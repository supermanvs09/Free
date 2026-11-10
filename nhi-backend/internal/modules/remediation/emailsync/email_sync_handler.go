package emailsync

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type EmailSyncHandler struct {
	service *EmailSyncService
}

func NewEmailSyncHandler(service *EmailSyncService) *EmailSyncHandler {
	return &EmailSyncHandler{service: service}
}

var allowed = common.Allow("limit")

// Get handles GET /email-sync.
func (h *EmailSyncHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, allowed) {
		return
	}
	limit, ok := common.QueryInt(w, q, "limit")
	if !ok {
		return
	}
	res, err := h.service.Get(r.Context(), c, limit)
	if err != nil {
		common.Fail(w, r, "email sync status", err)
		return
	}
	common.Respond(w, http.StatusOK, res)
}
