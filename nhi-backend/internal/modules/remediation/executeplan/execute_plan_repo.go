package executeplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ExecutePlanRepository queues the execution (remediation_executions is the
// queue) through the engine, which re-checks approvals, expiry and the
// account's One-click settings first.
type ExecutePlanRepository struct {
	core *engine.Service
}

func NewExecutePlanRepository(core *engine.Service) *ExecutePlanRepository {
	return &ExecutePlanRepository{core: core}
}

func (r *ExecutePlanRepository) Execute(ctx context.Context, actor domain.Actor, planID string) (*domain.Execution, error) {
	return r.core.Execute(ctx, actor, planID)
}
