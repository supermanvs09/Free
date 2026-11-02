package auditlog

import (
	"net/http"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
)

type AuditLogHandler struct {
	service *AuditLogService
}

func NewAuditLogHandler(service *AuditLogService) *AuditLogHandler {
	return &AuditLogHandler{service: service}
}

var allowed = common.Allow("plan_id", "limit")

// List handles GET /audit.
func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, allowed) {
		return
	}
	limit, ok := common.QueryInt(w, q, "limit")
	if !ok {
		return
	}
	evs, err := h.service.List(r.Context(), c, AuditQuery{PlanID: strings.TrimSpace(q.Get("plan_id")), Limit: limit})
	if err != nil {
		common.Fail(w, r, "read audit trail", err)
		return
	}
	common.Respond(w, http.StatusOK, evs)
}
