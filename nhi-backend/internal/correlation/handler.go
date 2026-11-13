package correlation

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

// Handler serves the blast-radius API. The tenant, its schema and the
// accounts/regions in view come from the signed-in user (JWT + saved scope),
// never from the request, so one tenant cannot read another's graph.
type Handler struct {
	engine *Engine
	repo   *PGRepo
	// scope resolves the caller's tenant scope (tests substitute a fixed one).
	scope func(r *http.Request) (*Scope, int, error)
}

func NewHandler(engine *Engine, repo *PGRepo, resolver *scope.Resolver) *Handler {
	return &Handler{engine: engine, repo: repo, scope: func(r *http.Request) (*Scope, int, error) {
		claims := middleware.GetClaims(r)
		if claims == nil {
			return nil, http.StatusUnauthorized, errUnauthorized
		}
		ds, err := resolver.Resolve(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return BuildScope(ds.DB, ds.QSchema(), ds.AccountIDs, ds.Regions), 0, nil
	}}
}

var errUnauthorized = errors.New("unauthorized")

// Register mounts the endpoints on the authenticated /api/v1 router. ARNs
// contain '/', so the path variables match across segments.
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/correlations/blast-radius/{arn:.+}", h.BlastRadius).Methods(http.MethodGet)
	r.HandleFunc("/correlations/who-can-assume/{arn:.+}", h.WhoCanAssume).Methods(http.MethodGet)
	r.HandleFunc("/correlations/reverse-access/{arn:.+}", h.ReverseAccess).Methods(http.MethodGet)
	r.HandleFunc("/correlations/graph/{arn:.+}", h.Graph).Methods(http.MethodGet)
	r.HandleFunc("/correlations/path", h.Path).Methods(http.MethodGet)
	r.HandleFunc("/correlations/identities/{id}/credentials", h.IdentitySubjects).Methods(http.MethodGet)
}

// computeTimeout bounds one synchronous computation.
const computeTimeout = 50 * time.Second

var arnRe = regexp.MustCompile(`^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:[0-9]*:[^\s]+$`)

func validARN(s string) bool { return len(s) <= 2048 && arnRe.MatchString(s) }

// scopeFor resolves the caller's tenant scope. It answers the request itself
// (and returns nil) when that fails.
func (h *Handler) scopeFor(w http.ResponseWriter, r *http.Request) *Scope {
	ds, status, err := h.scope(r)
	switch {
	case status == http.StatusUnauthorized:
		fail(w, status, "Unauthorized", "UNAUTHORIZED")
		return nil
	case err != nil:
		httpx.SendServerError(w, r, err, "Could not load your workspace", "SCOPE_UNAVAILABLE")
		return nil
	}
	return ds
}

func fail(w http.ResponseWriter, status int, msg, code string) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: false, Message: msg, Error: code})
}

func ok(w http.ResponseWriter, data any) {
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: data})
}

func arnVar(w http.ResponseWriter, r *http.Request) (string, bool) {
	arn := mux.Vars(r)["arn"]
	if !validARN(arn) {
		fail(w, http.StatusBadRequest, "A valid ARN is required", "INVALID_ARN")
		return "", false
	}
	return arn, true
}

// BlastRadius: GET /correlations/blast-radius/{arn}?refresh=&summary=
func (h *Handler) BlastRadius(w http.ResponseWriter, r *http.Request) {
	arn, good := arnVar(w, r)
	if !good {
		return
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	refresh, _ := strconv.ParseBool(r.URL.Query().Get("refresh"))
	summary, _ := strconv.ParseBool(r.URL.Query().Get("summary"))
	ctx, cancel := context.WithTimeout(r.Context(), computeTimeout)
	defer cancel()

	result, err := h.engine.ComputeBlastRadiusOpts(ctx, ds, arn, refresh)
	if err != nil {
		if errors.Is(err, ErrCredentialNotFound) {
			fail(w, http.StatusNotFound, "This identity is not in the accounts and regions you are viewing", "NOT_IN_SCOPE")
			return
		}
		httpx.SendServerError(w, r, err, "Blast radius could not be computed", "BLAST_RADIUS_FAILED")
		return
	}
	if summary {
		result = summarizeResult(result)
	}
	ok(w, result)
}

// summaryResources is how many reachable resources a summary keeps.
const summaryResources = 25

// summarizeResult returns a short copy for ?summary=true: score, service
// groups, identities and the strongest resources, without the full path list.
func summarizeResult(r *BlastRadiusResult) *BlastRadiusResult {
	s := *r
	s.Summary = true
	s.Paths = []BlastRadiusPath{}
	s.ReachableResourcesTotal = len(r.ReachableResources)
	if len(s.ReachableResources) > summaryResources {
		s.ReachableResources = s.ReachableResources[:summaryResources]
	}
	return &s
}

// WhoCanAssume: GET /correlations/who-can-assume/{arn}?depth=1..5
func (h *Handler) WhoCanAssume(w http.ResponseWriter, r *http.Request) {
	arn, good := arnVar(w, r)
	if !good {
		return
	}
	depth := 1
	if v := r.URL.Query().Get("depth"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 5 {
			fail(w, http.StatusBadRequest, "depth must be a number from 1 to 5", "INVALID_REQUEST")
			return
		}
		depth = n
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), computeTimeout)
	defer cancel()
	res, found := h.engine.WhoCanAssume(ctx, ds, arn, depth)
	if !found {
		fail(w, http.StatusNotFound, "This role is not in view, or it has no trust policy", "NOT_IN_SCOPE")
		return
	}
	ok(w, res)
}

// ReverseAccess: GET /correlations/reverse-access/{arn} - who can reach a resource.
func (h *Handler) ReverseAccess(w http.ResponseWriter, r *http.Request) {
	arn, good := arnVar(w, r)
	if !good {
		return
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), computeTimeout)
	defer cancel()
	paths, err := h.engine.ReverseAccess(ctx, ds, arn)
	if err != nil {
		httpx.SendServerError(w, r, err, "Reverse access could not be computed", "REVERSE_ACCESS_FAILED")
		return
	}
	ok(w, map[string]any{"resource_arn": arn, "total": len(paths), "paths": paths})
}

// Graph: GET /correlations/graph/{arn}?direction=out|in|both&service=&limit=&offset=
func (h *Handler) Graph(w http.ResponseWriter, r *http.Request) {
	arn, good := arnVar(w, r)
	if !good {
		return
	}
	q := r.URL.Query()
	opts := NavOptions{Direction: q.Get("direction"), Service: strings.ToLower(strings.TrimSpace(q.Get("service")))}
	switch opts.Direction {
	case "", "both", "out", "in":
	default:
		fail(w, http.StatusBadRequest, "direction must be out, in or both", "INVALID_REQUEST")
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			fail(w, http.StatusBadRequest, "limit must be a number from 1 to 200", "INVALID_REQUEST")
			return
		}
		opts.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			fail(w, http.StatusBadRequest, "offset must be 0 or more", "INVALID_REQUEST")
			return
		}
		opts.Offset = n
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), computeTimeout)
	defer cancel()
	view, err := h.engine.Navigate(ctx, ds, arn, opts)
	if err != nil {
		if errors.Is(err, ErrCredentialNotFound) {
			fail(w, http.StatusNotFound, "This identity is not in the accounts and regions you are viewing", "NOT_IN_SCOPE")
			return
		}
		httpx.SendServerError(w, r, err, "The access graph could not be loaded", "GRAPH_FAILED")
		return
	}
	ok(w, view)
}

// Path: GET /correlations/path?from=<arn>&to=<arn|*|*:service>
func (h *Handler) Path(w http.ResponseWriter, r *http.Request) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if !validARN(from) || !(validARN(to) || isAllResourcesTarget(to)) {
		fail(w, http.StatusBadRequest, "from and to must be ARNs (to may also be * or *:<service>)", "INVALID_REQUEST")
		return
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), computeTimeout)
	defer cancel()
	paths, err := h.engine.PathsBetween(ctx, ds, from, to)
	if err != nil {
		if errors.Is(err, ErrCredentialNotFound) {
			fail(w, http.StatusNotFound, "This identity is not in the accounts and regions you are viewing", "NOT_IN_SCOPE")
			return
		}
		httpx.SendServerError(w, r, err, "Paths could not be computed", "PATH_FAILED")
		return
	}
	ok(w, map[string]any{"from": from, "to": to, "total": len(paths), "paths": paths})
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

// IdentitySubjects: GET /correlations/identities/{id}/credentials - the
// credentials an identity signs in with (roles first), whose blast radius is
// the identity's.
func (h *Handler) IdentitySubjects(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if !uuidRe.MatchString(id) {
		fail(w, http.StatusBadRequest, "Invalid identity ID", "INVALID_REQUEST")
		return
	}
	ds := h.scopeFor(w, r)
	if ds == nil {
		return
	}
	list, err := h.repo.IdentityCredentials(r.Context(), ds, id)
	if err != nil {
		httpx.SendServerError(w, r, err, "The identity's credentials could not be loaded", "SUBJECTS_FAILED")
		return
	}
	ok(w, map[string]any{"credentials": list})
}
