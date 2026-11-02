package approveplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ApprovePlanHandler struct {
	service *ApprovePlanService
}

func NewApprovePlanHandler(service *ApprovePlanService) *ApprovePlanHandler {
	return &ApprovePlanHandler{service: service}
}

// Post handles POST /plans/{id}/approve.
func (h *ApprovePlanHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req ApprovePlanRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.Approve(r.Context(), c, id, req)
	if err != nil {
		common.Fail(w, r, "approve plan", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
