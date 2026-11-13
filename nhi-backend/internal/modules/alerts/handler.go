package alerts

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/credentialexposure"
	"nhi-backend-api/internal/modules/users"
	"nhi-backend-api/internal/platform/authz"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

// Handler serves /api/v1/alerts. Tenant, schema and accounts come from the
// signed-in user only.
type Handler struct {
	repo     Repo
	exposure *credentialexposure.FindingsRepository
	genome   GenomeLister
	users    UserLister
	resolver *scope.Resolver
}

// UserLister lists the workspace's dashboard users (users.Repository), so
// the history shows names.
type UserLister interface {
	List(ctx context.Context, tenantID, search, role, status string) ([]users.User, error)
}

func NewHandler(resolver *scope.Resolver, exposure *credentialexposure.FindingsRepository, genome GenomeLister, userList UserLister) *Handler {
	return &Handler{resolver: resolver, exposure: exposure, genome: genome, users: userList}
}

// Register mounts the endpoints on the authenticated /api/v1 router.
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/alerts", h.List).Methods(http.MethodGet)
	r.HandleFunc("/alerts/summary", h.Summary).Methods(http.MethodGet)
	r.HandleFunc("/alerts/triage", h.Triage).Methods(http.MethodPost)
	r.HandleFunc("/alerts/activity", h.Activity).Methods(http.MethodGet)
	r.HandleFunc("/alerts/identities/{id:.+}", h.Identity).Methods(http.MethodGet)
}

const exposureLimit = 200

var identityIDRe = regexp.MustCompile(`^[A-Za-z0-9:/_.@+=,-]{1,512}$`)

func fail(w http.ResponseWriter, status int, msg, code string) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: false, Message: msg, Error: code})
}

func (h *Handler) scope(w http.ResponseWriter, r *http.Request) *scope.DataScope {
	claims := middleware.GetClaims(r)
	if claims == nil {
		fail(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return nil
	}
	ds, err := h.resolver.Resolve(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Could not load your workspace", "SCOPE_UNAVAILABLE")
		return nil
	}
	return ds
}

func parseTime(s string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999-07", "2006-01-02 15:04:05", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// List: GET /alerts - the unified inbox.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	c := middleware.GetClaims(r)
	out, err := h.inbox(r.Context(), ds, c.UserID, c.TenantID, c.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Alerts could not be loaded", "ALERTS_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: out})
}

// Summary: GET /alerts/summary - the counts behind the navigation badge.
func (h *Handler) Summary(w http.ResponseWriter, r *http.Request) {
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	c := middleware.GetClaims(r)
	out, err := h.inbox(r.Context(), ds, c.UserID, c.TenantID, c.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Alerts could not be loaded", "ALERTS_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: out.Summary})
}

var keyRe = regexp.MustCompile(`^(posture|genome|exposure):[^\s]{1,600}$`)

// Triage: POST /alerts/triage {keys, status?, note?} - move or comment on
// one or many alerts. Needs the write capability.
func (h *Handler) Triage(w http.ResponseWriter, r *http.Request) {
	c := middleware.GetClaims(r)
	if c == nil {
		fail(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}
	if !authz.Can(authz.NormalizeRole(c.Role), authz.CapWrite) {
		fail(w, http.StatusForbidden, "Your role can view alerts but not work them", "FORBIDDEN")
		return
	}
	var body TriageChange
	r.Body = http.MaxBytesReader(w, r.Body, 1<<16)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "Invalid request body", "INVALID_REQUEST")
		return
	}
	if len(body.Keys) == 0 || len(body.Keys) > 500 {
		fail(w, http.StatusBadRequest, "Choose between 1 and 500 alerts", "INVALID_REQUEST")
		return
	}
	for _, k := range body.Keys {
		if !keyRe.MatchString(k) {
			fail(w, http.StatusBadRequest, "Invalid alert key", "INVALID_REQUEST")
			return
		}
	}
	if body.Status != nil && !validStatus[*body.Status] {
		fail(w, http.StatusBadRequest, "status must be open, in_progress, resolved or dismissed", "INVALID_REQUEST")
		return
	}
	if len(body.Note) > 4000 {
		fail(w, http.StatusBadRequest, "A comment can be at most 4000 characters", "INVALID_REQUEST")
		return
	}
	if body.Status == nil && strings.TrimSpace(body.Note) == "" {
		fail(w, http.StatusBadRequest, "Nothing to change", "INVALID_REQUEST")
		return
	}
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	if err := applyTriage(r.Context(), ds, c.UserID, body); err != nil {
		httpx.SendServerError(w, r, err, "The alerts could not be updated", "TRIAGE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "updated"})
}

// Activity: GET /alerts/activity?key= - who did what, newest first.
func (h *Handler) Activity(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if !keyRe.MatchString(key) {
		fail(w, http.StatusBadRequest, "Invalid alert key", "INVALID_REQUEST")
		return
	}
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	list, err := activityFor(r.Context(), ds, key)
	if err != nil {
		httpx.SendServerError(w, r, err, "The history could not be loaded", "ACTIVITY_FAILED")
		return
	}
	/* Show people by name, not e-mail. A failed lookup only costs the names. */
	if h.users != nil && len(list) > 0 {
		if people, err := h.users.List(r.Context(), middleware.GetClaims(r).TenantID, "", "", ""); err == nil {
			names := map[string]string{}
			for _, u := range people {
				names[strings.ToLower(u.Email)] = u.FullName
			}
			for i := range list {
				list[i].ActorName = names[strings.ToLower(list[i].Actor)]
			}
		}
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: list})
}

// Identity: GET /alerts/identities/{id} - why one identity's score dropped.
func (h *Handler) Identity(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if !identityIDRe.MatchString(id) {
		fail(w, http.StatusBadRequest, "Invalid identity ID", "INVALID_REQUEST")
		return
	}
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	out, err := h.repo.Identity(r.Context(), ds, id)
	if errors.Is(err, errNotFound) {
		fail(w, http.StatusNotFound, "This identity has no posture score in the accounts you are viewing", "NOT_FOUND")
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "The alert could not be loaded", "ALERT_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: out})
}
