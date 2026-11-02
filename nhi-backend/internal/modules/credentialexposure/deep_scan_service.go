package credentialexposure

import (
	"context"
	"regexp"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/scope"
)

// ErrDeepScanClientNotFound is repo.ErrDeepScanClientNotFound, re-exported for the handler.
var ErrDeepScanClientNotFound = ErrDeepScanClientMissing

// DeepScanService requests and reports full-history scans. Both sides are the
// tenant's own secscan_* tables: a request writes the deep-scan row the
// scanner worker polls, and status reads it back. Nothing leaves this API.
type DeepScanService struct {
	repo     *DeepScanRepository
	resolver *scope.Resolver
	now      func() time.Time
}

func NewDeepScanService(repo *DeepScanRepository, resolver *scope.Resolver) *DeepScanService {
	return &DeepScanService{repo: repo, resolver: resolver, now: time.Now}
}

func (s *DeepScanService) Status(ctx context.Context, userID, tenantID, dbName, clientID, repoKey, platform string) ([]DeepScanResult, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Status(ctx, resolved, clientID, repoKey, platform)
}

// Trigger queues the walk. The platform is the request's, else the one the
// client is known on, else - when it is known on both - read from the name:
// GitHub repositories are owner/repo, CodeCommit names cannot contain "/".
func (s *DeepScanService) Trigger(ctx context.Context, userID, tenantID, dbName string, req DeepScanRequest) (*DeepScanAccepted, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	known, err := s.repo.ClientPlatforms(ctx, resolved, req.ClientID)
	if err != nil {
		return nil, err
	}
	platform, err := pickPlatform(req.Platform, req.Repository, known)
	if err != nil {
		return nil, err
	}
	// The scanner's own checks (integration guide, POST /api/deep-scan 400s).
	switch platform {
	case "github":
		if !githubRepoRE.MatchString(req.Repository) {
			return nil, invalid("GitHub repositories are given as owner/repo, e.g. acme/payments-api")
		}
	case "codecommit":
		onboarded, err := s.repo.RepositoryKnown(ctx, resolved, req.ClientID, req.Repository, platform)
		if err != nil {
			return nil, err
		}
		if !onboarded {
			return nil, invalid("That repository is not one of this client's onboarded CodeCommit repositories")
		}
	}
	requestedAt, already, err := s.repo.Request(ctx, resolved, req.ClientID, req.Repository, platform, s.now())
	if err != nil {
		return nil, err
	}
	return &DeepScanAccepted{
		Accepted:       true,
		Status:         "running",
		ClientID:       req.ClientID,
		RepoKey:        req.Repository,
		Platform:       platform,
		RequestedAt:    requestedAt,
		AlreadyRunning: already,
	}, nil
}

var githubRepoRE = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

func pickPlatform(asked, repository string, known []string) (string, error) {
	has := func(p string) bool {
		for _, k := range known {
			if k == p {
				return true
			}
		}
		return false
	}
	switch {
	case asked != "":
		if !has(asked) {
			return "", ErrDeepScanClientNotFound
		}
		return asked, nil
	case len(known) == 1:
		return known[0], nil
	case len(known) == 0:
		return "", ErrDeepScanClientNotFound
	case strings.Contains(repository, "/"):
		return "github", nil
	default:
		return "codecommit", nil
	}
}
