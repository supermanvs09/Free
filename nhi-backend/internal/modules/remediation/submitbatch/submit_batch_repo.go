package submitbatch

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// SubmitBatchRepository submits the plans of the batch through the engine.
type SubmitBatchRepository struct {
	core *engine.Service
}

func NewSubmitBatchRepository(core *engine.Service) *SubmitBatchRepository {
	return &SubmitBatchRepository{core: core}
}

func (r *SubmitBatchRepository) Submit(ctx context.Context, actor domain.Actor, batchID string) (*domain.Batch, error) {
	return r.core.SubmitBatch(ctx, actor, batchID)
}
