package cancelplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// CancelPlanRepository cancels the plan (and its queued execution) through the engine.
type CancelPlanRepository struct {
	core *engine.Service
}

func NewCancelPlanRepository(core *engine.Service) *CancelPlanRepository {
	return &CancelPlanRepository{core: core}
}

func (r *CancelPlanRepository) Cancel(ctx context.Context, actor domain.Actor, planID, reason string) (*domain.Plan, error) {
	return r.core.Cancel(ctx, actor, planID, reason)
}
