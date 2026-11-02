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

func (r *CreatePlanRepository) Create(ctx context.Context, actor domain.Actor, req engine.CreatePlanReq) (*domain.Plan, error) {
	return r.core.CreatePlan(ctx, actor, req)
}
