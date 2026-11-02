package executebatch

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type ExecuteBatchService struct {
	repo *ExecuteBatchRepository
}

func NewExecuteBatchService(r *ExecuteBatchRepository) *ExecuteBatchService {
	return &ExecuteBatchService{repo: r}
}

func (s *ExecuteBatchService) Execute(ctx context.Context, c common.Caller, batchID string) (*engine.ExecuteBatchResult, error) {
	if err := common.Require(c, domain.PermExecute); err != nil {
		return nil, err
	}
	return s.repo.Execute(ctx, c.Actor(), batchID)
}
