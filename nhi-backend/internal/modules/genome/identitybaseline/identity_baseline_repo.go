package identitybaseline

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

// Repository reads what the identity baseline panel needs from the
// caller's tenant schema: baselines (current state + profile_json),
// baseline_versions (published history) and daily_stats (baseline-training
// data points). Like the other monitoring repositories every method takes
// the resolved *scope.DataScope: the pool and the schema-qualified table
// names come from it (resolved.Table), never from configuration or
// constants. The monitoring tables are looked up by the normalized keys
// the service passes — identity key first, then the shared workload key.
// Nothing is written.
type Repository struct{}

// NewRepository creates the repository.
func NewRepository() *Repository { return &Repository{} }

// BaselineRow is one baselines row (schema guide §7). Profile is the raw
// profile_json; the service reduces it to safe summaries and never returns
// it as is.
type BaselineRow struct {
	Key           common.MonitoringKey // the key the row is stored under (identity key or shared workload key)
	Status        string
	RequiredDays  int
	BuiltDays     int
	DaysRemaining int
	FirstSeenDate *time.Time // DATE column
	ActiveSince   *time.Time
	UpdatedAt     time.Time
	Profile       []byte
}

// Baseline returns the baselines row of the first key, in the order given,
// that has one; nil, nil when no key has a row.
// Baseline returns the baselines row of the first key, in the order given,
// that has one. It returns nil, nil when none of the supplied keys has a row.
//
// Both active and inactive baseline rows are returned.
func (r *Repository) Baseline(
	ctx context.Context,
	resolved *scope.DataScope,
	keys []common.MonitoringKey,
) (*BaselineRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}

	types, names := common.KeyArrays(
		keys,
	)

	q := `
		WITH requested_keys AS (
			SELECT
				key.source_type,
				key.identity_name,
				key.preference
			FROM unnest(
				$1::text[],
				$2::text[]
			) WITH ORDINALITY AS key(
				source_type,
				identity_name,
				preference
			)
		)
		SELECT
			b.source_type,
			b.identity_name,
			COALESCE(
				b.status,
				''
			),
			COALESCE(
				b.required_days,
				0
			),
			COALESCE(
				b.built_days,
				0
			),
			COALESCE(
				b.days_remaining,
				GREATEST(
					COALESCE(
						b.required_days,
						0
					) -
					COALESCE(
						b.built_days,
						0
					),
					0
				)
			),
			b.first_seen_date,
			b.active_since,
			b.updated_at,
			COALESCE(
				b.profile_json,
				'{}'::jsonb
			)
		FROM ` + resolved.Table("baselines") + ` AS b
		JOIN requested_keys AS key
		  ON key.source_type =
		     b.source_type
		 AND key.identity_name =
		     b.identity_name
		ORDER BY
			key.preference
		LIMIT 1`

	var (
		row BaselineRow

		firstSeen sql.NullTime
		active    sql.NullTime
		updated   sql.NullTime

		profile []byte
	)

	err := resolved.DB.QueryRowContext(
		ctx,
		q,
		types,
		names,
	).Scan(
		&row.Key.SourceType,
		&row.Key.IdentityName,
		&row.Status,
		&row.RequiredDays,
		&row.BuiltDays,
		&row.DaysRemaining,
		&firstSeen,
		&active,
		&updated,
		&profile,
	)

	if errors.Is(
		err,
		sql.ErrNoRows,
	) {
		return nil, nil
	}

	if err != nil {
		return nil, common.WrapMonitoringErr(
			ctx,
			"baseline",
			err,
		)
	}

	if firstSeen.Valid {
		value := firstSeen.Time.UTC()
		row.FirstSeenDate = &value
	}

	if active.Valid {
		value := active.Time.UTC()
		row.ActiveSince = &value
	}

	if updated.Valid {
		row.UpdatedAt =
			updated.Time.UTC()
	}

	row.Profile = profile

	return &row, nil
}

// BaselineVersionRow is one baseline_versions row (schema guide §8).
type BaselineVersionRow struct {
	Key         common.MonitoringKey
	Version     int64
	PublishedAt time.Time
	Profile     []byte // raw profile_json; the service returns safe selected fields only
}

// Versions returns the most recently published versions (newest first, at
// most limit rows) of the first key, in the order given, that has any —
// the key the current baseline is stored under when the caller knows it.
func (r *Repository) Versions(ctx context.Context, resolved *scope.DataScope, keys []common.MonitoringKey, limit int) ([]BaselineVersionRow, error) {
	out := []BaselineVersionRow{}
	if len(keys) == 0 || limit < 1 {
		return out, nil
	}
	types, names := common.KeyArrays(keys)
	q := `SELECT v.source_type, v.identity_name, v.version, v.published_at, v.profile_json
	      FROM ` + resolved.Table("baseline_versions") + ` v` + common.KeyPreferenceJoin("v") + `
	      ORDER BY k.preference, v.published_at DESC, v.version DESC
	      LIMIT $3`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, limit)
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "baseline versions", err)
	}
	defer rows.Close()
	for rows.Next() {
		var v BaselineVersionRow
		if err := rows.Scan(&v.Key.SourceType, &v.Key.IdentityName, &v.Version, &v.PublishedAt, &v.Profile); err != nil {
			return nil, common.WrapMonitoringErr(ctx, "baseline versions", err)
		}
		if len(out) > 0 && v.Key != out[0].Key {
			break // rows of the preferred key are exhausted; ignore the fallback key's history
		}
		v.PublishedAt = v.PublishedAt.UTC()
		out = append(out, v)
	}
	return out, common.WrapMonitoringErr(ctx, "baseline versions", rows.Err())
}

// DataPoints is baseline.data_points: SUM(daily_stats.event_count) over
// the baseline window of the resolved baseline key — its most recent
// `periods` training periods, where periods is the baseline's
// required_days (daily_stats.nhi_type holds the source type). 0 when the
// key has no rows.
func (r *Repository) DataPoints(ctx context.Context, resolved *scope.DataScope, key common.MonitoringKey, periods int) (int64, error) {
	if periods < 1 {
		return 0, nil
	}
	q := `SELECT COALESCE(SUM(w.event_count), 0)
	      FROM (
	          SELECT event_count
	          FROM ` + resolved.Table("daily_stats") + `
	          WHERE nhi_type = $1 AND identity_name = $2
	          ORDER BY period_start DESC
	          LIMIT $3
	      ) w`
	var total int64
	if err := resolved.DB.QueryRowContext(ctx, q, key.SourceType, key.IdentityName, periods).Scan(&total); err != nil {
		return 0, common.WrapMonitoringErr(ctx, "daily stats", err)
	}
	return total, nil
}
