package getplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type GetPlanHandler struct {
	service *GetPlanService
}

func NewGetPlanHandler(service *GetPlanService) *GetPlanHandler {
	return &GetPlanHandler{service: service}
}

// Get handles GET /plans/{id}.
func (h *GetPlanHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	id, ok := common.UUIDParam(w, r, "id")
	if !ok {
		return
	}
	d, err := h.service.Get(r.Context(), c, id)
	if err != nil {
		common.Fail(w, r, "read plan", err)
		return
	}
	common.Respond(w, http.StatusOK, d)
}
