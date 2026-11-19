package identitygraph

import (
	"fmt"
	"strings"
)

// Credential types as written by the collector into human_identity_credentials.
const (
	CredTypeAccessKey = "ACCESS_KEY"
	CredTypePassword  = "PASSWORD"
	CredTypeMFADevice = "MFA_DEVICE"
)

// humanAdminActions are policy actions that grant full administrative access.
// Compared case-insensitively.
var humanAdminActions = []string{"*", "*:*", "iam:*"}

// humanEscalationActions are policy actions that let a user gain more privilege
// than they have. Lower case; compared case-insensitively.
var humanEscalationActions = []string{
	"iam:passrole",
	"iam:createpolicyversion",
	"iam:setdefaultpolicyversion",
	"iam:attachuserpolicy",
	"iam:attachrolepolicy",
	"iam:attachgrouppolicy",
	"iam:putuserpolicy",
	"iam:putrolepolicy",
	"iam:putgrouppolicy",
	"iam:createaccesskey",
	"iam:createloginprofile",
	"iam:updateloginprofile",
	"iam:addusertogroup",
	"iam:updateassumerolepolicy",
}

// hiTS casts a text expression read from details to timestamptz only when it
// looks like a date. The IAM credential report writes values such as "N/A" or
// "not_supported" in date columns; a plain ::timestamptz cast on those would
// fail the whole overview or list query.
func hiTS(expr string) string {
	return "(CASE WHEN (" + expr + ") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (" + expr + ")::timestamptz END)"
}

// Sign-in and password timestamps from identity details.
var (
	hiPasswordChanged  = hiTS("h.details->>'password_last_changed'")
	hiLastConsoleLogin = hiTS("h.details->'last_console_login'->>'at'")
	hiLastFailedLogin  = hiTS("h.details->'last_failed_console_login'->>'at'")
)

// HumanRiskRule is one risk definition. It is written once here and used by the
// overview counts, the risk= list filter and the detail risk signals, so the three
// cannot disagree. A rule with an empty Label is used only for counts and filters
// and does not produce a risk signal.
type HumanRiskRule struct {
	Key      string
	Label    string
	Severity string
	where    func(schema string) string
}

// HumanRiskRules lists every rule. Signals are reported in this order.
var HumanRiskRules = []HumanRiskRule{
	{
		Key: "root_no_mfa", Label: "Root account without MFA", Severity: "critical",
		where: func(string) string {
			return fmt.Sprintf("h.human_type = '%s' AND h.mfa_active IS NOT TRUE", HumanTypeRoot)
		},
	},
	{
		Key: "console_no_mfa", Label: "Console access without MFA", Severity: "critical",
		where: func(string) string {
			return "h.console_access IS TRUE AND h.mfa_active IS NOT TRUE"
		},
	},
	{
		Key: "mfa_disabled", Label: "MFA disabled", Severity: "high",
		where: func(string) string {
			return "h.mfa_active IS FALSE"
		},
	},
	{
		Key: "never_used", Label: "Never used", Severity: "medium",
		where: func(string) string {
			return fmt.Sprintf("h.source = '%s' AND h.last_activity_at IS NULL", HumanSourceIAM)
		},
	},
	{
		Key: "inactive_90d", Label: "Inactive over 90 days", Severity: "high",
		where: func(string) string {
			return fmt.Sprintf("h.source = '%s' AND h.last_activity_at < NOW() - INTERVAL '90 days'", HumanSourceIAM)
		},
	},
	{
		Key: "admin", Label: "Privileged access", Severity: "high",
		where: humanAdminWhere,
	},
	{
		// Policy-only admin. Count and filter only, no signal.
		Key: "admin_policy",
		where: func(s string) string {
			return accessExists(s, policyAllowsActionsSQL("a", humanAdminActions))
		},
	},
	{
		Key: "escalation", Label: "Privilege escalation risk", Severity: "high",
		where: func(s string) string {
			return accessExists(s, policyAllowsActionsSQL("a", humanEscalationActions))
		},
	},
	{
		// Count and filter only, no signal.
		Key: "active_access_key",
		where: func(s string) string {
			return hiCredExists(s, CredTypeAccessKey, "")
		},
	},
	{
		Key: "old_access_key", Label: "Access key older than 90 days", Severity: "high",
		where: func(s string) string {
			return hiCredExists(s, CredTypeAccessKey,
				"COALESCE(c.last_rotated_at, c.created_at) < NOW() - INTERVAL '90 days'")
		},
	},
	{
		Key: "unused_access_key", Label: "Access key never used", Severity: "medium",
		where: func(s string) string {
			return hiCredExists(s, CredTypeAccessKey, "c.last_used_at IS NULL")
		},
	},
	{
		Key: "two_active_keys", Label: "Two active access keys", Severity: "medium",
		where: func(s string) string {
			return fmt.Sprintf(
				"(SELECT COUNT(*) FROM %s.human_identity_credentials c WHERE c.human_id = h.id AND c.credential_type = '%s' AND c.status = 'active') >= 2",
				s, CredTypeAccessKey)
		},
	},
	{
		Key: "old_password", Label: "Password older than 90 days", Severity: "high",
		where: func(s string) string {
			return hiCredExists(s, CredTypePassword,
				"COALESCE("+hiPasswordChanged+", c.created_at) < NOW() - INTERVAL '90 days'")
		},
	},
	{
		Key: "password_never_changed", Label: "Password never changed since creation", Severity: "medium",
		where: func(s string) string {
			changed := hiPasswordChanged
			return fmt.Sprintf(
				"h.source = '%s' AND %s AND (%s IS NULL OR (h.created_at_source IS NOT NULL AND %s <= h.created_at_source + INTERVAL '1 day'))",
				HumanSourceIAM, hiCredExists(s, CredTypePassword, ""), changed, changed)
		},
	},
	{
		Key: "virtual_mfa_admin", Label: "Admin with only virtual MFA", Severity: "high",
		where: func(s string) string {
			return fmt.Sprintf("(%s) AND %s AND NOT %s",
				humanAdminWhere(s),
				hiCredExists(s, CredTypeMFADevice, "LOWER(COALESCE(c.mfa_type, '')) = 'virtual'"),
				hiCredExists(s, CredTypeMFADevice, "LOWER(COALESCE(c.mfa_type, '')) <> 'virtual'"))
		},
	},
	{
		Key: "login_without_mfa", Label: "Console login without MFA (last 90 days)", Severity: "high",
		where: func(string) string {
			return "LOWER(COALESCE(h.details->'last_console_login'->>'mfa_used', '')) = 'no' " +
				"AND " + hiLastConsoleLogin + " > NOW() - INTERVAL '90 days'"
		},
	},
	{
		Key: "failed_login", Label: "Recent failed console login (7 days)", Severity: "medium",
		where: func(string) string {
			return hiLastFailedLogin + " > NOW() - INTERVAL '7 days'"
		},
	},
}

// HumanRiskRuleByKey returns the rule with the given key.
func HumanRiskRuleByKey(key string) (HumanRiskRule, bool) {
	for _, rule := range HumanRiskRules {
		if rule.Key == key {
			return rule, true
		}
	}
	return HumanRiskRule{}, false
}

// IsValidHumanRisk reports whether key is a known risk rule key.
func IsValidHumanRisk(key string) bool {
	_, ok := HumanRiskRuleByKey(key)
	return ok
}

// humanSignalsFromFlags turns the triggered rules into detail risk signals.
func humanSignalsFromFlags(flags []bool) []HumanRiskSignal {
	set := make(map[string]bool, len(HumanRiskRules))
	for i, rule := range HumanRiskRules {
		set[rule.Key] = flags[i]
	}
	signals := []HumanRiskSignal{}
	for _, rule := range HumanRiskRules {
		if rule.Label == "" || !set[rule.Key] {
			continue
		}
		// Root without MFA is reported once, as root, not again as console access.
		if rule.Key == "console_no_mfa" && set["root_no_mfa"] {
			continue
		}
		signals = append(signals, HumanRiskSignal{Label: rule.Label, Severity: rule.Severity})
	}
	return signals
}

// humanAdminWhere is the identity-level admin rule: an admin-like permission set
// name, an AdministratorAccess policy ARN, or a policy document that allows admin actions.
func humanAdminWhere(schema string) string {
	return accessExists(schema, adminAccessCond("a"))
}

// adminAccessCond is the per-access-row admin test. Used by the identity rule and
// by the per-policy flags in the detail view.
func adminAccessCond(alias string) string {
	return fmt.Sprintf(
		"(%[1]s.permission_set_name ILIKE '%%admin%%' OR %[1]s.policy_arn ILIKE '%%AdministratorAccess%%' OR %[2]s)",
		alias, policyAllowsActionsSQL(alias, humanAdminActions))
}

// escalationAccessCond is the per-access-row escalation test.
func escalationAccessCond(alias string) string {
	return policyAllowsActionsSQL(alias, humanEscalationActions)
}

// accessExists wraps a condition on human_identity_access (alias a) in an EXISTS for the identity (alias h).
func accessExists(schema, cond string) string {
	return fmt.Sprintf(
		"EXISTS (SELECT 1 FROM %s.human_identity_access a WHERE a.human_id = h.id AND (%s))",
		schema, cond)
}

// hiCredExists is EXISTS over active credentials of one type for the identity (alias h).
func hiCredExists(schema, credType, extra string) string {
	cond := fmt.Sprintf("c.human_id = h.id AND c.credential_type = '%s' AND c.status = 'active'", credType)
	if extra != "" {
		cond += " AND (" + extra + ")"
	}
	return fmt.Sprintf("EXISTS (SELECT 1 FROM %s.human_identity_credentials c WHERE %s)", schema, cond)
}

// policyStatementsFrom expands the Statement of a policy document (object or array)
// into one row per statement, exposed as st(v).
func policyStatementsFrom(alias string) string {
	return fmt.Sprintf(`jsonb_array_elements(
		CASE WHEN jsonb_typeof(%[1]s.policy_document::jsonb -> 'Statement') = 'array'
		     THEN %[1]s.policy_document::jsonb -> 'Statement'
		     ELSE jsonb_build_array(%[1]s.policy_document::jsonb -> 'Statement')
		END) AS st(v)`, alias)
}

// policyAllowsActionsSQL is true when an Allow statement in the row's policy
// document lists one of the given actions. Deny statements are ignored.
// Action may be a string or an array.
func policyAllowsActionsSQL(alias string, actions []string) string {
	return fmt.Sprintf(`EXISTS (
		SELECT 1
		FROM %[1]s
		CROSS JOIN LATERAL jsonb_array_elements_text(
			CASE WHEN jsonb_typeof(st.v -> 'Action') = 'array'
			     THEN st.v -> 'Action'
			     ELSE jsonb_build_array(st.v -> 'Action')
			END) AS act(val)
		WHERE st.v ->> 'Effect' = 'Allow'
		  AND LOWER(act.val) IN (%[2]s)
	)`, policyStatementsFrom(alias), sqlQuoteList(actions))
}

// sqlQuoteList turns constant values into a quoted SQL list: 'a','b'.
func sqlQuoteList(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, v := range values {
		quoted = append(quoted, "'"+strings.ReplaceAll(v, "'", "''")+"'")
	}
	return strings.Join(quoted, ",")
}
