package findingplans

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type FindingPlansService struct {
	repo *FindingPlansRepository
}

func NewFindingPlansService(r *FindingPlansRepository) *FindingPlansService {
	return &FindingPlansService{repo: r}
}

func (s *FindingPlansService) List(ctx context.Context, c common.Caller, findingID string) ([]domain.Plan, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, c.TenantID, findingID)
}
