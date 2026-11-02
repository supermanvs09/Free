package overview

import (
	"net/http"

	"nhi-backend-api/internal/modules/posture/common"
)

type PostureOverviewHandler struct {
	service *PostureOverviewService
}

func NewPostureOverviewHandler(service *PostureOverviewService) *PostureOverviewHandler {
	return &PostureOverviewHandler{service: service}
}

// Get handles GET /posture/overview?window=30d — the whole Posture page.
func (h *PostureOverviewHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("window")) {
		return
	}
	win, ok := common.ParseWindowParam(w, q)
	if !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, win)
	if err != nil {
		common.Fail(w, r, "load posture overview", err)
		return
	}
	common.Respond(w, env, true)
}
