package export

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/modules/posture/identitylist"
	"nhi-backend-api/internal/platform/scope"
)

type PostureExportRepository struct {
	list *identitylist.IdentitiesListRepository
}

func NewPostureExportRepository() *PostureExportRepository {
	return &PostureExportRepository{list: identitylist.NewIdentitiesListRepository()}
}

// Stream implements GET /posture/export. It walks the filtered identities in
// keyset order, models.ExportChunkSize rows per query, and hands each chunk to
// emit as soon as it is read, so memory stays flat for any fleet size. emit
// returning an error (for example a closed connection) stops the walk.
func (r *PostureExportRepository) Stream(ctx context.Context, s *scope.DataScope, f common.IdentityFilter, emit func([]common.ExportRow) error) error {
	if err := common.Need(s); err != nil {
		return err
	}
	if f.Sort == "" {
		f.Sort = common.SortScore
	}
	afterID := ""
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		rows, err := r.list.QueryIdentityPage(ctx, s, f, afterID, common.ExportChunkSize)
		if err != nil {
			return fmt.Errorf("export chunk: %w", err)
		}
		if len(rows) == 0 {
			return nil
		}
		chunk := make([]common.ExportRow, 0, len(rows))
		for _, row := range rows {
			chunk = append(chunk, row.ToExport())
		}
		if err := emit(chunk); err != nil {
			return err
		}
		if len(rows) < common.ExportChunkSize {
			return nil
		}
		afterID = rows[len(rows)-1].IdentityID
	}
}
