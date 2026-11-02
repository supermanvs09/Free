package executeplan

import "nhi-backend-api/internal/remediation/domain"

// POST /remediation/plans/{id}/execute (analyst / admin)
//
// Queues an APPROVED One-click plan. The execution starts after the grace
// period of the action (scheduled_for); poll status_url for its progress.

// ExecutePlanResponse is the 202 body.
type ExecutePlanResponse struct {
	Data      *domain.Execution `json:"data"`
	StatusURL string            `json:"status_url"`
}

// executionsPath is where an execution can be read (Location / status_url).
const executionsPath = "/api/v1/remediation/executions/"
