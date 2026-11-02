package markdone

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type MarkDoneService struct {
	repo *MarkDoneRepository
}

func NewMarkDoneService(r *MarkDoneRepository) *MarkDoneService {
	return &MarkDoneService{repo: r}
}

func (s *MarkDoneService) MarkDone(ctx context.Context, c common.Caller, planID string, req MarkDoneRequest) (*domain.Plan, error) {
	if err := common.Require(c, domain.PermPlan); err != nil {
		return nil, err
	}
	note := strings.TrimSpace(req.Note)
	if len(note) > maxNoteLen {
		return nil, &common.ParamError{Field: "note", Message: fmt.Sprintf("note must be at most %d characters", maxNoteLen)}
	}
	return s.repo.MarkDone(ctx, c.Actor(), planID, note)
}
