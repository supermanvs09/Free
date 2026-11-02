package submitplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type SubmitPlanHandler struct {
	service *SubmitPlanService
}

func NewSubmitPlanHandler(service *SubmitPlanService) *SubmitPlanHandler {
	return &SubmitPlanHandler{service: service}
}

// Post handles POST /plans/{id}/submit.
func (h *SubmitPlanHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req SubmitPlanRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.Submit(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "submit plan", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
