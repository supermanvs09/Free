package auditlog

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/audit"
	"nhi-backend-api/internal/platform/authz"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

// Handler serves the audit log to the console.
//
// Who sees what: a role holding authz.CapAuditAll (admin, operator) reads
// every actor's entries; everyone else reads their own. That is a narrowing of
// the query rather than a refusal, so "what did I change" stays answerable by
// everybody, and nobody can widen it with a parameter.
type Handler struct{ repo *Repository }

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

const (
	defaultPageSize = 50
	maxPageSize     = 200
	maxExportRows   = 10000
)

var listParams = map[string]struct{}{
	"page": {}, "page_size": {}, "action": {}, "actor": {}, "outcome": {},
	"q": {}, "from": {}, "to": {}, "format": {},
}

// scopeFor narrows the query to the caller when their role may not see
// everyone, and reports the scope so the console can say which it is showing.
func scopeFor(role string) (actorOnly bool) {
	return !authz.CanText(role, authz.CapAuditAll)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	if httpx.RejectUnknownQuery(w, r, listParams) {
		return
	}
	q, ok := h.parse(w, r, claims.TenantID, claims.Role, claims.UserID)
	if !ok {
		return
	}
	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		h.exportCSV(w, r, q)
		return
	}
	page, err := h.repo.List(r.Context(), q)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to read the audit log", "AUDIT_LOG_READ_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Audit log retrieved successfully",
		Data: map[string]any{
			"entries":   page.Entries,
			"total":     page.Total,
			"page":      page.Page,
			"page_size": page.PageSize,
			// What the console tells the reader they are looking at.
			"scope": map[string]any{
				"everyone": !scopeFor(claims.Role),
				"actor":    q.Actor,
			},
		},
	})
}

func (h *Handler) parse(w http.ResponseWriter, r *http.Request, tenantID, role, userID string) (Query, bool) {
	query := r.URL.Query()
	q := Query{TenantID: tenantID, Page: 1, PageSize: defaultPageSize}

	if v := strings.TrimSpace(query.Get("page")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			badRequest(w, "page must be a whole number of 1 or more", "INVALID_PAGE")
			return q, false
		}
		q.Page = n
	}
	if v := strings.TrimSpace(query.Get("page_size")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > maxPageSize {
			badRequest(w, "page_size must be between 1 and "+strconv.Itoa(maxPageSize), "INVALID_PAGE_SIZE")
			return q, false
		}
		q.PageSize = n
	}
	q.Action = trim(query.Get("action"), 120)
	q.Search = trim(query.Get("q"), 120)
	if v := trim(query.Get("outcome"), 20); v != "" {
		switch v {
		case audit.OutcomeSuccess, audit.OutcomeDenied, audit.OutcomeInvalid, audit.OutcomeFailed:
			q.Outcome = v
		default:
			badRequest(w, "outcome must be one of success, denied, invalid, failed", "INVALID_OUTCOME")
			return q, false
		}
	}
	for _, f := range []struct {
		name string
		into **time.Time
	}{{"from", &q.From}, {"to", &q.To}} {
		v := strings.TrimSpace(query.Get(f.name))
		if v == "" {
			continue
		}
		t, err := parseTime(v)
		if err != nil {
			badRequest(w, f.name+" must be a date (2026-01-31) or a timestamp", "INVALID_"+strings.ToUpper(f.name))
			return q, false
		}
		*f.into = &t
	}
	if q.From != nil && q.To != nil && !q.To.After(*q.From) {
		badRequest(w, "to must be later than from", "INVALID_RANGE")
		return q, false
	}

	// The narrowing that cannot be argued with.
	if scopeFor(role) {
		q.Actor = userID
	} else {
		q.Actor = trim(query.Get("actor"), 320)
	}
	return q, true
}

// parseTime takes a plain date or a full timestamp, which is what a date
// picker and a copied value respectively send.
func parseTime(v string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, v); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, errInvalidTime
}

var errInvalidTime = &timeError{}

type timeError struct{}

func (*timeError) Error() string { return "not a date or timestamp" }

func (h *Handler) Facets(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}
	actor := ""
	if scopeFor(claims.Role) {
		actor = claims.UserID
	}
	facets, err := h.repo.Facets(r.Context(), claims.TenantID, actor)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to read the audit log filters", "AUDIT_LOG_FACETS_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Audit log filters retrieved successfully", Data: facets})
}

// exportCSV writes the filtered log as a spreadsheet. Capped, and the cap is
// said in the file name so a truncated export is never mistaken for the whole.
func (h *Handler) exportCSV(w http.ResponseWriter, r *http.Request, q Query) {
	q.Page = 1
	q.PageSize = maxExportRows
	page, err := h.repo.List(r.Context(), q)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to export the audit log", "AUDIT_LOG_EXPORT_FAILED")
		return
	}
	name := "audit-log-" + time.Now().UTC().Format("2006-01-02")
	if page.Total > len(page.Entries) {
		name += "-first-" + strconv.Itoa(len(page.Entries))
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{"When (UTC)", "Who", "Role", "Action", "Outcome", "Target", "Screen", "Method", "Path", "Status", "Error", "IP", "Request ID"})
	for _, e := range page.Entries {
		_ = cw.Write([]string{
			e.OccurredAt.UTC().Format(time.RFC3339), cell(e.Actor), cell(e.ActorRole), cell(e.Action), e.Outcome,
			cell(e.Target), cell(e.Screen), e.Method, cell(e.Path), strconv.Itoa(e.Status), cell(e.ErrorCode), e.IP, cell(e.RequestID),
		})
	}
}

// cell keeps a value a caller supplied (a username, an id in a URL, a header)
// from being read as a formula when the export is opened in a spreadsheet:
// "=HYPERLINK(...)" typed as a sign-in name would otherwise run.
func cell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func badRequest(w http.ResponseWriter, message, code string) {
	httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: message, Error: code})
}

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}
