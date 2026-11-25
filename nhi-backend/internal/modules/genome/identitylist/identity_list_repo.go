package identitylist

import (
	"context"
	"strings"

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

// ECSInventoryLookup is one ClickHouse ECS task observation.
type ECSInventoryLookup struct {
	TaskID    string
	AccountID string
	Region    string
}

// ECSInventoryMapping is the live ECS task row resolved through
// ecs_task_registry.task_arn -> identities.arn.
type ECSInventoryMapping struct {
	TaskID   string
	Identity common.DiscoveryIdentityRow
}

// ResolveECSInventory resolves ClickHouse task_id -> ecs_task_registry.task_arn
// -> identities.arn. role_type and role_arn remain ClickHouse facts and are not
// verified through identity_credentials.
func (r *Repository) ResolveECSInventory(
	ctx context.Context,
	resolved *scope.DataScope,
	lookups []ECSInventoryLookup,
) (map[string]ECSInventoryMapping, error) {
	out := make(map[string]ECSInventoryMapping, len(lookups))
	for _, lookup := range lookups {
		taskID := strings.TrimSpace(lookup.TaskID)
		accountID := strings.TrimSpace(lookup.AccountID)
		region := strings.TrimSpace(lookup.Region)
		if taskID == "" || accountID == "" {
			continue
		}
		q := `SELECT i.id::text, i.arn, COALESCE(i.name, ''),
		             COALESCE(i.identity_type, ''), i.account_id,
		             COALESCE(i.region, ''), COALESCE(i.status, ''),
		             i.type_attributes, i.last_seen_at
		      FROM ` + resolved.Table("ecs_task_registry") + ` r
		      JOIN ` + resolved.Table("identities") + ` i
		        ON i.arn = r.task_arn
		       AND i.account_id = r.account_id
		       AND i.deleted_at IS NULL
		      WHERE r.task_id = $1
		        AND r.account_id = $2
		        AND ($3 = '' OR r.region = $3)
		        AND r.task_arn IS NOT NULL
		        AND BTRIM(r.task_arn) <> ''
		      ORDER BY i.last_seen_at DESC NULLS LAST,
		               i.updated_at DESC NULLS LAST,
		               i.id DESC
		      LIMIT 2`
		rows, err := resolved.DB.QueryContext(ctx, q, taskID, accountID, region)
		if err != nil {
			return nil, common.WrapMonitoringErr(ctx, "resolve ECS inventory", err)
		}
		matches := make([]common.DiscoveryIdentityRow, 0, 2)
		for rows.Next() {
			var row common.DiscoveryIdentityRow
			if err := rows.Scan(&row.ID, &row.ARN, &row.Name, &row.IdentityType,
				&row.AccountID, &row.Region, &row.Status, &row.TypeAttributes,
				&row.LastSeenAt); err != nil {
				rows.Close()
				return nil, common.WrapMonitoringErr(ctx, "resolve ECS inventory", err)
			}
			matches = append(matches, row)
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			return nil, common.WrapMonitoringErr(ctx, "resolve ECS inventory", rowsErr)
		}
		if len(matches) != 1 {
			continue
		}
		mapping := ECSInventoryMapping{TaskID: taskID, Identity: matches[0]}
		out[ecsTaskLookupKey(mapping.Identity.AccountID, mapping.Identity.Region, mapping.TaskID)] = mapping
	}
	return out, nil
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
