package identitytimeline

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/middleware"
)

// IdentityTimelineHandler serves
// GET /api/v1/identities/{source_type}/{identity_name}/timeline
// (backend_api_contract.md §5.6 — baseline and anomaly lifecycle). It only
// reads the JWT claims, validates the request and shapes the §1.5 envelope;
// the data work is in svc.IdentityTimelineService.
type IdentityTimelineHandler struct {
	service *IdentityTimelineService
	now     func() time.Time
}

// NewIdentityTimelineHandler creates the handler.
func NewIdentityTimelineHandler(service *IdentityTimelineService) *IdentityTimelineHandler {
	return &IdentityTimelineHandler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Query parameters of §5.6: the §2 page controls.
var identityTimelineAllowed = map[string]struct{}{"limit": {}, "cursor": {}}

// Get handles GET /api/v1/identities/{source_type}/{identity_name}/timeline.
func (h *IdentityTimelineHandler) Get(w http.ResponseWriter, r *http.Request) {
	rid := summarycommon.SummaryRequestID(r)
	w.Header().Set("X-Request-ID", rid)

	claims := middleware.GetClaims(r)
	if claims == nil {
		summarycommon.WriteSummaryError(w, http.StatusUnauthorized, summarycommon.MonitoringCodeUnauthorized, "authentication required", rid)
		return
	}
	sourceType, identityName, err := summarycommon.IdentityPath(r)
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}
	q := r.URL.Query()
	if unknown, bad := summarycommon.CheckUnknown(q, identityTimelineAllowed); bad {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation,
			fmt.Sprintf("unknown query parameter %q; allowed: %s", unknown, summarycommon.AllowedList(identityTimelineAllowed)), rid)
		return
	}
	limit, err := summarycommon.ParseIdentityLimit(q, "limit")
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}

	data, next, err := h.service.GetTimeline(r.Context(), claims.UserID, claims.TenantID, claims.DBName, sourceType, identityName,
		IdentityTimelineParams{Limit: limit, Cursor: strings.TrimSpace(q.Get("cursor"))})
	if errors.Is(err, summarycommon.ErrInvalidCursor) {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, "cursor is invalid", rid)
		return
	}
	if err != nil {
		summarycommon.WriteIdentityServiceError(r.Context(), w, "identity timeline", rid, err)
		return
	}
	summarycommon.WriteSummaryJSON(w, http.StatusOK, summarycommon.MonitoringEnvelope{
		Data: data,
		Meta: summarycommon.MonitoringMeta{RequestID: rid, GeneratedAt: h.now(), NextCursor: next},
	})
}
