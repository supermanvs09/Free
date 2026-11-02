package createplan

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
