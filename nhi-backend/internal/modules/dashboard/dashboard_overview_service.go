package dashboard

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

type DashboardOverviewService struct {
	repo     *DashboardOverviewRepository
	changes  *identitygraph.ScanChangesRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
}

func NewDashboardOverviewService(repo *DashboardOverviewRepository, changes *identitygraph.ScanChangesRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *DashboardOverviewService {
	return &DashboardOverviewService{repo: repo, changes: changes, resolver: resolver, activity: activity}
}

func (s *DashboardOverviewService) GetOverview(ctx context.Context, userID, tenantID, dbName string) (*DashboardOverviewResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	result, err := s.repo.GetOverview(ctx, resolved, s.activity.ForRequest(ctx, resolved))
	if err != nil {
		return nil, fmt.Errorf("get tenant-scoped dashboard: %w", err)
	}
	// Recent changes are an extra: when they cannot be read the dashboard
	// still loads, without the card.
	if s.changes != nil {
		if rc, err := s.changes.RecentChanges(ctx, resolved); err != nil {
			logging.FromContext(ctx).Warn("dashboard recent changes failed, serving without the card", "err", err)
		} else {
			result.RecentChanges = rc
		}
	}
	return result, nil
}
