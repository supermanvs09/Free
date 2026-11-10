package listplans

import (
	"context"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

type ListPlansService struct {
	repo *ListPlansRepository
}

func NewListPlansService(r *ListPlansRepository) *ListPlansService {
	return &ListPlansService{repo: r}
}

func (s *ListPlansService) List(ctx context.Context, c common.Caller, q ListPlansQuery) (*ListPlansResponse, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	if q.FindingID != "" && !common.UUIDRegex.MatchString(q.FindingID) {
		return nil, &common.ParamError{Field: "finding_id", Message: "finding_id must be a UUID"}
	}
	if q.BatchID != "" && !common.UUIDRegex.MatchString(q.BatchID) {
		return nil, &common.ParamError{Field: "batch_id", Message: "batch_id must be a UUID"}
	}
	if q.AccountID != "" && !common.AccountIDRegex.MatchString(q.AccountID) {
		return nil, &common.ParamError{Field: "account_id", Message: "account_id must be a 12-digit AWS account id"}
	}
	mode := domain.Mode(strings.ToUpper(q.Mode))
	if mode != "" && mode != domain.ModeGuided && mode != domain.ModeOneClick {
		return nil, &common.ParamError{Field: "mode", Message: "mode must be GUIDED or ONE_CLICK"}
	}
	limit := common.ClampLimit(q.Limit, defaultLimit, maxLimit)
	plans, total, err := s.repo.List(ctx, c.TenantID, store.PlanFilter{
		Status: strings.ToUpper(q.Status), Mode: string(mode), AccountID: q.AccountID, FindingID: strings.ToLower(q.FindingID),
		BatchID: strings.ToLower(q.BatchID), TargetARN: q.TargetARN,
		Limit: limit, Offset: q.Offset,
	})
	if err != nil {
		return nil, err
	}
	return &ListPlansResponse{Data: plans, Pagination: ListPlansPagination{
		Page: q.Offset/limit + 1, PageSize: limit, Count: len(plans),
		TotalCount: total, TotalPages: (total + limit - 1) / limit,
	}}, nil
}
