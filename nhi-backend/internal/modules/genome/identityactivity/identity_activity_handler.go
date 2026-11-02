package identityactivity

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/middleware"
)

// IdentityActivityHandler serves
// GET /api/v1/identities/{source_type}/{identity_name}/activity
// (backend_api_contract.md §5.3 — call volume and recent calls). It only
// reads the JWT claims, validates the request and shapes the §1.5 envelope;
// the data work is in svc.IdentityActivityService.
type IdentityActivityHandler struct {
	service *IdentityActivityService
	now     func() time.Time
}

// NewIdentityActivityHandler creates the handler.
func NewIdentityActivityHandler(service *IdentityActivityService) *IdentityActivityHandler {
	return &IdentityActivityHandler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Query parameters of §5.3.
var identityActivityAllowed = map[string]struct{}{"from": {}, "to": {}, "bucket": {}, "recent_limit": {}, "recent_cursor": {}}

// Get handles GET /api/v1/identities/{source_type}/{identity_name}/activity.
func (h *IdentityActivityHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	if unknown, bad := summarycommon.CheckUnknown(q, identityActivityAllowed); bad {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation,
			fmt.Sprintf("unknown query parameter %q; allowed: %s", unknown, summarycommon.AllowedList(identityActivityAllowed)), rid)
		return
	}
	window, err := summarycommon.ParseIdentityWindow(q, h.now())
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}
	bucket := strings.ToLower(strings.TrimSpace(q.Get("bucket")))
	switch bucket {
	case "":
		bucket = ActivityBucketDay
	case ActivityBucketDay, ActivityBucketHour:
	default:
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, "bucket must be day or hour", rid)
		return
	}
	limit, err := summarycommon.ParseIdentityLimit(q, "recent_limit")
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}

	data, next, err := h.service.GetActivity(r.Context(), claims.UserID, claims.TenantID, claims.DBName, sourceType, identityName,
		IdentityActivityParams{Window: window, Bucket: bucket, RecentLimit: limit, RecentCursor: strings.TrimSpace(q.Get("recent_cursor"))})
	if errors.Is(err, summarycommon.ErrInvalidCursor) {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, "recent_cursor is invalid", rid)
		return
	}
	if err != nil {
		summarycommon.WriteIdentityServiceError(r.Context(), w, "identity activity", rid, err)
		return
	}
	summarycommon.WriteSummaryJSON(w, http.StatusOK, summarycommon.MonitoringEnvelope{
		Data: data,
		Meta: summarycommon.MonitoringMeta{RequestID: rid, GeneratedAt: h.now(), NextCursor: next},
	})
}
