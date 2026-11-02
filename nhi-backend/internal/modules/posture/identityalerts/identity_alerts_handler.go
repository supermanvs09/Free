package identityalerts

import (
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityAlertsHandler struct {
	service *IdentityAlertsService
}

func NewIdentityAlertsHandler(service *IdentityAlertsService) *IdentityAlertsHandler {
	return &IdentityAlertsHandler{service: service}
}

// Get handles GET /identities/{id}/alerts?window=30d&status=open|closed|all&limit=&cursor=
// — the Alerts tab. Alerts change when an analyst accepts or suppresses one,
// not only at scan time, so this endpoint is not served from the scan-id ETag.
func (h *IdentityAlertsHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("window", "status", "limit", "cursor")) {
		return
	}
	f := IdentityAlertsFilter{Status: AlertsAll}
	if f.Window, ok = common.ParseWindowParam(w, q); !ok {
		return
	}
	if raw := strings.ToLower(strings.TrimSpace(q.Get("status"))); raw != "" {
		switch raw {
		case AlertsOpen, AlertsClosed, AlertsAll:
			f.Status = raw
		default:
			common.Invalid(w, "status", "status must be open, closed or all")
			return
		}
	}
	if f.Limit, ok = common.ParseLimit(w, q); !ok {
		return
	}
	if f.Cursor, ok = common.ParseCursor(w, q); !ok {
		return
	}
	env, err := h.service.Get(r.Context(), c, id, f)
	if err != nil {
		common.Fail(w, r, "load identity alerts", err)
		return
	}
	common.Respond(w, env, false)
}
