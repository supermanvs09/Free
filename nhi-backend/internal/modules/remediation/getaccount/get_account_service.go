package getaccount

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type GetAccountService struct {
	repo *GetAccountRepository
}

func NewGetAccountService(r *GetAccountRepository) *GetAccountService {
	return &GetAccountService{repo: r}
}

func (s *GetAccountService) Get(ctx context.Context, c common.Caller, accountID string) (*domain.Account, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, accountID)
}
