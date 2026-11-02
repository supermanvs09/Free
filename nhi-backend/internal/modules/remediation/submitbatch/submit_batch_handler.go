package submitbatch

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type SubmitBatchHandler struct {
	service *SubmitBatchService
}

func NewSubmitBatchHandler(service *SubmitBatchService) *SubmitBatchHandler {
	return &SubmitBatchHandler{service: service}
}

// Post handles POST /batches/{id}/submit.
func (h *SubmitBatchHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req SubmitBatchRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	b, err := h.service.Submit(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "submit batch", err)
		return
	}
	common.Respond(w, http.StatusOK, b)
}
