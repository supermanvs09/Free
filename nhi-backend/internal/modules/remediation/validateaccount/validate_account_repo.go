package validateaccount

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ValidateAccountRepository runs the provider's access check and stores its
// result through the engine.
type ValidateAccountRepository struct {
	core *engine.Service
}

func NewValidateAccountRepository(core *engine.Service) *ValidateAccountRepository {
	return &ValidateAccountRepository{core: core}
}

func (r *ValidateAccountRepository) Validate(ctx context.Context, actor domain.Actor, accountID string) (*domain.Account, error) {
	return r.core.ValidateAccount(ctx, actor, accountID)
}
