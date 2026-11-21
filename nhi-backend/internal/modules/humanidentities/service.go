package humanidentities

import (
	"context"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

type HumanIdentityService struct {
	repo     *identitygraph.HumanIdentityRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
}

func NewHumanIdentityService(repo *identitygraph.HumanIdentityRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *HumanIdentityService {
	return &HumanIdentityService{repo: repo, resolver: resolver, activity: activity}
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

// GetPermissionSetCatalog returns IAM policy groups and SSO permission sets,
// trimmed to the usage view (all, used, unused). Never nil.
func (s *HumanIdentityService) GetPermissionSetCatalog(ctx context.Context, userID, tenantID, dbName, source, usage string) ([]identitygraph.HumanPermissionSet, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	sets, err := s.repo.PermissionSetCatalog(ctx, resolved, source, s.activity)
	if err != nil {
		return nil, err
	}
	return identitygraph.ApplyPermissionSetUsageFilter(sets, usage), nil
}
