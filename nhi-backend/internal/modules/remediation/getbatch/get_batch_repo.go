package getbatch

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// GetBatchRepository reads the batch and its plans. The engine owns the read
// because submit and execute of a batch use it too.
type GetBatchRepository struct {
	core *engine.Service
}

func NewGetBatchRepository(core *engine.Service) *GetBatchRepository {
	return &GetBatchRepository{core: core}
}

func (r *GetBatchRepository) Get(ctx context.Context, tenantID, id string) (*domain.Batch, error) {
	return r.core.GetBatch(ctx, tenantID, id)
}
