package quickwins

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type QuickWinIdentitiesHandler struct {
	service *QuickWinIdentitiesService
}

func NewQuickWinIdentitiesHandler(service *QuickWinIdentitiesService) *QuickWinIdentitiesHandler {
	return &QuickWinIdentitiesHandler{service: service}
}

// Get handles GET /posture/quick-wins/{rule_id}/identities?limit=&cursor= —
// the identities failing one check.
func (h *QuickWinIdentitiesHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	ruleID, ok := common.RuleIDOK(w, mux.Vars(r)["rule_id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("limit", "cursor")) {
		return
	}
	limit, ok := common.ParseLimit(w, q)
	if !ok {
		return
	}
	cursor, ok := common.ParseCursor(w, q)
	if !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, ruleID, limit, cursor)
	if err != nil {
		common.Fail(w, r, "load quick-win identities", err)
		return
	}
	common.Respond(w, env, true)
}
