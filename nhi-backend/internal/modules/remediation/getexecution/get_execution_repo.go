package getexecution

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type GetExecutionRepository struct {
	core *engine.Service
}

func NewGetExecutionRepository(core *engine.Service) *GetExecutionRepository {
	return &GetExecutionRepository{core: core}
}

// Get reads one row of remediation_executions.
func (r *GetExecutionRepository) Get(ctx context.Context, tenantID, id string) (*domain.Execution, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	ex, err := st.GetExecution(ctx, id)
	if err != nil {
		return nil, common.NotFound("execution", err)
	}
	return ex, nil
}
