package identityroleuse

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityRoleUseService struct {
	common.Base
	repo *IdentityRoleUseRepository
}

func NewIdentityRoleUseService(r *IdentityRoleUseRepository, resolver *scope.Resolver) *IdentityRoleUseService {
	return &IdentityRoleUseService{Base: common.NewBase(resolver), repo: r}
}

// Get returns the Role use tab. Until the scanner provides AssumeRole events
// the envelope carries meta.data_available = false and empty lists.
func (s *IdentityRoleUseService) Get(ctx context.Context, c common.Caller, id string) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, available, err := s.repo.Get(ctx, resolved, id)
	if err != nil {
		return nil, fmt.Errorf("get identity role use: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", available)
}
