package listactions

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ListActionsService struct {
	repo *ListActionsRepository
}

func NewListActionsService(r *ListActionsRepository) *ListActionsService {
	return &ListActionsService{repo: r}
}

func (s *ListActionsService) List(ctx context.Context, c common.Caller) ([]domain.Action, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, c.TenantID)
}
