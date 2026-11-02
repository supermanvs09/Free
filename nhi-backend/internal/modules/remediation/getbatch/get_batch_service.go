package getbatch

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type GetBatchService struct {
	repo *GetBatchRepository
}

func NewGetBatchService(r *GetBatchRepository) *GetBatchService {
	return &GetBatchService{repo: r}
}

func (s *GetBatchService) Get(ctx context.Context, c common.Caller, id string) (*domain.Batch, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, id)
}
