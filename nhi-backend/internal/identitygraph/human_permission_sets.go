package identitygraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	chrepo "nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/scope"
)

// Source labels used in the permission-sets response.
const (
	HumanPermSourceIAM = "iam"
	HumanPermSourceSSO = "sso"
)

// HumanPermissionSet is one grant group: an IAM managed policy, an IAM inline
// policy, or an SSO permission set. IAM rows are grouped by policy, so a shared
// policy appears once with every assigned identity listed.
type HumanPermissionSet struct {
	Source             string                     `json:"source"`
	Kind               string                     `json:"kind"`
	Name               string                     `json:"name"`
	ARN                string                     `json:"arn"`
	SessionDuration    *string                    `json:"session_duration"`
	UsageAvailable     bool                       `json:"usage_available"`
	Summary            HumanPermissionSetSummary  `json:"summary"`
	Policies           []HumanPermissionPolicyRef `json:"policies"`
	Actions            []HumanPermissionAction    `json:"actions"`
	AssignedIdentities []HumanAssignedIdentity    `json:"assigned_identities"`
}

// HumanPermissionSetSummary holds the counts shown in the summary cards.
// Usage fields are null when usage is not available, so they are never shown as 0.
type HumanPermissionSetSummary struct {
	ActionsAllowed int  `json:"actions_allowed"`
	Used90d        *int `json:"used_90d"`
	NeverUsed      *int `json:"never_used"`
	ShareUsedPct   *int `json:"share_used_pct"`
}

// HumanPermissionPolicyRef is one policy that contributes to a grant group.
type HumanPermissionPolicyRef struct {
	Name        string `json:"name"`
	ARN         string `json:"arn"`
	Kind        string `json:"kind"` // managed | inline
	HasDocument bool   `json:"has_document"`
}

// HumanPermissionAction is one allowed action row. Used90d and LastUsedAt are
// null when usage is not available for this group.
type HumanPermissionAction struct {
	Effect       string     `json:"effect"`
	Service      string     `json:"service"`
	Action       string     `json:"action"`
	Resource     string     `json:"resource"`
	PolicySource string     `json:"policy_source"`
	Used90d      *bool      `json:"used_90d"`
	LastUsedAt   *time.Time `json:"last_used_at"`
	SourceIPs    []string   `json:"source_ips"`
}

// HumanAssignedIdentity is one identity that holds this grant group.
type HumanAssignedIdentity struct {
	HumanID    string   `json:"human_id"`
	UserName   string   `json:"user_name"`
	Source     string   `json:"source"`
	AccountIDs []string `json:"account_ids"`
}

// hpRow is one access row joined to its identity.
type hpRow struct {
	humanID     string
	userName    string
	source      string
	arn         string
	accountID   string
	accessType  string
	permSetARN  string
	permSetName string
	policyARN   string
	policyName  string
	document    string
	session     sql.NullString
}

// hpPolicyText is one policy document, with the label used as policy_source.
type hpPolicyText struct {
	label string
	doc   string
}

// hpGroup collects the rows that belong to one grant group.
type hpGroup struct {
	set        HumanPermissionSet
	isSSO      bool
	identByID  map[string]*HumanAssignedIdentity
	identOrder []string
	policies   []HumanPermissionPolicyRef
	policySeen map[string]bool
	docs       []hpPolicyText
	docSeen    map[string]bool
}

// hpInfo is what the usage lookup needs for one IAM identity.
type hpInfo struct {
	arn  string
	keys []string
}

// PermissionSetCatalog returns IAM policy groups and SSO permission sets in one
// list. source is "", "iam" or "sso" (API values); the same scope and source
// filter as the other human identity endpoints apply. Returns an empty slice
// when there is no data.
func (r *HumanIdentityRepository) PermissionSetCatalog(ctx context.Context, resolved *scope.DataScope, source string, activity *ActivityService) ([]HumanPermissionSet, error) {
	if resolved == nil || resolved.DB == nil {
		return nil, ErrScopeRequired
	}
	schema := resolved.QSchema()

	// 1. Access rows, with the same scope and source filter as the other tabs.
	// policy_name is read through to_jsonb so tenants whose table predates the
	// column still load (the name then falls back to the ARN).
	a := &humanArgs{}
	whereSQL := strings.Join(humanWhere(resolved, a, source, "", nil, nil, "", ""), " AND ")
	q := fmt.Sprintf(`
		SELECT h.id::text, COALESCE(h.user_name, h.id::text), h.source, COALESCE(h.arn, ''),
		       a.account_id, a.access_type,
		       COALESCE(a.permission_set_arn, ''), COALESCE(a.permission_set_name, ''),
		       COALESCE(a.policy_arn, ''), COALESCE(to_jsonb(a)->>'policy_name', ''),
		       COALESCE(a.policy_document::text, ''), a.session_duration
		FROM %[1]s.human_identity_access a
		JOIN %[1]s.human_identities h ON h.id = a.human_id
		WHERE %[2]s
		ORDER BY h.source, a.account_id, h.user_name`, schema, whereSQL)
	rows, err := resolved.DB.QueryContext(ctx, q, a.values...)
	if err != nil {
		return nil, fmt.Errorf("query permission set access: %w", err)
	}
	defer rows.Close()

	var accessRows []hpRow
	iam := map[string]*hpInfo{}
	for rows.Next() {
		var row hpRow
		if err := rows.Scan(
			&row.humanID, &row.userName, &row.source, &row.arn,
			&row.accountID, &row.accessType,
			&row.permSetARN, &row.permSetName,
			&row.policyARN, &row.policyName,
			&row.document, &row.session,
		); err != nil {
			return nil, fmt.Errorf("scan permission set access: %w", err)
		}
		accessRows = append(accessRows, row)
		if row.source != HumanSourceSSO {
			if _, ok := iam[row.humanID]; !ok {
				iam[row.humanID] = &hpInfo{arn: row.arn}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate permission set access: %w", err)
	}

	var usage *RequestActivity
	usageOn := false
	if activity != nil {
		usage = activity.ForRequest(ctx, resolved)
		usageOn = usage.Available()
	}

	// 2. Access key IDs for IAM identities. Usage is recorded against the key
	// ID as well as the user ARN, so both are needed.
	if usageOn && len(iam) > 0 {
		ka := &humanArgs{}
		keyWhere := strings.Join(humanWhere(resolved, ka, source, "", nil, nil, "", ""), " AND ")
		keyType := ka.add(CredTypeAccessKey)
		kq := fmt.Sprintf(`
		SELECT c.human_id::text, c.credential_ref
		FROM %[1]s.human_identity_credentials c
		JOIN %[1]s.human_identities h ON h.id = c.human_id
		WHERE %[2]s AND c.credential_type = %[3]s`, schema, keyWhere, keyType)
		keyRows, err := resolved.DB.QueryContext(ctx, kq, ka.values...)
		if err != nil {
			return nil, fmt.Errorf("query permission set access keys: %w", err)
		}
		defer keyRows.Close()
		for keyRows.Next() {
			var hid, ref string
			if err := keyRows.Scan(&hid, &ref); err != nil {
				return nil, fmt.Errorf("scan permission set access key: %w", err)
			}
			if info, ok := iam[hid]; ok && ref != "" {
				info.keys = append(info.keys, ref)
			}
		}
		if err := keyRows.Err(); err != nil {
			return nil, fmt.Errorf("iterate permission set access keys: %w", err)
		}
	}

	// 3. Usage per IAM identity. The group usage is the union across its identities.
	usedByHuman := map[string][]chrepo.UsedPermission{}
	if usageOn {
		since := UsageSince(time.Now())
		for hid, info := range iam {
			keys := []string{}
			if info.arn != "" {
				keys = append(keys, info.arn)
			}
			keys = append(keys, info.keys...)
			usedByHuman[hid] = usage.UsedPermissions(ctx, keys, since)
		}
	}

	// 4. Group rows. SSO rows group by permission set. IAM rows group by policy:
	// a managed policy by its ARN, an inline policy by account, name and document.
	groups := map[string]*hpGroup{}
	var order []string
	for _, row := range accessRows {
		isSSO := row.source == HumanSourceSSO
		managedPolicy := row.policyARN != "" && row.accessType != "iam_inline_policy"

		var key, kind, name, arn string
		switch {
		case isSSO:
			kind = "permission_set"
			arn = hpFirst(row.permSetARN, row.policyARN, row.policyName)
			name = hpFirst(row.permSetName, row.policyName, arn)
			key = "sso|" + arn
		case managedPolicy:
			kind = "managed"
			arn = row.policyARN
			name = hpFirst(row.policyName, hpLastSegment(arn))
			key = "iam|managed|" + arn
		default:
			kind = "inline"
			name = hpFirst(row.policyName, row.permSetName, "inline policy")
			key = "iam|inline|" + row.accountID + "|" + name + "|" + row.document
		}

		g, ok := groups[key]
		if !ok {
			sourceLabel := HumanPermSourceIAM
			if isSSO {
				sourceLabel = HumanPermSourceSSO
			}
			g = &hpGroup{
				set: HumanPermissionSet{
					Source: sourceLabel,
					Kind:   kind,
					Name:   name,
					ARN:    arn,
				},
				isSSO:      isSSO,
				identByID:  map[string]*HumanAssignedIdentity{},
				policySeen: map[string]bool{},
				docSeen:    map[string]bool{},
			}
			groups[key] = g
			order = append(order, key)
		}

		if g.set.SessionDuration == nil && row.session.Valid && strings.TrimSpace(row.session.String) != "" {
			s := row.session.String
			g.set.SessionDuration = &s
		}

		polKind := "inline"
		if managedPolicy {
			polKind = "managed"
		}
		// A managed policy is the same policy on every row whatever name the row
		// carries, so it is keyed by ARN and named once.
		polName := hpFirst(row.policyName, hpLastSegment(row.policyARN), "inline policy")
		pk := polKind + "|" + polName
		if managedPolicy {
			if !isSSO {
				polName = g.set.Name
			}
			pk = polKind + "|" + row.policyARN
		}
		if !g.policySeen[pk] {
			g.policySeen[pk] = true
			g.policies = append(g.policies, HumanPermissionPolicyRef{
				Name:        polName,
				ARN:         row.policyARN,
				Kind:        polKind,
				HasDocument: row.document != "",
			})
		}

		ident, ok := g.identByID[row.humanID]
		if !ok {
			ident = &HumanAssignedIdentity{
				HumanID:    row.humanID,
				UserName:   row.userName,
				Source:     g.set.Source,
				AccountIDs: []string{},
			}
			g.identByID[row.humanID] = ident
			g.identOrder = append(g.identOrder, row.humanID)
		}
		if !hpContains(ident.AccountIDs, row.accountID) {
			ident.AccountIDs = append(ident.AccountIDs, row.accountID)
		}

		if row.document != "" {
			label := polName
			dk := label + "\x00" + row.document
			if !g.docSeen[dk] {
				g.docSeen[dk] = true
				g.docs = append(g.docs, hpPolicyText{label: label, doc: row.document})
			}
		}
	}

	// 5. Build the output: actions, usage and summary per group.
	out := make([]HumanPermissionSet, 0, len(order))
	for _, key := range order {
		g := groups[key]
		set := g.set
		set.Policies = g.policies
		if set.Policies == nil {
			set.Policies = []HumanPermissionPolicyRef{}
		}
		set.AssignedIdentities = make([]HumanAssignedIdentity, 0, len(g.identOrder))
		for _, hid := range g.identOrder {
			set.AssignedIdentities = append(set.AssignedIdentities, *g.identByID[hid])
		}
		sort.SliceStable(set.AssignedIdentities, func(i, j int) bool {
			return set.AssignedIdentities[i].UserName < set.AssignedIdentities[j].UserName
		})

		actions := make([]HumanPermissionAction, 0)
		seen := map[string]bool{}
		for _, d := range g.docs {
			for _, p := range hpParseAllowedActions(d.doc) {
				ak := p.service + ":" + p.action + "|" + p.resource + "|" + d.label
				if seen[ak] {
					continue
				}
				seen[ak] = true
				actions = append(actions, HumanPermissionAction{
					Effect:       "Allow",
					Service:      p.service,
					Action:       p.action,
					Resource:     p.resource,
					PolicySource: d.label,
					SourceIPs:    []string{},
				})
			}
		}

		// An IAM policy with no Allow actions (for example a Deny-only policy)
		// grants nothing, so it is not listed. SSO sets are always listed.
		if !g.isSSO && len(actions) == 0 {
			continue
		}

		set.UsageAvailable = !g.isSSO && usageOn
		set.Summary.ActionsAllowed = len(actions)
		if set.UsageAvailable {
			var union []chrepo.UsedPermission
			for _, hid := range g.identOrder {
				union = append(union, usedByHuman[hid]...)
			}
			used := 0
			for i := range actions {
				matched, last, ips := usageFor(actions[i].Service, actions[i].Action, union)
				actions[i].Used90d = &matched
				actions[i].LastUsedAt = last
				if ips == nil {
					ips = []string{}
				}
				actions[i].SourceIPs = ips
				if matched {
					used++
				}
			}
			allowed := len(actions)
			never := allowed - used
			share := 0
			if allowed > 0 {
				share = (used*100 + allowed/2) / allowed
			}
			set.Summary.Used90d = &used
			set.Summary.NeverUsed = &never
			set.Summary.ShareUsedPct = &share
		}
		set.Actions = actions
		out = append(out, set)
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Source != out[j].Source {
			return out[i].Source < out[j].Source
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].ARN < out[j].ARN
	})
	return out, nil
}

// hpParsedAction is one action and resource pair from an Allow statement.
type hpParsedAction struct {
	service  string
	action   string
	resource string
}

// hpPolicyDoc and hpStatement read only the fields needed for Allow actions.
// NotAction and Condition are ignored.
type hpPolicyDoc struct {
	Statement json.RawMessage `json:"Statement"`
}

type hpStatement struct {
	Effect   string          `json:"Effect"`
	Action   json.RawMessage `json:"Action"`
	Resource json.RawMessage `json:"Resource"`
}

// hpParseAllowedActions returns one entry per action and resource in the Allow
// statements of a policy document. Statement, Action and Resource may each be
// a single value or an array.
func hpParseAllowedActions(doc string) []hpParsedAction {
	if strings.TrimSpace(doc) == "" {
		return nil
	}
	var pd hpPolicyDoc
	if err := json.Unmarshal([]byte(doc), &pd); err != nil {
		return nil
	}
	var out []hpParsedAction
	for _, st := range hpParseStatements(pd.Statement) {
		if !strings.EqualFold(strings.TrimSpace(st.Effect), "Allow") {
			continue
		}
		actions := hpJSONStringList(st.Action)
		resources := hpJSONStringList(st.Resource)
		if len(resources) == 0 {
			resources = []string{""}
		}
		for _, act := range actions {
			svc, name := hpSplitAction(act)
			for _, res := range resources {
				out = append(out, hpParsedAction{service: svc, action: name, resource: res})
			}
		}
	}
	return out
}

func hpParseStatements(raw json.RawMessage) []hpStatement {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var list []hpStatement
		if json.Unmarshal(raw, &list) != nil {
			return nil
		}
		return list
	}
	var one hpStatement
	if json.Unmarshal(raw, &one) != nil {
		return nil
	}
	return []hpStatement{one}
}

func hpJSONStringList(raw json.RawMessage) []string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var list []string
		if json.Unmarshal(raw, &list) != nil {
			return nil
		}
		return list
	}
	var one string
	if json.Unmarshal(raw, &one) == nil && one != "" {
		return []string{one}
	}
	return nil
}

// hpSplitAction splits "s3:GetObject" into service and action. "*" means every
// service and action.
func hpSplitAction(action string) (string, string) {
	a := strings.TrimSpace(action)
	if a == "*" {
		return "*", "*"
	}
	svc, name, ok := strings.Cut(a, ":")
	if !ok {
		return "", a
	}
	return svc, name
}

// hpFirst returns the first non-empty trimmed value.
func hpFirst(values ...string) string {
	for _, v := range values {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

// hpLastSegment returns the part of an ARN after the last "/".
func hpLastSegment(arn string) string {
	if i := strings.LastIndex(arn, "/"); i >= 0 {
		return arn[i+1:]
	}
	return arn
}

func hpContains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
