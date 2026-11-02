package rollbackexecution

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type RollbackExecutionHandler struct {
	service *RollbackExecutionService
}

func NewRollbackExecutionHandler(service *RollbackExecutionService) *RollbackExecutionHandler {
	return &RollbackExecutionHandler{service: service}
}

// Post handles POST /executions/{id}/rollback (202 Accepted).
func (h *RollbackExecutionHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var body struct{}
	if !common.Decode(w, r, &body, true) {
		return
	}
	ex, err := h.service.Rollback(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "queue rollback", err)
		return
	}
	w.Header().Set("Location", executionsPath+ex.ID)
	common.WriteJSON(w, http.StatusAccepted, RollbackResponse{Data: ex, StatusURL: executionsPath + ex.ID})
}
