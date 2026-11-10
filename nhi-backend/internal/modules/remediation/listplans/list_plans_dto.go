package listplans

import "nhi-backend-api/internal/remediation/domain"

// GET /remediation/plans (every role)

// ListPlansQuery is the filter of the plan list. Every field is optional.
type ListPlansQuery struct {
	Status    string
	Mode      string // GUIDED | ONE_CLICK
	AccountID string
	FindingID string
	BatchID   string
	TargetARN string
	Limit     int // default 50, maximum 200
	Offset    int
}

const (
	defaultLimit = 50
	maxLimit     = 200
)

// ListPlansPagination says how many plans match the filter, not only how many are in this answer.
// The answer is { "data": [domain.Plan], "pagination": ListPlansPagination }.
type ListPlansPagination struct {
	Page       int `json:"page"`        // 1-based: offset / page_size + 1
	PageSize   int `json:"page_size"`   // the limit used for this answer
	Count      int `json:"count"`       // plans in this answer
	TotalCount int `json:"total_count"` // plans that match the filter in all pages
	TotalPages int `json:"total_pages"`
}

// ListPlansResponse is the answer of GET /plans.
type ListPlansResponse struct {
	Data       []domain.Plan       `json:"data"`
	Pagination ListPlansPagination `json:"pagination"`
}
