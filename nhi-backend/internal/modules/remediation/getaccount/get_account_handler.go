package getaccount

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type GetAccountHandler struct {
	service *GetAccountService
}

func NewGetAccountHandler(service *GetAccountService) *GetAccountHandler {
	return &GetAccountHandler{service: service}
}

// Get handles GET /accounts/{account_id}.
func (h *GetAccountHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	acct, err := h.service.Get(r.Context(), c, accountID)
	if err != nil {
		common.Fail(w, r, "read remediation account", err)
		return
	}
	common.Respond(w, http.StatusOK, acct)
}
