// Package audit records what people did in the console.
//
// One middleware sits in front of every authenticated route, so an endpoint
// added later is recorded without anybody remembering to add a call: it names
// the action from the route mux matched, notes who the caller was and how the
// request ended, and writes a row. Handlers stay free of audit code.
//
// What is recorded, and what is not:
//
//   - every request that changes state (POST, PUT, PATCH, DELETE), whether it
//     succeeded, was refused, or failed;
//   - every request refused for a lack of permission, read or not, because an
//     attempt to reach something is itself worth keeping;
//   - signing in, signing out, and exports;
//   - ordinary reads only when AUDIT_READS is on. Listing a table is not an
//     action, and a console that polls would bury the real entries.
//
// Never recorded: passwords, tokens, secrets, or any value under a key that
// looks like one (see redact).
package audit

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

// Outcome says how a request ended, in the words the console filters by.
const (
	OutcomeSuccess = "success" // 2xx / 3xx
	OutcomeDenied  = "denied"  // 401, 403 - not allowed
	OutcomeInvalid = "invalid" // other 4xx - the request itself was wrong
	OutcomeFailed  = "failed"  // 5xx - our side broke
)

// Entry is one recorded action.
type Entry struct {
	ID         int64          `json:"id"`
	OccurredAt time.Time      `json:"occurred_at"`
	TenantID   string         `json:"tenant_id"`
	Actor      string         `json:"actor"`      // the signed-in user's email, or "anonymous"
	ActorRole  string         `json:"actor_role"` // the role at the time of the action
	Action     string         `json:"action"`     // "aws.accounts.create", "login", ...
	Method     string         `json:"method"`
	Route      string         `json:"route"`  // the template, so entries group
	Path       string         `json:"path"`   // what was actually called
	Target     string         `json:"target"` // the id the action was about, when there is one
	Status     int            `json:"status"`
	Outcome    string         `json:"outcome"`
	ErrorCode  string         `json:"error_code,omitempty"`
	RequestID  string         `json:"request_id,omitempty"`
	IP         string         `json:"ip,omitempty"`
	UserAgent  string         `json:"user_agent,omitempty"`
	DurationMS int            `json:"duration_ms"`
	Screen     string         `json:"screen,omitempty"` // the console screen it came from
	Details    map[string]any `json:"details,omitempty"`
}

// Sink takes finished entries. Writing must not block the request, so the
// Postgres sink buffers and drops rather than waits (see store.go).
type Sink interface {
	Record(ctx context.Context, e Entry)
}

// Nop discards entries. Used when no database is configured, so the service
// still runs (with a warning) rather than refusing to start.
type Nop struct{}

func (Nop) Record(context.Context, Entry) {}

// sensitive matches a field name whose value must never be stored.
func sensitive(key string) bool {
	k := strings.ToLower(key)
	for _, bad := range []string{"password", "passwd", "secret", "token", "credential", "api_key", "apikey", "authorization", "private", "signature", "session"} {
		if strings.Contains(k, bad) {
			return true
		}
	}
	// "key" alone, but not "keys_count" or a role "key".
	return k == "key" || strings.HasSuffix(k, "_key")
}

const (
	maxValueLen = 200
	maxFields   = 40
	maxDepth    = 3
)

// redact turns a decoded request body into something safe to keep: the shape
// and the ordinary values, with anything that looks like a secret replaced by
// a marker. It is what makes "who changed this, and to what" answerable
// without the audit log becoming somewhere secrets live.
func redact(v any, depth int) any {
	switch t := v.(type) {
	case map[string]any:
		if depth >= maxDepth {
			return "{...}"
		}
		out := make(map[string]any, len(t))
		n := 0
		for k, val := range t {
			if n >= maxFields {
				out["..."] = "truncated"
				break
			}
			n++
			if sensitive(k) {
				out[k] = "[redacted]"
				continue
			}
			out[k] = redact(val, depth+1)
		}
		return out
	case []any:
		if depth >= maxDepth {
			return "[...]"
		}
		limit := len(t)
		if limit > 10 {
			limit = 10
		}
		out := make([]any, 0, limit)
		for _, val := range t[:limit] {
			out = append(out, redact(val, depth+1))
		}
		if len(t) > limit {
			out = append(out, "... and "+itoa(len(t)-limit)+" more")
		}
		return out
	case string:
		if len(t) > maxValueLen {
			return t[:maxValueLen] + "..."
		}
		return t
	default:
		return v
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// Body decodes a captured request body into redacted details. A body that is
// not JSON is recorded only by its size, never by its content.
func Body(raw []byte) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var parsed any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return map[string]any{"body_bytes": len(raw)}
	}
	switch red := redact(parsed, 0).(type) {
	case map[string]any:
		if len(red) == 0 {
			return nil
		}
		return red
	default:
		return map[string]any{"body": red}
	}
}

// OutcomeFor maps a status code onto the words the console filters by.
func OutcomeFor(status int) string {
	switch {
	case status >= 500:
		return OutcomeFailed
	case status == 401 || status == 403:
		return OutcomeDenied
	case status >= 400:
		return OutcomeInvalid
	default:
		return OutcomeSuccess
	}
}
