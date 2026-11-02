package findingplans

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/store"
)

type FindingPlansRepository struct {
	core *engine.Service
}

func NewFindingPlansRepository(core *engine.Service) *FindingPlansRepository {
	return &FindingPlansRepository{core: core}
}

// List reads the plans whose finding_ids contain the finding.
func (r *FindingPlansRepository) List(ctx context.Context, tenantID, findingID string) ([]domain.Plan, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	plans, err := st.ListPlans(ctx, store.PlanFilter{FindingID: findingID, Limit: findingPlansLimit})
	if plans == nil && err == nil {
		plans = []domain.Plan{}
	}
	return plans, err
}
