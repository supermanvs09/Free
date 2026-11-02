package updateintegration

import (
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type UpdateIntegrationHandler struct {
	service *UpdateIntegrationService
}

func NewUpdateIntegrationHandler(service *UpdateIntegrationService) *UpdateIntegrationHandler {
	return &UpdateIntegrationHandler{service: service}
}

// Put handles PUT /integrations/{type}.
func (h *UpdateIntegrationHandler) Put(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if err := common.Require(c, domain.PermSettings); err != nil { // checked before reading anything else
		common.Fail(w, r, "update integration", err)
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	typ := strings.ToUpper(strings.TrimSpace(mux.Vars(r)["type"]))
	if !integrationTypes[typ] {
		common.Invalid(w, "type", "type must be jira, smtp or ses")
		return
	}
	var req UpdateIntegrationRequest
	if !common.Decode(w, r, &req, false) {
		return
	}
	i, err := h.service.Update(r.Context(), c, typ, req)
	if err != nil {
		common.Fail(w, r, "update integration", err)
		return
	}
	common.Respond(w, http.StatusOK, i)
}
