package identityposture

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityPostureService struct {
	common.Base
	repo *IdentityPostureRepository
}

func NewIdentityPostureService(r *IdentityPostureRepository, resolver *scope.Resolver) *IdentityPostureService {
	return &IdentityPostureService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityPostureService) Get(ctx context.Context, c common.Caller, id string, w common.Window) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, err := s.repo.Get(ctx, resolved, id, w)
	if err != nil {
		return nil, fmt.Errorf("get identity posture: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, w.Label, true)
}
