package identityheader

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityHeaderHandler struct {
	service *IdentityHeaderService
}

func NewIdentityHeaderHandler(service *IdentityHeaderService) *IdentityHeaderHandler {
	return &IdentityHeaderHandler{service: service}
}

// Get handles GET /identities/{id} — the identity page header.
func (h *IdentityHeaderHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "load identity", err)
		return
	}
	common.Respond(w, env, true)
}
