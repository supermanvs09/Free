package correlation

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

// graphBase is the path prefix of the navigation endpoint; every peer carries an
// Expand link built from it so a client can keep walking without knowing routes.
const graphBase = "/api/v1/correlations/graph/"

// NavNode is one node in the navigation view.
type NavNode struct {
	ARN            string `json:"arn"`
	Name           string `json:"name"`
	Kind           string `json:"kind"` // role, user, workload, service, account, federated, public, resource, service-group, all-resources
	Account        string `json:"account,omitempty"`
	PrivilegeLevel *int   `json:"privilege_level,omitempty"`
}

// NavEdge is one step from the focus node to a peer, with the proof behind it.
type NavEdge struct {
	Type           string     `json:"type"` // CAN_ASSUME, CAN_ACCESS, ESCALATES, RUNS_AS, TRUSTS
	Peer           NavNode    `json:"peer"`
	Basis          string     `json:"basis,omitempty"`
	Evidence       string     `json:"evidence,omitempty"`
	Conditions     []string   `json:"conditions,omitempty"`
	Limitations    []string   `json:"limitations,omitempty"`
	Significance   string     `json:"significance,omitempty"`
	Actions        []string   `json:"actions,omitempty"`
	ActionCount    int        `json:"action_count,omitempty"`
	Binding        string     `json:"binding,omitempty"`
	ObservedCount  uint64     `json:"observed_count,omitempty"`
	LastObservedAt *time.Time `json:"last_observed_at,omitempty"`
	Expand         string     `json:"expand,omitempty"` // continue from the peer
}

// ServiceGroup summarises what the focus node can access inside one AWS service.
type ServiceGroup struct {
	Service      string   `json:"service"`
	Resources    int      `json:"resources"`
	Wildcard     bool     `json:"wildcard"`
	Significance string   `json:"significance"`
	Actions      []string `json:"actions_sample"`
	Expand       string   `json:"expand"` // lists the resources of this service
}

// NavAccess is the access side of the outward view: groups first, items on demand.
type NavAccess struct {
	Groups  []ServiceGroup `json:"groups"`
	Service string         `json:"service,omitempty"` // set when the items below are one service's resources
	Items   []NavEdge      `json:"items,omitempty"`
	Total   int            `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
}

// NavOutward is everything the focus node can reach in one step.
type NavOutward struct {
	Assumes    []NavEdge `json:"assumes"`
	Access     NavAccess `json:"access"`
	Escalation []NavEdge `json:"escalation"`
}

// NavInward is everything that can reach the focus node in one step.
type NavInward struct {
	AssumedBy       []NavEdge          `json:"assumed_by"`
	TrustPrincipals []InboundPrincipal `json:"trust_principals"`
	RunsAs          []NavEdge          `json:"runs_as"`
}

// NavView is one step of the graph around a node.
type NavView struct {
	Node     NavNode       `json:"node"`
	DataAsOf DataFreshness `json:"data_as_of"`
	Outward  *NavOutward   `json:"outward,omitempty"`
	Inward   *NavInward    `json:"inward,omitempty"`
}

// NavOptions controls one Navigate call.
type NavOptions struct {
	Direction string // "out", "in" or "both" (default)
	Service   string // when set, list this service's resources instead of the groups
	Limit     int    // items per page, 1 to 200 (default 50)
	Offset    int
}

func navKind(arn string) string {
	switch {
	case arn == AllResourcesARN:
		return "all-resources"
	case strings.HasPrefix(arn, "*:"):
		return "service-group"
	case strings.Contains(arn, ":role/"):
		return "role"
	case strings.Contains(arn, ":user/"):
		return "user"
	case strings.HasPrefix(arn, "arn:"):
		return "resource"
	}
	return "workload"
}

func serviceKeyOf(target string) string {
	if target == AllResourcesARN {
		return "all-services"
	}
	if svc := serviceOfTarget(target); svc != "" {
		return svc
	}
	return "other"
}

func expandLink(arn string) string { return graphBase + arn }

// Navigate returns one step of the graph around a node. Large fan-outs (a broad
// role can reach hundreds of services) come back as groups, and one group's
// resources are listed on request with paging.
func (e *Engine) Navigate(ctx context.Context, ds *Scope, arn string, opts NavOptions) (*NavView, error) {
	if opts.Limit <= 0 || opts.Limit > 200 {
		opts.Limit = 50
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}
	switch opts.Direction {
	case "", "both", "out", "in":
	default:
		return nil, fmt.Errorf("direction must be out, in or both")
	}
	if opts.Direction == "" {
		opts.Direction = "both"
	}

	graph := e.assumeGraph(ctx, ds, false)
	cred, credErr := e.repo.LoadCredentialByARN(ctx, ds, arn)
	role := graph.Roles[arn]
	if credErr != nil && role == nil && len(graph.From[arn]) == 0 {
		return nil, ErrCredentialNotFound
	}

	levels := map[string]int{}
	level := func(a string) *int {
		if _, ok := levels[a]; !ok {
			perms, err := e.repo.LoadEffectivePermissions(ctx, ds, a)
			if err != nil {
				return nil
			}
			levels[a] = PrivilegeLevel(GroupByResource(ApplyDenies(perms)))
		}
		v := levels[a]
		return &v
	}
	peerOf := func(a string) NavNode {
		n := NavNode{ARN: a, Name: nameFromARN(a), Kind: navKind(a), Account: arnAccount(a)}
		if r := graph.Roles[a]; r != nil {
			n.Name = r.Name
		}
		if n.Kind == "role" || n.Kind == "user" {
			n.PrivilegeLevel = level(a)
		}
		return n
	}

	node := NavNode{ARN: arn, Name: nameFromARN(arn), Kind: navKind(arn), Account: arnAccount(arn)}
	if cred != nil {
		node.Name, node.Account = cred.Name, cred.AccountID
	} else if role != nil {
		node.Name = role.Name
	}
	node.PrivilegeLevel = level(arn)

	view := &NavView{Node: node}
	if fresh, err := e.repo.LoadDataFreshness(ctx, ds, arn); err == nil {
		if fresh.CredentialLastSeenAt != nil && time.Since(*fresh.CredentialLastSeenAt) > staleAfter {
			fresh.Stale = true
		}
		view.DataAsOf = fresh
	}

	if opts.Direction == "out" || opts.Direction == "both" {
		out := &NavOutward{Assumes: []NavEdge{}, Escalation: []NavEdge{}}

		for _, ed := range graph.From[arn] {
			out.Assumes = append(out.Assumes, NavEdge{
				Type: "CAN_ASSUME", Peer: peerOf(ed.To), Basis: ed.Basis, Evidence: ed.Evidence,
				Conditions: ed.Conditions, Limitations: ed.Flags,
				ObservedCount: ed.ObservedCount, LastObservedAt: ed.LastObservedAt,
				Expand: expandLink(ed.To),
			})
		}
		sort.SliceStable(out.Assumes, func(i, j int) bool { return out.Assumes[i].Peer.ARN < out.Assumes[j].Peer.ARN })

		perms, err := e.repo.LoadEffectivePermissions(ctx, ds, arn)
		if err != nil {
			return nil, fmt.Errorf("load permissions: %w", err)
		}
		grants := GroupByResource(ApplyDenies(perms))
		out.Access, out.Escalation = buildNavAccess(arn, grants, opts)
		view.Outward = out
	}

	if opts.Direction == "in" || opts.Direction == "both" {
		in := &NavInward{AssumedBy: []NavEdge{}, TrustPrincipals: []InboundPrincipal{}, RunsAs: []NavEdge{}}
		for _, ed := range graph.To[arn] {
			in.AssumedBy = append(in.AssumedBy, NavEdge{
				Type: "CAN_ASSUME", Peer: peerOf(ed.From), Basis: ed.Basis, Evidence: ed.Evidence,
				Conditions: ed.Conditions, Limitations: ed.Flags,
				ObservedCount: ed.ObservedCount, LastObservedAt: ed.LastObservedAt,
				Expand: expandLink(ed.From),
			})
		}
		sort.SliceStable(in.AssumedBy, func(i, j int) bool { return in.AssumedBy[i].Peer.ARN < in.AssumedBy[j].Peer.ARN })
		if inb, ok := graph.Inbound(arn, 1); ok {
			in.TrustPrincipals = inb.Principals
		}
		if bound, err := e.repo.LoadIdentityCredentials(ctx, ds, arn); err == nil {
			for _, b := range bound {
				in.RunsAs = append(in.RunsAs, NavEdge{
					Type: "RUNS_AS", Peer: NavNode{ARN: b.IdentityARN, Name: nameFromARN(b.IdentityARN), Kind: "workload", Account: arnAccount(b.IdentityARN)},
					Binding: b.BindingType, Basis: b.BindingSource, Evidence: EvidenceConfigured,
				})
			}
		}
		view.Inward = in
	}
	return view, nil
}

// buildNavAccess turns grants into service groups, lists one service's resources
// when asked, and extracts the escalation primitives.
func buildNavAccess(arn string, grants []ResourceGrant, opts NavOptions) (NavAccess, []NavEdge) {
	type agg struct {
		resources int
		wildcard  bool
		sig       string
		actions   map[string]bool
	}
	by := map[string]*agg{}
	var escalation []NavEdge
	var items []NavEdge

	for _, g := range grants {
		svc := serviceKeyOf(g.ResourceARN)
		a := by[svc]
		if a == nil {
			a = &agg{sig: "low", actions: map[string]bool{}}
			by[svc] = a
		}
		a.resources++
		a.wildcard = a.wildcard || isAllResourcesTarget(g.ResourceARN)
		sig := g.Significance()
		if significanceRank(sig) > significanceRank(a.sig) {
			a.sig = sig
		}
		for _, act := range g.Actions {
			a.actions[act] = true
		}

		flags := append([]string{}, g.Flags...)
		if isAllResourcesTarget(g.ResourceARN) {
			flags = appendUnique(flags, "wildcard_resource_grant")
		}
		actions := g.Actions
		if len(actions) > 20 {
			actions = actions[:20]
		}
		edge := NavEdge{
			Type: "CAN_ACCESS", Significance: sig, Actions: actions, ActionCount: len(g.Actions),
			Limitations: flags, Evidence: EvidenceEffective,
			Peer: NavNode{ARN: g.ResourceARN, Name: nameFromARN(g.ResourceARN), Kind: navKind(g.ResourceARN), Account: arnAccount(g.ResourceARN)},
		}
		if esc := g.EscalationActions(); len(esc) > 0 {
			e2 := edge
			e2.Type, e2.Significance, e2.Actions, e2.ActionCount = "ESCALATES", "high", esc, len(esc)
			escalation = append(escalation, e2)
		}
		if opts.Service != "" && svc == opts.Service {
			items = append(items, edge)
		}
	}

	groups := make([]ServiceGroup, 0, len(by))
	for svc, a := range by {
		sample := make([]string, 0, len(a.actions))
		for act := range a.actions {
			sample = append(sample, act)
		}
		sort.Strings(sample)
		if len(sample) > 5 {
			sample = sample[:5]
		}
		groups = append(groups, ServiceGroup{Service: svc, Resources: a.resources, Wildcard: a.wildcard,
			Significance: a.sig, Actions: sample, Expand: expandLink(arn) + "?service=" + svc})
	}
	sort.Slice(groups, func(i, j int) bool {
		if significanceRank(groups[i].Significance) != significanceRank(groups[j].Significance) {
			return significanceRank(groups[i].Significance) > significanceRank(groups[j].Significance)
		}
		return groups[i].Service < groups[j].Service
	})

	sort.SliceStable(escalation, func(i, j int) bool { return escalation[i].Peer.ARN < escalation[j].Peer.ARN })
	access := NavAccess{Groups: groups, Limit: opts.Limit, Offset: opts.Offset}
	if opts.Service != "" {
		sort.SliceStable(items, func(i, j int) bool {
			if significanceRank(items[i].Significance) != significanceRank(items[j].Significance) {
				return significanceRank(items[i].Significance) > significanceRank(items[j].Significance)
			}
			return items[i].Peer.ARN < items[j].Peer.ARN
		})
		access.Service, access.Total = opts.Service, len(items)
		lo := opts.Offset
		if lo > len(items) {
			lo = len(items)
		}
		hi := lo + opts.Limit
		if hi > len(items) {
			hi = len(items)
		}
		access.Items = items[lo:hi]
	} else {
		access.Total = len(groups)
	}
	if escalation == nil {
		escalation = []NavEdge{}
	}
	return access, escalation
}

// PathsBetween returns every explained path from one identity to a target (a
// role it can assume or a resource it can reach), strongest evidence first.
func (e *Engine) PathsBetween(ctx context.Context, ds *Scope, from, to string) ([]BlastRadiusPath, error) {
	res, err := e.ComputeBlastRadiusOpts(ctx, ds, from, false)
	if err != nil {
		return nil, err
	}
	out := []BlastRadiusPath{}
	for _, p := range res.Paths {
		if p.TargetARN == to {
			out = append(out, p)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].EvidenceRank != out[j].EvidenceRank {
			return out[i].EvidenceRank > out[j].EvidenceRank
		}
		return len(out[i].Hops) < len(out[j].Hops)
	})
	return out, nil
}
