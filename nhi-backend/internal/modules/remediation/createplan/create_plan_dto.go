package createplan

import "nhi-backend-api/internal/remediation/domain"

// POST /remediation/plans (analyst / admin)

// CreatePlanRequest builds a plan for one or more findings of one target.
type CreatePlanRequest struct {
	FindingIDs []string       `json:"finding_ids"`
	ActionType string         `json:"action_type"` // optional: the default action of the rule
	Params     map[string]any `json:"params"`      // optional overrides, e.g. target_arn
	Mode       string         `json:"mode"`        // optional: GUIDED | ONE_CLICK
}

// maxFindings bounds finding_ids of one plan.
const maxFindings = 100

// CreatePlanResponse is the answer: 201 { "data": plan } for a new plan, or 200
// { "data": plan, "existing_plan": true, "message": "…" } when a One-click request finds a plan
// of these findings that already waits for approval or is about to run (for example one the
// engine's automatic remediation created after a scan). That plan is returned as it is.
type CreatePlanResponse struct {
	Data         *domain.Plan `json:"data"`
	ExistingPlan bool         `json:"existing_plan,omitempty"`
	Message      string       `json:"message,omitempty"`
}
