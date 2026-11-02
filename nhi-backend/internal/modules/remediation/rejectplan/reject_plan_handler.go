package rejectplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type RejectPlanHandler struct {
	service *RejectPlanService
}

func NewRejectPlanHandler(service *RejectPlanService) *RejectPlanHandler {
	return &RejectPlanHandler{service: service}
}

// Post handles POST /plans/{id}/reject.
func (h *RejectPlanHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req RejectPlanRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.Reject(r.Context(), c, id, req)
	if err != nil {
		common.Fail(w, r, "reject plan", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
