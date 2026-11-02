package listaccounts

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ListAccountsHandler struct {
	service *ListAccountsService
}

func NewListAccountsHandler(service *ListAccountsService) *ListAccountsHandler {
	return &ListAccountsHandler{service: service}
}

// List handles GET /accounts.
func (h *ListAccountsHandler) List(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	list, err := h.service.List(r.Context(), c)
	if err != nil {
		common.Fail(w, r, "list remediation accounts", err)
		return
	}
	common.Respond(w, http.StatusOK, list)
}
