package updateaccount

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// UpdateAccountRepository upserts remediation_accounts through the engine,
// which validates the role ARN, generates the ExternalId and checks access.
type UpdateAccountRepository struct {
	core *engine.Service
}

func NewUpdateAccountRepository(core *engine.Service) *UpdateAccountRepository {
	return &UpdateAccountRepository{core: core}
}

func (r *UpdateAccountRepository) Update(ctx context.Context, actor domain.Actor, accountID string, req engine.AccountReq) (*domain.Account, error) {
	return r.core.PutAccount(ctx, actor, accountID, req)
}
