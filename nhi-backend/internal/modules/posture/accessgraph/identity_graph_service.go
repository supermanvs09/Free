package accessgraph

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityGraphService struct {
	common.Base
	repo *IdentityGraphRepository
}

func NewIdentityGraphService(r *IdentityGraphRepository, resolver *scope.Resolver) *IdentityGraphService {
	return &IdentityGraphService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityGraphService) Get(ctx context.Context, c common.Caller, id string, f IdentityGraphFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	if f.Depth < 1 {
		f.Depth = DefaultGraphDepth
	}
	if f.Depth > MaxGraphDepth {
		f.Depth = MaxGraphDepth
	}
	if f.MaxNodes < 1 {
		f.MaxNodes = DefaultGraphMaxNodes
	}
	if f.MaxNodes > MaxGraphMaxNodes {
		f.MaxNodes = MaxGraphMaxNodes
	}
	data, err := s.repo.Get(ctx, resolved, id, f)
	if err != nil {
		return nil, fmt.Errorf("get identity graph: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}
