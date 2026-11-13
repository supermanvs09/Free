package correlation

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Principal kinds found in a role's trust policy.
const (
	PrincipalPublic    = "public"               // "*"
	PrincipalAccount   = "account"              // account root or bare 12-digit id
	PrincipalRole      = "role"                 // a specific role ARN
	PrincipalUser      = "user"                 // a specific IAM user ARN
	PrincipalSession   = "assumed_role_session" // a specific assumed-role session ARN
	PrincipalService   = "service"              // lambda.amazonaws.com, ...
	PrincipalFederated = "federated"            // OIDC / SAML / Cognito provider
	PrincipalUniqueID  = "unique_id"            // AROA.../AIDA... (a deleted principal)
	PrincipalUnknown   = "unknown"
)

// How a hop was established.
const (
	BasisNamesRole       = "trust_policy_names_role"
	BasisAccountTrust    = "trust_policy_account_and_identity_permission"
	BasisPublicTrust     = "trust_policy_public_and_identity_permission"
	BasisTrustEdgesTable = "trust_edges"
	BasisObserved        = "observed_in_cloudtrail"
)

// TrustPrincipal is one principal of a trust-policy statement.
type TrustPrincipal struct {
	Kind    string `json:"kind"`
	Value   string `json:"value"`
	Account string `json:"account,omitempty"`
}

// TrustCondition is one operator/key pair of a statement's Condition block.
type TrustCondition struct {
	Operator string
	Key      string
	Values   []string
}

// TrustStatement is one statement of a role's trust (assume-role) policy.
type TrustStatement struct {
	Effect        string
	Sid           string
	Principals    []TrustPrincipal
	NotPrincipal  bool // statement uses NotPrincipal; it is skipped and flagged
	AssumeCapable bool // its Action covers an AssumeRole variant
	Conditions    []TrustCondition
}

var (
	reAccountID = regexp.MustCompile(`^[0-9]{12}$`)
	reUniqueID  = regexp.MustCompile(`^A(RO|ID|PK|IP)A[A-Z0-9]+$`)
)

// assumeActions are the actions that make a trust statement an assumption grant.
var assumeActions = []string{"sts:AssumeRole", "sts:AssumeRoleWithSAML", "sts:AssumeRoleWithWebIdentity"}

func stringList(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var one string
	if err := json.Unmarshal(raw, &one); err == nil {
		return []string{one}
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err == nil {
		return many
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return []string{fmt.Sprintf("%t", b)}
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		return []string{n.String()}
	}
	return nil
}

// arnAccount returns the account id of an ARN ("" if there is none).
func arnAccount(arn string) string {
	if !strings.HasPrefix(arn, "arn:") {
		return ""
	}
	parts := strings.SplitN(arn, ":", 6)
	if len(parts) >= 5 {
		return parts[4]
	}
	return ""
}

func classifyPrincipal(key, v string) TrustPrincipal {
	switch key {
	case "Service":
		return TrustPrincipal{Kind: PrincipalService, Value: v}
	case "Federated":
		return TrustPrincipal{Kind: PrincipalFederated, Value: v, Account: arnAccount(v)}
	}
	switch {
	case v == "*":
		return TrustPrincipal{Kind: PrincipalPublic, Value: v}
	case reAccountID.MatchString(v):
		return TrustPrincipal{Kind: PrincipalAccount, Value: v, Account: v}
	case reUniqueID.MatchString(v):
		return TrustPrincipal{Kind: PrincipalUniqueID, Value: v}
	case strings.HasPrefix(v, "arn:"):
		acct := arnAccount(v)
		switch {
		case strings.HasSuffix(v, ":root"):
			return TrustPrincipal{Kind: PrincipalAccount, Value: v, Account: acct}
		case strings.Contains(v, ":role/"):
			return TrustPrincipal{Kind: PrincipalRole, Value: v, Account: acct}
		case strings.Contains(v, ":user/"):
			return TrustPrincipal{Kind: PrincipalUser, Value: v, Account: acct}
		case strings.Contains(v, ":assumed-role/"):
			return TrustPrincipal{Kind: PrincipalSession, Value: v, Account: acct}
		}
	}
	return TrustPrincipal{Kind: PrincipalUnknown, Value: v}
}

func parsePrincipals(raw json.RawMessage) []TrustPrincipal {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var star string
	if err := json.Unmarshal(raw, &star); err == nil {
		return []TrustPrincipal{classifyPrincipal("AWS", star)}
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var out []TrustPrincipal
	for _, k := range keys {
		for _, v := range stringList(obj[k]) {
			out = append(out, classifyPrincipal(k, v))
		}
	}
	return out
}

func parseConditions(raw map[string]map[string]json.RawMessage) []TrustCondition {
	var out []TrustCondition
	ops := make([]string, 0, len(raw))
	for op := range raw {
		ops = append(ops, op)
	}
	sort.Strings(ops)
	for _, op := range ops {
		keys := make([]string, 0, len(raw[op]))
		for k := range raw[op] {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			out = append(out, TrustCondition{Operator: op, Key: k, Values: stringList(raw[op][k])})
		}
	}
	return out
}

func coversAssume(actions []string) bool {
	for _, a := range actions {
		for _, want := range assumeActions {
			if globMatch(a, want) {
				return true
			}
		}
	}
	return false
}

// ParseTrustPolicy parses a role trust policy. Statement may be an array or a
// single object, and the document may itself be stored as a JSON string.
func ParseTrustPolicy(doc []byte) ([]TrustStatement, error) {
	var top struct {
		Statement json.RawMessage `json:"Statement"`
	}
	if err := json.Unmarshal(doc, &top); err != nil {
		var s string
		if err2 := json.Unmarshal(doc, &s); err2 != nil || json.Unmarshal([]byte(s), &top) != nil {
			return nil, fmt.Errorf("parse trust policy: %w", err)
		}
	}
	var rawStmts []json.RawMessage
	if err := json.Unmarshal(top.Statement, &rawStmts); err != nil {
		var single json.RawMessage
		if json.Unmarshal(top.Statement, &single) != nil || len(single) == 0 || string(single) == "null" {
			return nil, nil
		}
		rawStmts = []json.RawMessage{single}
	}

	var out []TrustStatement
	for _, rs := range rawStmts {
		var s struct {
			Sid          string                                `json:"Sid"`
			Effect       string                                `json:"Effect"`
			Principal    json.RawMessage                       `json:"Principal"`
			NotPrincipal json.RawMessage                       `json:"NotPrincipal"`
			Action       json.RawMessage                       `json:"Action"`
			NotAction    json.RawMessage                       `json:"NotAction"`
			Condition    map[string]map[string]json.RawMessage `json:"Condition"`
		}
		if err := json.Unmarshal(rs, &s); err != nil {
			continue
		}
		st := TrustStatement{
			Effect:       s.Effect,
			Sid:          s.Sid,
			Principals:   parsePrincipals(s.Principal),
			NotPrincipal: len(s.NotPrincipal) > 0 && string(s.NotPrincipal) != "null",
			Conditions:   parseConditions(s.Condition),
		}
		if na := stringList(s.NotAction); len(na) > 0 {
			st.AssumeCapable = !coversAssume(na)
		} else {
			st.AssumeCapable = coversAssume(stringList(s.Action))
		}
		out = append(out, st)
	}
	return out, nil
}

// ConditionSummaries renders a statement's conditions as short readable lines.
func ConditionSummaries(conds []TrustCondition) []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, c := range conds {
		k := strings.ToLower(c.Key)
		vals := strings.Join(c.Values, ", ")
		switch {
		case strings.HasSuffix(k, "sts:externalid"):
			if strings.EqualFold(c.Operator, "Null") && strings.Contains(strings.ToLower(vals), "true") {
				add("ExternalId must be absent")
			} else {
				add("requires sts:ExternalId")
			}
		case k == "aws:multifactorauthpresent":
			add("requires MFA")
		case k == "aws:sourcearn":
			add("restricted by aws:SourceArn: " + vals)
		case k == "aws:sourceaccount":
			add("restricted by aws:SourceAccount: " + vals)
		case k == "aws:principalorgid" || k == "aws:principalorgpaths":
			add("restricted to AWS organization: " + vals)
		case strings.HasSuffix(k, ":sub"):
			add("federated subject restricted (" + c.Key + "): " + vals)
		case strings.HasSuffix(k, ":aud"):
			add("federated audience restricted (" + c.Key + "): " + vals)
		case strings.HasSuffix(k, ":amr"):
			add("federated authentication type restricted: " + vals)
		case strings.HasPrefix(k, "aws:principaltag/"):
			add("principal tag condition: " + c.Key)
		default:
			add(fmt.Sprintf("condition %s on %s", c.Operator, c.Key))
		}
	}
	return out
}

// ConditionTokens are machine-readable limitation tokens for a statement's conditions.
func ConditionTokens(conds []TrustCondition) []string {
	if len(conds) == 0 {
		return nil
	}
	set := map[string]bool{"trust_conditions_not_evaluated": true}
	for _, c := range conds {
		k := strings.ToLower(c.Key)
		switch {
		case strings.HasSuffix(k, "sts:externalid"):
			set["trust_requires_external_id"] = true
		case k == "aws:multifactorauthpresent":
			set["trust_requires_mfa"] = true
		case k == "aws:sourcearn" || k == "aws:sourceaccount" || strings.HasPrefix(k, "aws:principalorg"):
			set["trust_source_restricted"] = true
		case strings.HasSuffix(k, ":sub") || strings.HasSuffix(k, ":aud") || strings.HasSuffix(k, ":amr"):
			set["trust_federated_claims_restricted"] = true
		}
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}

// ── Assume graph ───────────────────────────────────────────────────────────────

// RoleTrustRow is one role and its stored trust policy document.
type RoleTrustRow struct {
	ARN         string
	Name        string
	AccountID   string
	TrustPolicy []byte
}

// RoleNode is a role with its parsed trust statements.
type RoleNode struct {
	ARN        string
	Name       string
	AccountID  string
	Trust      []TrustStatement
	ParseError bool
}

// AssumeEdge says role From can become role To.
type AssumeEdge struct {
	From       string
	To         string
	Basis      string
	Evidence   string // configured (the trust policy alone) or effective (trust policy and identity permission)
	Conditions []string
	Flags      []string // limitation tokens

	// Set when CloudTrail shows this assumption actually happened.
	ObservedCount  uint64
	LastObservedAt *time.Time
}

// AssumeGraph is the role-to-role assumption graph of one scope.
type AssumeGraph struct {
	Roles map[string]*RoleNode
	From  map[string][]AssumeEdge
	To    map[string][]AssumeEdge
	// Observed holds CloudTrail AssumeRole calls whose caller is not an ARN (an
	// AWS service such as lambda.amazonaws.com, or an account id), keyed by the
	// assumed role. They cannot start a hop, but they show which principals a
	// role's trust policy is really used by.
	Observed map[string][]AssumeObservation
}

func emptyAssumeGraph() *AssumeGraph {
	return &AssumeGraph{Roles: map[string]*RoleNode{}, From: map[string][]AssumeEdge{}, To: map[string][]AssumeEdge{},
		Observed: map[string][]AssumeObservation{}}
}

// identityAllowsAssume reports whether the caller's identity policies allow
// sts:AssumeRole on target, and whether the allowing statement has conditions.
// An unconditional explicit Deny wins; a conditional Deny cannot be evaluated
// and is ignored (the hop is flagged by the caller).
func identityAllowsAssume(perms []ResourcePermission, target string) (allowed, conditional bool) {
	match := func(p ResourcePermission) bool {
		if !globMatch(p.Action, "sts:AssumeRole") {
			return false
		}
		return p.ResourceARN == "" || isWildcardResource(p.ResourceARN) || globMatch(p.ResourceARN, target)
	}
	for _, p := range perms {
		if isDeny(p) && !p.Conditional && match(p) {
			return false, false
		}
	}
	for _, p := range perms {
		if !isDeny(p) && match(p) {
			allowed = true
			if p.Conditional {
				conditional = true
			} else {
				return true, false // an unconditional allow settles it
			}
		}
	}
	return allowed, conditional
}

// principalMatches reports whether a trust principal covers the caller with the
// given ARN (a role or an IAM user).
func principalMatches(p TrustPrincipal, arn string) bool {
	switch p.Kind {
	case PrincipalPublic:
		return true
	case PrincipalAccount:
		return p.Account != "" && p.Account == arnAccount(arn)
	case PrincipalRole, PrincipalUser:
		return p.Value == arn
	}
	return false
}

// BuildAssumeGraph resolves which roles can assume which. A role R can assume
// role T when T's trust policy allows R and either
//   - the trust policy names R's ARN in the same account (no identity policy
//     needed), or
//   - the trust policy names R's account (or "*", or R in another account) and
//     R's own identity policies also allow sts:AssumeRole on T.
//
// Explicit Denies on either side win. Conditions are recorded on the edge, not
// evaluated, because the session context they test is unknown.
func BuildAssumeGraph(rows []RoleTrustRow, perms map[string][]ResourcePermission) *AssumeGraph {
	g := emptyAssumeGraph()
	byAccount := map[string][]*RoleNode{}
	for _, r := range rows {
		n := &RoleNode{ARN: r.ARN, Name: r.Name, AccountID: r.AccountID}
		stmts, err := ParseTrustPolicy(r.TrustPolicy)
		if err != nil {
			n.ParseError = true
		}
		n.Trust = stmts
		g.Roles[r.ARN] = n
		byAccount[r.AccountID] = append(byAccount[r.AccountID], n)
	}

	type key struct{ from, to string }
	merged := map[key]*AssumeEdge{}
	rank := func(basis string) int {
		if basis == BasisNamesRole {
			return 2
		}
		return 1
	}

	targets := make([]string, 0, len(g.Roles))
	for arn := range g.Roles {
		targets = append(targets, arn)
	}
	sort.Strings(targets)

	for _, tArn := range targets {
		t := g.Roles[tArn]
		for _, s := range t.Trust {
			if !s.AssumeCapable || s.NotPrincipal || !strings.EqualFold(s.Effect, "Allow") {
				continue
			}
			conds, flags := ConditionSummaries(s.Conditions), ConditionTokens(s.Conditions)
			for _, p := range s.Principals {
				var callers []*RoleNode
				basis := BasisAccountTrust
				switch p.Kind {
				case PrincipalRole, PrincipalUser:
					// A named caller need not be in the role inventory (an IAM user,
					// or the owner of an access key); it still gets a hop.
					c := g.Roles[p.Value]
					if c == nil {
						c = &RoleNode{ARN: p.Value, Name: nameFromARN(p.Value), AccountID: p.Account}
					}
					callers = []*RoleNode{c}
					basis = BasisNamesRole
				case PrincipalAccount:
					callers = byAccount[p.Account]
				case PrincipalPublic:
					for _, c := range g.Roles {
						callers = append(callers, c)
					}
					basis = BasisPublicTrust
				default:
					continue
				}
				for _, c := range callers {
					if c.ARN == t.ARN {
						continue
					}
					needPerm := basis != BasisNamesRole || c.AccountID != t.AccountID
					edgeFlags := append([]string{}, flags...)
					evidence := EvidenceConfigured
					if needPerm {
						ok, cond := identityAllowsAssume(perms[c.ARN], t.ARN)
						if !ok {
							continue
						}
						evidence = EvidenceEffective
						if cond {
							edgeFlags = append(edgeFlags, "identity_permission_has_conditions")
						}
					}
					denied, conditionalDeny := trustDenies(t, c)
					if denied {
						continue
					}
					if conditionalDeny {
						edgeFlags = append(edgeFlags, "trust_has_conditional_deny")
					}
					k := key{c.ARN, t.ARN}
					if cur := merged[k]; cur != nil {
						if rank(basis) > rank(cur.Basis) {
							cur.Basis, cur.Evidence = basis, evidence
						}
						cur.Conditions = unionStrings(cur.Conditions, conds)
						cur.Flags = unionStrings(cur.Flags, edgeFlags)
						continue
					}
					merged[k] = &AssumeEdge{From: c.ARN, To: t.ARN, Basis: basis, Evidence: evidence,
						Conditions: append([]string{}, conds...), Flags: unionStrings(nil, edgeFlags)}
				}
			}
		}
	}

	keys := make([]key, 0, len(merged))
	for k := range merged {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].from != keys[j].from {
			return keys[i].from < keys[j].from
		}
		return keys[i].to < keys[j].to
	})
	for _, k := range keys {
		e := *merged[k]
		g.From[k.from] = append(g.From[k.from], e)
		g.To[k.to] = append(g.To[k.to], e)
	}
	return g
}

// ApplyObservations folds CloudTrail AssumeRole calls into the graph. A hop the
// policies already explain is upgraded to observed evidence. A call that no
// policy explains is added as an observed-only hop and flagged, because it proves
// the assumption happened even though the stored policies do not show why (the
// trust policy may have changed since, or the collector's data may be stale).
func (g *AssumeGraph) ApplyObservations(obs []AssumeObservation) {
	upgrade := func(list []AssumeEdge, from, to string, o AssumeObservation) bool {
		found := false
		for i := range list {
			if list[i].From == from && list[i].To == to {
				last := o.LastSeen
				list[i].Evidence = EvidenceObserved
				list[i].ObservedCount = o.Count
				list[i].LastObservedAt = &last
				found = true
			}
		}
		return found
	}
	for _, o := range obs {
		if o.Caller == "" || !strings.HasPrefix(o.Target, "arn:") || o.Caller == o.Target {
			continue
		}
		if !strings.HasPrefix(o.Caller, "arn:") {
			// A service or account caller has no ARN to start a hop from; keep it
			// for the inward view.
			g.Observed[o.Target] = append(g.Observed[o.Target], o)
			continue
		}
		inFrom := upgrade(g.From[o.Caller], o.Caller, o.Target, o)
		inTo := upgrade(g.To[o.Target], o.Caller, o.Target, o)
		if inFrom || inTo {
			continue
		}
		last := o.LastSeen
		e := AssumeEdge{From: o.Caller, To: o.Target, Basis: BasisObserved, Evidence: EvidenceObserved,
			Flags: []string{"observed_without_matching_policy"}, ObservedCount: o.Count, LastObservedAt: &last}
		g.From[o.Caller] = append(g.From[o.Caller], e)
		g.To[o.Target] = append(g.To[o.Target], e)
	}
}

// trustDenies reports whether the target's trust policy denies the caller, and
// whether a conditional Deny might.
func trustDenies(t *RoleNode, c *RoleNode) (denied, conditional bool) {
	for _, s := range t.Trust {
		if !s.AssumeCapable || !strings.EqualFold(s.Effect, "Deny") {
			continue
		}
		for _, p := range s.Principals {
			if !principalMatches(p, c.ARN) {
				continue
			}
			if len(s.Conditions) == 0 {
				return true, false
			}
			conditional = true
		}
	}
	return false, conditional
}

func unionStrings(a, b []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range append(append([]string{}, a...), b...) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

// ── Inbound view: who can assume this role ─────────────────────────────────────

// InboundPrincipal is one principal a role's trust policy names, and the roles in
// the inventory that can really use it.
type InboundPrincipal struct {
	Kind               string   `json:"kind"`
	Value              string   `json:"value"`
	Account            string   `json:"account,omitempty"`
	SameAccount        bool     `json:"same_account"`
	Via                string   `json:"via"`
	PermissionRequired bool     `json:"permission_required"`
	Conditions         []string `json:"conditions,omitempty"`
	Limitations        []string `json:"limitations,omitempty"`
	Callers            []string `json:"callers,omitempty"`
	// ObservedCount and LastObservedAt are set when CloudTrail shows this
	// principal really assumed the role.
	ObservedCount  uint64     `json:"observed_count,omitempty"`
	LastObservedAt *time.Time `json:"last_observed_at,omitempty"`
}

// observedFor sums the CloudTrail AssumeRole calls that a trust principal
// accounts for.
func observedFor(p TrustPrincipal, obs []AssumeObservation, byARN []AssumeEdge) (uint64, *time.Time) {
	var n uint64
	var last *time.Time
	note := func(c uint64, t time.Time) {
		n += c
		if last == nil || t.After(*last) {
			tt := t
			last = &tt
		}
	}
	for _, o := range obs {
		switch p.Kind {
		case PrincipalService:
			if o.Caller == p.Value {
				note(o.Count, o.LastSeen)
			}
		case PrincipalAccount:
			if o.Caller == p.Account {
				note(o.Count, o.LastSeen)
			}
		case PrincipalPublic:
			note(o.Count, o.LastSeen)
		}
	}
	for _, e := range byARN {
		if e.LastObservedAt != nil && principalMatches(p, e.From) {
			note(e.ObservedCount, *e.LastObservedAt)
		}
	}
	return n, last
}

// InboundCaller is a role that can reach the target, possibly through a chain.
type InboundCaller struct {
	ARN        string   `json:"arn"`
	Name       string   `json:"name"`
	Hops       int      `json:"hops"`
	Path       []string `json:"path"` // caller first, target last
	Basis      string   `json:"basis"`
	Evidence   string   `json:"evidence"`
	Conditions []string `json:"conditions,omitempty"`
}

// InboundResult answers "who can assume this role".
type InboundResult struct {
	RoleARN    string             `json:"role_arn"`
	RoleName   string             `json:"role_name"`
	AccountID  string             `json:"account_id"`
	Public     bool               `json:"public_trust"`
	Principals []InboundPrincipal `json:"principals"`
	Callers    []InboundCaller    `json:"callers"`
}

func viaFor(p TrustPrincipal) string {
	switch p.Kind {
	case PrincipalRole, PrincipalUser, PrincipalSession:
		return "names_principal"
	case PrincipalAccount:
		return "account_trust"
	case PrincipalPublic:
		return "public_trust"
	case PrincipalService:
		return "aws_service"
	case PrincipalFederated:
		return "federated_provider"
	}
	return "other"
}

// Inbound lists every principal a role trusts and the roles that can reach it,
// following chains up to depth hops (1 = direct callers only). ok is false when
// the role is unknown.
func (g *AssumeGraph) Inbound(roleARN string, depth int) (*InboundResult, bool) {
	t := g.Roles[roleARN]
	if t == nil {
		return nil, false
	}
	if depth < 1 {
		depth = 1
	}
	res := &InboundResult{RoleARN: t.ARN, RoleName: t.Name, AccountID: t.AccountID,
		Principals: []InboundPrincipal{}, Callers: []InboundCaller{}}

	direct := g.To[roleARN]
	for _, s := range t.Trust {
		if !s.AssumeCapable || s.NotPrincipal || !strings.EqualFold(s.Effect, "Allow") {
			continue
		}
		conds, flags := ConditionSummaries(s.Conditions), ConditionTokens(s.Conditions)
		for _, p := range s.Principals {
			ip := InboundPrincipal{Kind: p.Kind, Value: p.Value, Account: p.Account,
				SameAccount: p.Account != "" && p.Account == t.AccountID,
				Via:         viaFor(p), Conditions: conds, Limitations: flags}
			ip.PermissionRequired = p.Kind == PrincipalAccount || p.Kind == PrincipalPublic ||
				(p.Kind == PrincipalRole && p.Account != t.AccountID)
			if p.Kind == PrincipalPublic {
				res.Public = true
			}
			for _, e := range direct {
				if principalMatches(p, e.From) {
					ip.Callers = append(ip.Callers, e.From)
				}
			}
			sort.Strings(ip.Callers)
			ip.ObservedCount, ip.LastObservedAt = observedFor(p, g.Observed[roleARN], direct)
			res.Principals = append(res.Principals, ip)
		}
	}

	type node struct {
		arn  string
		path []string
		hops int
	}
	seen := map[string]bool{roleARN: true}
	frontier := []node{{arn: roleARN, path: []string{roleARN}}}
	for hop := 1; hop <= depth && len(frontier) > 0; hop++ {
		var next []node
		for _, f := range frontier {
			for _, e := range g.To[f.arn] {
				if seen[e.From] {
					continue
				}
				seen[e.From] = true
				path := append([]string{e.From}, f.path...)
				name := nameFromARN(e.From)
				if c := g.Roles[e.From]; c != nil {
					name = c.Name
				}
				res.Callers = append(res.Callers, InboundCaller{ARN: e.From, Name: name, Hops: hop,
					Path: path, Basis: e.Basis, Evidence: e.Evidence, Conditions: e.Conditions})
				next = append(next, node{arn: e.From, path: path, hops: hop})
			}
		}
		frontier = next
	}
	sort.SliceStable(res.Callers, func(i, j int) bool {
		if res.Callers[i].Hops != res.Callers[j].Hops {
			return res.Callers[i].Hops < res.Callers[j].Hops
		}
		return res.Callers[i].ARN < res.Callers[j].ARN
	})
	return res, true
}
