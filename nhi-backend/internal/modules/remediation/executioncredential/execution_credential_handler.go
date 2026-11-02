package executioncredential

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ExecutionCredentialHandler struct {
	service *ExecutionCredentialService
}

func NewExecutionCredentialHandler(service *ExecutionCredentialService) *ExecutionCredentialHandler {
	return &ExecutionCredentialHandler{service: service}
}

// Get handles GET /executions/{id}/credential.
func (h *ExecutionCredentialHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	id, ok := common.UUIDParam(w, r, "id")
	if !ok {
		return
	}
	v, err := h.service.Take(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "read new credential", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	common.Respond(w, http.StatusOK, v)
}
