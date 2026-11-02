package rejectplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// RejectPlanRepository records the rejection through the engine.
type RejectPlanRepository struct {
	core *engine.Service
}

func NewRejectPlanRepository(core *engine.Service) *RejectPlanRepository {
	return &RejectPlanRepository{core: core}
}

func (r *RejectPlanRepository) Reject(ctx context.Context, actor domain.Actor, planID, comment string) (*domain.Plan, error) {
	return r.core.Decide(ctx, actor, planID, false, comment)
}
