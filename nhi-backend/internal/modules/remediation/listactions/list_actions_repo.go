package listactions

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type ListActionsRepository struct {
	core *engine.Service
}

func NewListActionsRepository(core *engine.Service) *ListActionsRepository {
	return &ListActionsRepository{core: core}
}

// List reads remediation_actions (seeded from internal/remediation/catalog).
func (r *ListActionsRepository) List(ctx context.Context, tenantID string) ([]domain.Action, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	acts, err := st.ListActions(ctx)
	if acts == nil && err == nil {
		acts = []domain.Action{}
	}
	return acts, err
}
