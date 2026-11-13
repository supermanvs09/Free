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

// Get implements GET /identities/{id}/credentials: the BOUND_TO edges of
// ispm_access_edges, joined on arn with the credential tables (see
// credentialSource: the scanner's credentials, else the posture sample data in
// dummy_credentials). The number
// of open findings per credential comes from ispm_nhi_findings: the findings on
// that credential that belong to this identity, or to no identity. A finding
// owned by another identity that shares the role is not counted, so the number
// agrees with the Alerts tab.
func (r *IdentityCredentialsRepository) Get(ctx context.Context, s *scope.DataScope, id string) ([]IdentityCredential, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	ref, err := common.LoadIdentityRef(ctx, s, id)
	if err != nil {
		return nil, err
	}
	out := make([]IdentityCredential, 0)
	if ref.ARN == "" {
		return out, nil
	}
	src, err := common.CredentialSource(ctx, s)
	if err != nil {
		return nil, err
	}
	// The worker has written the binding and privilege under more than one key.
	q := fmt.Sprintf(`SELECT e.target_arn, COALESCE(e.target_type, ''),
			COALESCE(e.attributes->>'binding_type', e.attributes->>'binding', e.attributes->>'bound_via', ''),
			COALESCE(e.attributes->>'target_privileged', e.attributes->>'privileged', e.attributes->>'is_privileged'),
			COALESCE(c.credential_type, ''), COALESCE(c.status, ''), c.created_at_aws, c.last_used_at,
			c.permission_boundary_arn, c.max_session_duration,
			(SELECT count(*)::int FROM %s f
			  WHERE f.tenant_id = e.tenant_id AND f.credential_arn = e.target_arn
			    AND (f.identity_id = $3 OR f.identity_id IS NULL) AND f.status = 'OPEN')
		FROM %s e
		%s
		WHERE e.tenant_id = $1 AND e.source_arn = $2 AND e.edge_type = 'BOUND_TO'
		ORDER BY e.target_arn`, s.Table(common.TFindings), s.Table(common.TAccessEdges), common.LatestCredential(src))
	rows, err := s.DB.QueryContext(ctx, q, s.TenantID, ref.ARN, id)
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
