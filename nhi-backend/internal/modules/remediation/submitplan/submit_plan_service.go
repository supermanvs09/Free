package submitplan

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type SubmitPlanService struct {
	repo *SubmitPlanRepository
}

func NewSubmitPlanService(r *SubmitPlanRepository) *SubmitPlanService {
	return &SubmitPlanService{repo: r}
}

func (s *SubmitPlanService) Submit(ctx context.Context, c common.Caller, planID string) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	return s.repo.Submit(ctx, c.Actor(), planID)
}
