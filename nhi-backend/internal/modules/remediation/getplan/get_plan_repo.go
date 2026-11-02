package getplan

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type GetPlanRepository struct {
	core *engine.Service
}

func NewGetPlanRepository(core *engine.Service) *GetPlanRepository {
	return &GetPlanRepository{core: core}
}

// Get reads the plan, its approvals and its executions.
func (r *GetPlanRepository) Get(ctx context.Context, tenantID, id string) (*PlanDetail, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	p, err := st.GetPlan(ctx, id)
	if err != nil {
		return nil, common.NotFound("plan", err)
	}
	d := &PlanDetail{Plan: p}
	if d.Approvals, err = st.ListApprovals(ctx, id); err != nil {
		return nil, err
	}
	if d.Executions, err = st.ListExecutions(ctx, id); err != nil {
		return nil, err
	}
	if d.Approvals == nil {
		d.Approvals = []domain.Approval{}
	}
	if d.Executions == nil {
		d.Executions = []domain.Execution{}
	}
	d.ApprovalsOK = engine.CountApprovals(ctx, st, p)
	return d, nil
}
