package filters

import (
	"net/http"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type FilterHandler struct {
	filterService *FilterService
}

func NewFilterHandler(filterService *FilterService) *FilterHandler {
	return &FilterHandler{filterService: filterService}
}

func (h *FilterHandler) GetFilters(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{
			Success: false,
			Message: "Unauthorized",
			Error:   "UNAUTHORIZED",
		})
		return
	}

	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}

	filters, err := h.filterService.GetFilters(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to retrieve filter options", "FILTERS_LOAD_FAILED")
		return
	}

	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true,
		Message: "Filter options retrieved successfully",
		Data:    filters,
	})
}
