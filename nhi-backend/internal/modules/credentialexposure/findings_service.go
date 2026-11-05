package credentialexposure

import (
	"context"
	"strings"

	"nhi-backend-api/internal/platform/scope"
)

type FindingsService struct {
	repo     *FindingsRepository
	resolver *scope.Resolver
}

func NewFindingsService(repo *FindingsRepository, resolver *scope.Resolver) *FindingsService {
	return &FindingsService{repo: repo, resolver: resolver}
}

func (s *FindingsService) List(ctx context.Context, userID, tenantID, dbName string, filter FindingsFilter) ([]Finding, int, error) {
	filter.Platform = strings.ToLower(strings.TrimSpace(filter.Platform))
	if !validPlatform(filter.Platform) {
		return nil, 0, invalid(platformMessage)
	}
	if filter.Limit < 1 || filter.Limit > 500 {
		return nil, 0, invalid("limit must be between 1 and 500")
	}
	if filter.Offset < 0 {
		return nil, 0, invalid("offset cannot be negative")
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, 0, err
	}
	return s.repo.List(ctx, resolved, filter)
}

func (s *FindingsService) Get(ctx context.Context, userID, tenantID, dbName, id string, deep bool) (*Finding, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, resolved, id, deep)
}

// ListDeep reads the deep-scan findings.
func (s *FindingsService) ListDeep(ctx context.Context, userID, tenantID, dbName string, filter DeepFindingsFilter) ([]Finding, int, error) {
	filter.Platform = strings.ToLower(strings.TrimSpace(filter.Platform))
	filter.Branch = strings.TrimPrefix(strings.TrimSpace(filter.Branch), "refs/heads/")
	if !validPlatform(filter.Platform) {
		return nil, 0, invalid(platformMessage)
	}
	if filter.Limit < 1 || filter.Limit > 500 {
		return nil, 0, invalid("limit must be between 1 and 500")
	}
	if filter.Offset < 0 {
		return nil, 0, invalid("offset cannot be negative")
	}
	if len(filter.ClientID) > 200 || len(filter.Repository) > 500 || len(filter.Branch) > 500 {
		return nil, 0, invalid("client_id, repository or branch is too long")
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, 0, err
	}
	return s.repo.ListDeep(ctx, resolved, filter)
}

const platformMessage = "platform must be codecommit, github or bitbucket"

// validPlatform: empty (every platform) or one of the scanner's platforms.
func validPlatform(p string) bool {
	if p == "" {
		return true
	}
	for _, known := range ScannerPlatforms {
		if p == known {
			return true
		}
	}
	return false
}

func (s *FindingsService) Summary(ctx context.Context, userID, tenantID, dbName string, filter FindingsSummaryFilter) (FindingsSummary, error) {
	filter.ClientID = strings.TrimSpace(filter.ClientID)
	filter.Platform = strings.ToLower(strings.TrimSpace(filter.Platform))
	if !validPlatform(filter.Platform) {
		return FindingsSummary{}, invalid(platformMessage)
	}
	if len(filter.ClientID) > 200 {
		return FindingsSummary{}, invalid("client_id exceeds 200 characters")
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return FindingsSummary{}, err
	}
	return s.repo.Summary(ctx, resolved, filter)
}
