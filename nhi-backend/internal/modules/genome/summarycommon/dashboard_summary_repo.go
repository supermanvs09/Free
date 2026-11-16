package summarycommon

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/genome/workloadtypes"
	chclient "nhi-backend-api/internal/platform/clickhouse"
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
// configuration or constants. The genome identities are the baselines rows
// (Baselines); the other monitoring tables are read for a list of
// MonitoringKey values — baselines / baseline_versions by the baseline key,
// alerts / identity_risk_scores by the event identity names of the workload —
// always restricted to the caller's accounts. Nothing is written.
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

// BaselineIdentity is one baselines row: one identity NHI Genome watches.
// Key.IdentityName is the pipeline's baseline key, which is the workload_key
// of the identity's log_events rows (see chclient.IdentityEquals).
type BaselineIdentity struct {
	AccountID     string
	Key           MonitoringKey
	Status        string // active | inactive
	BuiltDays     int
	RequiredDays  int
	DaysRemaining int
	FirstSeenDate *time.Time // DATE column, midnight UTC
	ActiveSince   *time.Time
	UpdatedAt     *time.Time
}

// BaselineFilter narrows Baselines. Empty fields do not filter; a nil
// Families means every family.
type BaselineFilter struct {
	SourceType   string
	IdentityName string
	Families     []string
}

// Baselines returns the baselines rows of the caller's accounts, most
// recently updated first.
func (r *DashboardSummaryRepository) Baselines(ctx context.Context, resolved *scope.DataScope, f BaselineFilter) ([]BaselineIdentity, error) {
	out := []BaselineIdentity{}
	if len(resolved.AccountIDs) == 0 {
		return out, nil
	}
	q := `SELECT b.account_id, b.source_type, b.identity_name, b.status, b.built_days, b.required_days,
	             b.days_remaining, b.first_seen_date, b.active_since, b.updated_at
	      FROM ` + resolved.Table("baselines") + ` b
	      WHERE b.account_id = ANY($1::text[])`
	args := []any{pq.Array(resolved.AccountIDs)}
	if f.SourceType != "" {
		args = append(args, f.SourceType)
		q += fmt.Sprintf(` AND b.source_type = $%d`, len(args))
	}
	if f.IdentityName != "" {
		args = append(args, f.IdentityName)
		q += fmt.Sprintf(` AND b.identity_name = $%d`, len(args))
	}
	if f.Families != nil {
		args = append(args, pq.Array(f.Families))
		q += fmt.Sprintf(` AND b.source_type = ANY($%d::text[])`, len(args))
	}
	q += ` ORDER BY b.updated_at DESC NULLS LAST, b.account_id, b.source_type, b.identity_name`
	rows, err := resolved.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, WrapMonitoringErr("baselines", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			row                        BaselineIdentity
			firstSeen, active, updated sql.NullTime
		)
		if err := rows.Scan(&row.AccountID, &row.Key.SourceType, &row.Key.IdentityName, &row.Status,
			&row.BuiltDays, &row.RequiredDays, &row.DaysRemaining, &firstSeen, &active, &updated); err != nil {
			return nil, WrapMonitoringErr("baselines", err)
		}
		if firstSeen.Valid {
			d := firstSeen.Time
			t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
			row.FirstSeenDate = &t
		}
		row.ActiveSince, row.UpdatedAt = utcTime(active), utcTime(updated)
		out = append(out, row)
	}
	return out, WrapMonitoringErr("baselines", rows.Err())
}

func utcTime(v sql.NullTime) *time.Time {
	if !v.Valid {
		return nil
	}
	t := v.Time.UTC()
	return &t
}

// BaselineEventKeys are the names a baseline's log_events rows can carry
// (as workload_key or identity_name), the baseline key first: the key
// itself, the resource ARN a serverless key names (workloadtypes.ServerlessARN,
// in partition) and extra names (the ARNs of the identity's discovery
// resources), unique.
func BaselineEventKeys(key MonitoringKey, partition string, extra ...string) []MonitoringKey {
	out := []MonitoringKey{key}
	seen := map[MonitoringKey]struct{}{key: {}}
	add := func(name string) {
		k := MonitoringKey{SourceType: key.SourceType, IdentityName: name}
		if _, dup := seen[k]; dup || name == "" {
			return
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	if arn, ok := workloadtypes.ServerlessARN(key.SourceType, key.IdentityName, partition); ok {
		add(arn)
	}
	for _, name := range extra {
		add(name)
	}
	return out
}

// MergedFacts combines the log_events facts of a baseline's event keys
// (BaselineEventKeys): the labels of the first key that has events, the
// latest last_seen and every event identity name. ok is false when no key
// has events.
func MergedFacts(eventKeys []MonitoringKey, facts map[MonitoringKey]chclient.WorkloadFacts) (chclient.WorkloadFacts, bool) {
	var (
		out   chclient.WorkloadFacts
		found bool
	)
	seen := map[string]struct{}{}
	for _, k := range eventKeys {
		f, ok := facts[k]
		if !ok {
			continue
		}
		if !found {
			out = f
			out.IdentityNames = nil
			found = true
		} else if f.LastSeen != nil && (out.LastSeen == nil || f.LastSeen.After(*out.LastSeen)) {
			out.LastSeen = f.LastSeen
		}
		for _, name := range f.IdentityNames {
			if _, dup := seen[name]; !dup {
				seen[name] = struct{}{}
				out.IdentityNames = append(out.IdentityNames, name)
			}
		}
	}
	return out, found
}

// BaselineAlertKeys are the keys the alerts and identity_risk_scores rows of
// a baseline are stored under: its event keys (BaselineEventKeys, baseline
// key first), the event identity names log_events recorded under them
// (facts, when it could be read) and, for ECS, the event name derived from
// the baseline key (the fallback while log_events cannot be read).
func BaselineAlertKeys(eventKeys []MonitoringKey, facts map[MonitoringKey]chclient.WorkloadFacts) []MonitoringKey {
	if len(eventKeys) == 0 {
		return nil
	}
	sourceType := eventKeys[0].SourceType
	out := make([]MonitoringKey, 0, len(eventKeys))
	seen := map[MonitoringKey]struct{}{}
	add := func(name string) {
		k := MonitoringKey{SourceType: sourceType, IdentityName: name}
		if _, dup := seen[k]; dup || name == "" {
			return
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	for _, k := range eventKeys {
		add(k.IdentityName)
	}
	if merged, ok := MergedFacts(eventKeys, facts); ok {
		for _, name := range merged.IdentityNames {
			add(name)
		}
	}
	if sourceType == "ECS" {
		if name, ok := workloadtypes.ECSAlertName(eventKeys[0].IdentityName); ok {
			add(name)
		}
	}
	return out
}

// BaselineEventRow is one row of the recently-baselined feed.
type BaselineEventRow struct {
	AccountID  string
	Key        MonitoringKey
	Event      string // baseline_established | baseline_version_published
	OccurredAt time.Time
	Version    *int64
}

// RecentlyBaselined merges baselines.active_since and
// baseline_versions.published_at, newest first.
func (r *DashboardSummaryRepository) RecentlyBaselined(ctx context.Context, resolved *scope.DataScope, accounts []string, keys []MonitoringKey, limit int) ([]BaselineEventRow, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT * FROM (
	        SELECT b.account_id, b.source_type, b.identity_name, 'baseline_established' AS event, b.active_since AS occurred_at, NULL::bigint AS version
	        FROM ` + resolved.Table("baselines") + ` b` + KeyJoin("b") + ` WHERE b.active_since IS NOT NULL AND b.account_id = ANY($4::text[])
	        UNION ALL
	        SELECT v.account_id, v.source_type, v.identity_name, 'baseline_version_published', v.published_at, v.version
	        FROM ` + resolved.Table("baseline_versions") + ` v` + KeyJoin("v") + ` WHERE v.account_id = ANY($4::text[])
	      ) e ORDER BY occurred_at DESC LIMIT $3`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, limit, pq.Array(accounts))
	if err != nil {
		return nil, WrapMonitoringErr("recently baselined", err)
	}
	defer rows.Close()
	var out []BaselineEventRow
	for rows.Next() {
		var row BaselineEventRow
		var v sql.NullInt64
		if err := rows.Scan(&row.AccountID, &row.Key.SourceType, &row.Key.IdentityName, &row.Event, &row.OccurredAt, &v); err != nil {
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
func (r *DashboardSummaryRepository) LatestRiskScores(ctx context.Context, resolved *scope.DataScope, accounts []string, keys []MonitoringKey) (map[MonitoringKey]IdentityRiskRow, error) {
	out := map[MonitoringKey]IdentityRiskRow{}
	if len(keys) == 0 || len(accounts) == 0 {
		return out, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT DISTINCT ON (s.source_type, s.identity_name)
	             s.source_type, s.identity_name, s.risk_score, s.severity, s.score_status,
	             s.event_count, s.anomalous_event_count, s.window_start, s.window_end, s.computed_at
	      FROM ` + resolved.Table("identity_risk_scores") + ` s` + KeyJoin("s") + `
	      WHERE s.window_end <= now() AND s.account_id = ANY($3::text[])
	      ORDER BY s.source_type, s.identity_name, s.window_end DESC, s.computed_at DESC`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, pq.Array(accounts))
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
func (r *DashboardSummaryRepository) CountOpenAlerts(ctx context.Context, resolved *scope.DataScope, accounts []string, keys []MonitoringKey, from, to time.Time) (int, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return 0, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE a.status = 'open' AND a.created_at >= $3 AND a.created_at < $4 AND a.account_id = ANY($5::text[])`
	var n int
	if err := resolved.DB.QueryRowContext(ctx, q, types, names, from, to, pq.Array(accounts)).Scan(&n); err != nil {
		return 0, WrapMonitoringErr("count open alerts", err)
	}
	return n, nil
}

// DimensionCountRow is one GROUP BY dimension row.
type DimensionCountRow struct {
	Dimension string
	Count     int
}

// OpenAlertsByDimension counts open alerts per stored alerts.dimension in
// [from, to) — the contract's departures query, restricted to the keys.
func (r *DashboardSummaryRepository) OpenAlertsByDimension(ctx context.Context, resolved *scope.DataScope, accounts []string, keys []MonitoringKey, from, to time.Time) ([]DimensionCountRow, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT a.dimension, COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE a.status = 'open' AND a.created_at >= $3 AND a.created_at < $4 AND a.account_id = ANY($5::text[])
	      GROUP BY a.dimension ORDER BY COUNT(*) DESC, a.dimension`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, from, to, pq.Array(accounts))
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
func (r *DashboardSummaryRepository) AlertsByDay(ctx context.Context, resolved *scope.DataScope, accounts []string, keys []MonitoringKey, from, to time.Time) ([]DayCountRow, error) {
	if len(keys) == 0 || len(accounts) == 0 {
		return nil, nil
	}
	types, names := KeyArrays(keys)
	q := `SELECT date_trunc('day', a.created_at AT TIME ZONE 'UTC') AS day, COUNT(*)
	      FROM ` + resolved.Table("alerts") + ` a` + KeyJoin("a") + `
	      WHERE a.created_at >= $3 AND a.created_at < $4 AND a.account_id = ANY($5::text[])
	      GROUP BY 1 ORDER BY 1`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, from, to, pq.Array(accounts))
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
