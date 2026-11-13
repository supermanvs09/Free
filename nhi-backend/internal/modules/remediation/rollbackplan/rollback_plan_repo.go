package rollbackplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// RollbackPlanRepository queues the ROLLBACK execution of a plan through the engine.
type RollbackPlanRepository struct {
	core *engine.Service
}

func NewRollbackPlanRepository(core *engine.Service) *RollbackPlanRepository {
	return &RollbackPlanRepository{core: core}
}

func (r *RollbackPlanRepository) Rollback(ctx context.Context, actor domain.Actor, planID string) (*domain.Execution, error) {
	return r.core.RollbackPlan(ctx, actor, planID)
}
