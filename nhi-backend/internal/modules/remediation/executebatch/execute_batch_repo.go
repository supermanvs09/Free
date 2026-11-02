package executebatch

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ExecuteBatchRepository queues the executions of the batch through the engine.
type ExecuteBatchRepository struct {
	core *engine.Service
}

func NewExecuteBatchRepository(core *engine.Service) *ExecuteBatchRepository {
	return &ExecuteBatchRepository{core: core}
}

func (r *ExecuteBatchRepository) Execute(ctx context.Context, actor domain.Actor, batchID string) (*engine.ExecuteBatchResult, error) {
	return r.core.ExecuteBatch(ctx, actor, batchID)
}
