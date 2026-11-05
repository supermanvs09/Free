package identitysummary

import (
	"context"
	"database/sql"
	"fmt"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/platform/scope"
)

// IdentitySummaryRepository reads what
// GET /api/v1/genome/identities/{source_type}/{identity_name} needs from the
// caller's tenant schema (backend_api_contract.md §5.2 / §10.2):
//
//   - baselines  baseline_summary (status, built_days, required_days)
//   - alerts     headline_metrics.open_anomalies
//
// The identity itself comes from DashboardSummaryRepository.LatestIdentities
// (the same latest-snapshot rule as the dashboard). Like that repository,
// every method takes the resolved *scope.DataScope: the pool and the
// schema-qualified table names come from it (resolved.Table), never from
// configuration or constants. Monitoring tables are looked up by the
// normalized keys the service passes — identity key first, then the shared
// workload key (the contract's fallback). Nothing is written.
type IdentitySummaryRepository struct{}

// NewIdentitySummaryRepository creates the repository.
func NewIdentitySummaryRepository() *IdentitySummaryRepository {
	return &IdentitySummaryRepository{}
}

// BaselineSummaryRow is §5.2 baseline_summary (schema guide §7).
type BaselineSummaryRow struct {
	Key          summarycommon.MonitoringKey // key the row is stored under (identity key or shared workload key)
	Status       string
	BuiltDays    int
	RequiredDays int
}

// BaselineSummary returns the baselines row of the first key, in the order
// given, that has one; nil, nil when none has.
func (r *IdentitySummaryRepository) BaselineSummary(ctx context.Context, resolved *scope.DataScope, keys []summarycommon.MonitoringKey) (*BaselineSummaryRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	types, names := summarycommon.KeyArrays(keys)
	q := `SELECT b.source_type, b.identity_name, b.status, b.built_days, b.required_days
	      FROM ` + resolved.Table("baselines") + ` b` + fmt.Sprintf(summarycommon.KeyPreferenceJoinSQL, "b") + `
	      ORDER BY k.preference
	      LIMIT 1`
	var row BaselineSummaryRow
	err := resolved.DB.QueryRowContext(ctx, q, types, names).Scan(&row.Key.SourceType, &row.Key.IdentityName, &row.Status, &row.BuiltDays, &row.RequiredDays)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, summarycommon.WrapMonitoringErr("baseline summary", err)
	}
	return &row, nil
}

// OpenAlertCount is §10.2 open_anomaly_count / §5.2 headline_metrics
// .open_anomalies: COUNT(*) from alerts where the identity matches (any of
// the keys) and status = 'open' — no time window.
func (r *IdentitySummaryRepository) OpenAlertCount(ctx context.Context, resolved *scope.DataScope, keys []summarycommon.MonitoringKey) (int, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	types, names := summarycommon.KeyArrays(keys)
	q := `SELECT COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + summarycommon.KeyJoin("a") + `
	      WHERE lower(a.status) = 'open'`
	var n int
	if err := resolved.DB.QueryRowContext(ctx, q, types, names).Scan(&n); err != nil {
		return 0, summarycommon.WrapMonitoringErr("open alert count", err)
	}
	return n, nil
}

// ---------------------------------------------------------------------------
// ClickHouse log_events (backend_api_contract.md §5.2 / §10.2 headline_metrics)
// ---------------------------------------------------------------------------
