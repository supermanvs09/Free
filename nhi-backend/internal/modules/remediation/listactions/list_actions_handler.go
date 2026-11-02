package listactions

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ListActionsHandler struct {
	service *ListActionsService
}

func NewListActionsHandler(service *ListActionsService) *ListActionsHandler {
	return &ListActionsHandler{service: service}
}

// List handles GET /actions.
func (h *ListActionsHandler) List(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	acts, err := h.service.List(r.Context(), c)
	if err != nil {
		common.Fail(w, r, "list actions", err)
		return
	}
	common.Respond(w, http.StatusOK, acts)
}
