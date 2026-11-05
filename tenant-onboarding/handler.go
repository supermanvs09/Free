package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFiles embed.FS

// window is a fixed-window counter: at most limit events per minute, all callers
// together. Onboarding is a handful of people, so one shared budget is enough.
type window struct {
	mu    sync.Mutex
	start time.Time
	n     int
	limit int
}

// add counts one event and says whether it is still within the limit.
func (w *window) add(now time.Time) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if now.Sub(w.start) >= time.Minute {
		w.start, w.n = now, 0
	}
	w.n++
	return w.n <= w.limit
}

// Handler serves the sign-in page, the app and their API.
type Handler struct {
	svc     *Service
	db      *sql.DB
	auth    *Auth
	web     fs.FS
	static  http.Handler
	creates *window
	edits   *window
}

// publicAssets are what the sign-in page needs; everything else needs a session.
func publicAsset(path string) bool {
	switch path {
	case "/app.css", "/login.js", "/login.html":
		return true
	}
	return strings.HasPrefix(path, "/brand/")
}

// NewHandler returns the service's http.Handler.
func NewHandler(svc *Service, auth *Auth, db *sql.DB) http.Handler {
	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		panic(err)
	}
	h := &Handler{
		svc: svc, db: db, auth: auth, web: sub,
		static:  http.FileServerFS(sub),
		creates: &window{limit: 20},
		edits:   &window{limit: 60},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("GET /api/session", auth.state)
	mux.HandleFunc("POST /api/login", auth.login)
	mux.HandleFunc("POST /api/logout", auth.logout)
	mux.HandleFunc("GET /api/workspace", auth.requireSession(h.workspace))
	mux.HandleFunc("POST /api/onboard", auth.requireSession(h.onboard))
	mux.HandleFunc("GET /api/tenants", auth.requireSession(h.listTenants))
	mux.HandleFunc("PATCH /api/tenants/{id}", auth.requireSession(h.updateTenant))
	mux.HandleFunc("GET /api/tenants/{id}/delete-preview", auth.requireSession(h.deletePreview))
	mux.HandleFunc("DELETE /api/tenants/{id}", auth.requireSession(h.deleteTenant))
	mux.HandleFunc("GET /api/approvals", auth.requireSession(h.listApprovals))
	mux.HandleFunc("GET /api/approvals/pending", auth.requireSession(h.pendingApprovals))
	mux.HandleFunc("POST /api/approvals/{id}/approve", auth.requireSession(h.decide(true)))
	mux.HandleFunc("POST /api/approvals/{id}/reject", auth.requireSession(h.decide(false)))
	mux.HandleFunc("GET /", h.root)
	return h.secure(mux)
}

// secure adds what every response carries. The page loads only its own script
// and style, so the content policy allows nothing else.
func (h *Handler) secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hd := w.Header()
		hd.Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		hd.Set("X-Content-Type-Options", "nosniff")
		hd.Set("X-Frame-Options", "DENY")
		hd.Set("Referrer-Policy", "no-referrer")
		hd.Set("Cross-Origin-Opener-Policy", "same-origin")
		hd.Set("Cache-Control", "no-store")
		if h.auth.isSecure(r) {
			hd.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	if err := h.db.PingContext(r.Context()); err != nil {
		http.Error(w, "database unreachable", http.StatusServiceUnavailable)
		return
	}
	_, _ = w.Write([]byte("ok"))
}

// root serves the app to a signed-in administrator and the sign-in page to
// everyone else, at the same address, so a bookmark always works.
func (h *Handler) root(w http.ResponseWriter, r *http.Request) {
	_, signedIn := h.auth.current(r)
	switch {
	case r.URL.Path == "/" && signedIn:
		http.ServeFileFS(w, r, h.web, "index.html")
	case r.URL.Path == "/":
		http.ServeFileFS(w, r, h.web, "login.html")
	case publicAsset(r.URL.Path):
		h.static.ServeHTTP(w, r)
	default:
		h.auth.requireSession(h.static.ServeHTTP)(w, r)
	}
}

// workspace previews the names a company name will get, from the same code
// that creates them.
func (h *Handler) workspace(w http.ResponseWriter, r *http.Request) {
	name, err := WorkspaceName(r.URL.Query().Get("company"))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"workspace": ""})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"workspace": name, "domain": DomainFor(name, h.svc.suffix)})
}

type errorBody struct {
	Error  string            `json:"error"`
	Code   string            `json:"code,omitempty"`
	Fields map[string]string `json:"fields,omitempty"`
}

func (h *Handler) onboard(w http.ResponseWriter, r *http.Request) {
	if !h.creates.add(time.Now()) {
		writeJSON(w, http.StatusTooManyRequests, errorBody{Error: "Too many attempts. Wait a minute and try again."})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "That request could not be read. Reload the page and try again."})
		return
	}
	res, err := h.svc.Onboard(r.Context(), req)
	var verr *ValidationError
	var cerr *ConflictError
	switch {
	case err == nil:
		code := http.StatusCreated
		if res.Outcome == OutcomeAlreadyExists {
			code = http.StatusOK
		}
		detail := map[string]any{"outcome": res.Outcome, "tenant_id": res.Tenant.TenantID, "workspace": res.Tenant.DBName, "workspace_setup": res.Setup}
		if res.AccountID != "" {
			detail["customer_account"] = res.AccountID
		}
		if res.User != nil {
			detail["user_created"] = res.User.Username
			detail["role"] = res.User.Role
		}
		audit(r, "onboard", detail)
		writeJSON(w, code, res)
	case errors.As(err, &verr):
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: "Check the highlighted fields.", Fields: verr.Fields})
	case errors.As(err, &cerr):
		writeJSON(w, http.StatusConflict, errorBody{Error: cerr.Message, Fields: cerr.Fields})
	default:
		log.Printf("onboard %q: %v", clip(req.CompanyName, 80), err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong and nothing was saved. Try again; if it keeps happening, contact engineering."})
	}
}

func (h *Handler) listTenants(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListTenants(r.Context())
	if err != nil {
		log.Printf("list companies: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "The companies could not be loaded. Try again; if it keeps happening, contact engineering."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenants": list})
}

// shown is a value as it appears in the audit log: an External ID is shortened.
func shown(field string, v any) any {
	if s, ok := v.(string); ok && field == "collector_external_id" && len(s) > 8 {
		return s[:4] + "..." + s[len(s)-4:]
	}
	return v
}

func patchValues(p Patch) map[string]any {
	m := map[string]any{}
	if p.DomainName != nil {
		m["domain_name"] = *p.DomainName
	}
	if p.AWSAccountID != nil {
		m["collector_aws_account_id"] = *p.AWSAccountID
	}
	if p.ExternalID != nil {
		m["collector_external_id"] = shown("collector_external_id", *p.ExternalID)
	}
	if p.EventBridgeARN != nil {
		m["collector_event_bridge_arn"] = *p.EventBridgeARN
	}
	if p.Regions != nil {
		m["collector_regions"] = *p.Regions
	}
	return m
}

func (h *Handler) updateTenant(w http.ResponseWriter, r *http.Request) {
	id := strings.ToLower(r.PathValue("id"))
	if !uuidRE.MatchString(id) {
		writeJSON(w, http.StatusNotFound, errorBody{Error: NotFoundError{}.Error(), Code: "not_found"})
		return
	}
	if !h.edits.add(time.Now()) {
		writeJSON(w, http.StatusTooManyRequests, errorBody{Error: "Too many changes in a minute. Wait a moment and try again."})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields() // a request that names db_name or tenant_id is refused, not ignored
	var req UpdateRequest
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "That request could not be read. Reload the page and try again."})
		return
	}
	res, err := h.svc.UpdateTenant(r.Context(), id, req)
	var verr *ValidationError
	var cerr *ConflictError
	switch {
	case err == nil:
		if len(res.Changed) > 0 {
			audit(r, "tenant_updated", map[string]any{"tenant_id": id, "workspace": res.Tenant.DBName, "fields": res.Changed,
				"from": patchValues(req.Expected), "to": patchValues(req.Changes)})
		}
		writeJSON(w, http.StatusOK, res)
	case errors.As(err, &verr):
		msg := "Check the highlighted fields."
		if m := verr.Fields["_"]; m != "" {
			msg = m
		}
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: msg, Fields: verr.Fields})
	case errors.As(err, &cerr):
		writeJSON(w, http.StatusConflict, errorBody{Error: cerr.Message, Fields: cerr.Fields})
	case errors.Is(err, NotFoundError{}):
		writeJSON(w, http.StatusNotFound, errorBody{Error: err.Error(), Code: "not_found"})
	case errors.Is(err, StaleError{}):
		writeJSON(w, http.StatusConflict, errorBody{Error: err.Error(), Code: "stale"})
	default:
		log.Printf("update company %s: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong and nothing was saved. Try again; if it keeps happening, contact engineering."})
	}
}

func (h *Handler) deletePreview(w http.ResponseWriter, r *http.Request) {
	id := strings.ToLower(r.PathValue("id"))
	if !uuidRE.MatchString(id) {
		writeJSON(w, http.StatusNotFound, errorBody{Error: NotFoundError{}.Error(), Code: "not_found"})
		return
	}
	p, err := h.svc.PreviewDelete(r.Context(), id)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, p)
	case errors.Is(err, NotFoundError{}):
		writeJSON(w, http.StatusNotFound, errorBody{Error: err.Error(), Code: "not_found"})
	default:
		log.Printf("delete preview %s: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong. Try again; if it keeps happening, contact engineering."})
	}
}

func (h *Handler) deleteTenant(w http.ResponseWriter, r *http.Request) {
	id := strings.ToLower(r.PathValue("id"))
	if !uuidRE.MatchString(id) {
		writeJSON(w, http.StatusNotFound, errorBody{Error: NotFoundError{}.Error(), Code: "not_found"})
		return
	}
	if !h.edits.add(time.Now()) {
		writeJSON(w, http.StatusTooManyRequests, errorBody{Error: "Too many changes in a minute. Wait a moment and try again."})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req struct {
		Confirm string `json:"confirm"`
	}
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "That request could not be read. Reload the page and try again."})
		return
	}
	res, err := h.svc.DeleteTenant(r.Context(), id, req.Confirm)
	var verr *ValidationError
	var cerr *ConflictError
	switch {
	case err == nil:
		audit(r, "tenant_deleted", map[string]any{"tenant_id": res.TenantID, "workspace": res.DBName, "users_deleted": res.UsersDeleted, "workspace_dropped": res.WorkspaceGone})
		writeJSON(w, http.StatusOK, res)
	case errors.As(err, &verr):
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: verr.Fields["confirm"], Fields: verr.Fields})
	case errors.As(err, &cerr):
		writeJSON(w, http.StatusConflict, errorBody{Error: cerr.Message, Fields: cerr.Fields})
	case errors.Is(err, NotFoundError{}):
		writeJSON(w, http.StatusNotFound, errorBody{Error: err.Error(), Code: "not_found"})
	default:
		log.Printf("delete company %s: %v", id, err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong and nothing was deleted. Try again; if it keeps happening, contact engineering."})
	}
}

func (h *Handler) listApprovals(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListApprovals(r.Context(), strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status"))))
	var verr *ValidationError
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, list)
	case errors.As(err, &verr):
		writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: verr.Fields["status"], Fields: verr.Fields})
	default:
		log.Printf("list approvals: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "The connection requests could not be loaded. Try again; if it keeps happening, contact engineering."})
	}
}

// pendingApprovals is what every open page polls for the badge and the
// notification: two numbers, nothing else.
func (h *Handler) pendingApprovals(w http.ResponseWriter, r *http.Request) {
	n, latest, ready, err := h.svc.PendingApprovals(r.Context())
	if err != nil {
		log.Printf("count approvals: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "The connection requests could not be counted."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pending": n, "latest_pending_id": latest, "ready": ready})
}

func (h *Handler) decide(approve bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			writeJSON(w, http.StatusNotFound, errorBody{Error: "That request no longer exists.", Code: "not_found"})
			return
		}
		if !h.edits.add(time.Now()) {
			writeJSON(w, http.StatusTooManyRequests, errorBody{Error: "Too many changes in a minute. Wait a moment and try again."})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		var req struct {
			Note string `json:"note"`
		}
		if err := dec.Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody{Error: "That request could not be read. Reload the page and try again."})
			return
		}
		a, err := h.svc.Decide(r.Context(), id, approve, req.Note, Who(r))
		var verr *ValidationError
		var derr DecidedError
		switch {
		case err == nil:
			audit(r, "connection_"+a.Status, map[string]any{"approval_id": a.ID, "tenant_id": a.TenantID, "workspace": a.Workspace,
				"account_id": a.AccountID, "note": clip(a.DecisionNote, 300)})
			writeJSON(w, http.StatusOK, map[string]any{"approval": a})
		case errors.As(err, &verr):
			writeJSON(w, http.StatusUnprocessableEntity, errorBody{Error: verr.Fields["note"], Fields: verr.Fields})
		case errors.As(err, &derr):
			writeJSON(w, http.StatusConflict, errorBody{Error: derr.Error(), Code: "decided"})
		case errors.Is(err, NotFoundError{}):
			writeJSON(w, http.StatusNotFound, errorBody{Error: "That request no longer exists.", Code: "not_found"})
		default:
			log.Printf("decide approval %d: %v", id, err)
			writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong and nothing was changed. Try again; if it keeps happening, contact engineering."})
		}
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
