package getbatch

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type GetBatchHandler struct {
	service *GetBatchService
}

func NewGetBatchHandler(service *GetBatchService) *GetBatchHandler {
	return &GetBatchHandler{service: service}
}

// Get handles GET /batches/{id}.
func (h *GetBatchHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	b, err := h.service.Get(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "read batch", err)
		return
	}
	common.Respond(w, http.StatusOK, b)
}
