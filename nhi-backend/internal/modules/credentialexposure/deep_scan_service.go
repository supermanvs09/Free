package credentialexposure

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/scope"
)

// ErrDeepScanClientNotFound is repo.ErrDeepScanClientMissing, re-exported for the handler.
var ErrDeepScanClientNotFound = ErrDeepScanClientMissing

// ErrPlatformRequired: the client is known on two platforms whose repository
// names look alike (GitHub owner/repo and Bitbucket PROJECT/repo).
var ErrPlatformRequired = errors.New("deep scan: platform required")

// UnknownBranchesError is a deep-scan request naming branches the scanner has
// not recorded for the repository; Available lists the ones it has.
type UnknownBranchesError struct {
	Unknown   []string
	Available []string
}

func (e *UnknownBranchesError) Error() string {
	return "unknown branch(es): " + strings.Join(e.Unknown, ", ")
}

// maxDeepScanBranches is the scanner's own limit per request.
const maxDeepScanBranches = 50

// DeepScanService requests and reports full-history scans. Both sides are the
// tenant's own secscan_* tables: a request writes the deep-scan rows the
// scanner worker polls, and status reads them back. Nothing leaves this API.
type DeepScanService struct {
	repo     *DeepScanRepository
	resolver *scope.Resolver
	now      func() time.Time
}

func NewDeepScanService(repo *DeepScanRepository, resolver *scope.Resolver) *DeepScanService {
	return &DeepScanService{repo: repo, resolver: resolver, now: time.Now}
}

// Repositories lists every repository the scanner knows in the workspace.
func (s *DeepScanService) Repositories(ctx context.Context, userID, tenantID, dbName, clientID, platform string) ([]Repository, error) {
	if !validPlatform(platform) {
		return nil, invalid(platformMessage)
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	return s.repo.Inventory(ctx, resolved, clientID, platform, "")
}

// Branches answers the deep-scan branch dropdown for one repository.
func (s *DeepScanService) Branches(ctx context.Context, userID, tenantID, dbName, clientID, repository, platform string) (*BranchesResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	repo, err := s.findRepository(ctx, resolved, clientID, repository, platform)
	if err != nil {
		return nil, err
	}
	out := branchesOf(*repo)
	return &out, nil
}

// findRepository is the one repository the request names, on the platform
// asked for or the only one it is known on.
func (s *DeepScanService) findRepository(ctx context.Context, resolved *scope.DataScope, clientID, repository, platform string) (*Repository, error) {
	if !validPlatform(platform) {
		return nil, invalid(platformMessage)
	}
	known, err := s.repo.ClientPlatforms(ctx, resolved, clientID)
	if err != nil {
		return nil, err
	}
	if len(known) == 0 {
		return nil, ErrDeepScanClientNotFound
	}
	repos, err := s.repo.Inventory(ctx, resolved, clientID, platform, repository)
	if err != nil {
		return nil, err
	}
	switch len(repos) {
	case 0:
		return nil, invalid("That repository is not one of this client's scanned repositories. A new repository is scanned within an hour of being onboarded.")
	case 1:
		return &repos[0], nil
	}
	return nil, ErrPlatformRequired
}

// Status reports one deep scan: the one requested without branches, or, with
// branch, the one of that branch (repo_key "<repo>:<branch>").
func (s *DeepScanService) Status(ctx context.Context, userID, tenantID, dbName, clientID, repository, branch, platform string) ([]DeepScanResult, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	branch = shortBranch(strings.TrimSpace(branch))
	deepKey, ledgerKey := repository, repository
	if branch != "" {
		deepKey = repository + ":" + branch
		ledgerKey = deepKey
		// The default branch's ledger row is "<repo>".
		if repos, err := s.repo.Inventory(ctx, resolved, clientID, platform, repository); err == nil && len(repos) == 1 &&
			repos[0].DefaultBranch != nil && *repos[0].DefaultBranch == branch {
			ledgerKey = repository
		}
	}
	items, err := s.repo.Status(ctx, resolved, clientID, deepKey, ledgerKey, platform)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if branch != "" {
			b := branch
			items[i].Branch = &b
		}
	}
	return items, nil
}

// parseBranches reads "branches": absent/null, "default", "all", or a list of
// names. nil means "no branches chosen" (the default branch, as before).
func parseBranches(raw json.RawMessage) (mode string, names []string, err error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return "", nil, nil
	}
	var word string
	if err := json.Unmarshal(raw, &word); err == nil {
		switch strings.ToLower(strings.TrimSpace(word)) {
		case "default":
			return "default", nil, nil
		case "all":
			return "all", nil, nil
		}
		return "", nil, invalid(`branches must be "default", "all" or a non-empty list of branch names`)
	}
	if err := json.Unmarshal(raw, &names); err != nil || len(names) == 0 {
		return "", nil, invalid(`branches must be "default", "all" or a non-empty list of branch names`)
	}
	seen := map[string]bool{}
	clean := make([]string, 0, len(names))
	for _, n := range names {
		n = shortBranch(strings.TrimSpace(n))
		if n == "" || len(n) > 400 || strings.Contains(n, ":") {
			return "", nil, invalid("Each branch must be a branch name, as listed for the repository")
		}
		if !seen[n] {
			seen[n] = true
			clean = append(clean, n)
		}
	}
	if len(clean) > maxDeepScanBranches {
		return "", nil, invalid(fmt.Sprintf("At most %d branches per request", maxDeepScanBranches))
	}
	return "list", clean, nil
}

// Trigger queues the walk: of the default branch when no branches are
// chosen (repo_key "<repo>", as before), else one walk per chosen branch
// (repo_key "<repo>:<branch>"), each with its own status.
func (s *DeepScanService) Trigger(ctx context.Context, userID, tenantID, dbName string, req DeepScanRequest) (*DeepScanAccepted, error) {
	mode, names, err := parseBranches(req.Branches)
	if err != nil {
		return nil, err
	}
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
		if !slashRepoRE.MatchString(req.Repository) {
			return nil, invalid("GitHub repositories are given as owner/repo, e.g. acme/payments-api")
		}
	case "bitbucket":
		if !slashRepoRE.MatchString(req.Repository) {
			return nil, invalid("Bitbucket repositories are given as PROJECT/repo, e.g. LIV/payments-api")
		}
	case "codecommit":
		if strings.Contains(req.Repository, "/") {
			return nil, invalid("A CodeCommit repository is a bare name, without a slash")
		}
	}
	var repo *Repository
	if mode != "" || platform != "github" {
		repos, err := s.repo.Inventory(ctx, resolved, req.ClientID, platform, req.Repository)
		if err != nil {
			return nil, err
		}
		if len(repos) == 0 {
			return nil, invalid("That repository is not one of this client's scanned repositories. A new repository is scanned within an hour of being onboarded.")
		}
		repo = &repos[0]
	}

	type target struct{ branch, key string }
	var targets []target
	switch mode {
	case "":
		targets = []target{{"", req.Repository}}
	case "default":
		if repo.DefaultBranch != nil {
			targets = []target{{*repo.DefaultBranch, req.Repository + ":" + *repo.DefaultBranch}}
		} else {
			// Its name is not known yet: the request without branches walks it.
			targets = []target{{"", req.Repository}}
		}
	case "all", "list":
		available := branchesOf(*repo).Branches
		if mode == "all" {
			names = available
			if len(names) == 0 {
				return nil, invalid("The scanner has not recorded any branch of this repository yet")
			}
			if len(names) > maxDeepScanBranches {
				return nil, invalid(fmt.Sprintf("This repository has %d branches; choose at most %d", len(names), maxDeepScanBranches))
			}
		} else {
			have := map[string]bool{}
			for _, b := range available {
				have[b] = true
			}
			var unknown []string
			for _, n := range names {
				if !have[n] {
					unknown = append(unknown, n)
				}
			}
			if len(unknown) > 0 {
				sort.Strings(unknown)
				return nil, &UnknownBranchesError{Unknown: unknown, Available: available}
			}
		}
		for _, n := range names {
			targets = append(targets, target{n, req.Repository + ":" + n})
		}
	}

	out := &DeepScanAccepted{Accepted: true, Status: "running", ClientID: req.ClientID, RepoKey: targets[0].key, Platform: platform, AlreadyRunning: true}
	if mode != "" {
		out.Branches = []string{}
	}
	for _, t := range targets {
		requestedAt, already, err := s.repo.Request(ctx, resolved, req.ClientID, t.key, platform, s.now())
		if err != nil {
			return nil, err
		}
		if out.RequestedAt == "" {
			out.RequestedAt = requestedAt
		}
		out.AlreadyRunning = out.AlreadyRunning && already
		run := DeepScanRun{RepoKey: t.key, RequestedAt: requestedAt, AlreadyRunning: already}
		if t.branch != "" {
			out.Branches = append(out.Branches, t.branch)
			b := t.branch
			run.Branch = &b
		}
		out.Runs = append(out.Runs, run)
	}
	return out, nil
}

var slashRepoRE = regexp.MustCompile(`^[A-Za-z0-9_.~-]+/[A-Za-z0-9_.~-]+$`)

// pickPlatform: the request's platform, else the one the client is known on,
// else the one its name's shape fits (CodeCommit names have no slash; GitHub
// and Bitbucket names are owner/repo and PROJECT/repo, so the two cannot be
// told apart by name).
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
	}
	var fits []string
	for _, p := range known {
		if (p == "codecommit") != strings.Contains(repository, "/") {
			fits = append(fits, p)
		}
	}
	switch len(fits) {
	case 0:
		return known[0], nil // the format check that follows says what is wrong
	case 1:
		return fits[0], nil
	}
	return "", ErrPlatformRequired
}
