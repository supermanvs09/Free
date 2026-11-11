package findingfix

import "nhi-backend-api/internal/remediation/domain"

// GET /remediation/findings/{finding_id}/fix (every role): how to fix one finding, read only.
// Nothing is stored and AWS is never called: the answer is built from the finding
// (ispm_nhi_findings) and, for a rule with a mapped fix, from the action catalog and the
// account settings (accounts). A rule without a mapped fix gets its by-hand fix (title,
// description, steps) from the table remediation_guides. One-click needs a mapped fix.
// The answer is { "data": FindingFix }.

// FindingFix is the fix of one finding.
type FindingFix struct {
	FindingID    string `json:"finding_id"`
	RuleID       string `json:"rule_id"`
	RuleName     string `json:"rule_name"`
	Severity     string `json:"severity"`
	Status       string `json:"status"`
	Identity     string `json:"identity"` // "name (type)"
	IdentityID   string `json:"identity_id"`
	IdentityName string `json:"identity_name"`
	IdentityType string `json:"identity_type"`
	AccountID    string `json:"account_id"`
	Resource     string `json:"resource"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	WhyItMatters string `json:"why_it_matters"` // the scanner's risk explanation (may be empty)
	HowToFix     string `json:"how_to_fix"`
	DashboardURL string `json:"dashboard_url"`
	// Fix: the rule's mapped fix (remediation_actions), or for a rule without one its by-hand fix
	// from remediation_guides ("manual": true, action_type "manual_fix"; the rule's row, else DEFAULT).
	// null only when the rule has no mapped fix and remediation_guides has no row for it.
	Fix        *FixAction `json:"fix"`
	OtherFixes []FixRef   `json:"other_fixes"`
	// Modes are the two ways to fix the finding, for the dashboard's Guided / One-click choice.
	Modes Modes `json:"modes"`
	// SummaryText is the whole answer as plain text, ready to show or copy.
	SummaryText string `json:"summary_text"`
}

// FixAction is the mapped fix of the rule with its guided steps for this finding.
type FixAction struct {
	ActionType        string      `json:"action_type"`
	Title             string      `json:"title"`
	Description       string      `json:"description"`
	RiskLevel         domain.Risk `json:"risk_level"`
	Reversible        bool        `json:"reversible"`
	OneClickSupported bool        `json:"one_click_supported"`
	// Manual: there is no automatic fix for the rule; the steps are done by hand (Guided only).
	Manual bool                `json:"manual"`
	Steps  []domain.GuidedStep `json:"steps"`
}

// Modes: Guided is always offered (the steps); One-click when the backend can apply the fix.
type Modes struct {
	Guided   GuidedMode   `json:"guided"`
	OneClick OneClickMode `json:"one_click"`
}

type GuidedMode struct {
	Available bool   `json:"available"` // true for every OPEN finding (mapped fix or by-hand steps)
	Reason    string `json:"reason,omitempty"`
	Flow      string `json:"flow"`
}

// OneClickMode says whether POST /plans with "mode":"ONE_CLICK" works for this finding and
// what happens then: a risky fix, or any fix on a Critical finding, needs approval first; a
// safe fix (deactivate_key, enable_key_rotation, set_session_duration) on a lower severity runs right away.
type OneClickMode struct {
	Available        bool   `json:"available"`
	Reason           string `json:"reason,omitempty"` // why not, when not available
	ApprovalRequired bool   `json:"approval_required"`
	Flow             string `json:"flow"`
	// PendingPlan is the plan of this finding that already waits for approval or is about to
	// run (often made by the engine's automatic remediation after a scan); POST /plans with
	// "mode":"ONE_CLICK" returns this plan instead of making a new one. null when there is none.
	PendingPlan *PendingPlan `json:"pending_plan"`
}

type PendingPlan struct {
	PlanID    string `json:"plan_id"`
	Status    string `json:"status"`     // PENDING_APPROVAL | APPROVED | SCHEDULED | EXECUTING
	CreatedBy string `json:"created_by"` // a user, or auto:<policy> for the engine
	ByEngine  bool   `json:"by_engine"`  // true: the engine runs it once approved
}

// FixRef names another fix that can be chosen for the rule.
type FixRef struct {
	ActionType string `json:"action_type"`
	Title      string `json:"title"`
}
