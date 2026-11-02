package rollbackexecution

import "nhi-backend-api/internal/remediation/domain"

// POST /remediation/executions/{id}/rollback (analyst / admin)
//
// Queues a ROLLBACK execution that replays the snapshot taken before the
// change. Only a SUCCEEDED EXECUTE of a reversible action can be rolled back.

// RollbackResponse is the 202 body: the new ROLLBACK execution.
type RollbackResponse struct {
	Data      *domain.Execution `json:"data"`
	StatusURL string            `json:"status_url"`
}

// executionsPath is where an execution can be read.
const executionsPath = "/api/v1/remediation/executions/"
