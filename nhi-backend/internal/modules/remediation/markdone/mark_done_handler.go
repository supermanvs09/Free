package markdone

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type MarkDoneHandler struct {
	service *MarkDoneService
}

func NewMarkDoneHandler(service *MarkDoneService) *MarkDoneHandler {
	return &MarkDoneHandler{service: service}
}

// Post handles POST /plans/{id}/mark-done.
func (h *MarkDoneHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req MarkDoneRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.MarkDone(r.Context(), c, id, req)
	if err != nil {
		common.Fail(w, r, "mark plan done", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
