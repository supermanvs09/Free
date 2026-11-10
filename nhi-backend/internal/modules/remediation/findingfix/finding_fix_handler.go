package findingfix

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type FindingFixHandler struct {
	service *FindingFixService
}

func NewFindingFixHandler(service *FindingFixService) *FindingFixHandler {
	return &FindingFixHandler{service: service}
}

// Get handles GET /findings/{finding_id}/fix.
func (h *FindingFixHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	id, ok := common.UUIDParam(w, r, "finding_id")
	if !ok {
		return
	}
	fix, err := h.service.Get(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "finding fix", err)
		return
	}
	common.Respond(w, http.StatusOK, fix)
}
