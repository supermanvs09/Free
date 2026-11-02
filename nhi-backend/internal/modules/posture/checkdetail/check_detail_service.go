package checkdetail

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type CheckDetailService struct {
	common.Base
	repo *CheckDetailRepository
}

func NewCheckDetailService(r *CheckDetailRepository, resolver *scope.Resolver) *CheckDetailService {
	return &CheckDetailService{Base: common.NewBase(resolver), repo: r}
}

func (s *CheckDetailService) Get(ctx context.Context, c common.Caller, ruleID string) (*common.Envelope, error) {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	data, err := s.repo.Get(ctx, resolved, ruleID)
	if err != nil {
		return nil, fmt.Errorf("get check detail: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}
