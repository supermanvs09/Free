package approveplan

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type ApprovePlanService struct {
	repo *ApprovePlanRepository
}

func NewApprovePlanService(r *ApprovePlanRepository) *ApprovePlanService {
	return &ApprovePlanService{repo: r}
}

func (s *ApprovePlanService) Approve(ctx context.Context, c common.Caller, planID string, req ApprovePlanRequest) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermApprove); err != nil {
		return nil, err
	}
	comment := strings.TrimSpace(req.Comment)
	if len(comment) > maxCommentLen {
		return nil, &common.ParamError{Field: "comment", Message: fmt.Sprintf("comment must be at most %d characters", maxCommentLen)}
	}
	return s.repo.Approve(ctx, c.Actor(), planID, comment)
}
