package listintegrations

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ListIntegrationsService struct {
	repo *ListIntegrationsRepository
}

func NewListIntegrationsService(r *ListIntegrationsRepository) *ListIntegrationsService {
	return &ListIntegrationsService{repo: r}
}

func (s *ListIntegrationsService) List(ctx context.Context, c common.Caller) ([]domain.Integration, error) {
	if err := common.Require(c, domain.PermSettings); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, c.TenantID)
}
