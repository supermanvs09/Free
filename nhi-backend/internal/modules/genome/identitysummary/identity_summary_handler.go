package identitysummary

import (
	"fmt"
	"net/http"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/middleware"
)

// IdentitySummaryHandler serves GET /api/v1/genome/identities/{source_type}/{identity_name}
// (backend_api_contract.md §5.2 — identity header and summary). Like the
// dashboard summary it only reads the JWT claims, validates the request and
// shapes the §1.5 envelope; the data work is in svc.IdentitySummaryService.
type IdentitySummaryHandler struct {
	service *IdentitySummaryService
	now     func() time.Time
}

// NewIdentitySummaryHandler creates the handler.
func NewIdentitySummaryHandler(service *IdentitySummaryService) *IdentitySummaryHandler {
	return &IdentitySummaryHandler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Query parameters accepted by §5.2: the §2 window of calls_in_window.
var identitySummaryAllowed = map[string]struct{}{"from": {}, "to": {}}

// Get handles GET /api/v1/genome/identities/{source_type}/{identity_name}.
func (h *IdentitySummaryHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	if unknown, bad := summarycommon.CheckUnknown(q, identitySummaryAllowed); bad {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation,
			fmt.Sprintf("unknown query parameter %q; allowed: %s", unknown, summarycommon.AllowedList(identitySummaryAllowed)), rid)
		return
	}
	window, err := summarycommon.ParseIdentityWindow(q, h.now())
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}

	data, err := h.service.GetIdentity(r.Context(), claims.UserID, claims.TenantID, claims.DBName, sourceType, identityName,
		IdentitySummaryParams{Window: window})
	if err != nil {
		summarycommon.WriteIdentityServiceError(r.Context(), w, "identity summary", rid, err)
		return
	}
	summarycommon.WriteSummaryJSON(w, http.StatusOK, summarycommon.MonitoringEnvelope{
		Data: data,
		Meta: summarycommon.MonitoringMeta{RequestID: rid, GeneratedAt: h.now()},
	})
}
