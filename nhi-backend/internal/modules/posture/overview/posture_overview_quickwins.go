package overview

import (
	"context"
	"fmt"
	"sort"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

// maxQuickWins is how many quick wins the overview returns in all. The worker
// stores only its top few in the dashboard cache; the console shows five and
// folds the rest behind "See more".
const maxQuickWins = 15

// moreQuickWins tops the worker's stored quick wins up to maxQuickWins with the
// next failing checks, computed live the way the fleet gain is defined
// everywhere else: each failing identity gains min(points lost, 100 - score),
// and the fleet gain is the sum over the identities scored. Rules already in
// the stored list keep their stored numbers. A failure here costs only the
// extra rows, never the overview.
func (r *PostureOverviewRepository) moreQuickWins(ctx context.Context, s *scope.DataScope, class string, scored int, stored []QuickWin) []QuickWin {
	if len(stored) >= maxQuickWins || scored <= 0 {
		return stored
	}
	have := make([]string, 0, len(stored))
	for _, w := range stored {
		have = append(have, w.RuleID)
	}
	args := []any{s.TenantID, scored, have, maxQuickWins}
	classCond := ""
	if class != "" {
		args = append(args, class)
		classCond = " AND " + common.ClassExpr("p.identity_class") + " = $5"
	}
	q := fmt.Sprintf(`SELECT c.rule_id, COUNT(DISTINCT c.identity_id)::int,
			SUM(LEAST(COALESCE(c.points_lost, 0), GREATEST(100 - COALESCE(p.score, 100), 0)))::float8 / $2::float8
		FROM %s c JOIN %s p ON p.tenant_id = c.tenant_id AND p.identity_id = c.identity_id
		WHERE c.tenant_id = $1 AND c.status = 'FAIL' AND NOT (c.rule_id = ANY($3::text[]))%s
		GROUP BY c.rule_id
		HAVING SUM(LEAST(COALESCE(c.points_lost, 0), GREATEST(100 - COALESCE(p.score, 100), 0))) > 0
		ORDER BY 3 DESC, c.rule_id
		LIMIT $4`, s.Table(common.TIdentityChecks), s.Table(common.TIdentityPosture), classCond)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		logging.FromContext(ctx).Warn("posture quick wins: could not add more", "err", err)
		return stored
	}
	defer rows.Close()
	extra := []QuickWin{}
	ids := []string{}
	for rows.Next() {
		var w QuickWin
		var gain float64
		if err := rows.Scan(&w.RuleID, &w.Identities, &gain); err != nil {
			logging.FromContext(ctx).Warn("posture quick wins: could not read more", "err", err)
			return stored
		}
		w.FleetGain = common.Round1(gain)
		extra = append(extra, w)
		ids = append(ids, w.RuleID)
	}
	if rows.Err() != nil || len(extra) == 0 {
		return stored
	}
	titles, err := r.quickWinTitles(ctx, s, ids)
	if err != nil {
		logging.FromContext(ctx).Warn("posture quick wins: could not name more", "err", err)
		return stored
	}
	for i := range extra {
		extra[i].Title, extra[i].Pillar = titles[extra[i].RuleID][0], titles[extra[i].RuleID][1]
	}
	out := append(append([]QuickWin{}, stored...), extra...)
	if len(out) > maxQuickWins {
		out = out[:maxQuickWins]
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].FleetGain > out[j].FleetGain })
	return out
}
