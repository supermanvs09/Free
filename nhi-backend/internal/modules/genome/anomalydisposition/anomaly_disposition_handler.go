package anomalydisposition

import (
	"net/http"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
)

// Handler serves POST /api/v1/genome/anomalies/{alert_id}/disposition.
type Handler struct {
	service *Service
	now     func() time.Time
}

// NewHandler creates the handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// No query parameters are accepted.
var allowed = map[string]struct{}{}

const maxReasonLength = 4000

// Post handles POST /api/v1/genome/anomalies/{alert_id}/disposition.
func (h *Handler) Post(w http.ResponseWriter, r *http.Request) {
	rid := common.RequestID(r)
	w.Header().Set("X-Request-ID", rid)
	defer common.Recover(w, r, "anomaly disposition", rid)
	ctx, cancel := common.RequestContext(r)
	defer cancel()

	claims, ok := common.RequireClaims(w, r, rid)
	if !ok {
		return
	}
	alertID, err := common.AlertIDPath(r)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, err.Error(), rid)
		return
	}
	if unknown, bad := common.CheckUnknown(r.URL.Query(), allowed); bad {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, common.UnknownParamMessage(r.URL.Query(), unknown, allowed), rid)
		return
	}
	var body Request
	if be := common.DecodeJSONBody(w, r, &body); be != nil {
		common.WriteError(w, be.Status, be.Code, be.Message, rid)
		return
	}
	disposition := strings.ToLower(strings.TrimSpace(body.Disposition))
	if disposition != Resolved && disposition != Dismissed && disposition != Reopened {
		common.WriteError(w, http.StatusBadRequest, common.CodeValidation, errBadDisposition.Error(), rid)
		return
	}
	if body.Reason != nil {
		if err := common.CheckLength("reason", strings.TrimSpace(*body.Reason), maxReasonLength); err != nil {
			common.WriteError(w, http.StatusBadRequest, common.CodeValidation, err.Error(), rid)
			return
		}
	}
	actor := strings.TrimSpace(claims.UserID)
	if actor == "" {
		actor = strings.TrimSpace(claims.Email)
	}
	data, err := h.service.Set(ctx, claims.UserID, claims.TenantID, claims.DBName, actor, alertID, disposition, body.Reason)
	if err != nil {
		common.WriteServiceError(w, r, "anomaly disposition", rid, err)
		return
	}
	common.WriteJSON(w, http.StatusOK, common.Envelope{
		Data: data,
		Meta: common.Meta{RequestID: rid, GeneratedAt: h.now()},
	})
}
