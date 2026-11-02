package cancelplan

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type CancelPlanService struct {
	repo *CancelPlanRepository
}

func NewCancelPlanService(r *CancelPlanRepository) *CancelPlanService {
	return &CancelPlanService{repo: r}
}

func (s *CancelPlanService) Cancel(ctx context.Context, c common.Caller, planID string, req CancelPlanRequest) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	reason := strings.TrimSpace(req.Reason)
	if len(reason) > maxReasonLen {
		return nil, &common.ParamError{Field: "reason", Message: fmt.Sprintf("reason must be at most %d characters", maxReasonLen)}
	}
	return s.repo.Cancel(ctx, c.Actor(), planID, reason)
}
