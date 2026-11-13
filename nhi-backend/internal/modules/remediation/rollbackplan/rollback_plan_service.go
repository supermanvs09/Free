package rollbackplan

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type RollbackPlanService struct {
	repo *RollbackPlanRepository
}

func NewRollbackPlanService(r *RollbackPlanRepository) *RollbackPlanService {
	return &RollbackPlanService{repo: r}
}

func (s *RollbackPlanService) Rollback(ctx context.Context, c common.Caller, planID string) (*domain.Execution, error) {
	if err := common.Require(c, domain.PermExecute); err != nil {
		return nil, err
	}
	return s.repo.Rollback(ctx, c.Actor(), planID)
}
