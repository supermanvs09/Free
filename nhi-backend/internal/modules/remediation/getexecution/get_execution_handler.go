package getexecution

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type GetExecutionHandler struct {
	service *GetExecutionService
}

func NewGetExecutionHandler(service *GetExecutionService) *GetExecutionHandler {
	return &GetExecutionHandler{service: service}
}

// Get handles GET /executions/{id}.
func (h *GetExecutionHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	ex, err := h.service.Get(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "read execution", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store") // status changes while it runs
	common.Respond(w, http.StatusOK, ex)
}
