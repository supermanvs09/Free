package getplan

import "nhi-backend-api/internal/remediation/domain"

// GET /remediation/plans/{id} (every role)

// PlanDetail is a plan with its approvals and executions.
type PlanDetail struct {
	Plan        *domain.Plan       `json:"plan"`
	Approvals   []domain.Approval  `json:"approvals"`
	Executions  []domain.Execution `json:"executions"`
	ApprovalsOK int                `json:"approvals_counted"` // distinct approvers of the current plan hash
}
