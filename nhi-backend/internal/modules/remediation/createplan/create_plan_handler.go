package createplan

import (
	"net/http"

	"nhi-backend-api/internal/modules/remediation/common"
)

type CreatePlanHandler struct {
	service *CreatePlanService
}

func NewCreatePlanHandler(service *CreatePlanService) *CreatePlanHandler {
	return &CreatePlanHandler{service: service}
}

// Post handles POST /plans: reads the live state (read only), computes the
// diff, pre-checks, risk and score impact, and stores the plan (201).
func (h *CreatePlanHandler) Post(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	var req CreatePlanRequest
	if !common.Decode(w, r, &req, false) {
		return
	}
	plan, err := h.service.Create(r.Context(), c, req)
	if err != nil {
		common.Fail(w, r, "create plan", err)
		return
	}
	common.Respond(w, http.StatusCreated, plan)
}
