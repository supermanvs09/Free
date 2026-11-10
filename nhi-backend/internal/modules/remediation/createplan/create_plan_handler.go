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
// diff, pre-checks, risk and score impact, and stores the plan (201). A One-click
// request for findings whose plan already waits for approval or is about to run
// answers 200 with that plan and "existing_plan": true.
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
	res, err := h.service.Create(r.Context(), c, req)
	if err != nil {
		common.Fail(w, r, "create plan", err)
		return
	}
	status := http.StatusCreated
	if res.ExistingPlan {
		status = http.StatusOK
	}
	common.WriteJSON(w, status, res)
}
