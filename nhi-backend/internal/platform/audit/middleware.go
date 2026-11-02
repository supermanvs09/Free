package audit

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// Caller is what the audit middleware needs to know about the signed-in user.
// The auth middleware puts the claims in the context; this keeps the audit
// package from depending on the auth package (and the other way round).
type Caller struct {
	Actor    string
	Role     string
	TenantID string
}

// CallerFunc reads the caller out of a request. Returns an empty Caller for an
// anonymous request (sign-in, health).
type CallerFunc func(*http.Request) Caller

// Config decides how much the middleware records.
type Config struct {
	// Reads records ordinary GETs too. Off by default: a console that polls
	// would bury the entries that matter.
	Reads bool
	// Bodies keeps a redacted copy of the request body of a state change.
	// On by default, because "what did they change it to" is the question an
	// audit log is read for.
	Bodies bool
	// MaxBody is how much of a body is read for that, in bytes.
	MaxBody int64
}

// DefaultConfig records state changes with redacted bodies, and no reads.
func DefaultConfig() Config { return Config{Reads: false, Bodies: true, MaxBody: 16 << 10} }

// Middleware records every request that goes through it. Mount it once, after
// authentication, on the router every API hangs off: from then on each route
// is recorded, including routes added later.
func Middleware(sink Sink, caller CallerFunc, cfg Config) func(http.Handler) http.Handler {
	if cfg.MaxBody <= 0 {
		cfg.MaxBody = 16 << 10
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if sink == nil {
				next.ServeHTTP(w, r)
				return
			}
			start := time.Now()
			isRead := r.Method == http.MethodGet || r.Method == http.MethodHead

			var body []byte
			if cfg.Bodies && !isRead && r.Body != nil {
				// Read what fits, then put it back so the handler still sees it.
				body, _ = io.ReadAll(io.LimitReader(r.Body, cfg.MaxBody))
				rest := r.Body
				r.Body = struct {
					io.Reader
					io.Closer
				}{io.MultiReader(bytes.NewReader(body), rest), rest}
			}

			rec := &recorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			status := rec.status
			// A read that was allowed is not an action; a read that was refused
			// is. Exports are always recorded.
			if isRead && !cfg.Reads && status != http.StatusForbidden && status != http.StatusUnauthorized && !isExport(r) {
				return
			}

			route := RouteOf(r)
			c := Caller{}
			if caller != nil {
				c = caller(r)
			}
			if c.Actor == "" {
				c.Actor = "anonymous"
			}
			e := Entry{
				OccurredAt: start.UTC(),
				TenantID:   c.TenantID,
				Actor:      c.Actor,
				ActorRole:  c.Role,
				Action:     ActionName(r.Method, route),
				Method:     r.Method,
				Route:      route,
				Path:       r.URL.Path,
				Target:     targetOf(r),
				Status:     status,
				Outcome:    OutcomeFor(status),
				ErrorCode:  rec.errorCode(),
				RequestID:  strings.TrimSpace(r.Header.Get("X-Request-ID")),
				IP:         clientIP(r),
				UserAgent:  trim(r.UserAgent(), 300),
				DurationMS: int(time.Since(start).Milliseconds()),
				Screen:     trim(r.Header.Get("X-Console-Screen"), 120),
				Details:    details(r, body, cfg),
			}
			if id := rec.requestID(); e.RequestID == "" && id != "" {
				e.RequestID = id
			}
			sink.Record(r.Context(), e)
		})
	}
}

func details(r *http.Request, body []byte, cfg Config) map[string]any {
	out := map[string]any{}
	if cfg.Bodies && len(body) > 0 {
		for k, v := range Body(body) {
			out[k] = v
		}
	}
	// Query parameters say what a refused read was reaching for, and which
	// filter an export was taken with.
	if q := r.URL.RawQuery; q != "" && len(q) <= 1000 {
		params := map[string]any{}
		for k, vs := range r.URL.Query() {
			if sensitive(k) {
				params[k] = "[redacted]"
				continue
			}
			if len(vs) == 1 {
				params[k] = trim(vs[0], maxValueLen)
				continue
			}
			params[k] = vs
		}
		if len(params) > 0 {
			out["query"] = params
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func isExport(r *http.Request) bool {
	return strings.Contains(strings.ToLower(r.URL.Path), "/export")
}

// RouteOf is the template mux matched, which is what makes entries comparable
// ("/aws/accounts/{id}" rather than one route per account). Falls back to the
// path when nothing matched.
func RouteOf(r *http.Request) string {
	if route := mux.CurrentRoute(r); route != nil {
		if tpl, err := route.GetPathTemplate(); err == nil && tpl != "" {
			return tpl
		}
	}
	return r.URL.Path
}

// verbs are route segments that already say what the action is, so the method
// does not need to be turned into a word.
var verbs = map[string]bool{
	"login": true, "logout": true, "refresh": true, "verify": true, "recheck": true,
	"sync": true, "approve": true, "reject": true, "execute": true, "cancel": true,
	"dismiss": true, "resolve": true, "reopen": true, "escalate": true, "acknowledge": true,
	"assign": true, "suppress": true, "restore": true, "export": true, "retry": true,
	"deep-scan": true, "deepscan": true, "rescan": true, "scan": true, "rotate": true,
	"enable": true, "disable": true, "activate": true, "deactivate": true,
}

// methodVerb is what a method does, as a word, when the route does not say.
var methodVerb = map[string]string{
	http.MethodPost:   "create",
	http.MethodPut:    "update",
	http.MethodPatch:  "update",
	http.MethodDelete: "delete",
	http.MethodGet:    "read",
	http.MethodHead:   "read",
}

// ActionName turns a method and a route template into a stable, readable name:
//
//	POST   /api/v1/aws/accounts            -> aws.accounts.create
//	DELETE /api/v1/aws/accounts/{id}       -> aws.accounts.delete
//	PATCH  /api/v1/ispm/findings/{id}      -> ispm.findings.update
//	POST   /api/v1/aws/accounts/{id}/sync  -> aws.accounts.sync
//	POST   /api/auth/login                 -> login
//
// Names are what the console groups and filters by, so they must not change
// with the ids in a URL.
func ActionName(method, route string) string {
	r := strings.TrimPrefix(route, "/api")
	r = strings.TrimPrefix(r, "/v1")
	r = strings.TrimPrefix(r, "/auth")
	var parts []string
	for _, seg := range strings.Split(strings.Trim(r, "/"), "/") {
		if seg == "" || strings.HasPrefix(seg, "{") {
			continue
		}
		parts = append(parts, strings.ToLower(seg))
	}
	if len(parts) == 0 {
		return strings.ToLower(method)
	}
	if verbs[parts[len(parts)-1]] {
		return strings.Join(parts, ".")
	}
	if v := methodVerb[method]; v != "" {
		parts = append(parts, v)
	}
	return strings.Join(parts, ".")
}

// targetOf is the id the action was about: the last path variable mux captured,
// which is the resource in every route this API registers.
func targetOf(r *http.Request) string {
	vars := mux.Vars(r)
	if len(vars) == 0 {
		return ""
	}
	// Prefer an explicitly named id over a generic one.
	for _, name := range []string{"id", "account_id", "identity_id", "credential_id", "finding_id", "job_id", "alert_id", "user_id", "plan_id", "rule_id"} {
		if v := strings.TrimSpace(vars[name]); v != "" {
			return trim(v, 200)
		}
	}
	for _, v := range vars {
		if s := strings.TrimSpace(v); s != "" {
			return trim(s, 200)
		}
	}
	return ""
}

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		// The first entry is the client; the rest are proxies.
		if first, _, ok := strings.Cut(fwd, ","); ok {
			return trim(first, 64)
		}
		return trim(fwd, 64)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return trim(r.RemoteAddr, 64)
	}
	return host
}

// recorder notes the status and, for a refusal or a failure, the error code the
// client was told, so the audit entry says why without a second lookup.
type recorder struct {
	http.ResponseWriter
	status int
	body   []byte
	wrote  bool
}

const maxCapturedBody = 512

func (rw *recorder) WriteHeader(code int) {
	if !rw.wrote {
		rw.status = code
		rw.wrote = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *recorder) Write(b []byte) (int, error) {
	if !rw.wrote {
		rw.wrote = true
	}
	if rw.status >= 400 && len(rw.body) < maxCapturedBody {
		room := maxCapturedBody - len(rw.body)
		if room > len(b) {
			room = len(b)
		}
		rw.body = append(rw.body, b[:room]...)
	}
	return rw.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the real writer.
func (rw *recorder) Unwrap() http.ResponseWriter { return rw.ResponseWriter }

func (rw *recorder) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (rw *recorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	return h.Hijack()
}

// errorCode digs the API's error code out of the body it already wrote. Every
// family of this API puts it somewhere slightly different, so all four shapes
// are tried.
func (rw *recorder) errorCode() string {
	if len(rw.body) == 0 {
		return ""
	}
	return trim(extractField(rw.body, "code", "error"), 64)
}

func (rw *recorder) requestID() string {
	return trim(rw.Header().Get("X-Request-ID"), 128)
}

// extractField pulls a short string value out of a small JSON body without
// decoding it into a map: the body may be any of four error shapes, and only
// one short field is wanted.
func extractField(body []byte, keys ...string) string {
	s := string(body)
	for _, key := range keys {
		needle := `"` + key + `":`
		i := strings.Index(s, needle)
		if i < 0 {
			continue
		}
		rest := strings.TrimSpace(s[i+len(needle):])
		if !strings.HasPrefix(rest, `"`) {
			continue // an object, such as {"error":{"code":...}} - try the next key
		}
		rest = rest[1:]
		if end := strings.IndexByte(rest, '"'); end >= 0 {
			return rest[:end]
		}
	}
	return ""
}
