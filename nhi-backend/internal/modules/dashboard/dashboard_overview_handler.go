package dashboard

import (
	"net/http"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type DashboardOverviewHandler struct {
	service *DashboardOverviewService
}

func NewDashboardOverviewHandler(service *DashboardOverviewService) *DashboardOverviewHandler {
	return &DashboardOverviewHandler{service: service}
}

// Get handles GET /api/v1/dashboard/overview ("ENDPOINT 3: Dashboard Overview").
// No query parameters — returns all KPIs and all charts in one response.
func (h *DashboardOverviewHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}

	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}

	result, err := h.service.GetOverview(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to retrieve dashboard overview", "DASHBOARD_LOAD_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Dashboard overview retrieved successfully",
		Data:    result,
	})
}
