package rollbackplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type RollbackPlanHandler struct {
	service *RollbackPlanService
}

func NewRollbackPlanHandler(service *RollbackPlanService) *RollbackPlanHandler {
	return &RollbackPlanHandler{service: service}
}

// Post handles POST /plans/{id}/rollback (202 Accepted). {id} is the plan_id.
func (h *RollbackPlanHandler) Post(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	planID, ok := common.UUIDParam(w, r, "id")
	if !ok {
		return
	}
	var body struct{}
	if !common.Decode(w, r, &body, true) {
		return
	}
	ex, err := h.service.Rollback(r.Context(), c, planID)
	if err != nil {
		common.Fail(w, r, "queue rollback", err)
		return
	}
	w.Header().Set("Location", executionsPath+ex.ID)
	common.WriteJSON(w, http.StatusAccepted, RollbackResponse{Data: ex, StatusURL: executionsPath + ex.ID})
}
