package alerts

import (
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/credentialexposure"
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
	resolver *scope.Resolver
}

func NewHandler(resolver *scope.Resolver, exposure *credentialexposure.FindingsRepository, genome GenomeLister) *Handler {
	return &Handler{resolver: resolver, exposure: exposure, genome: genome}
}

// Register mounts the endpoints on the authenticated /api/v1 router.
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/alerts", h.List).Methods(http.MethodGet)
	r.HandleFunc("/alerts/summary", h.Summary).Methods(http.MethodGet)
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
	out, err := h.inbox(r.Context(), ds, c.UserID, c.TenantID, c.DBName, authz.Can(authz.NormalizeRole(c.Role), authz.CapExposure))
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
	out, err := h.inbox(r.Context(), ds, c.UserID, c.TenantID, c.DBName, authz.Can(authz.NormalizeRole(c.Role), authz.CapExposure))
	if err != nil {
		httpx.SendServerError(w, r, err, "Alerts could not be loaded", "ALERTS_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: out.Summary})
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
