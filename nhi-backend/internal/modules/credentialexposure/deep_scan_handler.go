package credentialexposure

import (
	"errors"
	"net/http"
	"strings"

	"nhi-backend-api/internal/platform/middleware"
)

var (
	deepScanStatusAllowed = map[string]struct{}{
		"client_id": {}, "repository": {}, "platform": {}, "branch": {},
	}
	repositoriesAllowed = map[string]struct{}{"client_id": {}, "platform": {}}
	branchesAllowed     = map[string]struct{}{"client_id": {}, "repository": {}, "platform": {}}
)

type DeepScanHandler struct{ service *DeepScanService }

func NewDeepScanHandler(service *DeepScanService) *DeepScanHandler {
	return &DeepScanHandler{service: service}
}

// writeDeepScanError maps the deep-scan errors every route shares.
func writeDeepScanError(w http.ResponseWriter, r *http.Request, err error, invalidCode, failMessage string) {
	var unknown *UnknownBranchesError
	switch {
	case errors.Is(err, ErrDeepScanClientNotFound):
		writeError(w, http.StatusNotFound, "CLIENT_NOT_FOUND", "This client has no scanned repositories on that platform in your workspace")
	case errors.Is(err, ErrPlatformRequired):
		writeError(w, http.StatusConflict, "PLATFORM_REQUIRED", "This client has repositories on more than one platform; say which with platform")
	case errors.Is(err, ErrDeepScanUnavailable):
		writeError(w, http.StatusConflict, "DEEP_SCAN_UNAVAILABLE", "Deep scans are not set up for this platform in your workspace yet")
	case errors.As(err, &unknown):
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error":     "UNKNOWN_BRANCH",
			"message":   unknown.Error() + ". Choose from the branches listed for the repository.",
			"unknown":   unknown.Unknown,
			"available": unknown.Available,
		})
	default:
		writeInvalidOr(w, r, err, invalidCode, failMessage)
	}
}

func readPlatform(w http.ResponseWriter, raw string) (string, bool) {
	p := strings.ToLower(strings.TrimSpace(raw))
	if !validPlatform(p) {
		writeAPIError(w, http.StatusBadRequest, "Invalid platform: "+raw+". Allowed: codecommit, github, bitbucket", "INVALID_PLATFORM")
		return "", false
	}
	return p, true
}

func (h *DeepScanHandler) Trigger(w http.ResponseWriter, r *http.Request) {
	if !requireScannerAdmin(w, r) {
		return
	}
	claims := middleware.GetClaims(r)
	if rejectUnknownQuery(w, r, map[string]struct{}{}) {
		return
	}
	var req DeepScanRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	req.ClientID = strings.TrimSpace(req.ClientID)
	req.Repository = strings.TrimSpace(req.Repository)
	if req.ClientID == "" || len(req.ClientID) > 200 || req.Repository == "" || len(req.Repository) > 500 {
		writeAPIError(w, http.StatusBadRequest, "client_id and repository are required and must fit their database columns", "INVALID_REQUEST")
		return
	}
	var ok bool
	if req.Platform, ok = readPlatform(w, req.Platform); !ok {
		return
	}
	accepted, err := h.service.Trigger(r.Context(), claims.UserID, claims.TenantID, claims.DBName, req)
	if err != nil {
		writeDeepScanError(w, r, err, "INVALID_REPOSITORY", "Unable to request the deep scan")
		return
	}
	writeJSON(w, http.StatusAccepted, accepted)
}

func (h *DeepScanHandler) Status(w http.ResponseWriter, r *http.Request) {
	if !requireScannerAdmin(w, r) {
		return
	}
	claims := middleware.GetClaims(r)
	if rejectUnknownQuery(w, r, deepScanStatusAllowed) {
		return
	}
	q := r.URL.Query()
	clientID := strings.TrimSpace(q.Get("client_id"))
	repoKey := strings.TrimSpace(q.Get("repository"))
	branch := strings.TrimSpace(q.Get("branch"))
	if clientID == "" || len(clientID) > 200 || repoKey == "" || len(repoKey) > 500 || len(branch) > 400 || strings.Contains(branch, ":") {
		writeAPIError(w, http.StatusBadRequest, "client_id and repository are required and must fit their database columns; branch is a branch name", "INVALID_QUERY")
		return
	}
	platform, ok := readPlatform(w, q.Get("platform"))
	if !ok {
		return
	}
	items, err := h.service.Status(r.Context(), claims.UserID, claims.TenantID, claims.DBName, clientID, repoKey, branch, platform)
	if err != nil {
		writeServerError(w, r, err, "Unable to load repository scan status")
		return
	}
	if len(items) == 0 {
		// Same shape as a started scan, so clients read one type.
		out := DeepScanResult{ClientID: clientID, RepoKey: repoKey, Platform: platform, Status: "not_started"}
		if branch != "" {
			b := shortBranch(branch)
			out.Branch, out.RepoKey = &b, repoKey+":"+b
		}
		writeJSON(w, http.StatusOK, out)
		return
	}
	if len(items) > 1 {
		writeError(w, http.StatusConflict, "PLATFORM_REQUIRED", "More than one platform matched; provide the platform query parameter")
		return
	}
	writeJSON(w, http.StatusOK, items[0])
}

// Repositories is GET /credential-exposure/repositories: every repository
// the scanner knows in the workspace, with its branches and scan state.
func (h *DeepScanHandler) Repositories(w http.ResponseWriter, r *http.Request) {
	if !requireScannerAdmin(w, r) {
		return
	}
	claims := middleware.GetClaims(r)
	if rejectUnknownQuery(w, r, repositoriesAllowed) {
		return
	}
	q := r.URL.Query()
	clientID := strings.TrimSpace(q.Get("client_id"))
	if len(clientID) > 200 {
		writeAPIError(w, http.StatusBadRequest, "client_id exceeds 200 characters", "INVALID_QUERY")
		return
	}
	platform, ok := readPlatform(w, q.Get("platform"))
	if !ok {
		return
	}
	repos, err := h.service.Repositories(r.Context(), claims.UserID, claims.TenantID, claims.DBName, clientID, platform)
	if err != nil {
		writeDeepScanError(w, r, err, "INVALID_QUERY", "Unable to load repositories")
		return
	}
	writeJSON(w, http.StatusOK, RepositoriesResponse{Repositories: repos})
}

// Branches is GET /credential-exposure/branches: one repository's branches
// and the deep-scan dropdown options.
func (h *DeepScanHandler) Branches(w http.ResponseWriter, r *http.Request) {
	if !requireScannerAdmin(w, r) {
		return
	}
	claims := middleware.GetClaims(r)
	if rejectUnknownQuery(w, r, branchesAllowed) {
		return
	}
	q := r.URL.Query()
	clientID := strings.TrimSpace(q.Get("client_id"))
	repository := strings.TrimSpace(q.Get("repository"))
	if clientID == "" || repository == "" {
		writeAPIError(w, http.StatusBadRequest, "missing query params: client_id, repository", "INVALID_QUERY")
		return
	}
	if len(clientID) > 200 || len(repository) > 500 {
		writeAPIError(w, http.StatusBadRequest, "client_id or repository is too long", "INVALID_QUERY")
		return
	}
	platform, ok := readPlatform(w, q.Get("platform"))
	if !ok {
		return
	}
	out, err := h.service.Branches(r.Context(), claims.UserID, claims.TenantID, claims.DBName, clientID, repository, platform)
	if err != nil {
		writeDeepScanError(w, r, err, "INVALID_REPOSITORY", "Unable to load branches")
		return
	}
	writeJSON(w, http.StatusOK, out)
}
