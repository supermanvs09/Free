package common

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

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/ratelimit"
	"nhi-backend-api/internal/remediation/engine"
)

// Error codes of the remediation API.
const (
	codeInvalid      = "invalid_request"
	codeUnauthorized = "unauthorized"
	codeForbidden    = "forbidden"
	codeNotFound     = "not_found"
	codeRateLimited  = "rate_limited"
	codeInternal     = "internal"
)

// maxBody bounds a request body.
const maxBody = 1 << 20

// ─────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────

func WriteJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		slog.Error("remediation api: encode response", "err", err)
		status, body = http.StatusInternalServerError,
			[]byte(`{"error":{"code":"internal","message":"failed to encode response"}}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// Respond writes { "data": v } with the given status.
func Respond(w http.ResponseWriter, status int, v any) {
	WriteJSON(w, status, Envelope{Data: v})
}

func writeError(w http.ResponseWriter, status int, code, message, field string) {
	WriteJSON(w, status, ErrorEnvelope{Error: ErrorBody{Code: code, Message: message, Field: field}})
}

// Invalid answers 400 for a named field.
func Invalid(w http.ResponseWriter, field, message string) {
	writeError(w, http.StatusBadRequest, codeInvalid, message, field)
}

// Fail translates a service error into the error body.
func Fail(w http.ResponseWriter, r *http.Request, what string, err error) {
	var (
		pe *ParamError
		ee *engine.Error
	)
	switch {
	case errors.As(err, &pe):
		Invalid(w, pe.Field, pe.Message)
	case errors.As(err, &ee):
		writeError(w, ee.Status, ee.Code, ee.Message, "")
	case errors.Is(err, ErrForbidden):
		writeError(w, http.StatusForbidden, codeForbidden, err.Error(), "")
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, err.Error(), "")
	default:
		logging.FromContext(r.Context()).Error("remediation api failed", "what", what, "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "failed to "+what, "")
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Caller, rate limit
// ─────────────────────────────────────────────────────────────────────────

// Begin takes the caller from the JWT and applies the per-tenant rate limit.
// It writes the error itself and returns ok=false when the request must stop.
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
// Request parsing
// ─────────────────────────────────────────────────────────────────────────

// Decode reads a JSON body into v; unknown fields are refused. An empty body
// is accepted when optional is true. It answers 400 itself on failure.
func Decode(w http.ResponseWriter, r *http.Request, v any, optional bool) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			if optional {
				return true
			}
			Invalid(w, "body", "a JSON body is required")
			return false
		}
		Invalid(w, "body", "the body is not valid JSON for this request: "+err.Error())
		return false
	}
	return true
}

// Allow builds the allowed query-parameter set of an endpoint.
func Allow(names ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(names))
	for _, n := range names {
		m[n] = struct{}{}
	}
	return m
}

// StrictQuery refuses unknown or repeated query parameters.
func StrictQuery(w http.ResponseWriter, q url.Values, allowed map[string]struct{}) bool {
	for k, v := range q {
		if _, ok := allowed[k]; !ok {
			Invalid(w, k, "unknown query parameter "+k)
			return false
		}
		if len(v) > 1 {
			Invalid(w, k, "query parameter "+k+" may be given once")
			return false
		}
	}
	return true
}

// QueryInt reads an optional non-negative integer query parameter.
func QueryInt(w http.ResponseWriter, q url.Values, name string) (int, bool) {
	raw := strings.TrimSpace(q.Get(name))
	if raw == "" {
		return 0, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		Invalid(w, name, name+" must be a non-negative integer")
		return 0, false
	}
	return n, true
}

// UUIDParam reads a {name} path variable that must be a UUID.
func UUIDParam(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	id := strings.TrimSpace(mux.Vars(r)[name])
	if !UUIDRegex.MatchString(id) {
		Invalid(w, name, name+" must be a UUID")
		return "", false
	}
	return strings.ToLower(id), true
}

// AccountParam reads the {account_id} path variable (12-digit AWS account).
func AccountParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := strings.TrimSpace(mux.Vars(r)["account_id"])
	if !AccountIDRegex.MatchString(id) {
		Invalid(w, "account_id", "account_id must be a 12-digit AWS account id")
		return "", false
	}
	return id, true
}
