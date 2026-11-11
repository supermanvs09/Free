// Package findinglist serves GET /remediation/findings (every role): the
// remediation backlog, i.e. the findings to fix with the stage each one is at
// (no plan yet, a guided plan in progress, marked done and waiting for the
// scan), plus the counts for the page's cards.
package findinglist

import (
	"context"
	"net/http"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/store"
)

type Handler struct{ core *engine.Service }

func NewHandler(core *engine.Service) *Handler { return &Handler{core: core} }

var allowed = common.Allow("status", "severity", "q", "stage", "limit", "offset")

var stages = map[string]bool{"": true, "todo": true, "in_progress": true, "waiting_scan": true}
var statuses = map[string]bool{"": true, "OPEN": true, "RESOLVED": true, "ALL": true}

type response struct {
	Data       []store.FindingRow    `json:"data"`
	Summary    *store.FindingSummary `json:"summary"`
	Pagination pagination            `json:"pagination"`
}

type pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Count      int `json:"count"`
	TotalCount int `json:"total_count"`
	TotalPages int `json:"total_pages"`
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
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
	stage := strings.TrimSpace(q.Get("stage"))
	if !stages[stage] {
		common.Invalid(w, "stage", "stage must be todo, in_progress or waiting_scan")
		return
	}
	status := strings.ToUpper(strings.TrimSpace(q.Get("status")))
	if !statuses[status] {
		common.Invalid(w, "status", "status must be OPEN, RESOLVED or ALL")
		return
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	res, err := h.list(r.Context(), c, store.FindingListFilter{
		Status: status, Severity: strings.TrimSpace(q.Get("severity")), Search: strings.TrimSpace(q.Get("q")),
		Stage: stage, Limit: limit, Offset: max(0, offset),
	})
	if err != nil {
		common.Fail(w, r, "list findings to fix", err)
		return
	}
	common.WriteJSON(w, http.StatusOK, res)
}

func (h *Handler) list(ctx context.Context, c common.Caller, f store.FindingListFilter) (*response, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	st, err := h.core.Store(ctx, c.TenantID)
	if err != nil {
		return nil, err
	}
	rows, total, err := st.ListFindings(ctx, f)
	if err != nil {
		return nil, err
	}
	sum, err := st.FindingsSummary(ctx)
	if err != nil {
		return nil, err
	}
	pages := (total + f.Limit - 1) / f.Limit
	return &response{Data: rows, Summary: sum, Pagination: pagination{
		Page: f.Offset/f.Limit + 1, PageSize: f.Limit, Count: len(rows), TotalCount: total, TotalPages: max(1, pages),
	}}, nil
}
