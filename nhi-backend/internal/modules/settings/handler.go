package settings

import (
	"encoding/json"
	"errors"
	"net/http"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type SettingsHandler struct{ service *SettingsService }

func NewSettingsHandler(service *SettingsService) *SettingsHandler {
	return &SettingsHandler{service: service}
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}

	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}

	result, err := h.service.GetSettings(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to retrieve settings", "SETTINGS_LOAD_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Settings retrieved successfully", Data: result})
}

func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}

	if httpx.RejectUnknownQuery(w, r, httpx.NoQueryAllowed) {
		return
	}

	var req UpdateSettingsRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid JSON request body", Error: "INVALID_REQUEST"})
		return
	}
	result, err := h.service.UpdateSettings(r.Context(), claims.UserID, claims.TenantID, claims.DBName, req)
	if err != nil {
		if errors.Is(err, ErrInvalidTenantSettings) {
			httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "One or more selected filters do not belong to this tenant", Error: "INVALID_SETTINGS"})
			return
		}
		httpx.SendServerError(w, r, err, "Failed to update settings", "SETTINGS_UPDATE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Settings updated successfully", Data: result})
}
