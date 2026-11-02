package identitycredentials

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityCredentialsService struct {
	common.Base
	repo *IdentityCredentialsRepository
}

func NewIdentityCredentialsService(r *IdentityCredentialsRepository, resolver *scope.Resolver) *IdentityCredentialsService {
	return &IdentityCredentialsService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityCredentialsService) Get(ctx context.Context, c common.Caller, id string) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, err := s.repo.Get(ctx, resolved, id)
	if err != nil {
		return nil, fmt.Errorf("get identity credentials: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}
