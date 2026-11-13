package credentials

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

var ErrInvalidTab = fmt.Errorf("invalid or disabled credential detail tab")

// Relationship graph traversal is enabled: traverseGraph prunes every hop to
// the caller's resolved account/region scope before expanding the frontier.
var validTabs = map[string]bool{
	"overview":      true,
	"trust":         true,
	"activity":      true,
	"rotation":      true,
	"sessions":      true,
	"relationships": true,
	"raw":           true,
	"changes":       true,
}

var ErrCredentialNotFound = identitygraph.ErrCredentialNotFound

type CredentialDetailService struct {
	repo     *identitygraph.CredentialDetailRepository
	changes  *identitygraph.ScanChangesRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
}

func NewCredentialDetailService(repo *identitygraph.CredentialDetailRepository, changes *identitygraph.ScanChangesRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *CredentialDetailService {
	return &CredentialDetailService{repo: repo, changes: changes, resolver: resolver, activity: activity}
}

func (s *CredentialDetailService) GetDetail(ctx context.Context, userID, tenantID, dbName string, f identitygraph.DetailFilter) (interface{}, error) {
	if !validTabs[f.Tab] {
		return nil, ErrInvalidTab
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	// Same normalisation as Identity Detail — see ResolveTimeRange.
	tr, err := identitygraph.ResolveRange(f.TimeRange, f.StartDate, f.EndDate)
	if err != nil {
		return nil, err
	}
	f.TimeRange = tr.Label

	src := s.activity.ForRequest(ctx, resolved)
	switch f.Tab {
	case "overview":
		return s.repo.GetOverview(ctx, resolved, f.CredentialID, src)
	case "trust":
		return s.repo.GetTrust(ctx, resolved, f.CredentialID, src)
	case "activity":
		subject, err := s.repo.GetActivitySubject(ctx, resolved, f.CredentialID)
		if err != nil {
			return nil, err
		}
		return s.activity.CredentialActivity(ctx, resolved, subject, tr, "", f.Page, f.PageSize), nil
	case "rotation":
		return s.repo.GetRotation(ctx, resolved, f.CredentialID)
	case "sessions":
		subject, err := s.repo.GetActivitySubject(ctx, resolved, f.CredentialID)
		if err != nil {
			return nil, err
		}
		return s.activity.RoleSessions(ctx, resolved, subject, tr), nil
	case "relationships":
		return s.repo.GetRelationships(ctx, resolved, f.CredentialID, f.Depth, f.EdgeType, tr.Start, tr.End, src)
	case "raw":
		return s.repo.GetRaw(ctx, resolved, f.CredentialID)
	case "changes":
		subject, err := s.repo.GetActivitySubject(ctx, resolved, f.CredentialID)
		if err != nil {
			return nil, err
		}
		return identitygraph.EntityChanges(ctx, s.changes, resolved, src, "credential_id", subject)
	default:
		return nil, ErrInvalidTab
	}
}
