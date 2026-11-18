package quickwins

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type QuickWinIdentitiesRepository struct{}

func NewQuickWinIdentitiesRepository() *QuickWinIdentitiesRepository {
	return &QuickWinIdentitiesRepository{}
}

type quickWinCursor struct {
	ID string `json:"id"`
}

// Get implements GET /posture/quick-wins/{rule_id}/identities: the identities
// failing one check, worst score first, with keyset pagination.
//
// Source: ispm_identity_checks (rule_id, status = 'FAIL', served by
// idx_ispm_checks_rule_status) joined with ispm_identity_posture.
func (r *QuickWinIdentitiesRepository) Get(ctx context.Context, s *scope.DataScope, ruleID string, limit int, cursor string) (*QuickWinIdentities, *string, error) {
	if err := common.Need(s); err != nil {
		return nil, nil, err
	}
	limit = common.ClampPageLimit(limit)

	out := &QuickWinIdentities{Identities: []QuickWinIdentity{}}
	ruleQ := fmt.Sprintf(`SELECT rule_id, COALESCE(NULLIF(check_title, ''), NULLIF(rule_name, ''), rule_id),
			COALESCE(severity, ''), COALESCE(penalty_points, 0)
		FROM %s WHERE rule_id = $1`, s.Table(common.TRuleWeights))
	err := s.DB.QueryRowContext(ctx, ruleQ, ruleID).Scan(&out.Rule.RuleID, &out.Rule.Title, &out.Rule.Severity, &out.Rule.PenaltyPoints)
	if errors.Is(err, sql.ErrNoRows) || common.IsUndefinedTable(err) {
		return nil, nil, common.ErrRecordNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("load rule: %w", err)
	}

	args := []any{s.TenantID, ruleID}
	where := "c.tenant_id = $1 AND c.rule_id = $2 AND c.status = 'FAIL'"
	posture := s.Table(common.TIdentityPosture)
	if strings.TrimSpace(cursor) != "" {
		var cur quickWinCursor
		if err := common.DecodeCursor(cursor, &cur); err != nil || cur.ID == "" {
			return nil, nil, common.ErrMalformedCursor
		}
		args = append(args, cur.ID)
		where += fmt.Sprintf(` AND (p.score, p.identity_id) > (SELECT x.score, x.identity_id FROM %s x WHERE x.tenant_id = $1 AND x.identity_id = $3)`, posture)
	}
	args = append(args, limit+1)
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name, ''), COALESCE(NULLIF(p.account_name, ''), p.account_id, ''),
			p.score, COALESCE(p.band, ''), COALESCE(c.points_lost, 0), c.failing_since
		FROM %s c
		JOIN %s p ON p.tenant_id = c.tenant_id AND p.identity_id = c.identity_id
		WHERE %s
		ORDER BY p.score ASC, p.identity_id ASC
		LIMIT $%d`, s.Table(common.TIdentityChecks), posture, where, len(args))

	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("query quick-win identities: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var it QuickWinIdentity
		var score, lost sql.NullFloat64
		var since sql.NullTime
		if err := rows.Scan(&it.IdentityID, &it.Name, &it.Account, &score, &it.Band, &lost, &since); err != nil {
			return nil, nil, fmt.Errorf("scan quick-win identity: %w", err)
		}
		it.Score = common.NullFloat(score)
		it.PointsIfFixed = lost.Float64
		it.FailingSince = common.NullTime(since)
		out.Identities = append(out.Identities, it)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	var next *string
	if len(out.Identities) > limit {
		out.Identities = out.Identities[:limit]
		c := common.EncodeCursor(quickWinCursor{ID: out.Identities[limit-1].IdentityID})
		next = &c
	}
	return out, next, nil
}
