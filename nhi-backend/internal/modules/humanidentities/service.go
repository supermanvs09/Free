package humanidentities

import (
	"context"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

type HumanIdentityService struct {
	repo     *identitygraph.HumanIdentityRepository
	resolver *scope.Resolver
}

func NewHumanIdentityService(repo *identitygraph.HumanIdentityRepository, resolver *scope.Resolver) *HumanIdentityService {
	return &HumanIdentityService{repo: repo, resolver: resolver}
}

func (s *HumanIdentityService) GetOverview(ctx context.Context, userID, tenantID, dbName, source string) (*identitygraph.HumanIdentityOverview, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Overview(ctx, resolved, source)
}

func (s *HumanIdentityService) GetList(ctx context.Context, userID, tenantID, dbName string, f identitygraph.HumanIdentityListFilter) (*identitygraph.HumanIdentityListResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.List(ctx, resolved, f)
}

func (s *HumanIdentityService) GetDetail(ctx context.Context, userID, tenantID, dbName, id string) (*identitygraph.HumanIdentityDetail, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	// RiskSignals are computed in the repo from identitygraph.HumanRiskRules, the
	// same definitions the overview and the risk= filter use.
	return s.repo.Detail(ctx, resolved, id)
}

// GetPermissionSets returns the SSO permission sets. It never returns nil, so
// the response is [] when there are none.
func (s *HumanIdentityService) GetPermissionSets(ctx context.Context, userID, tenantID, dbName string) ([]identitygraph.HumanPermissionSetItem, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	items, err := s.repo.PermissionSets(ctx, resolved)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []identitygraph.HumanPermissionSetItem{}
	}
	return items, nil
}
