package alerts

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/credentialexposure"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

// Handler serves /api/v1/alerts. Tenant, schema and accounts come from the
// signed-in user only.
type Handler struct {
	repo     Repo
	exposure *credentialexposure.FindingsRepository
	resolver *scope.Resolver
}

func NewHandler(resolver *scope.Resolver, exposure *credentialexposure.FindingsRepository) *Handler {
	return &Handler{resolver: resolver, exposure: exposure}
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

// build gathers the drops, the exposures and the summary.
func (h *Handler) build(ctx context.Context, ds *scope.DataScope) (*ListResponse, error) {
	drops, err := h.repo.ScoreDrops(ctx, ds)
	if err != nil {
		return nil, err
	}
	latest, previous, err := h.repo.LastSyncs(ctx, ds)
	if err != nil {
		return nil, err
	}
	out := &ListResponse{ScoreDrops: drops, Exposures: []Exposure{}}
	out.Summary.ScoreDrops = len(drops)
	if !latest.IsZero() {
		out.Summary.LastSync = &latest
	}
	if !previous.IsZero() {
		out.Summary.PreviousSync = &previous
	}
	/* "New" exposures are those found since the previous sync, or in the last
	   day when there is no sync history. */
	cutoff := time.Now().Add(-24 * time.Hour)
	if !previous.IsZero() {
		cutoff = previous
	}
	if h.exposure != nil {
		items, _, err := h.exposure.List(ctx, ds, credentialexposure.FindingsFilter{Limit: exposureLimit})
		if err != nil {
			slog.Default().Info("alerts: credential exposure unavailable", "err", err)
		} else {
			out.Summary.ExposureAvailable = true
			for _, f := range items {
				e := Exposure{FindingID: f.FindingID, Detector: f.Detector, Severity: f.Severity, RiskTier: f.RiskTier,
					VerificationStatus: f.VerificationStatus, Platform: f.Platform, Repository: f.Repository, FilePath: f.FilePath,
					LineNumber: f.LineNumber, Author: f.Author, Redacted: f.Redacted, DetectedAt: f.CreatedAt}
				if t, ok := parseTime(f.CreatedAt); ok && t.After(cutoff) {
					e.New = true
					out.Summary.NewExposures++
				}
				out.Exposures = append(out.Exposures, e)
			}
			out.Summary.Exposures = len(out.Exposures)
		}
	}
	out.Summary.Badge = out.Summary.ScoreDrops + out.Summary.NewExposures
	return out, nil
}

func parseTime(s string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999-07", "2006-01-02 15:04:05", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// List: GET /alerts
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	ds := h.scope(w, r)
	if ds == nil {
		return
	}
	out, err := h.build(r.Context(), ds)
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
	out, err := h.build(r.Context(), ds)
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
