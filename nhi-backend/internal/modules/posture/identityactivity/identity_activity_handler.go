package identityactivity

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityActivityHandler struct {
	service *IdentityActivityService
}

func NewIdentityActivityHandler(service *IdentityActivityService) *IdentityActivityHandler {
	return &IdentityActivityHandler{service: service}
}

// Get handles GET /identities/{id}/activity?window=30d&mutating=&service=&limit=&cursor=
// — the Activity tab: CloudTrail calls, newest first.
func (h *IdentityActivityHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("window", "mutating", "service", "limit", "cursor")) {
		return
	}
	var f IdentityActivityFilter
	if f.Window, ok = common.ParseWindowParam(w, q); !ok {
		return
	}
	if raw := strings.TrimSpace(q.Get("mutating")); raw != "" {
		v, err := strconv.ParseBool(raw)
		if err != nil {
			common.Invalid(w, "mutating", "mutating must be true or false")
			return
		}
		f.Mutating = &v
	}
	if raw := strings.TrimSpace(q.Get("service")); raw != "" {
		if !common.TokenRegex.MatchString(raw) {
			common.Invalid(w, "service", "service is not valid")
			return
		}
		f.Service = raw
	}
	if f.Limit, ok = common.ParseLimit(w, q); !ok {
		return
	}
	if f.Cursor, ok = common.ParseCursor(w, q); !ok {
		return
	}
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, id, f)
	if err != nil {
		common.Fail(w, r, "load identity activity", err)
		return
	}
	common.Respond(w, env, true)
}
