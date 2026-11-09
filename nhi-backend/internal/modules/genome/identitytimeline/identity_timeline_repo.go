package identitytimeline

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/scope"
)

// IdentityTimelineRepository reads the rows behind
// GET /api/v1/identities/{source_type}/{identity_name}/timeline
// (backend_api_contract.md §5.6 / §10.3) from the caller's tenant schema.
// The timeline is derived from current tables — alerts, baseline_versions
// and baselines — because the pipeline keeps no immutable event history
// (§5.6 SCHEMA GAP). Read-only.
type IdentityTimelineRepository struct{}

// NewIdentityTimelineRepository creates the repository.
func NewIdentityTimelineRepository() *IdentityTimelineRepository {
	return &IdentityTimelineRepository{}
}

// TimelineAlertRow is one alerts row of the identity (the "anomaly" item).
type TimelineDimensionRow struct {
	Dimension        string
	AlertCount       int64
	OpenCount        int64
	LatestOccurredAt time.Time
	LatestAlertID    int64
	LatestReason     string
}

// Alerts returns every alert stored under the keys (identity key and shared
// workload key), newest first (alerts_identity_created_idx order).
func (r *IdentityTimelineRepository) AlertDimensions(
	ctx context.Context,
	resolved *scope.DataScope,
	keys []summarycommon.MonitoringKey,
) ([]TimelineDimensionRow, error) {
	output := []TimelineDimensionRow{}

	if len(keys) == 0 {
		return output, nil
	}

	sourceTypes, identityNames :=
		summarycommon.KeyArrays(keys)

	query := `
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
		),
		matching_alerts AS (
			SELECT
				alert.id,
				alert.dimension,
				alert.reason,
				alert.status,
				alert.created_at
			FROM ` + resolved.Table("alerts") + ` AS alert
			JOIN requested_keys AS requested
			  ON requested.source_type =
			     alert.source_type
			 AND requested.identity_name =
			     alert.identity_name
		),
		dimension_totals AS (
			SELECT
				dimension,
				COUNT(*)::bigint AS alert_count,
				COUNT(*) FILTER (
					WHERE LOWER(
						TRIM(status)
					) = 'open'
				)::bigint AS open_count,
				MAX(created_at) AS latest_occurred_at
			FROM matching_alerts
			GROUP BY dimension
		),
		latest_alert AS (
			SELECT DISTINCT ON (dimension)
				dimension,
				id,
				reason,
				created_at
			FROM matching_alerts
			ORDER BY
				dimension,
				created_at DESC,
				id DESC
		)
		SELECT
			totals.dimension,
			totals.alert_count,
			totals.open_count,
			totals.latest_occurred_at,
			latest.id,
			COALESCE(latest.reason, '')
		FROM dimension_totals AS totals
		JOIN latest_alert AS latest
		  ON latest.dimension = totals.dimension
		ORDER BY
			totals.latest_occurred_at DESC,
			totals.dimension ASC`

	rows, err := resolved.DB.QueryContext(
		ctx,
		query,
		sourceTypes,
		identityNames,
	)
	if err != nil {
		return nil, summarycommon.WrapMonitoringErr(
			"timeline alert dimensions",
			err,
		)
	}
	defer rows.Close()

	for rows.Next() {
		var row TimelineDimensionRow

		if err := rows.Scan(
			&row.Dimension,
			&row.AlertCount,
			&row.OpenCount,
			&row.LatestOccurredAt,
			&row.LatestAlertID,
			&row.LatestReason,
		); err != nil {
			return nil,
				summarycommon.WrapMonitoringErr(
					"timeline alert dimension scan",
					err,
				)
		}

		row.LatestOccurredAt =
			row.LatestOccurredAt.UTC()

		output = append(output, row)
	}

	if err := rows.Err(); err != nil {
		return nil, summarycommon.WrapMonitoringErr(
			"timeline alert dimensions",
			err,
		)
	}

	return output, nil
}

// BaselineMilestoneRow carries the two lifecycle timestamps of a baselines
// row: first_seen_date (learning started) and active_since (established).
type BaselineMilestoneRow struct {
	Key           summarycommon.MonitoringKey // the key the row is stored under (identity key or shared workload key)
	FirstSeenDate *time.Time                  // DATE column, midnight UTC
	ActiveSince   *time.Time
}

// BaselineMilestones returns the baselines row of the identity, preferring
// the identity key over the shared workload key; nil when there is none.
func (r *IdentityTimelineRepository) BaselineMilestones(ctx context.Context, resolved *scope.DataScope, keys []summarycommon.MonitoringKey) (*BaselineMilestoneRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	types, names := summarycommon.KeyArrays(keys)
	q := `SELECT b.source_type, b.identity_name, b.first_seen_date, b.active_since
	      FROM ` + resolved.Table("baselines") + ` b` + fmt.Sprintf(summarycommon.KeyPreferenceJoinSQL, "b") + `
	      ORDER BY k.preference
	      LIMIT 1`
	var (
		row       BaselineMilestoneRow
		firstSeen sql.NullTime
		active    sql.NullTime
	)
	err := resolved.DB.QueryRowContext(ctx, q, types, names).Scan(&row.Key.SourceType, &row.Key.IdentityName, &firstSeen, &active)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, summarycommon.WrapMonitoringErr("baseline milestones", err)
	}
	if firstSeen.Valid {
		d := firstSeen.Time
		t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		row.FirstSeenDate = &t
	}
	if active.Valid {
		t := active.Time.UTC()
		row.ActiveSince = &t
	}
	return &row, nil
}

// PublishedVersionRow is one baseline_versions row (version, published_at).
type PublishedVersionRow struct {
	Key         summarycommon.MonitoringKey
	Version     int64
	PublishedAt time.Time
}

// PublishedVersions returns the version history stored under key, newest
// first (baseline_versions_identity_published_idx order).
func (r *IdentityTimelineRepository) PublishedVersions(ctx context.Context, resolved *scope.DataScope, key summarycommon.MonitoringKey) ([]PublishedVersionRow, error) {
	q := `SELECT v.source_type, v.identity_name, v.version, v.published_at
	      FROM ` + resolved.Table("baseline_versions") + ` v
	      WHERE v.source_type = $1 AND v.identity_name = $2
	      ORDER BY v.published_at DESC, v.version DESC`
	rows, err := resolved.DB.QueryContext(ctx, q, key.SourceType, key.IdentityName)
	if err != nil {
		return nil, summarycommon.WrapMonitoringErr("published baseline versions", err)
	}
	defer rows.Close()
	out := []PublishedVersionRow{}
	for rows.Next() {
		var v PublishedVersionRow
		if err := rows.Scan(&v.Key.SourceType, &v.Key.IdentityName, &v.Version, &v.PublishedAt); err != nil {
			return nil, summarycommon.WrapMonitoringErr("published baseline versions", err)
		}
		v.PublishedAt = v.PublishedAt.UTC()
		out = append(out, v)
	}
	return out, summarycommon.WrapMonitoringErr("published baseline versions", rows.Err())
}
