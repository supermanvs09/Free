package executeplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ExecutePlanHandler struct {
	service *ExecutePlanService
}

func NewExecutePlanHandler(service *ExecutePlanService) *ExecutePlanHandler {
	return &ExecutePlanHandler{service: service}
}

// Post handles POST /plans/{id}/execute (202 Accepted).
func (h *ExecutePlanHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	ex, err := h.service.Execute(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "queue execution", err)
		return
	}
	w.Header().Set("Location", executionsPath+ex.ID)
	common.WriteJSON(w, http.StatusAccepted, ExecutePlanResponse{Data: ex, StatusURL: executionsPath + ex.ID})
}
