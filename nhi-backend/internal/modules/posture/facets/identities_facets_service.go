package facets

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentitiesFacetsService struct {
	common.Base
	repo *IdentitiesFacetsRepository
}

func NewIdentitiesFacetsService(r *IdentitiesFacetsRepository, resolver *scope.Resolver) *IdentitiesFacetsService {
	return &IdentitiesFacetsService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentitiesFacetsService) Get(ctx context.Context, c common.Caller, f common.IdentityFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, err := s.repo.Get(ctx, resolved, f)
	if err != nil {
		return nil, fmt.Errorf("get identity facets: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, f.Window.Label, true)
}
