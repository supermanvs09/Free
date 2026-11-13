package correlation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"
)

var (
	ErrCredentialNotFound = errors.New("credential not found")
	ErrTableMissing       = errors.New("table missing")
)

// PGRepo is the PostgreSQL+ClickHouse data access layer for the correlation engine.
type PGRepo struct {
	chClient CHQuerier // optional — nil when ClickHouse is disabled
}

// CHQuerier abstracts the ClickHouse query interface so the repo can work
// with or without CH.
type CHQuerier interface {
	QueryObservedActivity(ctx context.Context, arn string, accounts []string, limit int) ([]ObservedEvent, error)
	QueryAssumeObservations(ctx context.Context, accounts []string, limit int) ([]AssumeObservation, error)
	Enabled() bool
}

func NewPGRepo(chClient CHQuerier) *PGRepo {
	return &PGRepo{chClient: chClient}
}

// isMissingTable checks if a PG error means the table (relation) is absent.
// A missing column ("column ... does not exist", 42703) is deliberately NOT a
// missing table: it means the collector schema drifted from what the engine
// expects, and swallowing it would silently return empty results.
func isMissingTable(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if strings.Contains(msg, "42703") || strings.Contains(msg, `column "`) {
		return false
	}
	return strings.Contains(msg, "42P01") || strings.Contains(msg, "undefined table") ||
		(strings.Contains(msg, `relation "`) && strings.Contains(msg, "does not exist"))
}

// ── Credential loading ────────────────────────────────────────────────────────

func (r *PGRepo) LoadCredentialByARN(ctx context.Context, ds *Scope, arn string) (*Credential, error) {
	if ds == nil || ds.DB == nil {
		return nil, ErrCredentialNotFound
	}
	query := fmt.Sprintf(`
		SELECT id::text, arn, name, credential_type, account_id, region, status,
		       trust_policy, attached_policies, inline_policies,
		       permission_boundary_arn, privilege_level, assumable_role_arns,
		       discovery_source, created_at, updated_at
		FROM %s
		WHERE arn = $1
		  AND (cardinality($2::text[]) = 0 OR account_id = ANY($2::text[]))
		  AND (cardinality($3::text[]) = 0 OR region = ANY($3::text[]))
		  AND deleted_at IS NULL
		LIMIT 1`, ds.Table("credentials"))

	var c Credential
	var trustPolicy, attachedPolicies, inlinePolicies, assumableRoleARNs []byte
	var boundary *string
	var privLevel *int
	var discovery *string

	err := ds.DB.QueryRowContext(ctx, query, arn,
		pq.Array(ds.AccountIDs), pq.Array(ds.Regions)).Scan(
		&c.ID, &c.ARN, &c.Name, &c.CredentialType, &c.AccountID, &c.Region, &c.Status,
		&trustPolicy, &attachedPolicies, &inlinePolicies,
		&boundary, &privLevel, &assumableRoleARNs,
		&discovery, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrCredentialNotFound
		}
		if isMissingTable(err) {
			return nil, ErrTableMissing
		}
		return nil, fmt.Errorf("load credential by ARN: %w", err)
	}
	c.TrustPolicy = trustPolicy
	c.AttachedPolicies = attachedPolicies
	c.InlinePolicies = inlinePolicies
	c.PermissionBoundary = boundary
	c.PrivilegeLevel = privLevel
	c.AssumableRoleARNs = assumableRoleARNs
	c.DiscoverySource = discovery
	return &c, nil
}

func (r *PGRepo) LoadAllCredentials(ctx context.Context, ds *Scope) ([]Credential, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT id::text, arn, name, credential_type, account_id, region, status,
		       trust_policy, attached_policies, inline_policies,
		       permission_boundary_arn, privilege_level, assumable_role_arns,
		       discovery_source, created_at, updated_at
		FROM %s
		WHERE (cardinality($1::text[]) = 0 OR account_id = ANY($1::text[]))
		  AND (cardinality($2::text[]) = 0 OR region = ANY($2::text[]))
		  AND deleted_at IS NULL`, ds.Table("credentials"))

	rows, err := ds.DB.QueryContext(ctx, query,
		pq.Array(ds.AccountIDs), pq.Array(ds.Regions))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load all credentials: %w", err)
	}
	defer rows.Close()

	var out []Credential
	for rows.Next() {
		var c Credential
		var trustPolicy, attachedPolicies, inlinePolicies, assumableRoleARNs []byte
		var boundary *string
		var privLevel *int
		var discovery *string

		err := rows.Scan(
			&c.ID, &c.ARN, &c.Name, &c.CredentialType, &c.AccountID, &c.Region, &c.Status,
			&trustPolicy, &attachedPolicies, &inlinePolicies,
			&boundary, &privLevel, &assumableRoleARNs,
			&discovery, &c.CreatedAt, &c.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan credential: %w", err)
		}
		c.TrustPolicy = trustPolicy
		c.AttachedPolicies = attachedPolicies
		c.InlinePolicies = inlinePolicies
		c.PermissionBoundary = boundary
		c.PrivilegeLevel = privLevel
		c.AssumableRoleARNs = assumableRoleARNs
		c.DiscoverySource = discovery
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Effective permissions ─────────────────────────────────────────────────────

func (r *PGRepo) LoadEffectivePermissions(ctx context.Context, ds *Scope, credentialARN string) ([]ResourcePermission, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	// effective_permissions stores permissions as JSONB. We need to join
	// credentials → effective_permissions and parse the permissions JSON.
	query := fmt.Sprintf(`
		SELECT ep.permissions, ep.granted_count, c.attached_policies, c.inline_policies
		FROM %s ep
		JOIN %s c ON ep.credential_id::text = c.id::text
		WHERE c.arn = $1
		  AND (cardinality($2::text[]) = 0 OR c.account_id = ANY($2::text[]))
		  AND (cardinality($3::text[]) = 0 OR c.region = ANY($3::text[]))
		  AND c.deleted_at IS NULL
		LIMIT 1`, ds.Table("effective_permissions"), ds.Table("credentials"))

	var permissionsJSON, attachedJSON, inlineJSON []byte
	var grantedCount int
	err := ds.DB.QueryRowContext(ctx, query, credentialARN,
		pq.Array(ds.AccountIDs), pq.Array(ds.Regions)).Scan(&permissionsJSON, &grantedCount, &attachedJSON, &inlineJSON)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // no effective permissions = empty list
		}
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load effective permissions: %w", err)
	}

	// Prefer the stored policy documents (they keep conditions, Sid, NotAction and
	// NotResource); fall back to the collector's flattened elements.
	return ResolvePermissions(permissionsJSON, attachedJSON, inlineJSON), nil
}

// ── Trust edges ────────────────────────────────────────────────────────────────

func (r *PGRepo) LoadTrustEdges(ctx context.Context, ds *Scope, sourceARN string) ([]TrustEdge, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT source_arn, target_arn, edge_type, conditions, account_id, metadata
		FROM %s
		WHERE source_arn = $1
		  AND (cardinality($2::text[]) = 0 OR account_id = ANY($2::text[]))
		  AND is_active = true`, ds.Table("trust_edges"))

	rows, err := ds.DB.QueryContext(ctx, query, sourceARN, pq.Array(ds.AccountIDs))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load trust edges: %w", err)
	}
	defer rows.Close()

	var out []TrustEdge
	for rows.Next() {
		var e TrustEdge
		var conditions, metadata []byte
		if err := rows.Scan(&e.SourceARN, &e.TargetARN, &e.EdgeType, &conditions, &e.AccountID, &metadata); err != nil {
			return nil, fmt.Errorf("scan trust edge: %w", err)
		}
		e.Conditions = conditions
		e.Metadata = metadata
		out = append(out, e)
	}
	return out, rows.Err()
}

// ── ISPM access edges ──────────────────────────────────────────────────────────

func (r *PGRepo) LoadISPMEdges(ctx context.Context, ds *Scope, sourceARN string) ([]ISPMEdge, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT source_arn, target_arn, edge_type
		FROM %s
		WHERE source_arn = $1`, ds.Table("ispm_access_edges"))

	rows, err := ds.DB.QueryContext(ctx, query, sourceARN)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load ispm edges: %w", err)
	}
	defer rows.Close()

	var out []ISPMEdge
	for rows.Next() {
		var e ISPMEdge
		if err := rows.Scan(&e.Source, &e.Target, &e.EdgeType); err != nil {
			return nil, fmt.Errorf("scan ispm edge: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// LoadReverseAccess answers "who can reach this resource". In this backend
// ispm_access_edges belongs to the ISPM worker (with its own columns), so the
// grants are derived here, read-only, from effective_permissions with the same
// resolution the engine uses: policy documents first, Deny wins, a Resource "*"
// grant counts as "*:<service>" (or "*" for action "*").
func (r *PGRepo) LoadReverseAccess(ctx context.Context, ds *Scope, resourceARN string) ([]ReverseAccessRow, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT c.arn, COALESCE(c.name, ''), ep.permissions, c.attached_policies, c.inline_policies
		FROM %s ep
		JOIN %s c ON ep.credential_id::text = c.id::text
		WHERE ep.permissions IS NOT NULL
		  AND jsonb_typeof(ep.permissions) IN ('object', 'array')
		  AND c.deleted_at IS NULL
		  AND (cardinality($1::text[]) = 0 OR c.account_id = ANY($1::text[]))
		  AND (cardinality($2::text[]) = 0 OR c.region = ANY($2::text[]))`,
		ds.Table("effective_permissions"), ds.Table("credentials"))
	rows, err := ds.DB.QueryContext(ctx, query, pq.Array(ds.AccountIDs), pq.Array(ds.Regions))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("load reverse access: %w", err)
	}
	defer rows.Close()

	serviceWildcard := WildcardTarget(serviceOfTarget(resourceARN))
	var out []ReverseAccessRow
	for rows.Next() {
		var arn, name string
		var perms, attached, inline []byte
		if err := rows.Scan(&arn, &name, &perms, &attached, &inline); err != nil {
			return nil, fmt.Errorf("scan reverse access: %w", err)
		}
		byTarget := map[string][]string{}
		for _, p := range ApplyDenies(ResolvePermissions(perms, attached, inline)) {
			target := p.ResourceARN
			if target == "" {
				continue
			}
			if isWildcardResource(target) {
				target = WildcardTarget(serviceOfAction(p.Action))
			}
			if target == resourceARN || target == "*" || target == serviceWildcard {
				byTarget[target] = append(byTarget[target], p.Action)
			}
		}
		for target, actions := range byTarget {
			out = append(out, ReverseAccessRow{SourceARN: arn, SourceName: name, TargetARN: target,
				Actions: dedupeActions(actions), EvidenceType: EvidenceConfigured})
		}
		if len(out) >= 5000 {
			break
		}
	}
	return out, rows.Err()
}

// dedupeActions removes duplicate action strings while preserving order.
func dedupeActions(actions []string) []string {
	seen := make(map[string]bool, len(actions))
	out := make([]string, 0, len(actions))
	for _, a := range actions {
		if !seen[a] {
			seen[a] = true
			out = append(out, a)
		}
	}
	return out
}

// LoadAssumeObservations returns the successful AssumeRole calls seen in
// CloudTrail, aggregated per caller and role. Without ClickHouse it is empty.
func (r *PGRepo) LoadAssumeObservations(ctx context.Context, ds *Scope) ([]AssumeObservation, error) {
	if r.chClient == nil || !r.chClient.Enabled() {
		return nil, nil
	}
	return r.chClient.QueryAssumeObservations(ctx, ds.AccountIDs, 5000)
}

// LoadDataFreshness reports when the collector last saw a credential and when its
// permissions were last recalculated, so a result can say how current it is.
func (r *PGRepo) LoadDataFreshness(ctx context.Context, ds *Scope, credentialARN string) (DataFreshness, error) {
	var f DataFreshness
	if ds == nil || ds.DB == nil {
		return f, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT c.last_seen_at, ep.updated_at
		FROM %s c
		LEFT JOIN %s ep ON ep.credential_id::text = c.id::text
		WHERE c.arn = $1 AND c.deleted_at IS NULL
		ORDER BY c.last_seen_at DESC NULLS LAST
		LIMIT 1`, ds.Table("credentials"), ds.Table("effective_permissions"))

	var seen, perms sql.NullTime
	if err := ds.DB.QueryRowContext(ctx, query, credentialARN).Scan(&seen, &perms); err != nil {
		if errors.Is(err, sql.ErrNoRows) || isMissingTable(err) {
			return f, nil
		}
		return f, fmt.Errorf("load data freshness: %w", err)
	}
	if seen.Valid {
		f.CredentialLastSeenAt = &seen.Time
	}
	if perms.Valid {
		f.PermissionsUpdatedAt = &perms.Time
	}
	return f, nil
}

// LoadRoleTrust returns every live IAM role in scope with its trust policy, the
// input for resolving which role can assume which.
func (r *PGRepo) LoadRoleTrust(ctx context.Context, ds *Scope) ([]RoleTrustRow, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT arn, name, account_id, trust_policy
		FROM %s
		WHERE credential_type = 'iam_role'
		  AND deleted_at IS NULL
		  AND trust_policy IS NOT NULL
		  AND (cardinality($1::text[]) = 0 OR account_id = ANY($1::text[]))`, ds.Table("credentials"))

	rows, err := ds.DB.QueryContext(ctx, query, pq.Array(ds.AccountIDs))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("load role trust: %w", err)
	}
	defer rows.Close()

	var out []RoleTrustRow
	for rows.Next() {
		var row RoleTrustRow
		if err := rows.Scan(&row.ARN, &row.Name, &row.AccountID, &row.TrustPolicy); err != nil {
			return nil, fmt.Errorf("scan role trust: %w", err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// LoadAssumePermissions returns the permission elements that could grant
// sts:AssumeRole: the exact action and every wildcard action (the engine then
// does the glob match), keyed by credential ARN.
func (r *PGRepo) LoadAssumePermissions(ctx context.Context, ds *Scope) (map[string][]ResourcePermission, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	// Same resolution as phase 1 (ResolvePermissions): the stored policy
	// documents first, the collector's flattened elements as the fallback, so a
	// role whose flattened list is stale still shows the chains its policies
	// allow.
	query := fmt.Sprintf(`
		SELECT c.arn, ep.permissions, c.attached_policies, c.inline_policies
		FROM %s c
		LEFT JOIN %s ep ON ep.credential_id::text = c.id::text
		WHERE c.deleted_at IS NULL
		  AND (cardinality($1::text[]) = 0 OR c.account_id = ANY($1::text[]))`,
		ds.Table("credentials"), ds.Table("effective_permissions"))

	rows, err := ds.DB.QueryContext(ctx, query, pq.Array(ds.AccountIDs))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("load assume permissions: %w", err)
	}
	defer rows.Close()

	out := map[string][]ResourcePermission{}
	for rows.Next() {
		var arn string
		var stored, attached, inline []byte
		if err := rows.Scan(&arn, &stored, &attached, &inline); err != nil {
			return nil, fmt.Errorf("scan assume permission: %w", err)
		}
		for _, p := range ResolvePermissions(stored, attached, inline) {
			if strings.EqualFold(p.Action, "sts:AssumeRole") || strings.ContainsAny(p.Action, "*?") {
				out[arn] = append(out[arn], p)
			}
		}
	}
	return out, rows.Err()
}

// ── Cross-account lineage ──────────────────────────────────────────────────────

func (r *PGRepo) LoadCrossAccountLineage(ctx context.Context, ds *Scope, sourceARN string) ([]LineageEdge, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	// nhi_lineage_aws has is_external column; we use it directly.
	// It does NOT have an account_id column — filter by source_arn only.
	query := fmt.Sprintf(`
		SELECT source_arn, rel_type, target_type, target_id, is_external
		FROM %s
		WHERE source_arn = $1
		LIMIT 500`, ds.Table("nhi_lineage_aws"))

	rows, err := ds.DB.QueryContext(ctx, query, sourceARN)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load lineage edges: %w", err)
	}
	defer rows.Close()

	var out []LineageEdge
	for rows.Next() {
		var e LineageEdge
		var isExternal int
		if err := rows.Scan(&e.SourceARN, &e.RelType, &e.TargetType, &e.TargetID, &isExternal); err != nil {
			return nil, fmt.Errorf("scan lineage edge: %w", err)
		}
		e.IsExternal = isExternal == 1
		if e.IsExternal {
			out = append(out, e)
		}
	}
	return out, rows.Err()
}

func isCrossAccount(targetID string, accounts []string) bool {
	// Check if targetID contains an ARN with an account number not in our list
	if !strings.Contains(targetID, "arn:aws:") || len(accounts) == 0 {
		return false // no account scope configured → cannot tell what is "foreign"
	}
	// Extract account number from ARN: arn:aws:iam::123456789012:role/...
	parts := strings.Split(targetID, ":")
	if len(parts) < 5 {
		return false
	}
	acct := parts[4]
	if acct == "" {
		return false
	}
	for _, a := range accounts {
		if a == acct {
			return false
		}
	}
	return true
}

// ── ECS task registry ──────────────────────────────────────────────────────────

func (r *PGRepo) LoadECSTasksForRole(ctx context.Context, ds *Scope, roleARN string) ([]ECSTask, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT task_arn, task_role_arn, execution_role_arn, cluster_name, service_name
		FROM %s
		WHERE (task_role_arn = $1 OR execution_role_arn = $1)
		  AND (cardinality($2::text[]) = 0 OR account_id = ANY($2::text[]))
		ORDER BY (last_status = 'RUNNING') DESC, updated_at DESC
		LIMIT 100`, ds.Table("ecs_task_registry"))

	rows, err := ds.DB.QueryContext(ctx, query, roleARN, pq.Array(ds.AccountIDs))
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty (ECS data not collected)
		}
		return nil, fmt.Errorf("load ecs tasks: %w", err)
	}
	defer rows.Close()

	var out []ECSTask
	for rows.Next() {
		var t ECSTask
		if err := rows.Scan(&t.TaskARN, &t.TaskRoleARN, &t.ExecutionRoleARN, &t.Cluster, &t.Service); err != nil {
			return nil, fmt.Errorf("scan ecs task: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ── Identity credentials bridge ────────────────────────────────────────────────

func (r *PGRepo) LoadIdentityCredentials(ctx context.Context, ds *Scope, credentialARN string) ([]IdentityCredential, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT identity_arn, credential_arn, binding_type, binding_source, is_primary
		FROM %s
		WHERE credential_arn = $1`, ds.Table("identity_credentials"))

	rows, err := ds.DB.QueryContext(ctx, query, credentialARN)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — return empty
		}
		return nil, fmt.Errorf("load identity credentials: %w", err)
	}
	defer rows.Close()

	var out []IdentityCredential
	for rows.Next() {
		var ic IdentityCredential
		var isPrimary bool
		if err := rows.Scan(&ic.IdentityARN, &ic.CredentialARN, &ic.BindingType, &ic.BindingSource, &isPrimary); err != nil {
			return nil, fmt.Errorf("scan identity credential: %w", err)
		}
		ic.IsPrimary = isPrimary
		out = append(out, ic)
	}
	return out, rows.Err()
}

// ── Observed activity (ClickHouse) ─────────────────────────────────────────────

func (r *PGRepo) LoadObservedActivity(ctx context.Context, ds *Scope, arn string, limit int) ([]ObservedEvent, error) {
	if r.chClient == nil || !r.chClient.Enabled() {
		return nil, nil // CH disabled — no observed activity
	}
	return r.chClient.QueryObservedActivity(ctx, arn, ds.AccountIDs, limit)
}

// ── Save blast radius results ──────────────────────────────────────────────────

func (r *PGRepo) SaveBlastRadius(ctx context.Context, ds *Scope, result *BlastRadiusResult) (string, error) {
	if ds == nil || ds.DB == nil {
		return "", errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		INSERT INTO %s (source_arn, source_name, source_type, total_paths, total_resources,
		       direct_paths, chain_paths, cross_account_paths, compute_paths,
		       secrets_access_found, converging_paths_found, computed_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id::text`, ds.Table("nhi_blast_radius"))

	// Replace any previous result for this source (paths cascade via FK).
	if _, err := ds.DB.ExecContext(ctx,
		fmt.Sprintf(`DELETE FROM %s WHERE source_arn = $1`, ds.Table("nhi_blast_radius")),
		result.SourceARN); err != nil {
		return "", fmt.Errorf("delete previous blast radius: %w", err)
	}

	var id string
	expiresAt := time.Now().Add(24 * time.Hour) // cache for 24h
	err := ds.DB.QueryRowContext(ctx, query,
		result.SourceARN, result.SourceName, result.SourceType,
		result.TotalPaths, result.TotalResources,
		result.DirectPaths, result.ChainPaths, result.CrossAccountPaths, result.ComputePaths,
		result.SecretsAccessFound, result.ConvergingPathsFound,
		result.ComputedAt, expiresAt,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("save blast radius: %w", err)
	}
	return id, nil
}

func (r *PGRepo) SaveBlastRadiusPaths(ctx context.Context, ds *Scope, blastRadiusID string, paths []BlastRadiusPath) error {
	if ds == nil || ds.DB == nil {
		return errors.New("nil scope")
	}
	tx, err := ds.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	query := fmt.Sprintf(`
		INSERT INTO %s (blast_radius_id, source_arn, target_arn, target_type, target_name,
		       path_type, path_description, hops, evidence_rank, confidence,
		       security_significance, limitations, phase, is_reverse_access)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
		ds.Table("nhi_blast_radius_paths"))

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	for _, p := range paths {
		hopsJSON, _ := json.Marshal(p.Hops)
		limitationsJSON, _ := json.Marshal(p.Limitations)
		_, err := stmt.ExecContext(ctx,
			blastRadiusID, p.SourceARN, p.TargetARN, p.TargetType, p.TargetName,
			p.PathType, p.PathDescription, hopsJSON, p.EvidenceRank, p.Confidence,
			p.SecuritySignificance, limitationsJSON, p.Phase, p.IsReverseAccess,
		)
		if err != nil {
			return fmt.Errorf("insert path: %w", err)
		}
	}
	return tx.Commit()
}

// ── Load cached blast radius ──────────────────────────────────────────────────

func (r *PGRepo) LoadBlastRadius(ctx context.Context, ds *Scope, sourceARN string) (*BlastRadiusResult, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	// Check if cached result is still fresh
	query := fmt.Sprintf(`
		SELECT id::text, source_arn, source_name, source_type, total_paths, total_resources,
		       direct_paths, chain_paths, cross_account_paths, compute_paths,
		       secrets_access_found, converging_paths_found, computed_at, expires_at
		FROM %s
		WHERE source_arn = $1
		  AND (expires_at IS NULL OR expires_at > $2)
		ORDER BY computed_at DESC
		LIMIT 1`, ds.Table("nhi_blast_radius"))

	var result BlastRadiusResult
	var id string
	var expiresAt *time.Time

	err := ds.DB.QueryRowContext(ctx, query, sourceARN, time.Now()).Scan(
		&id, &result.SourceARN, &result.SourceName, &result.SourceType,
		&result.TotalPaths, &result.TotalResources,
		&result.DirectPaths, &result.ChainPaths, &result.CrossAccountPaths, &result.ComputePaths,
		&result.SecretsAccessFound, &result.ConvergingPathsFound,
		&result.ComputedAt, &expiresAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // no cached result
		}
		if isMissingTable(err) {
			return nil, nil // table missing — no cache
		}
		return nil, fmt.Errorf("load cached blast radius: %w", err)
	}

	// Load paths
	pathsQuery := fmt.Sprintf(`
		SELECT target_arn, target_type, target_name, path_type, path_description,
		       hops, evidence_rank, confidence, security_significance, limitations,
		       phase, is_reverse_access, created_at
		FROM %s
		WHERE blast_radius_id = $1
		ORDER BY phase, path_type`, ds.Table("nhi_blast_radius_paths"))

	rows, err := ds.DB.QueryContext(ctx, pathsQuery, id)
	if err != nil {
		if isMissingTable(err) {
			return &result, nil // paths table missing — return summary only
		}
		return nil, fmt.Errorf("load cached paths: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p BlastRadiusPath
		var hopsJSON, limitationsJSON []byte
		var isReverse bool
		if err := rows.Scan(&p.TargetARN, &p.TargetType, &p.TargetName, &p.PathType, &p.PathDescription,
			&hopsJSON, &p.EvidenceRank, &p.Confidence, &p.SecuritySignificance, &limitationsJSON,
			&p.Phase, &isReverse, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan cached path: %w", err)
		}
		json.Unmarshal(hopsJSON, &p.Hops)
		json.Unmarshal(limitationsJSON, &p.Limitations)
		p.IsReverseAccess = isReverse
		p.SourceARN = result.SourceARN
		result.Paths = append(result.Paths, p)
	}
	return &result, rows.Err()
}

// ── Correlation definitions ───────────────────────────────────────────────────

func (r *PGRepo) LoadCorrelationDefinitions(ctx context.Context, ds *Scope, category string) ([]CorrelationDefinition, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT id::text, rule_id, category, source_entity_type, source_entity_identifiers,
		       source_table, target_entity_type, target_entity_identifiers, target_table,
		       relationship_type, edge_type, evidence_source, evidence_type,
		       phase, max_hops, description, is_active, COALESCE(disposition, '')
		FROM %s
		WHERE is_active = true
		  AND ($1 = '' OR category = $1)
		ORDER BY rule_id`, ds.Table("correlation_definitions"))

	rows, err := ds.DB.QueryContext(ctx, query, category)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — no rules
		}
		return nil, fmt.Errorf("load correlation definitions: %w", err)
	}
	defer rows.Close()

	var out []CorrelationDefinition
	for rows.Next() {
		var c CorrelationDefinition
		var srcIDs, tgtIDs []byte
		var active bool
		if err := rows.Scan(&c.ID, &c.RuleID, &c.Category, &c.SourceEntityType, &srcIDs,
			&c.SourceTable, &c.TargetEntityType, &tgtIDs, &c.TargetTable,
			&c.RelationshipType, &c.EdgeType, &c.EvidenceSource, &c.EvidenceType,
			&c.Phase, &c.MaxHops, &c.Description, &active, &c.Disposition); err != nil {
			return nil, fmt.Errorf("scan correlation definition: %w", err)
		}
		json.Unmarshal(srcIDs, &c.SourceEntityIdentifiers)
		json.Unmarshal(tgtIDs, &c.TargetEntityIdentifiers)
		c.IsActive = active
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Composition rules ─────────────────────────────────────────────────────────

func (r *PGRepo) LoadCompositionRules(ctx context.Context, ds *Scope) ([]CompositionRule, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT id::text, rule_id, rule_type, prerequisites, join_key, result_type,
		       result_semantics, bidirectional, detection_key, resolution_strategy,
		       flag_always, conditions, description, is_active
		FROM %s
		WHERE is_active = true
		ORDER BY rule_id`, ds.Table("correlation_composition_rules"))

	rows, err := ds.DB.QueryContext(ctx, query)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — no rules
		}
		return nil, fmt.Errorf("load composition rules: %w", err)
	}
	defer rows.Close()

	var out []CompositionRule
	for rows.Next() {
		var cr CompositionRule
		var prereqs, conditions []byte
		var active bool
		if err := rows.Scan(&cr.ID, &cr.RuleID, &cr.RuleType, &prereqs, &cr.JoinKey,
			&cr.ResultType, &cr.ResultSemantics, &cr.Bidirectional, &cr.DetectionKey,
			&cr.ResolutionStrategy, &cr.FlagAlways, &conditions, &cr.Description, &active); err != nil {
			return nil, fmt.Errorf("scan composition rule: %w", err)
		}
		json.Unmarshal(prereqs, &cr.Prerequisites)
		json.Unmarshal(conditions, &cr.Conditions)
		cr.IsActive = active
		out = append(out, cr)
	}
	return out, rows.Err()
}

// ── Path types ────────────────────────────────────────────────────────────────

func (r *PGRepo) LoadPathTypes(ctx context.Context, ds *Scope) ([]PathType, error) {
	if ds == nil || ds.DB == nil {
		return nil, errors.New("nil scope")
	}
	query := fmt.Sprintf(`
		SELECT id::text, path_id, path_name, min_hops, max_hops, confidence_formula,
		       limitations, security_significance, phase, description, is_active
		FROM %s
		WHERE is_active = true
		ORDER BY path_id`, ds.Table("correlation_path_types"))

	rows, err := ds.DB.QueryContext(ctx, query)
	if err != nil {
		if isMissingTable(err) {
			return nil, nil // table missing — no path types
		}
		return nil, fmt.Errorf("load path types: %w", err)
	}
	defer rows.Close()

	var out []PathType
	for rows.Next() {
		var pt PathType
		var limitations []byte
		var active bool
		if err := rows.Scan(&pt.ID, &pt.PathID, &pt.PathName, &pt.MinHops, &pt.MaxHops,
			&pt.ConfidenceFormula, &limitations, &pt.SecuritySignificance,
			&pt.Phase, &pt.Description, &active); err != nil {
			return nil, fmt.Errorf("scan path type: %w", err)
		}
		json.Unmarshal(limitations, &pt.Limitations)
		pt.IsActive = active
		out = append(out, pt)
	}
	return out, rows.Err()
}

// SubjectCredential is a credential an identity signs in with, a candidate
// subject for its blast radius.
type SubjectCredential struct {
	ARN            string `json:"arn"`
	Name           string `json:"name"`
	CredentialType string `json:"credential_type"`
	IsPrimary      bool   `json:"is_primary"`
}

// IdentityCredentials lists the in-scope credentials bound to an identity,
// roles and the primary binding first: what it can reach is what they grant.
func (r *PGRepo) IdentityCredentials(ctx context.Context, ds *Scope, identityID string) ([]SubjectCredential, error) {
	query := fmt.Sprintf(`
		SELECT DISTINCT ON (c.arn) c.arn, COALESCE(c.name, ''), COALESCE(c.credential_type, ''), COALESCE(ic.is_primary, false)
		FROM %s ic
		JOIN %s c ON c.id::text = ic.credential_id::text AND c.deleted_at IS NULL
		WHERE ic.identity_id::text = $1
		  AND (cardinality($2::text[]) = 0 OR c.account_id = ANY($2::text[]))
		  AND (cardinality($3::text[]) = 0 OR c.region = ANY($3::text[]))
		ORDER BY c.arn, ic.is_primary DESC`, ds.Table("identity_credentials"), ds.Table("credentials"))
	rows, err := ds.DB.QueryContext(ctx, query, identityID, pq.Array(ds.AccountIDs), pq.Array(ds.Regions))
	if err != nil {
		if isMissingTable(err) {
			return []SubjectCredential{}, nil
		}
		return nil, fmt.Errorf("identity credentials: %w", err)
	}
	defer rows.Close()
	out := []SubjectCredential{}
	for rows.Next() {
		var c SubjectCredential
		if err := rows.Scan(&c.ARN, &c.Name, &c.CredentialType, &c.IsPrimary); err != nil {
			return nil, fmt.Errorf("scan identity credential: %w", err)
		}
		out = append(out, c)
	}
	sort.SliceStable(out, func(i, j int) bool {
		ri, rj := out[i].CredentialType == "iam_role", out[j].CredentialType == "iam_role"
		if ri != rj {
			return ri
		}
		return out[i].IsPrimary && !out[j].IsPrimary
	})
	return out, rows.Err()
}
