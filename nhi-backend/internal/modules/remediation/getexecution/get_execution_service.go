package getexecution

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type GetExecutionService struct {
	repo *GetExecutionRepository
}

func NewGetExecutionService(r *GetExecutionRepository) *GetExecutionService {
	return &GetExecutionService{repo: r}
}

func (s *GetExecutionService) Get(ctx context.Context, c common.Caller, id string) (*domain.Execution, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, id)
}
