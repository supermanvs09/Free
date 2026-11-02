package getplan

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type GetPlanService struct {
	repo *GetPlanRepository
}

func NewGetPlanService(r *GetPlanRepository) *GetPlanService {
	return &GetPlanService{repo: r}
}

func (s *GetPlanService) Get(ctx context.Context, c common.Caller, id string) (*PlanDetail, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, id)
}
