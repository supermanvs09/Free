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
	if !common.StrictQuery(w, q, common.Allow("window", "identity_class")) {
		return
	}
	win, ok := common.ParseWindowParam(w, q)
	if !ok {
		return
	}
	// One class (HI or NHI) scopes the whole overview; absent = as before.
	classes, ok := common.CsvEnum(w, q, "identity_class", common.IdentityClasses)
	if !ok {
		return
	}
	class := ""
	if len(classes) == 1 {
		class = classes[0]
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, win, class)
	if err != nil {
		common.Fail(w, r, "load posture overview", err)
		return
	}
	common.Respond(w, env, true)
}
