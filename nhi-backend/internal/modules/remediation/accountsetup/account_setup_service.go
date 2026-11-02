package accountsetup

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type AccountSetupService struct {
	repo *AccountSetupRepository
}

func NewAccountSetupService(r *AccountSetupRepository) *AccountSetupService {
	return &AccountSetupService{repo: r}
}

// Get returns the setup values; admin only because it shows the ExternalId.
func (s *AccountSetupService) Get(ctx context.Context, c common.Caller, accountID string) (*AccountSetup, error) {
	if err := common.Require(c, domain.PermSettings); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, accountID)
}
