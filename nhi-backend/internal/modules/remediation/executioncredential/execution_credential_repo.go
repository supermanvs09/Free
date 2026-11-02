package executioncredential

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// ExecutionCredentialRepository takes the key from the engine's in-memory
// one-time store (it checks who started the execution).
type ExecutionCredentialRepository struct {
	core *engine.Service
}

func NewExecutionCredentialRepository(core *engine.Service) *ExecutionCredentialRepository {
	return &ExecutionCredentialRepository{core: core}
}

func (r *ExecutionCredentialRepository) Take(ctx context.Context, actor domain.Actor, executionID string) (Credential, error) {
	v, err := r.core.Credential(ctx, actor, executionID)
	if err != nil {
		return nil, err
	}
	return Credential(v), nil
}
