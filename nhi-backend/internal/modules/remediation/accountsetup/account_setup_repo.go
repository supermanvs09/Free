package accountsetup

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/engine"
)

type AccountSetupRepository struct {
	core *engine.Service
}

func NewAccountSetupRepository(core *engine.Service) *AccountSetupRepository {
	return &AccountSetupRepository{core: core}
}

// Get reads the account's ExternalId and role ARN from remediation_accounts.
func (r *AccountSetupRepository) Get(ctx context.Context, tenantID, accountID string) (*AccountSetup, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	a, err := st.GetAccount(ctx, accountID)
	if err != nil {
		return nil, common.NotFound("account settings", err)
	}
	return &AccountSetup{AccountID: accountID, ExternalID: a.ExternalID, RoleARN: a.RoleARN}, nil
}
