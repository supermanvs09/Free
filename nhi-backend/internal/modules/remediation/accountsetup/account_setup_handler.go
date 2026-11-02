package accountsetup

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type AccountSetupHandler struct {
	service *AccountSetupService
}

func NewAccountSetupHandler(service *AccountSetupService) *AccountSetupHandler {
	return &AccountSetupHandler{service: service}
}

// Get handles GET /accounts/{account_id}/setup.
func (h *AccountSetupHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	accountID, ok := common.AccountParam(w, r)
	if !ok {
		return
	}
	v, err := h.service.Get(r.Context(), c, accountID)
	if err != nil {
		common.Fail(w, r, "read account setup", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store") // contains the ExternalId
	common.Respond(w, http.StatusOK, v)
}
