package listplans

import (
	"net/http"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
)

type ListPlansHandler struct {
	service *ListPlansService
}

func NewListPlansHandler(service *ListPlansService) *ListPlansHandler {
	return &ListPlansHandler{service: service}
}

var allowed = common.Allow("status", "account_id", "finding_id", "batch_id", "target_arn", "limit", "offset")

// List handles GET /plans.
func (h *ListPlansHandler) List(w http.ResponseWriter, r *http.Request) {
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
	offset, ok := common.QueryInt(w, q, "offset")
	if !ok {
		return
	}
	plans, err := h.service.List(r.Context(), c, ListPlansQuery{
		Status: strings.TrimSpace(q.Get("status")), AccountID: strings.TrimSpace(q.Get("account_id")),
		FindingID: strings.TrimSpace(q.Get("finding_id")), BatchID: strings.TrimSpace(q.Get("batch_id")),
		TargetARN: strings.TrimSpace(q.Get("target_arn")), Limit: limit, Offset: offset,
	})
	if err != nil {
		common.Fail(w, r, "list plans", err)
		return
	}
	common.Respond(w, http.StatusOK, plans)
}
