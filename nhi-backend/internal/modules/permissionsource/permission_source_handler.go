package permissionsource

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"nhi-backend-api/internal/modules/credentials"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

var permissionSourceAllowed = map[string]struct{}{
	"credential_id": {}, "event_source": {}, "event_name": {},
}

// CloudTrail event sources / names are plain tokens such as
// "s3.amazonaws.com" and "GetObject".
var eventTokenRegex = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

type PermissionSourceHandler struct {
	service *PermissionSourceService
}

func NewPermissionSourceHandler(service *PermissionSourceService) *PermissionSourceHandler {
	return &PermissionSourceHandler{service: service}
}

// Get handles GET /api/v1/permission-source?credential_id=&event_source=&event_name=
// — the policy behind one event, looked up only when a user opens that event.
func (h *PermissionSourceHandler) Get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	if httpx.RejectUnknownQuery(w, r, permissionSourceAllowed) {
		return
	}
	q := r.URL.Query()
	credentialID := strings.TrimSpace(q.Get("credential_id"))
	if !httpx.CredentialUUIDRegex.MatchString(credentialID) {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "credential_id must be a credential UUID", Error: "INVALID_CREDENTIAL_ID"})
		return
	}
	eventSource, eventName := strings.TrimSpace(q.Get("event_source")), strings.TrimSpace(q.Get("event_name"))
	if !eventTokenRegex.MatchString(eventSource) || !eventTokenRegex.MatchString(eventName) {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "event_source and event_name are required (letters, digits, . _ : -)", Error: "INVALID_EVENT"})
		return
	}

	result, err := h.service.Find(r.Context(), claims.UserID, claims.TenantID, claims.DBName, credentialID, eventSource, eventName)
	if err != nil {
		if errors.Is(err, credentials.ErrCredentialNotFound) {
			httpx.SendJSONResponse(w, http.StatusNotFound, httpx.APIResponse{Success: false, Message: "credential not found", Error: "CREDENTIAL_NOT_FOUND"})
			return
		}
		httpx.SendServerError(w, r, err, "Failed to look up the permission source", "PERMISSION_SOURCE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Permission source retrieved successfully", Data: result})
}
