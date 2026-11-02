package cancelplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type CancelPlanHandler struct {
	service *CancelPlanService
}

func NewCancelPlanHandler(service *CancelPlanService) *CancelPlanHandler {
	return &CancelPlanHandler{service: service}
}

// Post handles POST /plans/{id}/cancel.
func (h *CancelPlanHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req CancelPlanRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.Cancel(r.Context(), c, id, req)
	if err != nil {
		common.Fail(w, r, "cancel plan", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
