package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"
)

// Graph data is what the additive collector fetcher writes to the tenant's
// nhi_* tables (in the tenant schema): resource-based policies, KMS key policies and grants,
// resource links (encryption keys, triggers), SCPs, Access Advisor and the
// outcome of every fetch. Without that schema the engine behaves as before.

// ResourceStatement is one statement of a resource-based policy (bucket, secret,
// queue, topic, function, repository or KMS key policy).
type ResourceStatement struct {
	Sid          string
	Effect       string
	Principals   []TrustPrincipal
	NotPrincipal bool
	Actions      []string
	NotActions   []string
	Resources    []string
	Conditions   []TrustCondition
}

// ParseResourcePolicy parses a resource-based policy document.
func ParseResourcePolicy(doc []byte) ([]ResourceStatement, error) {
	raws, err := statementsOf(doc)
	if err != nil {
		return nil, err
	}
	var out []ResourceStatement
	for _, rs := range raws {
		var s struct {
			Sid          string                                `json:"Sid"`
			Effect       string                                `json:"Effect"`
			Principal    json.RawMessage                       `json:"Principal"`
			NotPrincipal json.RawMessage                       `json:"NotPrincipal"`
			Action       json.RawMessage                       `json:"Action"`
			NotAction    json.RawMessage                       `json:"NotAction"`
			Resource     json.RawMessage                       `json:"Resource"`
			Condition    map[string]map[string]json.RawMessage `json:"Condition"`
		}
		if json.Unmarshal(rs, &s) != nil {
			continue
		}
		out = append(out, ResourceStatement{
			Sid:          s.Sid,
			Effect:       s.Effect,
			Principals:   parsePrincipals(s.Principal),
			NotPrincipal: len(s.NotPrincipal) > 0 && string(s.NotPrincipal) != "null",
			Actions:      stringList(s.Action),
			NotActions:   stringList(s.NotAction),
			Resources:    stringList(s.Resource),
			Conditions:   parseConditions(s.Condition),
		})
	}
	return out, nil
}

// ResourcePolicy is the policy attached to one resource.
type ResourcePolicy struct {
	ResourceARN string
	AccountID   string // the account the resource was fetched from
	PolicyType  string // resource_policy | key_policy
	PolicyName  string
	Statements  []ResourceStatement
}

// KMSGrant lets a principal use a key for the listed operations.
type KMSGrant struct {
	KeyARN     string
	Grantee    string
	Operations []string
}

// GraphLink is a resource-to-resource link such as encrypted_by or triggers.
type GraphLink struct {
	Type string
	From string
	To   string
}

// SCPTarget is an account, OU or root a service control policy is attached to.
type SCPTarget struct {
	ID   string `json:"id"`
	Type string `json:"type"` // ACCOUNT | ORGANIZATIONAL_UNIT | ROOT
}

// SCPolicy is one service control policy.
type SCPolicy struct {
	ID          string
	Name        string
	FromAccount string // the management or delegated-admin account it was read from
	Statements  []PolicyStatement
	Targets     []SCPTarget
}

// FetchStatus is the latest fetch outcome for one account, source and region.
type FetchStatus struct {
	AccountID string
	Source    string
	Region    string
	Status    string // ok | partial | not_permitted | error
	Message   string
}

// GraphData is everything loaded from the fetcher's nhi_* tables.
type GraphData struct {
	Available   bool // false when the schema or its tables do not exist
	Policies    map[string][]ResourcePolicy
	KMSGrants   map[string][]KMSGrant
	KeyManagers map[string]string // key ARN -> AWS | CUSTOMER
	LinksFrom   map[string][]GraphLink
	SCPs        []SCPolicy
	LastUsed    map[string]map[string]*time.Time // role -> service -> last use (nil = never)
	Status      []FetchStatus

	// Indexes built by index(): which policies name a principal explicitly, and
	// which allow everyone.
	byPrincipal map[string][]policyRef
	public      []policyRef
}

type policyRef struct {
	policy *ResourcePolicy
	stmt   int
}

// index builds the principal lookups; call once after loading.
func (d *GraphData) index() {
	d.byPrincipal = map[string][]policyRef{}
	d.public = nil
	for res := range d.Policies {
		pols := d.Policies[res]
		for i := range pols {
			p := &pols[i]
			for si, s := range p.Statements {
				if s.NotPrincipal {
					continue
				}
				for _, pr := range s.Principals {
					switch pr.Kind {
					case PrincipalPublic:
						d.public = append(d.public, policyRef{p, si})
					case PrincipalRole, PrincipalUser:
						d.byPrincipal[pr.Value] = append(d.byPrincipal[pr.Value], policyRef{p, si})
					}
				}
			}
		}
	}
}

// ── Loading and caching ──────────────────────────────────────────────────────

type graphDataEntry struct {
	d       *GraphData
	expires time.Time
}

// graphData returns the scope's graph data, cached like the assume graph.
func (e *Engine) graphData(ctx context.Context, ds *Scope, refresh bool) *GraphData {
	key := ds.Schema + "|" + strings.Join(ds.AccountIDs, ",")
	e.graphMu.Lock()
	defer e.graphMu.Unlock()
	if !refresh {
		if ent := e.gdata[key]; ent != nil && time.Now().Before(ent.expires) {
			return ent.d
		}
	}
	d, err := e.repo.LoadGraphData(ctx, ds)
	if err != nil || d == nil {
		if err != nil {
			log.Printf("WARNING: load graph data: %v", err)
		}
		return &GraphData{} // not cached, so the next request retries
	}
	d.index()
	if e.gdata == nil {
		e.gdata = map[string]*graphDataEntry{}
	}
	e.gdata[key] = &graphDataEntry{d: d, expires: time.Now().Add(graphCacheTTL)}
	return d
}

// ── Resource policies (FAM-14) ───────────────────────────────────────────────

// scopingKeys are condition keys that pin a "*" principal to an account,
// organization or source. AWS writes its default policies this way (AWS-managed
// KMS keys use kms:CallerAccount, default SNS topic policies AWS:SourceOwner), so
// such a statement is not public.
var scopingKeys = map[string]bool{
	"kms:calleraccount": true, "aws:principalaccount": true, "aws:sourceowner": true,
	"aws:sourceaccount": true, "aws:principalorgid": true, "aws:principalorgpaths": true,
	"aws:principalarn": true, "aws:sourcearn": true, "aws:sourcevpce": true, "aws:sourcevpc": true,
}

// scopedByCondition reports whether a statement's conditions limit who the
// principal can be (a positive match on an account, org, ARN or VPC endpoint).
func scopedByCondition(conds []TrustCondition) bool {
	for _, c := range conds {
		op := strings.ToLower(c.Operator)
		if strings.Contains(op, "not") || strings.HasPrefix(op, "null") {
			continue
		}
		if scopingKeys[strings.ToLower(c.Key)] {
			return true
		}
	}
	return false
}

// openToEveryone reports a statement that allows "*" without a scoping condition.
func openToEveryone(s ResourceStatement) bool {
	if scopedByCondition(s.Conditions) {
		return false
	}
	for _, pr := range s.Principals {
		if pr.Kind == PrincipalPublic {
			return true
		}
	}
	return false
}

// resourcePolicyGrants returns what resource policies grant the holder by
// naming it, or by allowing everyone. A policy naming only the holder's account
// delegates to IAM and grants nothing by itself, so it is not counted.
func (d *GraphData) resourcePolicyGrants(holder string) []ResourceGrant {
	if d == nil || !d.Available {
		return nil
	}
	type acc struct {
		actions map[string]bool
		flags   []string
	}
	byRes := map[string]*acc{}
	add := func(res string, actions []string, flags ...string) {
		a := byRes[res]
		if a == nil {
			a = &acc{actions: map[string]bool{}}
			byRes[res] = a
		}
		for _, x := range actions {
			a.actions[x] = true
		}
		a.flags = appendUnique(a.flags, flags...)
	}
	named := map[policyRef]bool{}
	for _, r := range d.byPrincipal[holder] {
		named[r] = true
	}
	refs := append(append([]policyRef{}, d.byPrincipal[holder]...), d.public...)
	for _, r := range refs {
		s := r.policy.Statements[r.stmt]
		if !strings.EqualFold(s.Effect, "Allow") || d.awsManagedKey(r.policy.ResourceARN) {
			continue // AWS-managed keys are usable by the whole account through their service
		}
		public := openToEveryone(s)
		if !named[r] && !public {
			continue // "*" scoped to an account or org: like naming the account, grants nothing alone
		}
		flags := []string{"granted_by_resource_policy"}
		if public {
			flags = append(flags, "public_resource_policy")
		}
		if len(s.Conditions) > 0 {
			flags = append(flags, "grant_has_conditions")
		}
		actions := s.Actions
		if len(s.NotActions) > 0 {
			actions = []string{"*"}
			flags = append(flags, "not_action_statement")
		}
		if acct := arnAccount(holder); acct != "" && r.policy.AccountID != "" && acct != r.policy.AccountID {
			flags = append(flags, "cross_account_needs_identity_permission")
		}
		add(r.policy.ResourceARN, actions, flags...)
	}
	for key, grants := range d.KMSGrants {
		for _, g := range grants {
			if g.Grantee != holder {
				continue
			}
			ops := make([]string, 0, len(g.Operations))
			for _, op := range g.Operations {
				ops = append(ops, "kms:"+op)
			}
			add(key, ops, "granted_by_kms_grant")
		}
	}

	out := make([]ResourceGrant, 0, len(byRes))
	for res, a := range byRes {
		acts := make([]string, 0, len(a.actions))
		for x := range a.actions {
			acts = append(acts, x)
		}
		sort.Strings(acts)
		sort.Strings(a.flags)
		out = append(out, ResourceGrant{ResourceARN: res, Actions: acts, Flags: a.flags})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ResourceARN < out[j].ResourceARN })
	return out
}

type denyResult int

const (
	denyNone denyResult = iota
	denySome            // part of the grant, or only under a condition
	denyAll             // every action of the grant, unconditionally
)

// denyCoverage says how far deny elements cover a grant.
func denyCoverage(denies []ResourcePermission, g ResourceGrant) denyResult {
	if len(denies) == 0 || len(g.Actions) == 0 {
		return denyNone
	}
	hardAll, any := true, false
	for _, a := range g.Actions {
		hard := false
		for _, d := range denies {
			if !denyCovers(d, a) {
				continue
			}
			if !(isWildcardResource(d.ResourceARN) || d.ResourceARN == "" || globMatch(d.ResourceARN, g.ResourceARN)) {
				continue
			}
			any = true
			if !d.Conditional {
				hard = true
				break
			}
		}
		if !hard {
			hardAll = false
		}
	}
	switch {
	case any && hardAll:
		return denyAll
	case any:
		return denySome
	}
	return denyNone
}

// resourcePolicyDeny checks the Deny statements of the resource's own policy
// that apply to the holder (by name, by account or to everyone).
func (d *GraphData) resourcePolicyDeny(holder string, g ResourceGrant) denyResult {
	if d == nil || !d.Available || isAllResourcesTarget(g.ResourceARN) {
		return denyNone
	}
	var denies []ResourcePermission
	for _, p := range d.Policies[g.ResourceARN] {
		for _, s := range p.Statements {
			if !strings.EqualFold(s.Effect, "Deny") || s.NotPrincipal {
				continue
			}
			applies := false
			for _, pr := range s.Principals {
				if principalMatches(pr, holder) {
					applies = true
				}
			}
			if !applies {
				continue
			}
			// A Deny limited to part of the resource (a prefix, say) may not hit
			// the grant: treat it as conditional.
			conditional := len(s.Conditions) > 0 || !coversResource(s.Resources, g.ResourceARN)
			actions, except := s.Actions, []string(nil)
			if len(s.NotActions) > 0 {
				actions, except = []string{"*"}, s.NotActions
			}
			for _, a := range actions {
				denies = append(denies, ResourcePermission{Action: a, Effect: "Deny", Conditional: conditional, ExceptActions: except})
			}
		}
	}
	return denyCoverage(denies, g)
}

func coversResource(patterns []string, arn string) bool {
	if len(patterns) == 0 {
		return true
	}
	for _, p := range patterns {
		if p == "*" || globMatch(p, arn) {
			return true
		}
	}
	return false
}

// ── SCPs (FAM-11) ────────────────────────────────────────────────────────────

// scpDeny applies the SCPs attached to the holder's account or the org root.
// SCPs do not affect the management account or service-linked roles. SCPs on
// OUs cannot be placed without the OU tree, so they only raise a flag.
func (d *GraphData) scpDeny(holder string, g ResourceGrant) (denyResult, []string) {
	acct := arnAccount(holder)
	if d == nil || !d.Available || acct == "" || strings.Contains(holder, "/aws-service-role/") {
		return denyNone, nil
	}
	var applied, onOU []ResourcePermission
	for _, p := range d.SCPs {
		if p.FromAccount == acct {
			continue
		}
		direct, ou := false, false
		for _, t := range p.Targets {
			switch t.Type {
			case "ROOT":
				direct = true
			case "ACCOUNT":
				if t.ID == acct {
					direct = true
				}
			case "ORGANIZATIONAL_UNIT":
				ou = true
			}
		}
		if !direct && !ou {
			continue
		}
		for _, el := range ElementsFromStatements(p.Statements, p.Name, "scp") {
			if !isDeny(el) {
				continue
			}
			if direct {
				applied = append(applied, el)
			} else {
				onOU = append(onOU, el)
			}
		}
	}
	var flags []string
	if denyCoverage(onOU, g) != denyNone {
		flags = append(flags, "scp_on_ou_not_resolved")
	}
	res := denyCoverage(applied, g)
	if res == denySome {
		flags = append(flags, "may_be_denied_by_scp")
	}
	return res, flags
}

// ── KMS (FAM-10) ─────────────────────────────────────────────────────────────

// encryptionKeys returns the keys that protect a resource.
func (d *GraphData) encryptionKeys(res string) []string {
	if d == nil {
		return nil
	}
	var keys []string
	for _, l := range d.LinksFrom[res] {
		if l.Type == "encrypted_by" {
			keys = appendUnique(keys, l.To)
		}
	}
	return keys
}

// keyPolicyAllows says whether a key policy lets the holder decrypt: directly
// (it names the holder or everyone) or by delegating to the account's IAM
// policies (it names the account root).
func (d *GraphData) keyPolicyAllows(key, holder string) (direct, delegates, known bool) {
	for _, p := range d.Policies[key] {
		if p.PolicyType != "key_policy" {
			continue
		}
		known = true
		for _, s := range p.Statements {
			if !strings.EqualFold(s.Effect, "Allow") || s.NotPrincipal || !actionsCover(s.Actions, s.NotActions, "kms:Decrypt") {
				continue
			}
			for _, pr := range s.Principals {
				switch {
				case pr.Kind == PrincipalPublic, (pr.Kind == PrincipalRole || pr.Kind == PrincipalUser) && pr.Value == holder:
					direct = true
				case pr.Kind == PrincipalAccount && principalMatches(pr, holder):
					delegates = true
				}
			}
		}
	}
	return direct, delegates, known
}

func actionsCover(actions, notActions []string, want string) bool {
	if len(notActions) > 0 {
		for _, n := range notActions {
			if globMatch(n, want) {
				return false
			}
		}
		return true
	}
	for _, a := range actions {
		if globMatch(a, want) {
			return true
		}
	}
	return false
}

func (d *GraphData) grantAllowsDecrypt(key, holder string) bool {
	for _, g := range d.KMSGrants[key] {
		if g.Grantee != holder {
			continue
		}
		for _, op := range g.Operations {
			if strings.EqualFold(op, "Decrypt") {
				return true
			}
		}
	}
	return false
}

// awsManagedKey reports keys AWS manages (alias/aws/...), which need no grant.
func (d *GraphData) awsManagedKey(key string) bool {
	return strings.Contains(key, ":alias/aws/") || d.KeyManagers[key] == "AWS"
}

// ── Access Advisor ───────────────────────────────────────────────────────────

const recentUse = 90 * 24 * time.Hour

// usageFlag says whether the holder has used the service lately, from IAM
// Access Advisor. Empty when there is no report for the holder or service.
func (d *GraphData) usageFlag(holder, service string) string {
	if d == nil || !d.Available || service == "" {
		return ""
	}
	last, ok := d.LastUsed[holder][service]
	switch {
	case !ok:
		return ""
	case last == nil:
		return "service_not_used_in_tracking_period"
	case time.Since(*last) <= recentUse:
		return "service_used_last_90_days"
	}
	return "service_last_used_over_90_days"
}

// ── Coverage ─────────────────────────────────────────────────────────────────

// coverage lists what is missing from the graph data for one account, so a
// missing edge can be told apart from data that was never collected.
func (d *GraphData) coverage(account string) []string {
	if d == nil || !d.Available {
		return []string{"graph data not collected (no nhi_* graph tables)"}
	}
	var out []string
	seen := false
	for _, s := range d.Status {
		if account != "" && s.AccountID != account {
			continue
		}
		seen = true
		if s.Status == "ok" {
			continue
		}
		line := fmt.Sprintf("%s %s: %s", s.Source, s.Region, s.Status)
		if s.Message != "" {
			line += " (" + truncateText(s.Message, 120) + ")"
		}
		out = append(out, line)
	}
	if !seen {
		out = append(out, "graph data not collected for account "+account)
	}
	sort.Strings(out)
	return out
}

func truncateText(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ── Checks applied to every grant path ───────────────────────────────────────

type grantCheck struct {
	drop      bool     // an unconditional Deny removes the path
	downgrade bool     // the path probably does not work as granted
	flags     []string // limitation tokens to add
}

// checkGrant applies the graph data to one grant held by holder: resource
// policy and SCP Denies, the KMS key the resource needs, and recent use.
func (t *traversal) checkGrant(holder string, g ResourceGrant) grantCheck {
	var c grantCheck
	d := t.gd
	if d == nil || !d.Available {
		return c
	}
	if t.rb.FamilyEnabled("FAM-14") {
		switch d.resourcePolicyDeny(holder, g) {
		case denyAll:
			c.drop = true
			return c
		case denySome:
			c.flags = append(c.flags, "may_be_denied_by_resource_policy")
		}
	}
	if t.rb.FamilyEnabled("FAM-11") {
		res, flags := d.scpDeny(holder, g)
		if res == denyAll {
			c.drop = true
			return c
		}
		c.flags = append(c.flags, flags...)
	}
	if t.rb.FamilyEnabled("FAM-10") && !isAllResourcesTarget(g.ResourceARN) {
		for _, key := range d.encryptionKeys(g.ResourceARN) {
			switch {
			case d.awsManagedKey(key):
			case d.KeyManagers[key] == "":
				c.flags = appendUnique(c.flags, "kms_key_not_collected")
			case t.holderCanDecrypt(holder, key):
				c.flags = appendUnique(c.flags, "kms_decrypt_also_granted")
			default:
				c.flags = appendUnique(c.flags, "kms_key_blocks_read")
				c.downgrade = true
			}
		}
	}
	if t.rb.FamilyEnabled("FAM-13") {
		if f := d.usageFlag(holder, serviceOfTarget(g.ResourceARN)); f != "" {
			c.flags = append(c.flags, f)
		}
	}
	return c
}

// holderCanDecrypt combines the key policy, KMS grants and the holder's own
// identity permissions the way KMS does.
func (t *traversal) holderCanDecrypt(holder, key string) bool {
	d := t.gd
	if d.grantAllowsDecrypt(key, holder) {
		return true
	}
	direct, delegates, known := d.keyPolicyAllows(key, holder)
	if direct {
		return true
	}
	identity := false
	for _, g := range t.holderGrants(holder) {
		if g.ResourceARN != AllResourcesARN && g.ResourceARN != "*:kms" && !globMatch(g.ResourceARN, key) {
			continue
		}
		for _, a := range g.Actions {
			if globMatch(a, "kms:Decrypt") {
				identity = true
			}
		}
	}
	if !known {
		return identity // key policy not collected: identity permission is all we know
	}
	return identity && delegates
}

// holderGrants returns a principal's identity grants, cached per traversal.
func (t *traversal) holderGrants(holder string) []ResourceGrant {
	if g, ok := t.grantCache[holder]; ok {
		return g
	}
	perms, err := t.e.repo.LoadEffectivePermissions(t.ctx, t.ds, holder)
	if err != nil {
		log.Printf("WARNING: permissions for %s: %v", holder, err)
	}
	g := GroupByResource(ApplyDenies(perms))
	if t.grantCache == nil {
		t.grantCache = map[string][]ResourceGrant{}
	}
	t.grantCache[holder] = g
	return g
}

func downgradeSignificance(s string) string {
	switch s {
	case "high":
		return "medium"
	case "medium":
		return "conditional"
	}
	return s
}

// ── Trigger injection (FAM-08) ───────────────────────────────────────────────

// writeTriggers are actions that put input into something that can start code.
var writeTriggers = []string{"sqs:SendMessage", "sns:Publish", "s3:PutObject", "kinesis:PutRecord", "kinesis:PutRecords"}

var triggerLinks = map[string]bool{"triggers": true, "notifies": true, "delivers_to": true, "invokes": true}

func grantCanWrite(g ResourceGrant) bool {
	for _, a := range g.Actions {
		for _, w := range writeTriggers {
			if globMatch(a, w) {
				return true
			}
		}
	}
	return false
}

type triggerTarget struct {
	via  []GraphLink // resource -> ... -> function
	role string
}

// triggeredRoles follows trigger links from a resource to Lambda functions (at
// most through one queue or topic in between) and returns the roles they run as.
func (d *GraphData) triggeredRoles(res string) []triggerTarget {
	var out []triggerTarget
	var walk func(node string, via []GraphLink, depth int)
	walk = func(node string, via []GraphLink, depth int) {
		for _, l := range d.LinksFrom[node] {
			if !triggerLinks[l.Type] || l.To == res {
				continue
			}
			path := append(append([]GraphLink{}, via...), l)
			if serviceOfTarget(l.To) == "lambda" {
				for _, r := range d.LinksFrom[l.To] {
					if r.Type == "executes_as" {
						out = append(out, triggerTarget{via: path, role: r.To})
					}
				}
				continue
			}
			if depth < 2 {
				walk(l.To, path, depth+1)
			}
		}
	}
	walk(res, nil, 1)
	return out
}

// triggerPaths adds a path to every role whose code the holder can start by
// writing to the resource. The holder controls the input, not the role's
// credentials, so the path is medium and says so.
func (t *traversal) triggerPaths(holderName string, hops []PathHop, rank int, g ResourceGrant, limits []string) {
	if t.gd == nil || !t.gd.Available || !t.rb.FamilyEnabled("FAM-08") ||
		isAllResourcesTarget(g.ResourceARN) || !grantCanWrite(g) {
		return
	}
	for _, tt := range t.gd.triggeredRoles(g.ResourceARN) {
		if tt.role == t.cred.ARN {
			continue
		}
		all := append([]PathHop{}, hops...)
		for _, l := range tt.via {
			all = append(all, PathHop{FromARN: l.From, ToARN: l.To, EdgeType: EdgeTriggers,
				Evidence: EvidenceConfigured, Table: "nhi_resource_links", Basis: l.Type})
		}
		fn := tt.via[len(tt.via)-1].To
		all = append(all, PathHop{FromARN: fn, ToARN: tt.role, EdgeType: EdgeHasRole,
			Evidence: EvidenceConfigured, Table: "nhi_resource_links", Basis: "executes_as"})
		t.add(BlastRadiusPath{
			TargetARN:  tt.role,
			TargetType: resourceType(tt.role),
			TargetName: nameFromARN(tt.role),
			PathType:   PathEscalation,
			PathDescription: fmt.Sprintf("%s can write to %s, which starts %s running as %s",
				holderOrSelf(t.cred.Name, holderName, len(hops)-1), nameFromARN(g.ResourceARN), nameFromARN(fn), nameFromARN(tt.role)),
			Hops:                 all,
			EvidenceRank:         minInt(rank, EvidenceRankConfigured),
			SecuritySignificance: "medium",
			Limitations:          append(append([]string{}, limits...), "controls_input_only_not_role_credentials"),
			Phase:                2,
		})
	}
}

// ── Inward: who can reach a resource through its policy ──────────────────────

// resourcePolicyReverse lists the principals a resource's own policy allows,
// for the "who can reach this" view.
func (d *GraphData) resourcePolicyReverse(res string) []BlastRadiusPath {
	if d == nil || !d.Available {
		return nil
	}
	var out []BlastRadiusPath
	for _, p := range d.Policies[res] {
		for _, s := range p.Statements {
			if !strings.EqualFold(s.Effect, "Allow") || s.NotPrincipal {
				continue
			}
			actions := s.Actions
			if len(s.NotActions) > 0 {
				actions = []string{"*"}
			}
			for _, pr := range s.Principals {
				limits := []string{"does_not_prove_access_happened"}
				switch {
				case pr.Kind == PrincipalPublic && scopedByCondition(s.Conditions):
					limits = append(limits, "any_principal_limited_by_condition")
				case pr.Kind == PrincipalPublic:
					limits = append(limits, "public_resource_policy")
				case pr.Kind == PrincipalAccount:
					limits = append(limits, "any_identity_in_account_with_iam_permission")
				case pr.Kind == PrincipalService:
					limits = append(limits, "aws_service_principal")
				}
				if len(s.Conditions) > 0 {
					limits = append(limits, "grant_has_conditions")
				}
				out = append(out, BlastRadiusPath{
					SourceARN:  pr.Value,
					TargetARN:  res,
					TargetType: resourceType(res),
					PathType:   PathDirectAccess,
					PathDescription: fmt.Sprintf("%s can %s on %s (its %s)", pr.Value,
						summariseActions(actions), shortARN(res), strings.ReplaceAll(p.PolicyType, "_", " ")),
					Hops: []PathHop{{FromARN: pr.Value, ToARN: res, EdgeType: EdgeCanAccess,
						Evidence: EvidenceConfigured, Table: "nhi_resource_policies", Basis: p.PolicyType}},
					EvidenceRank:         EvidenceRankConfigured,
					Confidence:           confidenceFromRank(EvidenceRankConfigured),
					SecuritySignificance: grantSignificance(actions, res),
					Limitations:          limits,
					Phase:                1,
					IsReverseAccess:      true,
				})
			}
		}
	}
	for _, g := range d.KMSGrants[res] {
		ops := make([]string, 0, len(g.Operations))
		for _, op := range g.Operations {
			ops = append(ops, "kms:"+op)
		}
		out = append(out, BlastRadiusPath{
			SourceARN: g.Grantee, TargetARN: res, TargetType: resourceType(res), PathType: PathDirectAccess,
			PathDescription: fmt.Sprintf("%s can %s on %s (KMS grant)", g.Grantee, summariseActions(ops), shortARN(res)),
			Hops: []PathHop{{FromARN: g.Grantee, ToARN: res, EdgeType: EdgeCanAccess,
				Evidence: EvidenceConfigured, Table: "nhi_resource_policies", Basis: "kms_grant"}},
			EvidenceRank: EvidenceRankConfigured, Confidence: confidenceFromRank(EvidenceRankConfigured),
			SecuritySignificance: grantSignificance(ops, res),
			Limitations:          []string{"does_not_prove_access_happened"},
			Phase:                1, IsReverseAccess: true,
		})
	}
	return out
}
