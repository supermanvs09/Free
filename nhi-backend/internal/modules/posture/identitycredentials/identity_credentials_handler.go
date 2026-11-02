package identitycredentials

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityCredentialsHandler struct {
	service *IdentityCredentialsService
}

func NewIdentityCredentialsHandler(service *IdentityCredentialsService) *IdentityCredentialsHandler {
	return &IdentityCredentialsHandler{service: service}
}

// Get handles GET /identities/{id}/credentials — the Credentials tab.
func (h *IdentityCredentialsHandler) Get(w http.ResponseWriter, r *http.Request) {
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
		common.Fail(w, r, "load identity credentials", err)
		return
	}
	common.Respond(w, env, true)
}
