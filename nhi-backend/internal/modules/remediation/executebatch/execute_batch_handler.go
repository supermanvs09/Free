package executebatch

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ExecuteBatchHandler struct {
	service *ExecuteBatchService
}

func NewExecuteBatchHandler(service *ExecuteBatchService) *ExecuteBatchHandler {
	return &ExecuteBatchHandler{service: service}
}

// Post handles POST /batches/{id}/execute (202 Accepted).
func (h *ExecuteBatchHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req ExecuteBatchRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	res, err := h.service.Execute(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "execute batch", err)
		return
	}
	common.Respond(w, http.StatusAccepted, res)
}
