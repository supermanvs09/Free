package credentials

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

type CredentialsService struct {
	repo     *CredentialsRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
	changes  *identitygraph.ScanChangesRepository
}

func NewCredentialsService(repo *CredentialsRepository, changes *identitygraph.ScanChangesRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *CredentialsService {
	return &CredentialsService{repo: repo, changes: changes, resolver: resolver, activity: activity}
}

func (s *CredentialsService) GetCredentials(ctx context.Context, userID, tenantID, dbName string, f CredentialListFilter) (*CredentialListResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	result, err := s.repo.GetCredentialsList(ctx, resolved, f, s.activity.ForRequest(ctx, resolved))
	if err != nil {
		return nil, fmt.Errorf("get scoped credentials: %w", err)
	}
	s.flagRecentChanges(ctx, resolved, result)
	return result, nil
}

// flagRecentChanges sets recent_change on the page's rows from the latest
// scan. Best effort: the list never fails because of it.
func (s *CredentialsService) flagRecentChanges(ctx context.Context, resolved *scope.DataScope, result *CredentialListResponse) {
	if s.changes == nil || result == nil || len(result.Data) == 0 {
		return
	}
	ids := make([]string, 0, len(result.Data))
	arns := make([]string, 0, len(result.Data))
	for _, row := range result.Data {
		ids = append(ids, row.ID)
		arns = append(arns, row.ARN)
	}
	flags, err := s.changes.RecentChangeFlags(ctx, resolved, identitygraph.EntityCredential, ids, arns)
	if err != nil {
		logging.FromContext(ctx).Warn("list recent change flags failed, continuing without them", "err", err)
		return
	}
	for i := range result.Data {
		flag := flags[result.Data[i].ID]
		if flag == "" {
			flag = flags[result.Data[i].ARN]
		}
		if flag != "" {
			v := flag
			result.Data[i].RecentChange = &v
		}
	}
}
