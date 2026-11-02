package listintegrations

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type ListIntegrationsRepository struct {
	core *engine.Service
}

func NewListIntegrationsRepository(core *engine.Service) *ListIntegrationsRepository {
	return &ListIntegrationsRepository{core: core}
}

// List reads remediation_integrations of the tenant.
func (r *ListIntegrationsRepository) List(ctx context.Context, tenantID string) ([]domain.Integration, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	list, err := st.ListIntegrations(ctx)
	if list == nil && err == nil {
		list = []domain.Integration{}
	}
	return list, err
}
