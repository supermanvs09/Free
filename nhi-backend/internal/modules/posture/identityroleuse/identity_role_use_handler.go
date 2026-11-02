package identityroleuse

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityRoleUseHandler struct {
	service *IdentityRoleUseService
}

func NewIdentityRoleUseHandler(service *IdentityRoleUseService) *IdentityRoleUseHandler {
	return &IdentityRoleUseHandler{service: service}
}

// Get handles GET /identities/{id}/role-use — the Role use tab. There is no
// window yet: it needs a daily rollup that arrives with the CloudTrail data.
func (h *IdentityRoleUseHandler) Get(w http.ResponseWriter, r *http.Request) {
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
		common.Fail(w, r, "load identity role use", err)
		return
	}
	common.Respond(w, env, true)
}
