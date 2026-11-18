package overview

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

// The worker writes the dashboard cache for the whole tenant. When the user's
// saved scope leaves accounts out, every card is recomputed here from the
// identity rows of the scoped accounts instead, so the page matches the
// accounts the user chose. "Identities with" uses the worker's own
// definitions and is left out under a narrowed scope rather than shown for
// accounts the user did not choose.

const scopedQuickWinCount = 5

// scopedWhere is the scoped identity test: tenant, accounts, optional class.
// Arguments: $1 tenant, $2 accounts, then $3 class when given.
func scopedWhere(s *scope.DataScope, class, alias string) (string, []any) {
	p := alias + "."
	where := p + "tenant_id = $1 AND " + p + "account_id = ANY($2::text[])"
	args := []any{s.TenantID, pq.Array(s.AccountIDs)}
	if class != "" {
		where += " AND " + common.ClassExpr(p+"identity_class") + " = $3"
		args = append(args, class)
	}
	return where, args
}

// bandOf is the fleet band for a mean score: Healthy 80+, Fair 60-79,
// Poor 40-59, Critical below 40.
func bandOf(score float64) string {
	switch {
	case score >= 80:
		return "healthy"
	case score >= 60:
		return "fair"
	case score >= 40:
		return "poor"
	}
	return "critical"
}

func (r *PostureOverviewRepository) scopedOverview(ctx context.Context, s *scope.DataScope, w common.Window, class string, out *PostureOverview, anchor sql.NullTime) error {
	where, args := scopedWhere(s, class, "p")
	posture := s.Table(common.TIdentityPosture)

	var mean sql.NullFloat64
	var n, healthy, fair, poor, critical int
	q := fmt.Sprintf(`SELECT avg(p.score), count(*)::int,
			count(*) FILTER (WHERE upper(p.band) = 'HEALTHY')::int, count(*) FILTER (WHERE upper(p.band) = 'FAIR')::int,
			count(*) FILTER (WHERE upper(p.band) = 'POOR')::int, count(*) FILTER (WHERE upper(p.band) = 'CRITICAL')::int
		FROM %s p WHERE %s`, posture, where)
	if err := s.DB.QueryRowContext(ctx, q, args...).Scan(&mean, &n, &healthy, &fair, &poor, &critical); err != nil {
		return fmt.Errorf("scoped fleet score: %w", err)
	}
	out.Fleet.Score, out.Fleet.Grade, out.Fleet.Band = nil, "", ""
	if mean.Valid {
		v := common.Round1(mean.Float64)
		out.Fleet.Score = &v
		out.Fleet.Band = bandOf(v)
	}
	out.Fleet.IdentitiesScored = n
	out.Distribution = BandDistribution{Healthy: healthy, Fair: fair, Poor: poor, Critical: critical}
	out.IdentitiesWith = map[string]int{}

	var err error
	if out.Trend, err = r.scopedTrend(ctx, s, w, class, anchor); err != nil {
		return err
	}
	out.Fleet.Change = FleetChange{Window: w.Label}
	if out.Fleet.Score != nil && len(out.Trend) > 1 && !w.PerScan {
		prev := out.Trend[0].Score
		delta := common.Round1(*out.Fleet.Score - prev)
		out.Fleet.Change.Previous = &prev
		out.Fleet.Change.Delta = &delta
	}
	if out.Pillars, err = r.scopedPillars(ctx, s, class); err != nil {
		return err
	}
	if out.QuickWins, err = r.scopedQuickWins(ctx, s, class, n); err != nil {
		return err
	}
	if out.WeakestIdentities, err = r.scopedWeakest(ctx, s, class); err != nil {
		return err
	}
	if out.ByCategory, err = r.scopedGroupStats(ctx, s, w, class, "p.functional_class"); err != nil {
		return err
	}
	byAccount, err := r.scopedGroupStats(ctx, s, w, class, "COALESCE(NULLIF(p.account_name, ''), p.account_id)")
	if err != nil {
		return err
	}
	out.ByAccount = make([]AccountStat, 0, len(byAccount))
	for _, c := range byAccount {
		out.ByAccount = append(out.ByAccount, AccountStat{Account: c.FunctionalClass, Count: c.Count, Mean: c.Mean, Change: c.Change})
	}
	return nil
}

// scopedTrend is the mean score per day of the scoped identities, from their
// daily history. Per-scan windows (24h, 3d, 7d) use days too: per-scan
// snapshots exist only for the whole tenant.
func (r *PostureOverviewRepository) scopedTrend(ctx context.Context, s *scope.DataScope, w common.Window, class string, anchor sql.NullTime) ([]TrendPoint, error) {
	where, args := scopedWhere(s, class, "p")
	at := time.Now()
	if anchor.Valid {
		at = anchor.Time
	}
	days := w.Days
	if days < 1 {
		days = int(w.Duration.Hours()/24) + 1
	}
	args = append(args, at, days)
	q := fmt.Sprintf(`SELECT d.snapshot_date, avg(d.score)
		FROM %s d JOIN %s p ON p.tenant_id = d.tenant_id AND p.identity_id = d.identity_id
		WHERE %s AND d.snapshot_date >= $%d::date - $%d::int AND d.score IS NOT NULL
		GROUP BY d.snapshot_date ORDER BY d.snapshot_date`,
		s.Table(common.TPostureDaily), s.Table(common.TIdentityPosture), where, len(args)-1, len(args))
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		if common.IsUndefinedTable(err) {
			return []TrendPoint{}, nil
		}
		return nil, fmt.Errorf("scoped trend: %w", err)
	}
	defer rows.Close()
	out := make([]TrendPoint, 0, 64)
	for rows.Next() {
		var day time.Time
		var score float64
		if err := rows.Scan(&day, &score); err != nil {
			return nil, fmt.Errorf("scan scoped trend: %w", err)
		}
		out = append(out, TrendPoint{At: day.Format("2006-01-02"), Score: common.Round1(score)})
	}
	return out, rows.Err()
}

// scopedPillars averages each pillar over the scoped identities' own pillar
// scores, then reuses the cached-row path for names, order and status.
func (r *PostureOverviewRepository) scopedPillars(ctx context.Context, s *scope.DataScope, class string) ([]common.PillarScore, error) {
	where, args := scopedWhere(s, class, "p")
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT p.pillar_scores FROM %s p WHERE %s AND p.pillar_scores IS NOT NULL`, s.Table(common.TIdentityPosture), where), args...)
	if err != nil {
		return nil, fmt.Errorf("scoped pillars: %w", err)
	}
	defer rows.Close()
	type acc struct {
		sum                 float64
		n, evaluated, fails int
	}
	totals := map[string]*acc{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, fmt.Errorf("scan scoped pillars: %w", err)
		}
		for code, st := range identityPillars(raw) {
			a := totals[code]
			if a == nil {
				a = &acc{}
				totals[code] = a
			}
			if st.Score != nil {
				a.sum += *st.Score
				a.n++
			}
			if st.Evaluated != nil {
				a.evaluated += *st.Evaluated
			}
			if st.Failing != nil {
				a.fails += *st.Failing
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	list := make([]map[string]any, 0, len(totals))
	for code, a := range totals {
		item := map[string]any{"pillar": code, "evaluated": a.evaluated, "failing": a.fails}
		if a.n > 0 {
			item["score"] = a.sum / float64(a.n)
		}
		list = append(list, item)
	}
	raw, _ := json.Marshal(list)
	return r.pillars(ctx, s, raw)
}

// identityPillars reads one identity's pillar_scores in either stored form:
// a list of pillar objects, or an object keyed by pillar code whose values are
// a score or a pillar object.
func identityPillars(raw []byte) map[string]common.PillarStat {
	if stats := common.ParsePillarStats(raw); len(stats) > 0 {
		return stats
	}
	out := map[string]common.PillarStat{}
	m, ok := common.DecodeAny(raw).(map[string]any)
	if !ok {
		return out
	}
	for code, v := range m {
		if f, ok := common.AsFloat(v); ok {
			out[code] = common.PillarStat{Score: &f}
			continue
		}
		if o, ok := v.(map[string]any); ok {
			out[code] = common.PillarStat{
				Score:     common.FloatOf(o, "score", "mean", "pillar_score", "value"),
				Evaluated: common.IntOf(o, "evaluated", "checks_evaluated"),
				Failing:   common.IntOf(o, "failing", "failed", "checks_failed"),
			}
		}
	}
	return out
}

// scopedQuickWins: the failing rules with the largest mean score gain over the
// scoped identities (points lost to the rule / identities scored).
func (r *PostureOverviewRepository) scopedQuickWins(ctx context.Context, s *scope.DataScope, class string, scored int) ([]QuickWin, error) {
	if scored == 0 {
		return []QuickWin{}, nil
	}
	where, args := scopedWhere(s, class, "p")
	q := fmt.Sprintf(`SELECT c.rule_id, count(DISTINCT c.identity_id)::int, COALESCE(sum(c.points_lost), 0)::float8
		FROM %s c JOIN %s p ON p.tenant_id = c.tenant_id AND p.identity_id = c.identity_id
		WHERE %s AND c.status = 'FAIL'
		GROUP BY c.rule_id ORDER BY 3 DESC, c.rule_id LIMIT %d`,
		s.Table(common.TIdentityChecks), s.Table(common.TIdentityPosture), where, scopedQuickWinCount)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("scoped quick wins: %w", err)
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var rule string
		var identities int
		var lost float64
		if err := rows.Scan(&rule, &identities, &lost); err != nil {
			return nil, fmt.Errorf("scan scoped quick win: %w", err)
		}
		list = append(list, map[string]any{"rule_id": rule, "identities": identities, "fleet_gain": lost / float64(scored)})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(list)
	return r.quickWins(ctx, s, raw)
}

func (r *PostureOverviewRepository) scopedWeakest(ctx context.Context, s *scope.DataScope, class string) ([]WeakIdentity, error) {
	where, args := scopedWhere(s, class, "p")
	q := fmt.Sprintf(`SELECT p.identity_id, COALESCE(p.identity_name, ''), p.functional_class,
			COALESCE(NULLIF(p.account_name, ''), p.account_id, ''), p.score, COALESCE(p.band, ''), COALESCE(p.checks_failed, 0)
		FROM %s p WHERE %s
		ORDER BY p.score ASC, p.identity_name ASC, p.identity_id ASC
		LIMIT %d`, s.Table(common.TIdentityPosture), where, weakestIdentityCount)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("scoped weakest identities: %w", err)
	}
	defer rows.Close()
	out := make([]WeakIdentity, 0, weakestIdentityCount)
	for rows.Next() {
		var wi WeakIdentity
		var fc sql.NullString
		var score sql.NullFloat64
		var failed sql.NullInt64
		if err := rows.Scan(&wi.IdentityID, &wi.Name, &fc, &wi.Account, &score, &wi.Band, &failed); err != nil {
			return nil, fmt.Errorf("scan scoped weakest identity: %w", err)
		}
		wi.FunctionalClass = common.NullStr(fc)
		wi.Score = common.NullFloat(score)
		wi.ChecksFailed = common.IntVal(failed)
		out = append(out, wi)
	}
	return out, rows.Err()
}

// scopedGroupStats groups the scoped identities by an expression (a fixed
// column expression from this file, never user input), lowest mean first.
func (r *PostureOverviewRepository) scopedGroupStats(ctx context.Context, s *scope.DataScope, w common.Window, class, groupExpr string) ([]CategoryStat, error) {
	where, args := scopedWhere(s, class, "p")
	q := fmt.Sprintf(`SELECT %[1]s, count(*)::int, avg(p.score), avg(p.%[2]s)
		FROM %[3]s p WHERE %[4]s AND %[1]s IS NOT NULL AND %[1]s <> ''
		GROUP BY %[1]s ORDER BY avg(p.score) ASC, %[1]s`, groupExpr, w.ChangeColumn, s.Table(common.TIdentityPosture), where)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("scoped group stats: %w", err)
	}
	defer rows.Close()
	out := make([]CategoryStat, 0)
	for rows.Next() {
		var st CategoryStat
		var mean, change sql.NullFloat64
		if err := rows.Scan(&st.FunctionalClass, &st.Count, &mean, &change); err != nil {
			return nil, fmt.Errorf("scan scoped group stat: %w", err)
		}
		if mean.Valid {
			st.Mean = common.Round1(mean.Float64)
		}
		st.Change = common.NullFloat(change)
		out = append(out, st)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Mean < out[j].Mean })
	return out, rows.Err()
}
