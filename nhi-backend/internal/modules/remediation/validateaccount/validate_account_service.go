package validateaccount

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ValidateAccountService struct {
	repo *ValidateAccountRepository
}

func NewValidateAccountService(r *ValidateAccountRepository) *ValidateAccountService {
	return &ValidateAccountService{repo: r}
}

func (s *ValidateAccountService) Validate(ctx context.Context, c common.Caller, accountID string) (*domain.Account, error) {
	if err := common.Require(c, domain.PermSettings); err != nil {
		return nil, err
	}
	return s.repo.Validate(ctx, c.Actor(), accountID)
}
