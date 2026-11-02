// Package postures serves the ISPM posture dashboard API (ISPM_Dashboard_API_v2.md).
//
// Unlike the other v1 handlers, every endpoint here answers in the envelope the
// document defines: { data, page, meta } on success and
// { error: { code, message, field } } on failure. Common rules enforced for
// every endpoint: Bearer JWT (tenant from the token only), a 20 req/s per
// tenant limit with bursts up to 50, strict query validation, and
// ETag/If-None-Match keyed on the scan id.
package common

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/ratelimit"
)

// Error codes of the documented error body.
const (
	codeInvalidParameter = "invalid_parameter"
	codeUnauthorized     = "unauthorized"
	codeForbidden        = "forbidden"
	codeNotFound         = "not_found"
	codeConflict         = "conflict"
	codeRateLimited      = "rate_limited"
	codeInternal         = "internal_error"
)

var (
	UuidRegex   = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	ruleIDRegex = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)
	TokenRegex  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`)
)

// ─────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────

func WriteJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		slog.Error("posture api: encode response", "err", err)
		status, body = http.StatusInternalServerError,
			[]byte(`{"error":{"code":"internal_error","message":"failed to encode response"}}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	WriteJSON(w, status, ErrorEnvelope{Error: ErrorBody{Code: code, Message: message, Field: field}})
}

func Invalid(w http.ResponseWriter, field, message string) {
	writeError(w, http.StatusBadRequest, codeInvalidParameter, message, field)
}

// fail translates a service error into the documented error body.
func Fail(w http.ResponseWriter, r *http.Request, what string, err error) {
	var pe *ParamError
	switch {
	case errors.As(err, &pe):
		Invalid(w, pe.Field, pe.Message)
	case errors.Is(err, ErrInvalidCursor):
		Invalid(w, "cursor", "cursor is not valid for this request")
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "not found", "")
	case errors.Is(err, ErrForbidden):
		writeError(w, http.StatusForbidden, codeForbidden, "your role may not perform this action", "")
	case errors.Is(err, ErrFindingResolved):
		writeError(w, http.StatusConflict, codeConflict, "the finding is resolved and can only be changed by the engine", "")
	case errors.Is(err, ErrConflict):
		writeError(w, http.StatusConflict, codeConflict, "the finding was changed by someone else; reload it and try again", "If-Match")
	default:
		logging.FromContext(r.Context()).Error("posture api failed", "what", what, "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "failed to "+what, "")
	}
}

// respond writes a 200 envelope. With cache set it adds the scan-id ETag so
// the client can revalidate with If-None-Match.
func Respond(w http.ResponseWriter, env *Envelope, cache bool) {
	if cache {
		if tag := etagFor(env.Meta); tag != "" {
			w.Header().Set("ETag", tag)
		}
	}
	w.Header().Set("Cache-Control", "private, no-cache")
	WriteJSON(w, http.StatusOK, env)
}

// ─────────────────────────────────────────────────────────────────────────
// Caller, rate limit
// ─────────────────────────────────────────────────────────────────────────

// begin authenticates the request and applies the per-tenant rate limit. It
// writes the error itself and returns ok=false when the request must stop.
func Begin(w http.ResponseWriter, r *http.Request) (Caller, bool) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "missing or invalid token", "")
		return Caller{}, false
	}
	if ok, wait := tenantLimiter.Allow(claims.TenantID, time.Now()); !ok {
		secs := int(math.Ceil(wait.Seconds()))
		if secs < 1 {
			secs = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		writeError(w, http.StatusTooManyRequests, codeRateLimited, "rate limit exceeded: 20 requests per second per tenant", "")
		return Caller{}, false
	}
	return Caller{UserID: claims.UserID, TenantID: claims.TenantID, DBName: claims.DBName, Role: claims.Role}, true
}

const (
	rateLimitPerSecond = 20.0
	rateLimitBurst     = 50.0
)

// tenantLimiter is a per-tenant token bucket.
var tenantLimiter = ratelimit.New(rateLimitPerSecond, rateLimitBurst)

// ─────────────────────────────────────────────────────────────────────────
// Caching: ETag "<scan_id>"
// ─────────────────────────────────────────────────────────────────────────

func etagFor(m Meta) string {
	if m.ScanID == "" {
		return ""
	}
	return `"` + m.ScanID + `"`
}

// scanMetaFunc is the cheap "which scan is current" lookup every service has.
type scanMetaFunc func(ctx context.Context, c Caller) (Meta, error)

// notModified answers 304 when If-None-Match carries the current scan's ETag.
// A failing lookup is ignored: the request simply proceeds uncached.
func NotModified(w http.ResponseWriter, r *http.Request, c Caller, scanMeta scanMetaFunc) bool {
	header := r.Header.Get("If-None-Match")
	if header == "" {
		return false
	}
	meta, err := scanMeta(r.Context(), c)
	if err != nil {
		return false
	}
	tag := etagFor(meta)
	if tag == "" {
		return false
	}
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimPrefix(strings.TrimSpace(candidate), "W/")
		if candidate == "*" || candidate == tag {
			w.Header().Set("ETag", tag)
			w.Header().Set("Cache-Control", "private, no-cache")
			w.WriteHeader(http.StatusNotModified)
			return true
		}
	}
	return false
}

// ─────────────────────────────────────────────────────────────────────────
// Query parsing
// ─────────────────────────────────────────────────────────────────────────

// allow builds a set of permitted query parameters.
func Allow(names ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(names))
	for _, n := range names {
		m[n] = struct{}{}
	}
	return m
}

// strictQuery rejects the first unknown parameter, so a typo is an error and
// not a silently ignored filter. It writes the 400 and returns false.
func StrictQuery(w http.ResponseWriter, q url.Values, allowed map[string]struct{}) bool {
	for k := range q {
		if _, ok := allowed[k]; !ok {
			names := make([]string, 0, len(allowed))
			for n := range allowed {
				names = append(names, n)
			}
			sort.Strings(names)
			list := "(none)"
			if len(names) > 0 {
				list = strings.Join(names, ", ")
			}
			Invalid(w, k, fmt.Sprintf("unknown query parameter %q; allowed: %s", k, list))
			return false
		}
	}
	return true
}

func ParseWindowParam(w http.ResponseWriter, q url.Values) (Window, bool) {
	win, ok := ParseWindow(q.Get("window"))
	if !ok {
		Invalid(w, "window", "window must be one of "+strings.Join(WindowLabels, ", "))
		return win, false
	}
	return win, true
}

// parseLimit reads ?limit= (default 50). Values above 100 are clamped to 100.
func ParseLimit(w http.ResponseWriter, q url.Values) (int, bool) {
	raw := strings.TrimSpace(q.Get("limit"))
	if raw == "" {
		return 50, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		Invalid(w, "limit", "limit must be a positive integer (maximum 100)")
		return 0, false
	}
	if n > 100 {
		n = 100
	}
	return n, true
}

func ParseCursor(w http.ResponseWriter, q url.Values) (string, bool) {
	c := strings.TrimSpace(q.Get("cursor"))
	if len(c) > 1024 {
		Invalid(w, "cursor", "cursor is too long")
		return "", false
	}
	return c, true
}

const maxListValues = 50

// csvValues splits a comma-separated parameter into trimmed, non-empty values.
func csvValues(w http.ResponseWriter, q url.Values, name string) ([]string, bool) {
	raw := strings.TrimSpace(q.Get(name))
	if raw == "" {
		return nil, true
	}
	var out []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			if len(p) > 128 {
				Invalid(w, name, name+" contains a value that is too long")
				return nil, false
			}
			out = append(out, p)
		}
	}
	if len(out) > maxListValues {
		Invalid(w, name, fmt.Sprintf("%s accepts at most %d values", name, maxListValues))
		return nil, false
	}
	return out, true
}

// csvEnum reads a comma-separated parameter whose values must match (case
// insensitively) one of the allowed spellings; the allowed spelling is returned.
func CsvEnum(w http.ResponseWriter, q url.Values, name string, allowed []string) ([]string, bool) {
	vals, ok := csvValues(w, q, name)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		match := ""
		for _, a := range allowed {
			if strings.EqualFold(a, v) {
				match = a
				break
			}
		}
		if match == "" {
			Invalid(w, name, fmt.Sprintf("%s %q is not valid; allowed: %s", name, v, strings.Join(allowed, ", ")))
			return nil, false
		}
		out = append(out, match)
	}
	return out, true
}

// pathID reads the {id} path variable as an identity UUID.
func IdentityIDOK(w http.ResponseWriter, id string) (string, bool) {
	id = strings.TrimSpace(id)
	if !UuidRegex.MatchString(id) {
		Invalid(w, "id", "id must be a valid identity UUID")
		return "", false
	}
	return strings.ToLower(id), true
}

func RuleIDOK(w http.ResponseWriter, id string) (string, bool) {
	id = strings.TrimSpace(id)
	if !ruleIDRegex.MatchString(id) {
		Invalid(w, "rule_id", "rule_id is not valid")
		return "", false
	}
	return id, true
}

// identityFilterParams are the filter parameters shared by /identities,
// /identities/facets and /posture/export.
var IdentityFilterParams = []string{
	"window", "band", "severity", "category", "account", "type", "pillar", "failing_check", "changed", "q",
}

// parseIdentityFilter validates the shared filter parameters. withSort adds
// sort, limit and cursor (list only). The caller has already run strictQuery.
func ParseIdentityFilter(w http.ResponseWriter, q url.Values, withSort bool) (IdentityFilter, bool) {
	var f IdentityFilter
	var ok bool
	if f.Window, ok = ParseWindowParam(w, q); !ok {
		return f, false
	}
	if f.Bands, ok = CsvEnum(w, q, "band", Bands); !ok {
		return f, false
	}
	if f.Severities, ok = CsvEnum(w, q, "severity", Severities); !ok {
		return f, false
	}
	if f.Categories, ok = csvValues(w, q, "category"); !ok {
		return f, false
	}
	if f.Accounts, ok = csvValues(w, q, "account"); !ok {
		return f, false
	}
	if f.Types, ok = csvValues(w, q, "type"); !ok {
		return f, false
	}
	for i := range f.Types {
		f.Types[i] = strings.ToUpper(f.Types[i])
	}
	if f.Pillars, ok = csvValues(w, q, "pillar"); !ok {
		return f, false
	}
	for i, p := range f.Pillars {
		if !TokenRegex.MatchString(p) {
			Invalid(w, "pillar", "pillar is not valid")
			return f, false
		}
		f.Pillars[i] = strings.ToLower(p)
	}
	if f.FailingChecks, ok = csvValues(w, q, "failing_check"); !ok {
		return f, false
	}
	for _, rule := range f.FailingChecks {
		if !ruleIDRegex.MatchString(rule) {
			Invalid(w, "failing_check", "failing_check is not valid")
			return f, false
		}
	}
	if raw := strings.ToLower(strings.TrimSpace(q.Get("changed"))); raw != "" {
		switch raw {
		case ChangedDown, ChangedUp, ChangedSame:
			f.Changed = raw
		default:
			Invalid(w, "changed", "changed must be down, up or same")
			return f, false
		}
	}
	if raw := strings.TrimSpace(q.Get("q")); raw != "" {
		if n := len([]rune(raw)); n < 2 || n > 100 {
			Invalid(w, "q", "q must be 2 to 100 characters")
			return f, false
		}
		f.Q = raw
	}
	f.Sort = SortScore
	if withSort {
		if raw := strings.TrimSpace(q.Get("sort")); raw != "" {
			valid := false
			for _, k := range SortKeys {
				if raw == k {
					valid, f.Sort = true, k
				}
			}
			if !valid {
				Invalid(w, "sort", "sort must be one of "+strings.Join(SortKeys, ", "))
				return f, false
			}
		}
		if f.Limit, ok = ParseLimit(w, q); !ok {
			return f, false
		}
		if f.Cursor, ok = ParseCursor(w, q); !ok {
			return f, false
		}
	}
	return f, true
}
