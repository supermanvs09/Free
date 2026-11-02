package rollbackexecution

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type RollbackExecutionService struct {
	repo *RollbackExecutionRepository
}

func NewRollbackExecutionService(r *RollbackExecutionRepository) *RollbackExecutionService {
	return &RollbackExecutionService{repo: r}
}

func (s *RollbackExecutionService) Rollback(ctx context.Context, c common.Caller, executionID string) (*domain.Execution, error) {
	if err := common.Require(c, domain.PermExecute); err != nil {
		return nil, err
	}
	return s.repo.Rollback(ctx, c.Actor(), executionID)
}
