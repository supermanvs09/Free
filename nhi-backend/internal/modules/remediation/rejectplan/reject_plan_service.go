package rejectplan

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type RejectPlanService struct {
	repo *RejectPlanRepository
}

func NewRejectPlanService(r *RejectPlanRepository) *RejectPlanService {
	return &RejectPlanService{repo: r}
}

func (s *RejectPlanService) Reject(ctx context.Context, c common.Caller, planID string, req RejectPlanRequest) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermApprove); err != nil {
		return nil, err
	}
	comment := strings.TrimSpace(req.Comment)
	if len(comment) > maxCommentLen {
		return nil, &common.ParamError{Field: "comment", Message: fmt.Sprintf("comment must be at most %d characters", maxCommentLen)}
	}
	return s.repo.Reject(ctx, c.Actor(), planID, comment)
}
