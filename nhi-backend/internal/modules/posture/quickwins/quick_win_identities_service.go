package quickwins

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type QuickWinIdentitiesService struct {
	common.Base
	repo *QuickWinIdentitiesRepository
}

func NewQuickWinIdentitiesService(r *QuickWinIdentitiesRepository, resolver *scope.Resolver) *QuickWinIdentitiesService {
	return &QuickWinIdentitiesService{Base: common.NewBase(resolver), repo: r}
}

func (s *QuickWinIdentitiesService) Get(ctx context.Context, c common.Caller, ruleID string, limit int, cursor string) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	limit = common.ClampLimit(limit)
	data, next, err := s.repo.Get(ctx, resolved, ruleID, limit, cursor)
	if err != nil {
		return nil, fmt.Errorf("get quick-win identities: %w", err)
	}
	return s.Envelope(ctx, resolved, data, common.PageOf(next, limit), "", true)
}
