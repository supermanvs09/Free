package listaccounts

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type ListAccountsRepository struct {
	core *engine.Service
}

func NewListAccountsRepository(core *engine.Service) *ListAccountsRepository {
	return &ListAccountsRepository{core: core}
}

// List reads remediation_accounts of the tenant.
func (r *ListAccountsRepository) List(ctx context.Context, tenantID string) ([]domain.Account, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	list, err := st.ListAccounts(ctx)
	if list == nil && err == nil {
		list = []domain.Account{}
	}
	return list, err
}
