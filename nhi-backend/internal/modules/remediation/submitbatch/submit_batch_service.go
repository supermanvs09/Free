package submitbatch

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type SubmitBatchService struct {
	repo *SubmitBatchRepository
}

func NewSubmitBatchService(r *SubmitBatchRepository) *SubmitBatchService {
	return &SubmitBatchService{repo: r}
}

func (s *SubmitBatchService) Submit(ctx context.Context, c common.Caller, batchID string) (*domain.Batch, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	return s.repo.Submit(ctx, c.Actor(), batchID)
}
