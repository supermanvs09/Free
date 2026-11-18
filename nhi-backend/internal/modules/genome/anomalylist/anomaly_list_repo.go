package anomalylist

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/platform/scope"
)

type Repository struct{}

func NewRepository() *Repository { return &Repository{} }

type Filter struct {
	Dimension    string
	Status       string
	SourceType   string
	IdentityName string
	EventID      string

	Search     string
	SearchKeys []common.MonitoringKey
	From       *time.Time
	To         *time.Time
	After      *common.AlertCursor
	Limit      int
	Offset     int
}

func filterSQL(f Filter, includeCursor bool) ([]string, []any) {
	var where []string
	var args []any
	arg := func(value any) string {
		args = append(args, value)
		return "$" + strconv.Itoa(len(args))
	}

	if f.Dimension != "" {
		where = append(where, "a.dimension = "+arg(f.Dimension))
	}
	if f.Status != "" {
		where = append(where, "a.status = "+arg(f.Status))
	}
	if f.SourceType != "" {
		where = append(where, "a.source_type = "+arg(f.SourceType))
	}
	if f.IdentityName != "" {
		where = append(where, "a.identity_name = "+arg(f.IdentityName))
	}
	if families, all := workloadtypes.Enabled(); !all {
		where = append(where, "a.source_type = ANY("+arg(pq.Array(families))+"::text[])")
	}
	if f.From != nil {
		where = append(where, "a.created_at >= "+arg(*f.From))
	}
	if f.To != nil {
		where = append(where, "a.created_at < "+arg(*f.To))
	}
	if includeCursor && f.After != nil {
		where = append(where, "(a.created_at, a.id) < ("+arg(f.After.CreatedAt)+", "+arg(f.After.ID)+")")
	}
	if f.EventID != "" {
		where = append(
			where,
			"a.event_id = "+
				arg(f.EventID),
		)
	}
	if f.Search != "" {
		pattern := "%" + common.EscapeLike(f.Search) + "%"
		types, names := common.KeyArrays(f.SearchKeys)
		where = append(where,
			"(a.identity_name ILIKE "+arg(pattern)+
				" OR a.identity_metadata->>'display_name' ILIKE "+arg(pattern)+
				" OR (a.source_type, a.identity_name) IN (SELECT * FROM unnest("+
				arg(types)+"::text[], "+arg(names)+"::text[])))")
	}
	return where, args
}

func (r *Repository) Page(ctx context.Context, resolved *scope.DataScope, f Filter) ([]common.AlertRow, error) {
	out := []common.AlertRow{}
	if f.Limit < 1 {
		return out, nil
	}
	where, args := filterSQL(f, true)
	arg := func(value any) string {
		args = append(args, value)
		return "$" + strconv.Itoa(len(args))
	}
	q := `SELECT ` + common.AlertColumns + ` FROM ` + resolved.Table("alerts") + ` a`
	if len(where) > 0 {
		q += ` WHERE ` + strings.Join(where, " AND ")
	}
	q += ` ORDER BY a.created_at DESC, a.id DESC LIMIT ` + arg(f.Limit)
	if f.Offset > 0 && f.After == nil {
		q += ` OFFSET ` + arg(f.Offset)
	}
	rows, err := resolved.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "anomaly list", err)
	}
	defer rows.Close()
	for rows.Next() {
		row, scanErr := common.ScanAlert(rows)
		if scanErr != nil {
			return nil, common.WrapMonitoringErr(ctx, "anomaly list", scanErr)
		}
		out = append(out, row)
	}
	return out, common.WrapMonitoringErr(ctx, "anomaly list", rows.Err())
}

func (r *Repository) Count(ctx context.Context, resolved *scope.DataScope, f Filter) (int, error) {
	where, args := filterSQL(f, false)
	q := `SELECT COUNT(*) FROM ` + resolved.Table("alerts") + ` a`
	if len(where) > 0 {
		q += ` WHERE ` + strings.Join(where, " AND ")
	}
	var total int
	if err := resolved.DB.QueryRowContext(ctx, q, args...).Scan(&total); err != nil {
		return 0, common.WrapMonitoringErr(ctx, "anomaly count", err)
	}
	return total, nil
}

// All returns all alerts matching non-pagination filters. It is used only for
// exact collection-wide severity aggregation in bounded ClickHouse batches.
func (r *Repository) All(ctx context.Context, resolved *scope.DataScope, f Filter, limit int) ([]common.AlertRow, error) {
	f.After = nil
	f.Offset = 0
	f.Limit = limit
	return r.Page(ctx, resolved, f)
}
