package createplan

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// CreatePlanRepository stores a new plan through the remediation engine,
// which also supersedes older open plans of the same target and writes the audit row.
type CreatePlanRepository struct {
	core *engine.Service
}

func NewCreatePlanRepository(core *engine.Service) *CreatePlanRepository {
	return &CreatePlanRepository{core: core}
}

// Create returns the new plan, or (existing = true) the plan of these findings that already
// waits for approval or is about to run.
func (r *CreatePlanRepository) Create(ctx context.Context, actor domain.Actor, req engine.CreatePlanReq) (*domain.Plan, bool, error) {
	return r.core.CreateOrPendingPlan(ctx, actor, req)
}
