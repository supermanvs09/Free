package approveplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ApprovePlanRepository records the approval (remediation_approvals) and the
// resulting status change through the engine.
type ApprovePlanRepository struct {
	core *engine.Service
}

func NewApprovePlanRepository(core *engine.Service) *ApprovePlanRepository {
	return &ApprovePlanRepository{core: core}
}

func (r *ApprovePlanRepository) Approve(ctx context.Context, actor domain.Actor, planID, comment string) (*domain.Plan, error) {
	return r.core.Decide(ctx, actor, planID, true, comment)
}
