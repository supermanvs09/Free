package identitygenome

import (
	"fmt"
	"net/http"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/middleware"
)

// IdentityGenomeHandler serves
// GET /api/v1/identities/{source_type}/{identity_name}/genome
// (backend_api_contract.md §5.4 — behavioural fingerprint and typical
// actions). It only reads the JWT claims, validates the request and shapes
// the §1.5 envelope; the data work is in svc.IdentityGenomeService.
type IdentityGenomeHandler struct {
	service *IdentityGenomeService
	now     func() time.Time
}

// NewIdentityGenomeHandler creates the handler.
func NewIdentityGenomeHandler(service *IdentityGenomeService) *IdentityGenomeHandler {
	return &IdentityGenomeHandler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Query parameters: the §2 window the §5.4 queries are bounded by and the
// §2 limit (rows per list / values per fingerprint dimension).
var identityGenomeAllowed = map[string]struct{}{"from": {}, "to": {}, "limit": {}}

// Get handles GET /api/v1/identities/{source_type}/{identity_name}/genome.
func (h *IdentityGenomeHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	if unknown, bad := summarycommon.CheckUnknown(q, identityGenomeAllowed); bad {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation,
			fmt.Sprintf("unknown query parameter %q; allowed: %s", unknown, summarycommon.AllowedList(identityGenomeAllowed)), rid)
		return
	}
	window, err := summarycommon.ParseIdentityWindow(q, h.now())
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}
	limit, err := summarycommon.ParseIdentityLimit(q, "limit")
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}

	data, err := h.service.GetGenome(r.Context(), claims.UserID, claims.TenantID, claims.DBName, sourceType, identityName,
		IdentityGenomeParams{Window: window, Limit: limit})
	if err != nil {
		summarycommon.WriteIdentityServiceError(r.Context(), w, "identity genome", rid, err)
		return
	}
	summarycommon.WriteSummaryJSON(w, http.StatusOK, summarycommon.MonitoringEnvelope{
		Data: data,
		Meta: summarycommon.MonitoringMeta{RequestID: rid, GeneratedAt: h.now()},
	})
}
