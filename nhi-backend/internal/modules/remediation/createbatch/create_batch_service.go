package createbatch

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type CreateBatchService struct {
	repo *CreateBatchRepository
}

func NewCreateBatchService(r *CreateBatchRepository) *CreateBatchService {
	return &CreateBatchService{repo: r}
}

func (s *CreateBatchService) Create(ctx context.Context, c common.Caller, req CreateBatchRequest) (*CreateBatchResponse, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	mode := domain.BatchMode(strings.ToUpper(strings.TrimSpace(req.Mode)))
	switch mode {
	case "", domain.BatchIndependent, domain.BatchAllOrNothing:
	default:
		return nil, &common.ParamError{Field: "mode", Message: "mode must be INDEPENDENT or ALL_OR_NOTHING"}
	}
	if len(req.Items) == 0 {
		return nil, &common.ParamError{Field: "items", Message: "items is required"}
	}
	if len(req.Items) > maxItems {
		return nil, &common.ParamError{Field: "items", Message: fmt.Sprintf("at most %d items per batch", maxItems)}
	}
	items := make([]engine.CreatePlanReq, 0, len(req.Items))
	for i, it := range req.Items {
		if len(it.FindingIDs) == 0 || len(it.FindingIDs) > maxFindings {
			return nil, &common.ParamError{Field: fmt.Sprintf("items[%d].finding_ids", i), Message: fmt.Sprintf("each item needs 1 to %d finding_ids", maxFindings)}
		}
		ids := make([]string, 0, len(it.FindingIDs))
		for _, id := range it.FindingIDs {
			id = strings.TrimSpace(id)
			if !common.UUIDRegex.MatchString(id) {
				return nil, &common.ParamError{Field: fmt.Sprintf("items[%d].finding_ids", i), Message: "every finding id must be a UUID"}
			}
			ids = append(ids, strings.ToLower(id))
		}
		items = append(items, engine.CreatePlanReq{FindingIDs: ids, ActionType: strings.TrimSpace(it.ActionType),
			Params: it.Params, Mode: domain.Mode(strings.ToUpper(strings.TrimSpace(it.Mode)))})
	}
	res, err := s.repo.Create(ctx, c.Actor(), engine.CreateBatchReq{Mode: mode, Items: items})
	if err != nil {
		return nil, err
	}
	return &CreateBatchResponse{Data: res.Batch, Errors: res.Errors}, nil
}
