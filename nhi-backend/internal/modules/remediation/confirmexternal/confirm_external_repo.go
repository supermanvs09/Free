package confirmexternal

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ConfirmExternalRepository updates the plan params and status through the engine.
type ConfirmExternalRepository struct {
	core *engine.Service
}

func NewConfirmExternalRepository(core *engine.Service) *ConfirmExternalRepository {
	return &ConfirmExternalRepository{core: core}
}

func (r *ConfirmExternalRepository) Confirm(ctx context.Context, actor domain.Actor, planID string) (*domain.Plan, error) {
	return r.core.ConfirmExternal(ctx, actor, planID)
}
