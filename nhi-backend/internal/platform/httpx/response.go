package httpx

import (
	"encoding/json"
	"net/http"

	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/logging"
)

// APIResponse is the standard wrapper for all API responses
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// sendServerError logs err and answers 500, or 503 TENANT_NOT_PROVISIONED
// when the tenant schema lacks a table this endpoint reads.
func SendServerError(w http.ResponseWriter, r *http.Request, err error, message, code string) {
	logging.FromContext(r.Context()).Error(message, "code", code, "err", err)
	if database.IsMissingTable(err) {
		SendJSONResponse(w, http.StatusServiceUnavailable, APIResponse{Success: false, Message: database.NotProvisionedMessage, Error: database.NotProvisionedCode})
		return
	}
	SendJSONResponse(w, http.StatusInternalServerError, APIResponse{Success: false, Message: message, Error: code})
}

func SendJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}
