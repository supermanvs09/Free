package overview

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type PostureOverviewService struct {
	common.Base
	repo *PostureOverviewRepository
}

func NewPostureOverviewService(r *PostureOverviewRepository, resolver *scope.Resolver) *PostureOverviewService {
	return &PostureOverviewService{Base: common.NewBase(resolver), repo: r}
}

func (s *PostureOverviewService) Get(ctx context.Context, c common.Caller, w common.Window) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, meta, err := s.repo.Get(ctx, resolved, w)
	if err != nil {
		return nil, fmt.Errorf("get posture overview: %w", err)
	}
	return &common.Envelope{Data: data, Meta: meta}, nil
}
