package confirmexternal

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ConfirmExternalHandler struct {
	service *ConfirmExternalService
}

func NewConfirmExternalHandler(service *ConfirmExternalService) *ConfirmExternalHandler {
	return &ConfirmExternalHandler{service: service}
}

// Post handles POST /plans/{id}/confirm-external.
func (h *ConfirmExternalHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req ConfirmExternalRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	p, err := h.service.Confirm(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "confirm external id", err)
		return
	}
	common.Respond(w, http.StatusOK, p)
}
