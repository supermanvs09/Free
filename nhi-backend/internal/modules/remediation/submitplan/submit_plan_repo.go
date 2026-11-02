package submitplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// SubmitPlanRepository moves the plan to PENDING_APPROVAL through the engine
// (status change, approval window, audit row and notification).
type SubmitPlanRepository struct {
	core *engine.Service
}

func NewSubmitPlanRepository(core *engine.Service) *SubmitPlanRepository {
	return &SubmitPlanRepository{core: core}
}

func (r *SubmitPlanRepository) Submit(ctx context.Context, actor domain.Actor, planID string) (*domain.Plan, error) {
	return r.core.Submit(ctx, actor, planID)
}
