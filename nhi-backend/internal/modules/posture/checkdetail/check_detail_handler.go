package checkdetail

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type CheckDetailHandler struct {
	service *CheckDetailService
}

func NewCheckDetailHandler(service *CheckDetailService) *CheckDetailHandler {
	return &CheckDetailHandler{service: service}
}

// Get handles GET /checks/{rule_id} — the details behind the Remediate button.
func (h *CheckDetailHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	ruleID, ok := common.RuleIDOK(w, mux.Vars(r)["rule_id"])
	if !ok {
		return
	}
	if !common.StrictQuery(w, r.URL.Query(), common.Allow()) {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, ruleID)
	if err != nil {
		common.Fail(w, r, "load check", err)
		return
	}
	common.Respond(w, env, true)
}
