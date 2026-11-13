package rollbackplan

import "nhi-backend-api/internal/remediation/domain"

// POST /remediation/plans/{id}/rollback (analyst / admin)
//
// {id} is the plan_id: the same plan_id the rule engine writes to remediation_audit_log for its
// automatic remediation, or a dashboard plan. The backend links the plan to its last succeeded
// EXECUTE execution and queues a ROLLBACK execution that replays the snapshot taken before the
// change. Only a reversible action of a plan in EXECUTED / VERIFIED / RESOLVED can be rolled back.

// RollbackResponse is the 202 body: the new ROLLBACK execution.
type RollbackResponse struct {
	Data      *domain.Execution `json:"data"`
	StatusURL string            `json:"status_url"`
}

// executionsPath is where an execution can be read.
const executionsPath = "/api/v1/remediation/executions/"
