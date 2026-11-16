package engine

import (
	"context"
	"fmt"
	"log"
	"sort"
	"time"
)

// maxBoundRoles caps how many of a workload's roles are followed (a workload
// normally has one task or function role and maybe an execution role).
const maxBoundRoles = 5

// bindingSignificance rates a workload by how powerful the role it runs as is.
func bindingSignificance(privilege int) string {
	switch {
	case privilege >= 7:
		return "high"
	case privilege >= 4:
		return "medium"
	}
	return "conditional"
}

// computeWorkload answers the blast radius of a workload (FAM-04: a workload
// inherits its role's reach). A workload has no permissions of its own, so its
// result is every role it runs as, with everything each role reaches, and the
// workload-to-role binding as the first hop of every path.
func (e *Engine) computeWorkload(ctx context.Context, ds *Scope, rb *RuleBook, arn string, refresh bool) (*BlastRadiusResult, error) {
	w, err := e.repo.LoadWorkload(ctx, ds, arn)
	if err != nil {
		return nil, fmt.Errorf("load workload: %w", err)
	}
	if w == nil {
		return nil, fmt.Errorf("load credential: %w", ErrCredentialNotFound)
	}
	bound, err := e.repo.LoadBoundRoles(ctx, ds, arn)
	if err != nil {
		return nil, fmt.Errorf("load bound roles: %w", err)
	}
	if len(bound) > maxBoundRoles {
		bound = bound[:maxBoundRoles]
	}

	result := &BlastRadiusResult{
		SourceARN: w.ARN, SourceName: w.Name, SourceType: w.Type,
		ComputedAt: time.Now(), Paths: make([]BlastRadiusPath, 0),
	}
	level := 0
	var fresh *DataFreshness
	followed := 0

	for _, b := range bound {
		roleRes, err := e.ComputeBlastRadiusOpts(ctx, ds, b.CredentialARN, refresh)
		if err != nil {
			log.Printf("WARNING: workload %s: role %s: %v", arn, b.CredentialARN, err)
			continue
		}
		followed++
		if roleRes.PrivilegeLevel > level {
			level = roleRes.PrivilegeLevel
		}
		if fresh == nil {
			f := roleRes.DataAsOf
			fresh = &f
		}

		binding := PathHop{
			FromARN: w.ARN, ToARN: b.CredentialARN, EdgeType: EdgeHasRole, Evidence: EvidenceConfigured,
			Table: "identity_credentials", Basis: "binding:" + b.BindingType,
		}
		bindingFlags := []string{"does_not_prove_workload_used_this_role"}
		if !b.IsPrimary {
			bindingFlags = append(bindingFlags, "non_primary_binding")
		}

		// The role itself, as the first reachable identity.
		result.Paths = append(result.Paths, BlastRadiusPath{
			SourceARN: w.ARN, TargetARN: b.CredentialARN, TargetType: "role", TargetName: roleRes.SourceName,
			PathType:             PathWorkloadAccess,
			PathDescription:      fmt.Sprintf("%s runs as %s (%s)", w.Name, roleRes.SourceName, b.BindingType),
			Hops:                 []PathHop{binding},
			EvidenceRank:         EvidenceRankConfigured,
			SecuritySignificance: bindingSignificance(roleRes.PrivilegeLevel),
			Limitations:          rb.Limitations(PathWorkloadAccess, bindingFlags...),
			Phase:                4,
		})

		// Everything the role reaches, one hop further from the workload.
		for _, p := range roleRes.Paths {
			p.SourceARN = w.ARN
			p.Hops = append([]PathHop{binding}, p.Hops...)
			p.EvidenceRank = minInt(p.EvidenceRank, EvidenceRankConfigured)
			if p.PathType == PathDirectAccess {
				p.PathType = PathWorkloadAccess // the workload reaches it through its role
			}
			p.Limitations = appendUnique(append([]string{}, p.Limitations...), "reached_through_workload_role")
			for _, f := range bindingFlags {
				p.Limitations = appendUnique(p.Limitations, f)
			}
			result.Paths = append(result.Paths, p)
		}
	}
	if followed == 0 && len(bound) > 0 {
		return nil, fmt.Errorf("workload %s: none of its %d role(s) could be evaluated", arn, len(bound))
	}

	result.Paths = e.dedupPaths(result.Paths)
	sortPaths(result.Paths)
	DeriveSummary(result, rb.MultiPathEnabled())
	e.attachContextWith(ctx, ds, result, nil, &level, fresh)
	result.GraphDataCoverage = e.graphData(ctx, ds, false).coverage(w.AccountID)

	// The result is not cached in PostgreSQL: it is built from the roles' own
	// (cached) results.
	return result, nil
}

// navigateWorkload is the navigation view of a workload: no permissions of its
// own, just the roles it runs as (each one a link to keep walking).
func (e *Engine) navigateWorkload(ctx context.Context, ds *Scope, w *Workload, opts NavOptions, graph *AssumeGraph) (*NavView, error) {
	bound, err := e.repo.LoadBoundRoles(ctx, ds, w.ARN)
	if err != nil {
		return nil, fmt.Errorf("load bound roles: %w", err)
	}
	view := &NavView{Node: NavNode{ARN: w.ARN, Name: w.Name, Kind: "workload", Account: w.AccountID}}
	if opts.Direction == "in" {
		view.Inward = &NavInward{AssumedBy: []NavEdge{}, TrustPrincipals: []InboundPrincipal{}, RunsAs: []NavEdge{}}
		return view, nil
	}
	out := &NavOutward{Assumes: []NavEdge{}, Escalation: []NavEdge{}, RunsAs: []NavEdge{},
		Access: NavAccess{Groups: []ServiceGroup{}, Limit: opts.Limit, Offset: opts.Offset}}
	for _, b := range bound {
		peer := NavNode{ARN: b.CredentialARN, Name: nameFromARN(b.CredentialARN), Kind: navKind(b.CredentialARN), Account: arnAccount(b.CredentialARN)}
		if r := graph.Roles[b.CredentialARN]; r != nil {
			peer.Name = r.Name
		}
		if perms, err := e.repo.LoadEffectivePermissions(ctx, ds, b.CredentialARN); err == nil {
			lv := PrivilegeLevel(GroupByResource(ApplyDenies(perms)))
			peer.PrivilegeLevel = &lv
		}
		out.RunsAs = append(out.RunsAs, NavEdge{
			Type: "RUNS_AS", Peer: peer, Binding: b.BindingType, Basis: b.BindingSource,
			Evidence: EvidenceConfigured, Expand: expandLink(b.CredentialARN),
			Limitations: []string{"does_not_prove_workload_used_this_role"},
		})
	}
	sort.SliceStable(out.RunsAs, func(i, j int) bool { return out.RunsAs[i].Peer.ARN < out.RunsAs[j].Peer.ARN })
	view.Outward = out
	if opts.Direction == "both" || opts.Direction == "" {
		view.Inward = &NavInward{AssumedBy: []NavEdge{}, TrustPrincipals: []InboundPrincipal{}, RunsAs: []NavEdge{}}
	}
	return view, nil
}
