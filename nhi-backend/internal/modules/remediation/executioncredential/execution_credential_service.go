package executioncredential

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ExecutionCredentialService struct {
	repo *ExecutionCredentialRepository
}

func NewExecutionCredentialService(r *ExecutionCredentialRepository) *ExecutionCredentialService {
	return &ExecutionCredentialService{repo: r}
}

// Take returns the new key once. The engine allows only the user who started
// the execution, or an admin.
func (s *ExecutionCredentialService) Take(ctx context.Context, c common.Caller, executionID string) (Credential, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Take(ctx, c.Actor(), executionID)
}
