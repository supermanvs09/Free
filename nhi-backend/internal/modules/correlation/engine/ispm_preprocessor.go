package engine

import (
	"context"
	"fmt"

	"github.com/lib/pq"
)

// accessEdgesTable is the engine's own derived table (migration 014). It is not
// ispm_access_edges: on the real database that name belongs to the ISPM service,
// with a different shape, and the engine must never read or write it.
const accessEdgesTable = "correlation_access_edges"

// ComputeISPMEdges populates the correlation_access_edges table from effective_permissions.
//
// correlation_access_edges is a derived table — no collector produces it. It stores one
// row per (credential, resource) pair, with all actions the credential can perform
// on that resource. This is computed from effective_permissions.permissions JSONB.
//
// The function runs an upsert (ON CONFLICT DO UPDATE) so repeated calls merge
// actions rather than creating duplicates. It is safe to call multiple times.
//
// Call this before ComputeBlastRadius (which reads correlation_access_edges in Phase 1).
func (r *PGRepo) ComputeISPMEdges(ctx context.Context, ds *Scope) (int, error) {
	if ds == nil || ds.DB == nil {
		return 0, fmt.Errorf("nil scope")
	}

	// Step 1: Read all effective_permissions rows
	epQuery := fmt.Sprintf(`
		SELECT c.arn, ep.permissions, c.attached_policies, c.inline_policies
		FROM %s ep
		JOIN %s c ON ep.credential_id = c.id
		WHERE ep.permissions IS NOT NULL
		  AND jsonb_typeof(ep.permissions) IN ('object', 'array')
		  AND c.deleted_at IS NULL
		  AND (cardinality($1::text[]) = 0 OR c.account_id = ANY($1::text[]))
	`, ds.Table("effective_permissions"), ds.Table("credentials"))

	rows, err := ds.DB.QueryContext(ctx, epQuery, pq.Array(ds.AccountIDs))
	if err != nil {
		if isMissingTable(err) {
			return 0, nil // effective_permissions not yet created
		}
		return 0, fmt.Errorf("query effective_permissions: %w", err)
	}
	defer rows.Close()

	// Step 2: Aggregate permissions into (source_arn, target_arn) -> []actions
	type edgeKey struct {
		source string
		target string
	}
	edgeActions := make(map[edgeKey][]string)

	for rows.Next() {
		var credentialARN string
		var permissionsJSON, attachedJSON, inlineJSON []byte

		if err := rows.Scan(&credentialARN, &permissionsJSON, &attachedJSON, &inlineJSON); err != nil {
			continue
		}

		// Same resolution as the engine: policy documents first, the collector's
		// flattened elements as the fallback. Explicit Deny wins; a Resource "*"
		// grant is stored per service ("*:s3"), or "*" when the action is "*".
		for _, p := range ApplyDenies(ResolvePermissions(permissionsJSON, attachedJSON, inlineJSON)) {
			if p.ResourceARN == "" {
				continue
			}
			target := p.ResourceARN
			if isWildcardResource(target) {
				target = WildcardTarget(serviceOfAction(p.Action))
			}
			key := edgeKey{source: credentialARN, target: target}
			edgeActions[key] = append(edgeActions[key], p.Action)
		}
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate effective_permissions: %w", err)
	}

	if len(edgeActions) == 0 {
		return 0, nil // nothing to compute
	}

	// Step 3: Upsert into correlation_access_edges (merge actions on conflict)
	tx, err := ds.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	upsertSQL := fmt.Sprintf(`
		INSERT INTO %s (source_arn, target_arn, actions, evidence_type, edge_type, observed_count)
		VALUES ($1, $2, $3, 'configured', 'CAN_ACCESS', 0)
		ON CONFLICT (source_arn, target_arn) DO UPDATE
		-- Full recompute from effective_permissions each run, so replace rather than merge
		SET actions = EXCLUDED.actions,
		    updated_at = now()
	`, ds.Table(accessEdgesTable))

	stmt, err := tx.PrepareContext(ctx, upsertSQL)
	if err != nil {
		return 0, fmt.Errorf("prepare upsert: %w", err)
	}
	defer stmt.Close()

	// Deduplicate actions per edge
	inserted := 0
	for key, actions := range edgeActions {
		deduped := dedupeActions(actions)
		if len(deduped) == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx, key.source, key.target, pq.Array(deduped)); err != nil {
			if isMissingTable(err) {
				return 0, nil // correlation_access_edges not yet created
			}
			return 0, fmt.Errorf("upsert ispm edge (%s -> %s): %w", key.source, key.target, err)
		}
		inserted++
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit ispm edges: %w", err)
	}

	return inserted, nil
}

// dedupeActions removes duplicate action strings while preserving order.
func dedupeActions(actions []string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(actions))
	for _, a := range actions {
		if !seen[a] {
			seen[a] = true
			out = append(out, a)
		}
	}
	return out
}
