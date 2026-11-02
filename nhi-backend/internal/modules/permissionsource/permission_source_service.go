package permissionsource

import (
	"context"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/scope"
)

// PermissionSourceService resolves, on demand and for one event, which policy
// granted the permission behind it.
type PermissionSourceService struct {
	repo     *identitygraph.PermissionSourceRepository
	resolver *scope.Resolver
}

func NewPermissionSourceService(repo *identitygraph.PermissionSourceRepository, resolver *scope.Resolver) *PermissionSourceService {
	return &PermissionSourceService{repo: repo, resolver: resolver}
}

// Find takes the event as CloudTrail reports it (event_source such as
// "s3.amazonaws.com", event_name such as "GetObject").
func (s *PermissionSourceService) Find(ctx context.Context, userID, tenantID, dbName, credentialID, eventSource, eventName string) (*identitygraph.PermissionSourceResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Find(ctx, resolved, credentialID, eventstore.ServiceName(eventSource), eventName)
}
