package identityposture

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityPostureHandler struct {
	service *IdentityPostureService
}

func NewIdentityPostureHandler(service *IdentityPostureService) *IdentityPostureHandler {
	return &IdentityPostureHandler{service: service}
}

// Get handles GET /identities/{id}/posture?window=30d — the Posture tab.
func (h *IdentityPostureHandler) Get(w http.ResponseWriter, r *http.Request) {
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
		common.Fail(w, r, "load identity posture", err)
		return
	}
	common.Respond(w, env, true)
}
