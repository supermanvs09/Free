package confirmexternal

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ConfirmExternalService struct {
	repo *ConfirmExternalRepository
}

func NewConfirmExternalService(r *ConfirmExternalRepository) *ConfirmExternalService {
	return &ConfirmExternalService{repo: r}
}

func (s *ConfirmExternalService) Confirm(ctx context.Context, c common.Caller, planID string) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	return s.repo.Confirm(ctx, c.Actor(), planID)
}
