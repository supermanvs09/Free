package identitylist

import (
	"context"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

// Repository reads the per-identity monitoring facts of the identity list
// from the caller's tenant schema: baselines (the list's own rows) and alerts.
// Every method is one grouped query over the whole key set — never one query
// per identity. The discovery rows come from common.FleetWithDiscovery and
// the log_events facts from common.MonitoringEvents.WorkloadFacts.
type Repository struct{}

// NewRepository creates the repository.
func NewRepository() *Repository { return &Repository{} }

// BaselineRow is one row of the pipeline's baselines table. It is the
// primary record of the identity list: every item is one baselines row,
// mapped afterwards to the discovery identities it belongs to.
type BaselineRow = common.BaselineRow

// Baselines returns every baselines row of the caller's accounts, restricted
// to families when it is non-nil.
func (r *Repository) Baselines(ctx context.Context, resolved *scope.DataScope, families []string) ([]BaselineRow, error) {
	return common.Baselines(ctx, resolved, families)
}

// OpenAlertCounts is open_anomaly_count for every key at once: COUNT(*)
// from alerts where status = 'open', in the caller's accounts, grouped by
// identity. Keys without open alerts are absent from the map.
func (r *Repository) OpenAlertCounts(ctx context.Context, resolved *scope.DataScope, keys []common.MonitoringKey) (map[common.MonitoringKey]int, error) {
	out := map[common.MonitoringKey]int{}
	if len(keys) == 0 || len(resolved.AccountIDs) == 0 {
		return out, nil
	}
	types, names := common.KeyArrays(keys)
	q := `SELECT a.source_type, a.identity_name, COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + common.KeyJoin("a") + `
	      WHERE a.status = 'open' AND a.account_id = ANY($3::text[])
	      GROUP BY a.source_type, a.identity_name`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names, pq.Array(resolved.AccountIDs))
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "open alert counts", err)
	}
	defer rows.Close()
	for rows.Next() {
		var k common.MonitoringKey
		var n int
		if err := rows.Scan(&k.SourceType, &k.IdentityName, &n); err != nil {
			return nil, common.WrapMonitoringErr(ctx, "open alert counts", err)
		}
		out[k] = n
	}
	return out, common.WrapMonitoringErr(ctx, "open alert counts", rows.Err())
}
