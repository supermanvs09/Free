package facets

import (
	"net/http"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentitiesFacetsHandler struct {
	service *IdentitiesFacetsService
}

func NewIdentitiesFacetsHandler(service *IdentitiesFacetsService) *IdentitiesFacetsHandler {
	return &IdentitiesFacetsHandler{service: service}
}

// Get handles GET /identities/facets?<same filters> — the counts of the filter
// panel. Each facet ignores its own filter.
func (h *IdentitiesFacetsHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow(common.IdentityFilterParams...)) {
		return
	}
	filter, ok := common.ParseIdentityFilter(w, q, false)
	if !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, filter)
	if err != nil {
		common.Fail(w, r, "load identity facets", err)
		return
	}
	common.Respond(w, env, true)
}
