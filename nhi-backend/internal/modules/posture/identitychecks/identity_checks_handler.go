package identitychecks

import (
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityChecksHandler struct {
	service *IdentityChecksService
}

func NewIdentityChecksHandler(service *IdentityChecksService) *IdentityChecksHandler {
	return &IdentityChecksHandler{service: service}
}

// Get handles GET /identities/{id}/checks?status=failed|passed|all&pillar= —
// the Checks tab.
func (h *IdentityChecksHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("status", "pillar")) {
		return
	}
	f := IdentityChecksFilter{Status: ChecksAll}
	if raw := strings.ToLower(strings.TrimSpace(q.Get("status"))); raw != "" {
		switch raw {
		case ChecksFailed, ChecksPassed, ChecksAll:
			f.Status = raw
		default:
			common.Invalid(w, "status", "status must be failed, passed or all")
			return
		}
	}
	if raw := strings.ToLower(strings.TrimSpace(q.Get("pillar"))); raw != "" {
		if !common.TokenRegex.MatchString(raw) {
			common.Invalid(w, "pillar", "pillar is not valid")
			return
		}
		f.Pillar = raw
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, id, f)
	if err != nil {
		common.Fail(w, r, "load identity checks", err)
		return
	}
	common.Respond(w, env, true)
}
