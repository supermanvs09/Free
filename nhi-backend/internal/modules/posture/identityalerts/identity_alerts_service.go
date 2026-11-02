package identityalerts

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityAlertsService struct {
	common.Base
	repo *IdentityAlertsRepository
}

func NewIdentityAlertsService(r *IdentityAlertsRepository, resolver *scope.Resolver) *IdentityAlertsService {
	return &IdentityAlertsService{Base: common.NewBase(resolver), repo: r}
}

func (s *IdentityAlertsService) Get(ctx context.Context, c common.Caller, id string, f IdentityAlertsFilter) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	if f.Status == "" {
		f.Status = AlertsAll
	}
	f.Limit = common.ClampLimit(f.Limit)
	data, next, err := s.repo.Get(ctx, resolved, id, f)
	if err != nil {
		return nil, fmt.Errorf("get identity alerts: %w", err)
	}
	return s.Envelope(ctx, resolved, data, common.PageOf(next, f.Limit), f.Window.Label, true)
}
