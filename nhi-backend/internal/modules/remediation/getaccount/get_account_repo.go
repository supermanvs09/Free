package getaccount

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type GetAccountRepository struct {
	core *engine.Service
}

func NewGetAccountRepository(core *engine.Service) *GetAccountRepository {
	return &GetAccountRepository{core: core}
}

// Get reads the account settings, or the defaults when there are none.
func (r *GetAccountRepository) Get(ctx context.Context, tenantID, accountID string) (*domain.Account, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return engine.AccountFor(ctx, st, accountID)
}
