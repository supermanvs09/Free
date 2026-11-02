package identityheader

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityHeaderService struct {
	common.Base
	repo *IdentityHeaderRepository
}

func NewIdentityHeaderService(r *IdentityHeaderRepository, resolver *scope.Resolver) *IdentityHeaderService {
	return &IdentityHeaderService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityHeaderService) Get(ctx context.Context, c common.Caller, id string) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, err := s.repo.Get(ctx, resolved, id)
	if err != nil {
		return nil, fmt.Errorf("get identity header: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}
