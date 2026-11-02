package updateintegration

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// UpdateIntegrationRepository upserts remediation_integrations through the
// engine, which validates the Jira / e-mail settings.
type UpdateIntegrationRepository struct {
	core *engine.Service
}

func NewUpdateIntegrationRepository(core *engine.Service) *UpdateIntegrationRepository {
	return &UpdateIntegrationRepository{core: core}
}

func (r *UpdateIntegrationRepository) Update(ctx context.Context, actor domain.Actor, typ string, req engine.IntegrationReq) (*domain.Integration, error) {
	return r.core.PutIntegration(ctx, actor, typ, req)
}
