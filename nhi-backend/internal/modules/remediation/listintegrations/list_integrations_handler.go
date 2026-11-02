package listintegrations

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ListIntegrationsHandler struct {
	service *ListIntegrationsService
}

func NewListIntegrationsHandler(service *ListIntegrationsService) *ListIntegrationsHandler {
	return &ListIntegrationsHandler{service: service}
}

// List handles GET /integrations.
func (h *ListIntegrationsHandler) List(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	list, err := h.service.List(r.Context(), c)
	if err != nil {
		common.Fail(w, r, "list integrations", err)
		return
	}
	common.Respond(w, http.StatusOK, list)
}
