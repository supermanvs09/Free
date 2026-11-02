package identities

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

var ErrInvalidIdentityTab = fmt.Errorf("invalid or disabled identity detail tab")

// Relationship graph expansion is deliberately disabled until every traversed
// node can be constrained to the user's account/region scope.
var identityTabsServed = map[string]bool{
	"overview":      true,
	"permissions":   true,
	"activity":      true,
	"relationships": true,
	"credentials":   true,
	"raw":           true,
	"changes":       true,
}

var ErrIdentityNotFound = identitygraph.ErrIdentityNotFound

type IdentityDetailService struct {
	repo     *identitygraph.IdentityDetailRepository
	changes  *identitygraph.ScanChangesRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
}

func NewIdentityDetailService(repo *identitygraph.IdentityDetailRepository, changes *identitygraph.ScanChangesRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *IdentityDetailService {
	return &IdentityDetailService{repo: repo, changes: changes, resolver: resolver, activity: activity}
}

func (s *IdentityDetailService) GetDetail(ctx context.Context, userID, tenantID, dbName string, f identitygraph.IdentityDetailFilter) (interface{}, error) {
	if !identityTabsServed[f.Tab] {
		return nil, ErrInvalidIdentityTab
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	// Normalise ?time_range= once, up front: garbage is a 400 and every tab
	// sees the same canonical label rather than the raw query string.
	tr, err := identitygraph.ResolveRange(f.TimeRange, f.StartDate, f.EndDate)
	if err != nil {
		return nil, err
	}
	f.TimeRange = tr.Label

	src := s.activity.ForRequest(ctx, resolved)
	switch f.Tab {
	case "overview":
		return s.repo.GetOverview(ctx, resolved, f.IdentityID, src)
	case "permissions":
		return s.repo.GetPermissions(ctx, resolved, f.IdentityID, f.Service, f.UsedOnly, src)
	case "activity":
		subject, err := s.repo.GetActivitySubject(ctx, resolved, f.IdentityID)
		if err != nil {
			return nil, err
		}
		return s.activity.IdentityActivity(ctx, resolved, subject, tr, f.Service, f.Page, f.PageSize), nil
	case "relationships":
		return s.repo.GetRelationships(ctx, resolved, f.IdentityID, f.Depth, f.EdgeType, tr.Start, tr.End, src)
	case "credentials":
		return s.repo.GetCredentialsTab(ctx, resolved, f.IdentityID, src)
	case "raw":
		return s.repo.GetRaw(ctx, resolved, f.IdentityID)
	case "changes":
		subject, err := s.repo.GetActivitySubject(ctx, resolved, f.IdentityID)
		if err != nil {
			return nil, err
		}
		return identitygraph.EntityChanges(ctx, s.changes, resolved, src, "identity_id", subject)
	default:
		return nil, ErrInvalidIdentityTab
	}
}
