package identityhistory

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityHistoryHandler struct {
	service *IdentityHistoryService
}

func NewIdentityHistoryHandler(service *IdentityHistoryService) *IdentityHistoryHandler {
	return &IdentityHistoryHandler{service: service}
}

// Get handles GET /identities/{id}/history?window=30d — the History tab.
func (h *IdentityHistoryHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("window")) {
		return
	}
	win, ok := common.ParseWindowParam(w, q)
	if !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, id, win)
	if err != nil {
		common.Fail(w, r, "load identity history", err)
		return
	}
	common.Respond(w, env, true)
}
