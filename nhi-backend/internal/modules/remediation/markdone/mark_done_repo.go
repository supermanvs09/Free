package markdone

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// MarkDoneRepository records the manual fix through the engine.
type MarkDoneRepository struct {
	core *engine.Service
}

func NewMarkDoneRepository(core *engine.Service) *MarkDoneRepository {
	return &MarkDoneRepository{core: core}
}

func (r *MarkDoneRepository) MarkDone(ctx context.Context, actor domain.Actor, planID, note string) (*domain.Plan, error) {
	return r.core.MarkDone(ctx, actor, planID, note)
}
