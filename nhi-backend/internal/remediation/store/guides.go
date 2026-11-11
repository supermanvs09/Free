package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"nhi-backend-api/internal/remediation/domain"
)

// GuideFor reads the by-hand fix of a rule from remediation_guides: the rule's own row, else the
// DEFAULT row (enabled rows only). It returns nil, nil when there is neither, or when the table
// does not exist yet (it is created with SQL in the database).
func (s *Store) GuideFor(ctx context.Context, ruleID string) (*domain.Guide, error) {
	var g domain.Guide
	var risk, steps string
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT rule_id, title, description, risk_level, steps::text
		FROM %s WHERE rule_id IN ($1, $2) AND enabled
		ORDER BY rule_id = $2 LIMIT 1`, s.tbl("remediation_guides")), ruleID, domain.GuideDefault).
		Scan(&g.RuleID, &g.Title, &g.Description, &risk, &steps)
	switch {
	case errors.Is(err, pgx.ErrNoRows), undefinedTable(err):
		return nil, nil
	case err != nil:
		return nil, err
	}
	g.RiskLevel, g.Steps = domain.Risk(risk), rawFrom(steps)
	return &g, nil
}
