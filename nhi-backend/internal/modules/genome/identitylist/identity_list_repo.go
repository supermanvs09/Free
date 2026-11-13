package identitylist

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

// Repository reads the per-identity monitoring facts of the identity list
// from the caller's tenant schema: baselines (the list's own rows) and alerts. Every method is
// one grouped query over the whole key set — never one query per identity.
// The discovery rows themselves come from common.LatestIdentities and are
// normalized in the service; LastSeenByIdentity (ClickHouse) is called
// directly off common.MonitoringEvents.
type Repository struct{}

// NewRepository creates the repository.
func NewRepository() *Repository { return &Repository{} }

// BaselineRow is one row of the pipeline's baselines table. It is the
// primary record of the identity list: every item is one baselines row,
// mapped afterwards to the discovery identities it belongs to.
type BaselineRow struct {
	AccountID     string
	Key           common.MonitoringKey // (source_type, identity_name) as the pipeline stores it
	Status        string
	BuiltDays     int
	RequiredDays  int
	DaysRemaining int
	FirstSeenDate *time.Time // DATE column
	ActiveSince   *time.Time
	UpdatedAt     *time.Time
}

// Baselines returns every baselines row of the caller's accounts, restricted
// to families when it is non-nil. Rows without an account (legacy rows the
// pipeline could not attribute) are never returned.
func (r *Repository) Baselines(ctx context.Context, resolved *scope.DataScope, families []string) ([]BaselineRow, error) {
	out := []BaselineRow{}
	if len(resolved.AccountIDs) == 0 {
		return out, nil
	}
	q := `SELECT b.account_id, b.source_type, b.identity_name, b.status, b.built_days, b.required_days,
	             b.days_remaining, b.first_seen_date, b.active_since, b.updated_at
	      FROM ` + resolved.Table("baselines") + ` AS b
	      WHERE b.account_id = ANY($1::text[])`
	args := []any{pq.Array(resolved.AccountIDs)}
	if families != nil {
		q += ` AND b.source_type = ANY($2::text[])`
		args = append(args, pq.Array(families))
	}
	rows, err := resolved.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "baselines", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			row                        BaselineRow
			firstSeen, active, updated sql.NullTime
		)
		if err := rows.Scan(&row.AccountID, &row.Key.SourceType, &row.Key.IdentityName, &row.Status,
			&row.BuiltDays, &row.RequiredDays, &row.DaysRemaining, &firstSeen, &active, &updated); err != nil {
			return nil, common.WrapMonitoringErr(ctx, "baselines", err)
		}
		row.FirstSeenDate, row.ActiveSince, row.UpdatedAt = nullTime(firstSeen), nullTime(active), nullTime(updated)
		out = append(out, row)
	}
	return out, common.WrapMonitoringErr(ctx, "baselines", rows.Err())
}

func nullTime(v sql.NullTime) *time.Time {
	if !v.Valid {
		return nil
	}
	t := v.Time.UTC()
	return &t
}

// OpenAlertCounts is open_anomaly_count for every key at once: COUNT(*)
// from alerts where status = 'open', grouped by identity. Keys without
// open alerts are absent from the map.
func (r *Repository) OpenAlertCounts(ctx context.Context, resolved *scope.DataScope, keys []common.MonitoringKey) (map[common.MonitoringKey]int, error) {
	out := map[common.MonitoringKey]int{}
	if len(keys) == 0 {
		return out, nil
	}
	types, names := common.KeyArrays(keys)
	q := `SELECT a.source_type, a.identity_name, COUNT(*) FROM ` + resolved.Table("alerts") + ` a` + common.KeyJoin("a") + `
	      WHERE a.status = 'open'
	      GROUP BY a.source_type, a.identity_name`
	rows, err := resolved.DB.QueryContext(ctx, q, types, names)
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

// ===========================================================================
// Discovery credentials (identity_credentials, credentials)
// ===========================================================================

// Discovery credential tables (owned by the discovery scanner, read-only
// here): identity_credentials binds an identities row to a credentials row
// (binding_type task_role, execution_role, instance_profile, ...);
// credentials holds the IAM role / key itself.

// CredentialBinding is one identity_credentials row.
type CredentialBinding struct {
	IdentityID    string
	IdentityARN   string
	CredentialID  string
	CredentialARN string
	BindingType   string
	BindingSource string
	IsPrimary     bool
}

// CredentialBindings returns the bindings of the given discovery
// identities, matched by identities.id or by identity_arn (the scanner may
// have written the binding against another snapshot of the same resource).
// Primary and most recently updated bindings come first.
func (r *Repository) CredentialBindings(ctx context.Context, resolved *scope.DataScope, identityIDs, identityARNs []string) ([]CredentialBinding, error) {
	out := []CredentialBinding{}
	if len(identityIDs) == 0 && len(identityARNs) == 0 {
		return out, nil
	}
	q := `SELECT COALESCE(ic.identity_id::text, ''), COALESCE(ic.identity_arn, ''),
	             COALESCE(ic.credential_id::text, ''), COALESCE(ic.credential_arn, ''),
	             LOWER(COALESCE(ic.binding_type, '')), COALESCE(ic.binding_source, ''), COALESCE(ic.is_primary, false)
	      FROM ` + resolved.Table("identity_credentials") + ` AS ic
	      WHERE ic.identity_id::text = ANY($1::text[]) OR ic.identity_arn = ANY($2::text[])
	      ORDER BY COALESCE(ic.is_primary, false) DESC, ic.updated_at DESC NULLS LAST`
	rows, err := resolved.DB.QueryContext(ctx, q, pq.Array(identityIDs), pq.Array(identityARNs))
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "identity credential bindings", err)
	}
	defer rows.Close()
	for rows.Next() {
		var b CredentialBinding
		if err := rows.Scan(&b.IdentityID, &b.IdentityARN, &b.CredentialID, &b.CredentialARN, &b.BindingType, &b.BindingSource, &b.IsPrimary); err != nil {
			return nil, common.WrapMonitoringErr(ctx, "identity credential bindings", err)
		}
		b.IdentityID, b.CredentialARN = strings.TrimSpace(b.IdentityID), strings.TrimSpace(b.CredentialARN)
		out = append(out, b)
	}
	return out, common.WrapMonitoringErr(ctx, "identity credential bindings", rows.Err())
}

// CredentialRow is the latest non-deleted credentials row of one ARN.
type CredentialRow struct {
	ID             string
	ARN            string
	Name           string
	CredentialType string
	Status         string
	PrivilegeLevel string
	LastUsedAt     *time.Time
}

// Credentials returns the latest non-deleted credentials row per ARN for
// the given ARNs or ids, in the caller's accounts, keyed by both ARN and id.
func (r *Repository) Credentials(ctx context.Context, resolved *scope.DataScope, arns, ids []string) (map[string]CredentialRow, error) {
	out := map[string]CredentialRow{}
	if (len(arns) == 0 && len(ids) == 0) || len(resolved.AccountIDs) == 0 {
		return out, nil
	}
	q := `SELECT DISTINCT ON (c.arn)
	             c.id::text, c.arn, COALESCE(c.name, ''), COALESCE(c.credential_type, ''), COALESCE(c.status, ''),
	             COALESCE(c.privilege_level::text, ''), c.last_used_at
	      FROM ` + resolved.Table("credentials") + ` AS c
	      WHERE c.deleted_at IS NULL
	        AND c.account_id = ANY($3::text[])
	        AND (c.arn = ANY($1::text[]) OR c.id::text = ANY($2::text[]))
	      ORDER BY c.arn, c.last_seen_at DESC NULLS LAST, c.updated_at DESC NULLS LAST`
	rows, err := resolved.DB.QueryContext(ctx, q, pq.Array(arns), pq.Array(ids), pq.Array(resolved.AccountIDs))
	if err != nil {
		return nil, common.WrapMonitoringErr(ctx, "credentials", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			c        CredentialRow
			lastUsed sql.NullTime
		)
		if err := rows.Scan(&c.ID, &c.ARN, &c.Name, &c.CredentialType, &c.Status, &c.PrivilegeLevel, &lastUsed); err != nil {
			return nil, common.WrapMonitoringErr(ctx, "credentials", err)
		}
		c.LastUsedAt = nullTime(lastUsed)
		out[c.ARN] = c
		out[c.ID] = c
	}
	return out, common.WrapMonitoringErr(ctx, "credentials", rows.Err())
}
