package createplan

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type CreatePlanService struct {
	repo *CreatePlanRepository
}

func NewCreatePlanService(r *CreatePlanRepository) *CreatePlanService {
	return &CreatePlanService{repo: r}
}

// Create validates the request and builds the plan. Only analyst / admin may
// create plans; the engine checks the role again.
func (s *CreatePlanService) Create(ctx context.Context, c common.Caller, req CreatePlanRequest) (*CreatePlanResponse, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	if len(req.FindingIDs) == 0 {
		return nil, &common.ParamError{Field: "finding_ids", Message: "finding_ids is required"}
	}
	if len(req.FindingIDs) > maxFindings {
		return nil, &common.ParamError{Field: "finding_ids", Message: fmt.Sprintf("at most %d finding_ids per plan; use a batch", maxFindings)}
	}
	ids := make([]string, 0, len(req.FindingIDs))
	for _, id := range req.FindingIDs {
		id = strings.TrimSpace(id)
		if !common.UUIDRegex.MatchString(id) {
			return nil, &common.ParamError{Field: "finding_ids", Message: "every finding id must be a UUID"}
		}
		ids = append(ids, strings.ToLower(id))
	}
	mode := domain.Mode(strings.ToUpper(strings.TrimSpace(req.Mode)))
	switch mode {
	case "", domain.ModeGuided, domain.ModeOneClick:
	default:
		return nil, &common.ParamError{Field: "mode", Message: "mode must be GUIDED or ONE_CLICK"}
	}
	plan, existing, err := s.repo.Create(ctx, c.Actor(), engine.CreatePlanReq{
		FindingIDs: ids, ActionType: strings.TrimSpace(req.ActionType), Params: req.Params, Mode: mode,
	})
	if err != nil {
		return nil, err
	}
	res := &CreatePlanResponse{Data: plan, ExistingPlan: existing}
	if existing {
		by := "the dashboard"
		if plan.PolicyID != nil {
			by = "the engine's automatic remediation"
		}
		res.Message = fmt.Sprintf("this finding already has a plan (%s, created by %s): no new plan or approval e-mail", plan.Status, by)
	}
	return res, nil
}
