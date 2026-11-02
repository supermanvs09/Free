package createbatch

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type CreateBatchHandler struct {
	service *CreateBatchService
}

func NewCreateBatchHandler(service *CreateBatchService) *CreateBatchHandler {
	return &CreateBatchHandler{service: service}
}

// Post handles POST /batches (201).
func (h *CreateBatchHandler) Post(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	var req CreateBatchRequest
	if !common.Decode(w, r, &req, false) {
		return
	}
	res, err := h.service.Create(r.Context(), c, req)
	if err != nil {
		common.Fail(w, r, "create batch", err)
		return
	}
	common.WriteJSON(w, http.StatusCreated, res)
}
