package identityactivity

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityActivityService struct {
	common.Base
	repo *IdentityActivityRepository
}

func NewIdentityActivityService(r *IdentityActivityRepository, resolver *scope.Resolver) *IdentityActivityService {
	return &IdentityActivityService{Base: common.NewBase(resolver), repo: r}
}

// Get returns the Activity tab. While the event store is unavailable the
// envelope carries meta.data_available = false and an empty list.
func (s *IdentityActivityService) Get(ctx context.Context, c common.Caller, id string, f IdentityActivityFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	f.Limit = common.ClampLimit(f.Limit)
	data, next, available, err := s.repo.Get(ctx, resolved, id, f)
	if err != nil {
		return nil, fmt.Errorf("get identity activity: %w", err)
	}
	return s.Envelope(ctx, resolved, data, common.PageOf(next, f.Limit), f.Window.Label, available)
}
