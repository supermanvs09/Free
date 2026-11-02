package updateaccount

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type UpdateAccountHandler struct {
	service *UpdateAccountService
}

func NewUpdateAccountHandler(service *UpdateAccountService) *UpdateAccountHandler {
	return &UpdateAccountHandler{service: service}
}

// Put handles PUT /accounts/{account_id}.
func (h *UpdateAccountHandler) Put(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if err := common.Require(c, domain.PermSettings); err != nil { // checked before reading anything else
		common.Fail(w, r, "update remediation account", err)
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	accountID, ok := common.AccountParam(w, r)
	if !ok {
		return
	}
	var req UpdateAccountRequest
	if !common.Decode(w, r, &req, false) {
		return
	}
	acct, err := h.service.Update(r.Context(), c, accountID, req)
	if err != nil {
		common.Fail(w, r, "update remediation account", err)
		return
	}
	common.Respond(w, http.StatusOK, acct)
}
