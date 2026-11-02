package executeplan

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ExecutePlanService struct {
	repo *ExecutePlanRepository
}

func NewExecutePlanService(r *ExecutePlanRepository) *ExecutePlanService {
	return &ExecutePlanService{repo: r}
}

func (s *ExecutePlanService) Execute(ctx context.Context, c common.Caller, planID string) (*domain.Execution, error) {
	if err := common.Require(c, domain.PermExecute); err != nil {
		return nil, err
	}
	return s.repo.Execute(ctx, c.Actor(), planID)
}
