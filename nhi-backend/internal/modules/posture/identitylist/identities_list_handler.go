package identitylist

import (
	"net/http"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentitiesListHandler struct {
	service *IdentitiesListService
}

func NewIdentitiesListHandler(service *IdentitiesListService) *IdentitiesListHandler {
	return &IdentitiesListHandler{service: service}
}

// List handles GET /identities — the identity table with filters, sorting and
// keyset pagination (limit, cursor).
func (h *IdentitiesListHandler) List(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow(append([]string{"sort", "limit", "cursor"}, common.IdentityFilterParams...)...)) {
		return
	}
	filter, ok := common.ParseIdentityFilter(w, q, true)
	if !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.List(r.Context(), c, filter)
	if err != nil {
		common.Fail(w, r, "list identities", err)
		return
	}
	common.Respond(w, env, true)
}
