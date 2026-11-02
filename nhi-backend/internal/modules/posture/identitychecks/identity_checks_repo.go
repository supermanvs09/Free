package identitychecks

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityChecksRepository struct{}

func NewIdentityChecksRepository() *IdentityChecksRepository {
	return &IdentityChecksRepository{}
}

// Get implements GET /identities/{id}/checks. Failed checks come first,
// biggest cost first. The list is bounded by the number of rules, so it is not
// paginated.
//
// Source: ispm_identity_checks joined with ispm_rule_weights (positive title)
// and the linked finding (compliance tags).
func (r *IdentityChecksRepository) Get(ctx context.Context, s *scope.DataScope, id string, f IdentityChecksFilter) ([]IdentityCheck, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	if _, err := common.LoadIdentityRef(ctx, s, id); err != nil {
		return nil, err
	}

	args := []any{s.TenantID, id}
	where := "c.tenant_id = $1 AND c.identity_id = $2"
	switch f.Status {
	case ChecksFailed:
		where += " AND c.status = 'FAIL'"
	case ChecksPassed:
		where += " AND c.status = 'PASS'"
	}
	if p := strings.TrimSpace(f.Pillar); p != "" {
		args = append(args, p)
		where += fmt.Sprintf(" AND c.pillar_code = $%d", len(args))
	}
	q := fmt.Sprintf(`SELECT c.rule_id, COALESCE(NULLIF(w.check_title, ''), NULLIF(w.rule_name, ''), c.rule_id),
			COALESCE(c.status, ''), COALESCE(c.severity, ''), COALESCE(c.pillar_code, ''),
			COALESCE(c.points_lost, 0), c.detail, c.failing_since, c.finding_id::text, to_jsonb(f.compliance_tags), f.updated_at
		FROM %s c
		LEFT JOIN %s w ON w.rule_id = c.rule_id
		LEFT JOIN %s f ON f.tenant_id = c.tenant_id AND f.finding_id = c.finding_id
		WHERE %s
		ORDER BY (c.status = 'FAIL') DESC, COALESCE(c.points_lost, 0) DESC,
			CASE lower(COALESCE(c.severity, ''))
				WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
			c.rule_id`, s.Table(common.TIdentityChecks), s.Table(common.TRuleWeights), s.Table(common.TFindings), where)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query identity checks: %w", err)
	}
	defer rows.Close()
	out := make([]IdentityCheck, 0)
	for rows.Next() {
		var c IdentityCheck
		var detail, finding sql.NullString
		var since, findingUpdated sql.NullTime
		var tags []byte
		if err := rows.Scan(&c.RuleID, &c.Title, &c.Status, &c.Severity, &c.Pillar, &c.PointsIfFixed,
			&detail, &since, &finding, &tags, &findingUpdated); err != nil {
			return nil, fmt.Errorf("scan identity check: %w", err)
		}
		c.Detail = common.NullStr(detail)
		c.FailingSince = common.NullTime(since)
		c.FindingID = common.NullStr(finding)
		c.FindingUpdatedAt = common.NullTime(findingUpdated)
		c.Compliance = common.TagList(tags)
		out = append(out, c)
	}
	return out, rows.Err()
}
