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

// List reads one page of remediation_plans of the tenant, newest first, and the number of
// plans that match the filter in all pages.
func (r *ListPlansRepository) List(ctx context.Context, tenantID string, f store.PlanFilter) ([]domain.Plan, int, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, 0, err
	}
	plans, err := st.ListPlans(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	if plans == nil {
		plans = []domain.Plan{}
	}
	total, err := st.CountPlans(ctx, f)
	return plans, total, err
}
