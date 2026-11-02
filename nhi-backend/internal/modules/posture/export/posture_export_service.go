package export

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type PostureExportService struct {
	common.Base
	repo *PostureExportRepository
}

func NewPostureExportService(r *PostureExportRepository, resolver *scope.Resolver) *PostureExportService {
	return &PostureExportService{Base: common.NewBase(resolver), repo: r}
}

// Stream walks the filtered identities in chunks and passes each chunk to emit.
func (s *PostureExportService) Stream(ctx context.Context, c common.Caller, f common.IdentityFilter, emit func([]common.ExportRow) error) error {
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return err
	}
	if err := s.repo.Stream(ctx, resolved, f, emit); err != nil {
		return fmt.Errorf("stream posture export: %w", err)
	}
	return nil
}
