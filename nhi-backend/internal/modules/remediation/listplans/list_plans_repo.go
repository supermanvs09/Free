package listplans

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/store"
)

type ListPlansRepository struct {
	core *engine.Service
}

func NewListPlansRepository(core *engine.Service) *ListPlansRepository {
	return &ListPlansRepository{core: core}
}

// List reads remediation_plans of the tenant, newest first.
func (r *ListPlansRepository) List(ctx context.Context, tenantID string, f store.PlanFilter) ([]domain.Plan, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	plans, err := st.ListPlans(ctx, f)
	if plans == nil && err == nil {
		plans = []domain.Plan{}
	}
	return plans, err
}
