package dashboardsummary

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
)

// DashboardSummaryHandler serves GET /api/v1/dashboard/summary
// (backend_api_contract.md §4.1). Like the other v1 handlers it only reads
// the JWT claims, validates the query and shapes the response; the data
// work is in svc.DashboardSummaryService.
//
// This endpoint answers in the contract's §1.5 envelope — {data, meta} /
// {error} with request_id — not in models.APIResponse.
type DashboardSummaryHandler struct {
	service *DashboardSummaryService
	now     func() time.Time
}

func NewDashboardSummaryHandler(service *DashboardSummaryService) *DashboardSummaryHandler {
	return &DashboardSummaryHandler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Query parameters of §4.1 (nothing else is accepted).
var dashboardSummaryAllowed = map[string]struct{}{
	"from": {}, "to": {}, "source_type": {}, "account_id": {}, "region": {},
}

// §4.1 defaults when from/to are omitted: 14 days for charts/panels, 24 hours
// for the open-anomaly cards.
const (
	summaryDefaultCharts = 14 * 24 * time.Hour
	summaryDefaultCards  = 24 * time.Hour
)

// Get handles GET /api/v1/dashboard/summary.
func (h *DashboardSummaryHandler) Get(w http.ResponseWriter, r *http.Request) {
	rid := summarycommon.SummaryRequestID(r)
	w.Header().Set("X-Request-ID", rid)

	claims := middleware.GetClaims(r)
	if claims == nil {
		summarycommon.WriteSummaryError(w, http.StatusUnauthorized, summarycommon.MonitoringCodeUnauthorized, "authentication required", rid)
		return
	}
	q := r.URL.Query()
	if unknown, bad := summarycommon.CheckUnknown(q, dashboardSummaryAllowed); bad {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation,
			fmt.Sprintf("unknown query parameter %q; allowed: %s", unknown, summarycommon.AllowedList(dashboardSummaryAllowed)), rid)
		return
	}
	charts, cards, err := parseSummaryWindows(q, h.now())
	if err != nil {
		summarycommon.WriteSummaryError(w, http.StatusBadRequest, summarycommon.MonitoringCodeValidation, err.Error(), rid)
		return
	}

	data, err := h.service.GetSummary(r.Context(), claims.UserID, claims.TenantID, claims.DBName, DashboardSummaryParams{
		Charts:     charts,
		Cards:      cards,
		SourceType: strings.ToUpper(strings.TrimSpace(q.Get("source_type"))), // §2: compact upper-case family
		AccountID:  strings.TrimSpace(q.Get("account_id")),
		Region:     strings.TrimSpace(q.Get("region")),
	})
	if err != nil {
		var unavailable *summarycommon.StoreUnavailableError
		if errors.As(err, &unavailable) {
			logging.FromContext(r.Context()).Warn("genome store unavailable", "endpoint", "dashboard summary", "err", err)
			summarycommon.WriteUnavailable(w, unavailable, rid)
			return
		}
		logging.FromContext(r.Context()).Error("genome request failed", "endpoint", "dashboard summary", "err", err)
		summarycommon.WriteSummaryError(w, http.StatusInternalServerError, summarycommon.MonitoringCodeInternal, "unexpected error", rid)
		return
	}
	summarycommon.WriteSummaryJSON(w, http.StatusOK, summarycommon.MonitoringEnvelope{
		Data: data,
		Meta: summarycommon.MonitoringMeta{RequestID: rid, GeneratedAt: h.now()},
	})
}

// parseSummaryWindows applies §4.1: with from/to (inclusive/exclusive ISO-8601,
// §2) both the charts and the cards use that window; when both are omitted
// the charts cover the last 14 days and the cards the last 24 hours.
func parseSummaryWindows(q url.Values, now time.Time) (charts, cards summarycommon.TimeWindow, err error) {
	fromS, toS := strings.TrimSpace(q.Get("from")), strings.TrimSpace(q.Get("to"))
	if fromS == "" && toS == "" {
		charts = summarycommon.TimeWindow{From: now.Add(-summaryDefaultCharts), To: now}
		cards = summarycommon.TimeWindow{From: now.Add(-summaryDefaultCards), To: now}
		return charts, cards, nil
	}
	win := summarycommon.TimeWindow{To: now}
	if toS != "" {
		if win.To, err = summarycommon.ParseSummaryTime(toS); err != nil {
			return charts, cards, fmt.Errorf("to: %w", err)
		}
	}
	win.From = win.To.Add(-summaryDefaultCharts)
	if fromS != "" {
		if win.From, err = summarycommon.ParseSummaryTime(fromS); err != nil {
			return charts, cards, fmt.Errorf("from: %w", err)
		}
	}
	if !win.From.Before(win.To) {
		return charts, cards, fmt.Errorf("from must be before to")
	}
	return win, win, nil
}
