package correlation

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/correlation/engine"
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/ratelimit"
)

// Handler serves the six correlation endpoints.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ── Catalog ───────────────────────────────────────────────────────────────────

// Catalog: GET /correlation/catalog?section=rules,families&category=...
func (h *Handler) Catalog(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !strictQuery(w, q, "section", "category") {
		return
	}
	sections, ok := parseSections(w, q.Get("section"))
	if !ok {
		return
	}
	category := strings.TrimSpace(q.Get("category"))
	if len(category) > maxCategory {
		invalid(w, "category", "category is too long")
		return
	}
	out, err := h.svc.Catalog(r.Context(), c, sections, category)
	if err != nil {
		fail(w, r, "load the catalog", err)
		return
	}
	respond(w, http.StatusOK, out)
}

func parseSections(w http.ResponseWriter, raw string) (map[string]bool, bool) {
	want := map[string]bool{}
	if strings.TrimSpace(raw) == "" {
		for _, s := range catalogSections {
			want[s] = true
		}
		return want, true
	}
	known := map[string]bool{}
	for _, s := range catalogSections {
		known[s] = true
	}
	for _, s := range strings.Split(raw, ",") {
		s = strings.TrimSpace(s)
		if !known[s] {
			invalid(w, "section", "section must be a comma-separated list of "+strings.Join(catalogSections, ", "))
			return nil, false
		}
		want[s] = true
	}
	return want, true
}

// ── Blast radius ──────────────────────────────────────────────────────────────

// BlastRadius: GET /correlation/blast-radius?arn=...&summary=true&refresh=true.
// 200 with the result, or 202 with the queued run when it did not finish in time.
func (h *Handler) BlastRadius(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !strictQuery(w, q, "arn", "summary", "refresh") {
		return
	}
	arn, ok := arnParam(w, q, "arn")
	if !ok {
		return
	}
	summary, ok := boolParam(w, q, "summary")
	if !ok {
		return
	}
	refresh, ok := boolParam(w, q, "refresh")
	if !ok {
		return
	}
	res, run, err := h.svc.BlastRadius(r.Context(), c, arn, refresh, summary)
	if err != nil {
		fail(w, r, "compute the blast radius", err)
		return
	}
	if run != nil {
		respond(w, http.StatusAccepted, RunQueued{Run: run})
		return
	}
	respond(w, http.StatusOK, res)
}

// ── Graph ─────────────────────────────────────────────────────────────────────

// Graph: GET /correlation/graph?arn=...&direction=out|in|both&service=s3&limit=&offset=&depth=
func (h *Handler) Graph(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !strictQuery(w, q, "arn", "direction", "service", "limit", "offset", "depth") {
		return
	}
	arn, ok := arnParam(w, q, "arn")
	if !ok {
		return
	}
	opts := engine.NavOptions{Direction: q.Get("direction")}
	switch opts.Direction {
	case "", "both", "out", "in":
	default:
		invalid(w, "direction", "direction must be out, in or both")
		return
	}
	if v := strings.ToLower(strings.TrimSpace(q.Get("service"))); v != "" {
		if !serviceRe.MatchString(v) {
			invalid(w, "service", "service must be an AWS service name such as s3")
			return
		}
		opts.Service = v
	}
	var good bool
	if opts.Limit, good = intParam(w, q, "limit", 1, maxGraphLimit); !good {
		return
	}
	if opts.Offset, good = intParam(w, q, "offset", 0, math.MaxInt32); !good {
		return
	}
	depth, good := intParam(w, q, "depth", 1, maxDepth)
	if !good {
		return
	}
	if depth > 0 && opts.Direction == "out" {
		invalid(w, "depth", "depth answers who can assume the identity, so direction must be in or both")
		return
	}
	resp, err := h.svc.Graph(r.Context(), c, arn, opts, depth)
	if err != nil {
		fail(w, r, "load the graph", err)
		return
	}
	respond(w, http.StatusOK, resp)
}

// ── Paths ─────────────────────────────────────────────────────────────────────

// Paths: GET /correlation/paths?from=<arn>&to=<arn|*|*:svc>, or ?to=<arn> alone
// for every identity that can reach a resource.
func (h *Handler) Paths(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !strictQuery(w, q, "from", "to") {
		return
	}
	from, to := q.Get("from"), q.Get("to")
	if to == "" {
		invalid(w, "to", "to is required")
		return
	}
	if from == "" {
		if !engine.ValidARN(to) {
			invalid(w, "to", "without from, to must be the ARN of a resource")
			return
		}
	} else {
		if !engine.ValidARN(from) {
			invalid(w, "from", "from must be an ARN")
			return
		}
		if !engine.ValidARN(to) && !engine.IsAllResourcesTarget(to) {
			invalid(w, "to", "to must be an ARN, * or *:<service>")
			return
		}
	}
	resp, err := h.svc.Paths(r.Context(), c, from, to)
	if err != nil {
		fail(w, r, "load the paths", err)
		return
	}
	respond(w, http.StatusOK, resp)
}

// ── Runs ──────────────────────────────────────────────────────────────────────

// CreateRun: POST /correlation/runs {"arn": "...", "refresh": true}.
func (h *Handler) CreateRun(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	if !strictQuery(w, r.URL.Query()) {
		return
	}
	var body RunRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		if errors.Is(err, io.EOF) {
			invalid(w, "body", "a JSON body is required")
		} else {
			invalid(w, "body", "the body is not valid JSON for this request: "+err.Error())
		}
		return
	}
	if !engine.ValidARN(body.ARN) {
		invalid(w, "arn", "arn must be an ARN")
		return
	}
	refresh := true
	if body.Refresh != nil {
		refresh = *body.Refresh
	}
	run, err := h.svc.CreateRun(r.Context(), c, body.ARN, refresh)
	if err != nil {
		fail(w, r, "queue the run", err)
		return
	}
	respond(w, http.StatusAccepted, RunQueued{Run: run})
}

// Runs: GET /correlation/runs?id=<uuid>, or ?status=pending|running|completed|failed&limit=N.
func (h *Handler) Runs(w http.ResponseWriter, r *http.Request) {
	c, ok := begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !strictQuery(w, q, "id", "status", "limit") {
		return
	}
	if id := strings.TrimSpace(q.Get("id")); id != "" {
		if q.Get("status") != "" || q.Get("limit") != "" {
			invalid(w, "id", "id cannot be combined with status or limit")
			return
		}
		if !uuidRe.MatchString(id) {
			invalid(w, "id", "id must be a UUID")
			return
		}
		run, err := h.svc.Run(r.Context(), c, strings.ToLower(id))
		if err != nil {
			fail(w, r, "load the run", err)
			return
		}
		respond(w, http.StatusOK, run)
		return
	}
	status := strings.TrimSpace(q.Get("status"))
	if status != "" && !runStatuses[status] {
		invalid(w, "status", "status must be pending, running, completed or failed")
		return
	}
	limit, ok := intParam(w, q, "limit", 1, maxRunsLimit)
	if !ok {
		return
	}
	list, err := h.svc.Runs(r.Context(), c, status, limit)
	if err != nil {
		fail(w, r, "list the runs", err)
		return
	}
	respond(w, http.StatusOK, list)
}

// ── Request and response helpers ─────────────────────────────────────────────

const (
	rateLimitPerSecond = 20.0
	rateLimitBurst     = 50.0
)

// tenantLimiter is a per-tenant token bucket, the same budget as the other
// feature APIs. A blast radius is the heaviest call, so it matters here too.
var tenantLimiter = ratelimit.New(rateLimitPerSecond, rateLimitBurst)

// begin takes the caller from the JWT and applies the per-tenant rate limit. It
// writes the error itself and returns ok=false when the request must stop.
func begin(w http.ResponseWriter, r *http.Request) (caller, bool) {
	claims := middleware.GetClaims(r)
	if claims == nil || claims.DBName == "" {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "missing or invalid token", "")
		return caller{}, false
	}
	if ok, wait := tenantLimiter.Allow(claims.TenantID, time.Now()); !ok {
		secs := int(math.Ceil(wait.Seconds()))
		if secs < 1 {
			secs = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		writeError(w, http.StatusTooManyRequests, codeRateLimited, "rate limit exceeded: 20 requests per second per tenant", "")
		return caller{}, false
	}
	return caller{TenantID: claims.TenantID, DBName: claims.DBName}, true
}

// strictQuery refuses unknown or repeated query parameters.
func strictQuery(w http.ResponseWriter, q url.Values, allowed ...string) bool {
	ok := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		ok[a] = true
	}
	for k, v := range q {
		if !ok[k] {
			invalid(w, k, "unknown query parameter "+k)
			return false
		}
		if len(v) > 1 {
			invalid(w, k, "query parameter "+k+" may be given once")
			return false
		}
	}
	return true
}

func arnParam(w http.ResponseWriter, q url.Values, name string) (string, bool) {
	v := q.Get(name)
	if v == "" {
		invalid(w, name, name+" is required")
		return "", false
	}
	if !engine.ValidARN(v) {
		invalid(w, name, name+" must be an ARN")
		return "", false
	}
	return v, true
}

// boolParam reads an optional boolean; absent is false.
func boolParam(w http.ResponseWriter, q url.Values, name string) (bool, bool) {
	raw := strings.TrimSpace(q.Get(name))
	if raw == "" {
		return false, true
	}
	b, err := strconv.ParseBool(raw)
	if err != nil {
		invalid(w, name, name+" must be true or false")
		return false, false
	}
	return b, true
}

// intParam reads an optional integer within [lo, hi]; absent is 0, which the
// engine reads as "use the default" (or "not asked", for depth).
func intParam(w http.ResponseWriter, q url.Values, name string, lo, hi int) (int, bool) {
	raw := strings.TrimSpace(q.Get(name))
	if raw == "" {
		return 0, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < lo || n > hi {
		invalid(w, name, name+" must be a number from "+strconv.Itoa(lo)+" to "+strconv.Itoa(hi))
		return 0, false
	}
	return n, true
}

func respond(w http.ResponseWriter, status int, v any) {
	writeJSON(w, status, envelope{Data: v})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		slog.Error("correlation api: encode response", "err", err)
		status, body = http.StatusInternalServerError,
			[]byte(`{"error":{"code":"internal","message":"failed to encode response"}}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	writeJSON(w, status, errorEnvelope{Error: errorBody{Code: code, Message: message, Field: field}})
}

func invalid(w http.ResponseWriter, field, message string) {
	writeError(w, http.StatusBadRequest, codeInvalid, message, field)
}

// fail translates an error from the service into the error body.
func fail(w http.ResponseWriter, r *http.Request, what string, err error) {
	var pe *paramError
	switch {
	case errors.As(err, &pe):
		invalid(w, pe.Field, pe.Message)
	case errors.Is(err, engine.ErrCredentialNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "identity not found in this tenant", "")
	case errors.Is(err, engine.ErrRunNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "run not found", "")
	case errors.Is(err, errTimeout):
		writeError(w, http.StatusGatewayTimeout, codeTimeout,
			"the computation took too long; queue a run with POST /correlation/runs and poll GET /correlation/runs?id=", "")
	case errors.Is(err, engine.ErrTableMissing), engine.IsMissingTable(err), database.IsMissingTable(err):
		writeError(w, http.StatusServiceUnavailable, database.NotProvisionedCode, database.NotProvisionedMessage, "")
	default:
		logging.FromContext(r.Context()).Error("correlation api failed", "what", what, "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "failed to "+what, "")
	}
}
