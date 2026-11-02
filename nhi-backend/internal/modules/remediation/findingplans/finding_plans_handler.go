package findingplans

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type FindingPlansHandler struct {
	service *FindingPlansService
}

func NewFindingPlansHandler(service *FindingPlansService) *FindingPlansHandler {
	return &FindingPlansHandler{service: service}
}

// Get handles GET /findings/{finding_id}.
func (h *FindingPlansHandler) Get(w http.ResponseWriter, r *http.Request) {
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
	plans, err := h.service.List(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "list plans of finding", err)
		return
	}
	common.Respond(w, http.StatusOK, plans)
}
