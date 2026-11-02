package identitylist

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentitiesListService struct {
	common.Base
	repo *IdentitiesListRepository
}

func NewIdentitiesListService(r *IdentitiesListRepository, resolver *scope.Resolver) *IdentitiesListService {
	return &IdentitiesListService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentitiesListService) List(ctx context.Context, c common.Caller, f common.IdentityFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	f.Limit = common.ClampLimit(f.Limit)
	items, next, err := s.repo.List(ctx, resolved, f)
	if err != nil {
		return nil, fmt.Errorf("list identities: %w", err)
	}
	return s.Envelope(ctx, resolved, items, common.PageOf(next, f.Limit), f.Window.Label, true)
}
