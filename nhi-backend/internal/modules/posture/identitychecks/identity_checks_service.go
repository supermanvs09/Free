package identitychecks

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityChecksService struct {
	common.Base
	repo *IdentityChecksRepository
}

func NewIdentityChecksService(r *IdentityChecksRepository, resolver *scope.Resolver) *IdentityChecksService {
	return &IdentityChecksService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityChecksService) Get(ctx context.Context, c common.Caller, id string, f IdentityChecksFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	if f.Status == "" {
		f.Status = ChecksAll
	}
	data, err := s.repo.Get(ctx, resolved, id, f)
	if err != nil {
		return nil, fmt.Errorf("get identity checks: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}
