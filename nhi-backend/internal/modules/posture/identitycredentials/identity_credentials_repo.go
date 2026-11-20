package identitycredentials

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/modules/posture/identityposture"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityCredentialsRepository struct{}

func NewIdentityCredentialsRepository() *IdentityCredentialsRepository {
	return &IdentityCredentialsRepository{}
}

// tScannerCredentials is the scanner's credentials table, the one that holds
// the attached and inline policies of a role.
const tScannerCredentials = "credentials"

// Get implements GET /identities/{id}/credentials: the BOUND_TO edges of
// ispm_access_edges, joined on arn with the credential tables (see
// credentialSource: the scanner's credentials, else the posture sample data in
// dummy_credentials). The number
// of open findings per credential comes from ispm_nhi_findings: the findings on
// that credential that belong to this identity, or to no identity. A finding
// owned by another identity that shares the role is not counted, so the number
// agrees with the Alerts tab.
//
// The privileged flag comes from the edge attributes the worker wrote; when
// the edge has none, it is worked out from the role's policies in the
// credentials table (see privilegedFromPolicies).
func (r *IdentityCredentialsRepository) Get(ctx context.Context, s *scope.DataScope, id string) ([]IdentityCredential, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	ref, err := common.LoadIdentityRef(ctx, s, id)
	if err != nil {
		return nil, err
	}
	if ref.ARN == "" {
		return make([]IdentityCredential, 0), nil
	}
	src, err := common.CredentialSource(ctx, s)
	if err != nil {
		return nil, err
	}
	var hasPolicies bool
	if err := s.DB.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, s.Table(tScannerCredentials)).
		Scan(&hasPolicies); err != nil {
		return nil, fmt.Errorf("check credentials table: %w", err)
	}
	out, err := r.list(ctx, s, id, ref.ARN, src, hasPolicies)
	if err != nil && hasPolicies && common.IsUndefinedColumn(err) {
		// credentials exists but without the policy columns: no fallback.
		out, err = r.list(ctx, s, id, ref.ARN, src, false)
	}
	return out, err
}

// privilegedFromPolicies is the SQL fallback for the privileged flag when the
// BOUND_TO edge does not carry one. The newest live row of the credential in
// the credentials table is privileged ('true') when it has an AWS admin-level
// managed policy attached (AdministratorAccess, IAMFullAccess,
// PowerUserAccess) or an inline policy statement with "Action": "*";
// otherwise 'false'. It is NULL (unknown) when the credential is not in that
// table. The match is on the JSON text, so it works for either shape of
// attached_policies (names, ARNs, or objects holding them).
func privilegedFromPolicies(table string) string {
	return `(SELECT (COALESCE(p.attached_policies::text, '') ~* '(policy/|")(AdministratorAccess|IAMFullAccess|PowerUserAccess)\\?"'
            OR COALESCE(p.inline_policies::text, '') ~ '[^A-Za-z]Action\W{0,4}:\W{0,6}\*\W')::text
        FROM ` + table + ` p
        WHERE p.arn = e.target_arn AND p.deleted_at IS NULL
        ORDER BY p.last_seen_at DESC NULLS LAST, p.updated_at DESC NULLS LAST
        LIMIT 1)`
}

func (r *IdentityCredentialsRepository) list(ctx context.Context, s *scope.DataScope, id, identityARN, src string,
	hasPolicies bool) ([]IdentityCredential, error) {
	out := make([]IdentityCredential, 0)
	fallback := "NULL::text"
	if hasPolicies {
		fallback = privilegedFromPolicies(s.Table(tScannerCredentials))
	}
	// The worker has written the binding and privilege under more than one key;
	// when it wrote no privilege, the role's policies decide it.
	q := fmt.Sprintf(`SELECT e.target_arn, COALESCE(e.target_type, ''),
            COALESCE(e.attributes->>'binding_type', e.attributes->>'binding', e.attributes->>'bound_via', ''),
            COALESCE(e.attributes->>'target_privileged', e.attributes->>'privileged', e.attributes->>'is_privileged', %s),
            COALESCE(c.credential_type, ''), COALESCE(c.status, ''), c.created_at_aws, c.last_used_at,
            c.permission_boundary_arn, c.max_session_duration,
            (SELECT count(*)::int FROM %s f
              WHERE f.tenant_id = e.tenant_id AND f.credential_arn = e.target_arn
                AND (f.identity_id = $3 OR f.identity_id IS NULL) AND f.status = 'OPEN')
        FROM %s e
        %s
        WHERE e.tenant_id = $1 AND e.source_arn = $2 AND e.edge_type = 'BOUND_TO'
        ORDER BY e.target_arn`, fallback, s.Table(common.TFindings), s.Table(common.TAccessEdges), common.LatestCredential(src))
	rows, err := s.DB.QueryContext(ctx, q, s.TenantID, identityARN, id)
	if err != nil {
		return nil, fmt.Errorf("query identity credentials: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var arn, targetType, binding, credType, status string
		var privileged, boundary sql.NullString
		var created, used sql.NullTime
		var maxSession sql.NullInt64
		var open int
		if err := rows.Scan(&arn, &targetType, &binding, &privileged, &credType, &status, &created, &used,
			&boundary, &maxSession, &open); err != nil {
			return nil, fmt.Errorf("scan identity credential: %w", err)
		}
		typ := strings.ToUpper(identityposture.FirstNonEmpty(credType, targetType))
		c := IdentityCredential{CredentialARN: arn, Type: typ, Binding: binding, OpenFindings: open}
		if typ == "IAM_ROLE" || strings.Contains(arn, ":role/") {
			c.IsRole = true
			if privileged.Valid {
				v := strings.EqualFold(privileged.String, "true")
				c.Privileged = &v
			}
			hasBoundary := boundary.Valid && strings.TrimSpace(boundary.String) != ""
			c.HasBoundary = &hasBoundary
			c.MaxSessionDuration = common.NullInt(maxSession)
		} else {
			c.Status = common.TitleCase(status)
			c.AgeDays, c.LastUsedDays = common.DaysSince(created), common.DaysSince(used)
			c.UsageState = identityposture.UsageState(used, c.LastUsedDays)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
