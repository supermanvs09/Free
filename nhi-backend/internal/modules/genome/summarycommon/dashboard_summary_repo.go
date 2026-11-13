package summarycommon

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/platform/scope"
)

// DashboardSummaryRepository reads what GET /api/v1/dashboard/summary needs
// from the caller's tenant schema (backend_api_contract.md §4.1):
//
//   - identities           discovery rows (read-only)
//   - baselines            + baseline_versions
//   - identity_risk_scores
//   - alerts
//
// Every entry point takes the resolved *scope.DataScope: the pool and the
// schema-qualified table names come from it (resolved.Table), never from
// configuration or constants. Monitoring tables are keyed by the normalized
// (source_type, identity_name) pair, which the service computes from the
// discovery row — so the readers take a list of MonitoringKey values
// instead of joining the raw discovery columns in SQL. Nothing is written.
type DashboardSummaryRepository struct{}

// NewDashboardSummaryRepository creates the repository.
func NewDashboardSummaryRepository() *DashboardSummaryRepository {
	return &DashboardSummaryRepository{}
}

// ---------------------------------------------------------------------------
// identities
// ---------------------------------------------------------------------------

// DiscoveryIdentityRow is one latest discovery snapshot (raw, not normalized).
type DiscoveryIdentityRow struct {
	ID             string
	ARN            string
	Name           string
	IdentityType   string
	AccountID      string
	Region         string
	Status         string
	TypeAttributes []byte
	LastSeenAt     *time.Time
}

// IdentityCredentialRow describes one credential or IAM principal bound to a
// discovery identity.
type IdentityCredentialRow struct {
	IdentityID    string
	BindingType   string
	BindingSource string
	CredentialARN string
	IsPrimary     bool
}

// LatestIdentities returns the latest non-deleted discovery snapshot per
// (identity_type, arn, account_id) inside the scope's accounts/regions —
// the contract's step 1. Unlike the inventory endpoints it is not pinned to
// one scan_id: the monitoring pipeline keys its tables by stable resource,
// not by scan.
func (r *DashboardSummaryRepository) LatestIdentities(ctx context.Context, resolved *scope.DataScope) ([]DiscoveryIdentityRow, error) {
	q := `WITH ranked AS (
	SELECT id::text AS id, arn, name, identity_type, account_id, COALESCE(region, '') AS region, status, type_attributes, last_seen_at,
	       ROW_NUMBER() OVER (PARTITION BY identity_type, arn, account_id
	                          ORDER BY last_seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS row_rank
	FROM ` + resolved.Table("identities") + `
	WHERE deleted_at IS NULL
	  AND account_id = ANY($1::text[])
	  AND COALESCE(region, '') = ANY($2::text[])
)
SELECT id, arn, name, identity_type, account_id, region, status, type_attributes, last_seen_at
FROM ranked WHERE row_rank = 1`
	rows, err := resolved.DB.QueryContext(ctx, q, pq.Array(resolved.AccountIDs), pq.Array(resolved.Regions))
	if err != nil {
		return nil, WrapMonitoringErr("latest identities", err)
	}
	defer rows.Close()
	var out []DiscoveryIdentityRow
	for rows.Next() {
		var row DiscoveryIdentityRow
		var arn, name, typ, account, status sql.NullString
		var attrs []byte
		var lastSeen sql.NullTime
		if err := rows.Scan(&row.ID, &arn, &name, &typ, &account, &row.Region, &status, &attrs, &lastSeen); err != nil {
			return nil, WrapMonitoringErr("latest identities", err)
		}
		row.ARN, row.Name, row.IdentityType, row.AccountID, row.Status = arn.String, name.String, typ.String, account.String, status.String
		row.TypeAttributes = attrs
		if lastSeen.Valid {
			t := lastSeen.Time.UTC()
			row.LastSeenAt = &t
		}
		out = append(out, row)
	}
	return out, WrapMonitoringErr("latest identities", rows.Err())
}

// IdentityCredentials returns credential bindings grouped by discovery
// identity ID.
//
// The query is intentionally batched to avoid one PostgreSQL query per
// identity. The dashboard can use the returned bindings to expand one ECS
// discovery row into separate task-role and execution-role principals.
func (r *DashboardSummaryRepository) IdentityCredentials(
	ctx context.Context,
	resolved *scope.DataScope,
	identityIDs []string,
) (
	map[string][]IdentityCredentialRow,
	error,
) {
	out := make(
		map[string][]IdentityCredentialRow,
	)

	if len(identityIDs) == 0 {
		return out, nil
	}

	query := `
		SELECT
			c.identity_id::text,
			COALESCE(c.binding_type, ''),
			COALESCE(c.binding_source, ''),
			COALESCE(c.credential_arn, ''),
			COALESCE(c.is_primary, false)
		FROM ` + resolved.Table("identity_credentials") + ` AS c
		WHERE c.identity_id::text = ANY($1::text[])
		  AND NULLIF(TRIM(c.credential_arn), '') IS NOT NULL
		  AND c.binding_type IN (
    'instance_profile',
    'task_role',
    'execution_role',
    'function_role',
    'service_role',
    'target_role',
    'invocation_role',
    'pipe_role',
    'scheduler_role',
    'automation_role',
    'action_role',
    'job_role',
    'instance_role',
    'compute_role',
    'access_key',
    'roles_anywhere'
)
		ORDER BY
			c.identity_id,
			c.is_primary DESC,
			c.binding_type,
			c.credential_arn`

	rows, err := resolved.DB.QueryContext(
		ctx,
		query,
		pq.Array(identityIDs),
	)
	if err != nil {
		return nil, WrapMonitoringErr(
			"identity credentials",
			err,
		)
	}
	defer rows.Close()

	for rows.Next() {
		var row IdentityCredentialRow

		if err := rows.Scan(
			&row.IdentityID,
			&row.BindingType,
			&row.BindingSource,
			&row.CredentialARN,
			&row.IsPrimary,
		); err != nil {
			return nil, WrapMonitoringErr(
				"identity credentials",
				err,
			)
		}

		row.IdentityID = strings.TrimSpace(
			row.IdentityID,
		)

		row.BindingType = strings.ToLower(
			strings.TrimSpace(row.BindingType),
		)

		row.BindingSource = strings.TrimSpace(
			row.BindingSource,
		)

		row.CredentialARN = strings.TrimSpace(
			row.CredentialARN,
		)

		if row.IdentityID == "" ||
			row.CredentialARN == "" {
			continue
		}

		out[row.IdentityID] = append(
			out[row.IdentityID],
			row,
		)
	}

	if err := rows.Err(); err != nil {
		return nil, WrapMonitoringErr(
			"identity credentials",
			err,
		)
	}

	return out, nil
}

// ---------------------------------------------------------------------------
// baselines / baseline_versions
// ---------------------------------------------------------------------------

// BaselineStateRow is the baseline state of one key.
type BaselineStateRow struct {
	Key           MonitoringKey
	Status        string // active | inactive
	DaysRemaining int
	ActiveSince   *time.Time
}

// ScopedBaselineStates returns every baseline row in the selected tenant
// account and source-type scope. Dashboard population is derived from these
// rows; discovery identities are used only for optional display enrichment.
func (r *DashboardSummaryRepository) ScopedBaselineStates(
	ctx context.Context,
	resolved *scope.DataScope,
	sourceType string,
	accountID string,
) ([]BaselineStateRow, error) {
	out := []BaselineStateRow{}
	accountIDs := resolved.AccountIDs
	if strings.TrimSpace(accountID) != "" {
		accountIDs = []string{strings.TrimSpace(accountID)}
	}
	if len(accountIDs) == 0 {
		return out, nil
	}
	query := `SELECT b.source_type, b.identity_name, b.status,
	                 b.days_remaining, b.active_since
	          FROM ` + resolved.Table("baselines") + ` b
	          WHERE b.account_id = ANY($1::text[])`
	args := []any{pq.Array(accountIDs)}
	if strings.TrimSpace(sourceType) != "" {
		query += ` AND b.source_type = $2`
		args = append(args, strings.ToUpper(strings.TrimSpace(sourceType)))
	}
	rows, err := resolved.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, WrapMonitoringErr("scoped baselines", err)
	}
	defer rows.Close()
	for rows.Next() {
		var row BaselineStateRow
		var active sql.NullTime
		if err := rows.Scan(
			&row.Key.SourceType,
			&row.Key.IdentityName,
			&row.Status,
			&row.DaysRemaining,
			&active,
		); err != nil {
			return nil, WrapMonitoringErr("scoped baselines", err)
		}
		row.Key.SourceType = strings.ToUpper(strings.TrimSpace(row.Key.SourceType))
		row.Key.IdentityName = strings.TrimSpace(row.Key.IdentityName)
		row.Status = strings.ToLower(strings.TrimSpace(row.Status))
		if active.Valid {
			value := active.Time.UTC()
			row.ActiveSince = &value
		}
		out = append(out, row)
	}
	return out, WrapMonitoringErr("scoped baselines", rows.Err())
}

// BaselineStates loads the baseline state for every key that has one.
func (r *DashboardSummaryRepository) BaselineStates(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey) (map[MonitoringKey]BaselineStateRow, error) {
	out := map[MonitoringKey]BaselineStateRow{}
	if len(keys) == 0 {
		return out, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT b.source_type, b.identity_name, b.status, b.days_remaining, b.active_since
	      FROM ` + resolved.Table("baselines") + ` b` + KeyJoin("b")
	rows, err := resolved.DB.QueryContext(ctx, q, types, names)
	if err != nil {
		return nil, WrapMonitoringErr("baselines", err)
	}
	defer rows.Close()
	for rows.Next() {
		var row BaselineStateRow
		var active sql.NullTime
		if err := rows.Scan(&row.Key.SourceType, &row.Key.IdentityName, &row.Status, &row.DaysRemaining, &active); err != nil {
			return nil, WrapMonitoringErr("baselines", err)
		}
		if active.Valid {
			t := active.Time.UTC()
			row.ActiveSince = &t
		}
		out[row.Key] = row
	}
	return out, WrapMonitoringErr("baselines", rows.Err())
}

// BaselineEventRow is one row of the recently-baselined feed.
type BaselineEventRow struct {
	Key        MonitoringKey
	Event      string // baseline_established | baseline_version_published
	OccurredAt time.Time
	Version    *int64
}

// RecentlyBaselined merges baselines.active_since and
// baseline_versions.published_at, newest first.
func (r *DashboardSummaryRepository) RecentlyBaselined(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey, limit int) ([]BaselineEventRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT * FROM (
	        SELECT b.source_type, b.identity_name, 'baseline_established' AS event, b.active_since AS occurred_at, NULL::bigint AS version
	        FROM ` + resolved.Table("baselines") + ` b` + KeyJoin("b") + ` WHERE b.active_since IS NOT NULL
	        UNION ALL
	        SELECT v.source_type, v.identity_name, 'baseline_version_published', v.published_at, v.version
	        FROM ` + resolved.Table("baseline_versions") + ` v` + KeyJoin("v") + `
	      ) e ORDER BY occurred_at DESC LIMIT $3`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, limit)
	if err != nil {
		return nil, WrapMonitoringErr("recently baselined", err)
	}
	defer rows.Close()
	var out []BaselineEventRow
	for rows.Next() {
		var row BaselineEventRow
		var v sql.NullInt64
		if err := rows.Scan(&row.Key.SourceType, &row.Key.IdentityName, &row.Event, &row.OccurredAt, &v); err != nil {
			return nil, WrapMonitoringErr("recently baselined", err)
		}
		row.OccurredAt = row.OccurredAt.UTC()
		if v.Valid {
			n := v.Int64
			row.Version = &n
		}
		out = append(out, row)
	}
	return out, WrapMonitoringErr("recently baselined", rows.Err())
}

// ---------------------------------------------------------------------------
// identity_risk_scores
// ---------------------------------------------------------------------------

// IdentityRiskRow is the latest identity_risk_scores row for one key.
type IdentityRiskRow struct {
	Key                 MonitoringKey
	RiskScore           *int // NULL until the pipeline scores the identity
	Severity            string
	ScoreStatus         string
	EventCount          int
	AnomalousEventCount int
	WindowStart         time.Time
	WindowEnd           time.Time
	ComputedAt          time.Time
}

// LatestRiskScores returns the newest completed risk snapshot per key
// (contract §4.1 "Most anomalous identities").
func (r *DashboardSummaryRepository) LatestRiskScores(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey) (map[MonitoringKey]IdentityRiskRow, error) {
	out := map[MonitoringKey]IdentityRiskRow{}
	if len(keys) == 0 {
		return out, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT DISTINCT ON (s.source_type, s.identity_name)
	             s.source_type, s.identity_name, s.risk_score, s.severity, s.score_status,
	             s.event_count, s.anomalous_event_count, s.window_start, s.window_end, s.computed_at
	      FROM ` + resolved.Table("identity_risk_scores") + ` s` + KeyJoin("s") + `
	      WHERE s.window_end <= now()
	      ORDER BY s.source_type, s.identity_name, s.window_end DESC, s.computed_at DESC`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names)
	if err != nil {
		return nil, WrapMonitoringErr("identity risk scores", err)
	}
	defer rows.Close()
	for rows.Next() {
		var row IdentityRiskRow
		var score sql.NullInt64
		if err := rows.Scan(&row.Key.SourceType, &row.Key.IdentityName, &score, &row.Severity, &row.ScoreStatus,
			&row.EventCount, &row.AnomalousEventCount, &row.WindowStart, &row.WindowEnd, &row.ComputedAt); err != nil {
			return nil, WrapMonitoringErr("identity risk scores", err)
		}
		if score.Valid {
			n := int(score.Int64)
			row.RiskScore = &n
		}
		out[row.Key] = row
	}
	return out, WrapMonitoringErr("identity risk scores", rows.Err())
}

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

// CountOpenAlerts is cards.open_anomalies (§10.1): COUNT(*) from alerts
// where status = 'open' and created_at is in [from, to), for the keys.
func (r *DashboardSummaryRepository) CountOpenAlerts(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey, from, to time.Time) (int, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE lower(a.status) = 'open' AND a.created_at >= $3 AND a.created_at < $4`
	var n int
	if err := resolved.DB.QueryRowContext(ctx, q, types, names, from, to).Scan(&n); err != nil {
		return 0, WrapMonitoringErr("count open alerts", err)
	}
	return n, nil
}

// OpenAlertEventIDs is the event_id of every open alert, with the same rule
// the Anomalies page lists them by (any age, enabled workload families), so
// the critical card and that page count the same alerts.
func (r *DashboardSummaryRepository) OpenAlertEventIDs(ctx context.Context, resolved *scope.DataScope) ([]string, error) {
	q := `SELECT DISTINCT a.event_id FROM ` + resolved.Table("alerts") + ` a
	      WHERE lower(a.status) = 'open' AND COALESCE(a.event_id, '') <> ''`
	args := []any{}
	if families, all := workloadtypes.Enabled(); !all {
		q += ` AND a.source_type = ANY($1::text[])`
		args = append(args, pq.Array(families))
	}
	rows, err := resolved.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, WrapMonitoringErr("open alert events", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, WrapMonitoringErr("open alert events", err)
		}
		out = append(out, id)
	}
	return out, WrapMonitoringErr("open alert events", rows.Err())
}

// DimensionCountRow is one GROUP BY dimension row.
type DimensionCountRow struct {
	Dimension string
	Count     int
}

// OpenAlertsByDimension counts open alerts per stored alerts.dimension in
// [from, to) — the contract's departures query, restricted to the keys.
func (r *DashboardSummaryRepository) OpenAlertsByDimension(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey, from, to time.Time) ([]DimensionCountRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT a.dimension, COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE a.status = 'open' AND a.created_at >= $3 AND a.created_at < $4
	      GROUP BY a.dimension ORDER BY COUNT(*) DESC, a.dimension`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, from, to)
	if err != nil {
		return nil, WrapMonitoringErr("open alerts by dimension", err)
	}
	defer rows.Close()
	var out []DimensionCountRow
	for rows.Next() {
		var row DimensionCountRow
		if err := rows.Scan(&row.Dimension, &row.Count); err != nil {
			return nil, WrapMonitoringErr("open alerts by dimension", err)
		}
		out = append(out, row)
	}
	return out, WrapMonitoringErr("open alerts by dimension", rows.Err())
}

// DayCountRow is one alerts-per-UTC-day row.
type DayCountRow struct {
	Day   time.Time
	Count int
}

// AlertsByDay counts alerts (all statuses) created per UTC day in [from, to).
func (r *DashboardSummaryRepository) AlertsByDay(ctx context.Context, resolved *scope.DataScope, keys []MonitoringKey, from, to time.Time) ([]DayCountRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT date_trunc('day', a.created_at AT TIME ZONE 'UTC') AS day, COUNT(*)
	      FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE a.created_at >= $3 AND a.created_at < $4
	      GROUP BY 1 ORDER BY 1`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, from, to)
	if err != nil {
		return nil, WrapMonitoringErr("alerts by day", err)
	}
	defer rows.Close()
	var out []DayCountRow
	for rows.Next() {
		var row DayCountRow
		if err := rows.Scan(&row.Day, &row.Count); err != nil {
			return nil, WrapMonitoringErr("alerts by day", err)
		}
		row.Day = time.Date(row.Day.Year(), row.Day.Month(), row.Day.Day(), 0, 0, 0, 0, time.UTC)
		out = append(out, row)
	}
	return out, WrapMonitoringErr("alerts by day", rows.Err())
}
