package identitygraph

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/platform/scope"
)

// ErrScanNotFound: no completed scan with that id is visible to the caller.
var ErrScanChangesNotFound = ErrScanNotFound

// ScanChangesService answers GET /scans and GET /scans/{scan_id}/changes.
type ScanChangesService struct {
	repo     *ScanChangesRepository
	resolver *scope.Resolver
}

func NewScanChangesService(repo *ScanChangesRepository, resolver *scope.Resolver) *ScanChangesService {
	return &ScanChangesService{repo: repo, resolver: resolver}
}

// ListScans returns the newest completed scans the caller can see.
func (s *ScanChangesService) ListScans(ctx context.Context, userID, tenantID, dbName string, limit int) (*ScanListResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	scans, err := s.repo.ListScans(ctx, resolved, limit)
	if err != nil {
		return nil, err
	}
	return &ScanListResponse{Scans: scans}, nil
}

// Changes returns a scan, its summary and one page of its changes. Filters
// arrive validated and normalised (upper-case change type, lower-case entity
// type) from the handler.
func (s *ScanChangesService) Changes(ctx context.Context, userID, tenantID, dbName string, f ScanChangesFilter) (*ScanChangesResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	scan, err := s.repo.Scan(ctx, resolved, f.ScanID)
	if err != nil {
		return nil, err
	}
	f.ScanID = scan.ScanID
	summary, err := s.repo.Summary(ctx, resolved, scan.ScanID)
	if err != nil {
		return nil, err
	}
	changes, total, err := s.repo.Changes(ctx, resolved, f)
	if err != nil {
		return nil, err
	}
	pages := 0
	if total > 0 {
		pages = (total + f.Limit - 1) / f.Limit
	}
	return &ScanChangesResponse{
		Scan:       *scan,
		Summary:    summary,
		Changes:    changes,
		Pagination: ScanChangesPagination{Page: f.Page, Limit: f.Limit, Total: total, TotalPages: pages},
	}, nil
}

// entityChanges is tab=changes of an identity (column identity_id) or a
// credential (credential_id): its changes across scans, newest first, with
// the CloudTrail call behind each creation or deletion when it is recorded.
func EntityChanges(ctx context.Context, repo *ScanChangesRepository, resolved *scope.DataScope, src *RequestActivity, column string, subject *ActivitySubject) (*EntityChangesResponse, error) {
	out := &EntityChangesResponse{Tab: "changes", Changes: []ScanChange{}}
	if repo == nil || subject == nil {
		return out, nil
	}
	if column == "identity_id" {
		out.IdentityARN = subject.ARN
	} else {
		out.CredentialARN = subject.ARN
	}
	changes, truncated, available, err := repo.EntityChanges(ctx, resolved, column, subject.ID, subject.ARN, EntityChangesLimit)
	if err != nil {
		return nil, fmt.Errorf("entity changes: %w", err)
	}
	src.AttachChangeEvidence(ctx, changes)
	out.Changes = changes
	out.Truncated = truncated
	out.ChangeTrackingAvailable = available
	return out, nil
}

// Status is a scan's id, status and when it finished (scan_id may be "latest").
func (s *ScanChangesService) Status(ctx context.Context, userID, tenantID, dbName, scanID string) (*ScanStatus, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	info, err := s.repo.Scan(ctx, resolved, scanID)
	if err != nil {
		return nil, err
	}
	return &ScanStatus{ScanID: info.ScanID, Status: strings.ToUpper(strings.TrimSpace(info.Status)), ScanTime: info.CompletedAt}, nil
}
