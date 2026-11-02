package createbatch

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// CreateBatchRepository stores the batch and builds its plans through the engine.
type CreateBatchRepository struct {
	core *engine.Service
}

func NewCreateBatchRepository(core *engine.Service) *CreateBatchRepository {
	return &CreateBatchRepository{core: core}
}

func (r *CreateBatchRepository) Create(ctx context.Context, actor domain.Actor, req engine.CreateBatchReq) (*engine.BatchResult, error) {
	return r.core.CreateBatch(ctx, actor, req)
}
