package listaccounts

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ListAccountsService struct {
	repo *ListAccountsRepository
}

func NewListAccountsService(r *ListAccountsRepository) *ListAccountsService {
	return &ListAccountsService{repo: r}
}

func (s *ListAccountsService) List(ctx context.Context, c common.Caller) ([]domain.Account, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.List(ctx, c.TenantID)
}
