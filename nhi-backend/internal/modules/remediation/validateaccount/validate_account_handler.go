package validateaccount

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ValidateAccountHandler struct {
	service *ValidateAccountService
}

func NewValidateAccountHandler(service *ValidateAccountService) *ValidateAccountHandler {
	return &ValidateAccountHandler{service: service}
}

// Post handles POST /accounts/{account_id}/validate.
func (h *ValidateAccountHandler) Post(w http.ResponseWriter, r *http.Request) {
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
	var req ValidateAccountRequest
	if !common.Decode(w, r, &req, true) {
		return
	}
	acct, err := h.service.Validate(r.Context(), c, accountID)
	if err != nil {
		common.Fail(w, r, "validate remediation role", err)
		return
	}
	common.Respond(w, http.StatusOK, acct)
}
