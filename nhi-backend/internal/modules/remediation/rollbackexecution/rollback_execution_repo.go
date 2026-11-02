package rollbackexecution

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// RollbackExecutionRepository queues the ROLLBACK execution through the engine.
type RollbackExecutionRepository struct {
	core *engine.Service
}

func NewRollbackExecutionRepository(core *engine.Service) *RollbackExecutionRepository {
	return &RollbackExecutionRepository{core: core}
}

func (r *RollbackExecutionRepository) Rollback(ctx context.Context, actor domain.Actor, executionID string) (*domain.Execution, error) {
	return r.core.Rollback(ctx, actor, executionID)
}
