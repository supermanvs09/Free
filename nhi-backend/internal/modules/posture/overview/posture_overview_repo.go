package overview

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type PostureOverviewRepository struct{}

func NewPostureOverviewRepository() *PostureOverviewRepository {
	return &PostureOverviewRepository{}
}

// weakestIdentityCount is the size of the "weakest identities" card.
const weakestIdentityCount = 5

type cacheRow struct {
	snapshot  sql.NullTime
	computed  sql.NullTime
	scanID    sql.NullString
	score     sql.NullFloat64
	grade     sql.NullString
	band      sql.NullString
	scored    sql.NullInt64
	healthy   sql.NullInt64
	fair      sql.NullInt64
	poor      sql.NullInt64
	critical  sql.NullInt64
	with      []byte
	pillars   []byte
	wins      []byte
	byClass   []byte
	byAccount []byte
}

// Get implements GET /posture/overview.
//
// Current values come from the latest row of ispm_nhi_dashboard_cache (the
// copy the worker also keeps in Redis). The trend and the "change compared
// with" value follow the window rules: per-scan snapshots for 24h/3d/7d, one
// daily row for 30d/60d/90d.
// class is "" (as before), "HI" or "NHI": every figure below then counts only
// that class, so the score, the trend and the lists agree with the table.
func (r *PostureOverviewRepository) Get(ctx context.Context, s *scope.DataScope, w common.Window, class string) (*PostureOverview, common.Meta, error) {
	if err := common.Need(s); err != nil {
		return nil, common.Meta{}, err
	}
	out := &PostureOverview{
		Fleet:             FleetScore{Change: FleetChange{Window: w.Label}},
		Trend:             []TrendPoint{},
		IdentitiesWith:    map[string]int{},
		QuickWins:         []QuickWin{},
		Pillars:           []common.PillarScore{},
		WeakestIdentities: []WeakIdentity{},
		ByCategory:        []CategoryStat{},
		ByAccount:         []AccountStat{},
	}
	meta := common.Meta{Window: w.Label}

	row, filter, err := r.fleetRow(ctx, s, class)
	if errors.Is(err, sql.ErrNoRows) || (err != nil && common.IsUndefinedTable(err)) {
		return out, meta, nil // nothing computed yet
	}
	if err != nil {
		return nil, meta, err
	}
	meta.DataAvailable = true
	meta.ScanID = row.scanID.String
	meta.ComputedAt = common.NullTime(row.computed)

	out.Fleet.Score = common.NullFloat(row.score)
	out.Fleet.Grade = row.grade.String
	out.Fleet.Band = row.band.String
	out.Fleet.IdentitiesScored = common.IntVal(row.scored)
	out.Distribution = BandDistribution{
		Healthy: common.IntVal(row.healthy), Fair: common.IntVal(row.fair), Poor: common.IntVal(row.poor), Critical: common.IntVal(row.critical),
	}
	out.IdentitiesWith = parseIdentitiesWith(row.with)

	if out.Fleet.Score != nil && row.snapshot.Valid {
		prev, err := r.previousFleetScore(ctx, s, row.snapshot.Time, w.Days, filter)
		if err != nil {
			return nil, meta, err
		}
		if prev != nil {
			delta := common.Round1(*out.Fleet.Score - *prev)
			out.Fleet.Change.Previous = prev
			out.Fleet.Change.Delta = &delta
		}
	}

	if out.Trend, err = r.trend(ctx, s, w, row.snapshot, class, filter); err != nil {
		return nil, meta, err
	}
	if out.Pillars, err = r.pillars(ctx, s, row.pillars); err != nil {
		return nil, meta, err
	}
	if out.QuickWins, err = r.quickWins(ctx, s, row.wins); err != nil {
		return nil, meta, err
	}
	out.QuickWins = r.moreQuickWins(ctx, s, class, out.Fleet.IdentitiesScored, out.QuickWins)
	if out.WeakestIdentities, err = r.weakest(ctx, s, class); err != nil {
		return nil, meta, err
	}

	out.ByCategory = parseCategoryStats(row.byClass, w)
	if len(out.ByCategory) == 0 {
		if out.ByCategory, err = r.liveCategoryStats(ctx, s, w, class); err != nil {
			return nil, meta, err
		}
	}
	out.ByAccount = parseAccountStats(row.byAccount, w)
	if len(out.ByAccount) == 0 {
		if out.ByAccount, err = r.liveAccountStats(ctx, s, w, class); err != nil {
			return nil, meta, err
		}
	}
	return out, meta, nil
}

// fleetRow is the cached fleet row for the class, and the filter it was read
// with, for the comparison and the trend to read the same rows. The engine
// writes one row per class per day: ALL (every identity), HUMAN and NHI.
// "All" reads the ALL row; a cache from before the engine wrote it (no ALL
// row, or no class column) is read as it was, the newest row of the day.
func (r *PostureOverviewRepository) fleetRow(ctx context.Context, s *scope.DataScope, class string) (*cacheRow, string, error) {
	filter := cacheClassSQL(class)
	row, err := r.latestCacheRow(ctx, s, filter)
	if class == "" && (errors.Is(err, sql.ErrNoRows) || (err != nil && common.IsUndefinedColumn(err))) {
		filter = ""
		row, err = r.latestCacheRow(ctx, s, filter)
	}
	return row, filter, err
}

// cacheClassSQL selects the cache and snapshot rows of a class: "" the ALL
// row, "HI" the human row (HUMAN or HI), "NHI" the non-human one. The class
// values are fixed here, so the clause takes no bind parameter.
func cacheClassSQL(class string) string {
	switch class {
	case "HI":
		return " AND upper(identity_class) IN ('HI', 'HUMAN')"
	case "NHI":
		return " AND upper(identity_class) NOT IN ('HI', 'HUMAN', 'ALL')"
	}
	return " AND upper(identity_class) = 'ALL'"
}

func (r *PostureOverviewRepository) latestCacheRow(ctx context.Context, s *scope.DataScope, filter string) (*cacheRow, error) {
	q := fmt.Sprintf(`SELECT snapshot_date, computed_at, last_scan_id::text,
			fleet_score, fleet_grade, fleet_band, identities_scored,
			band_healthy, band_fair, band_poor, band_critical,
			identities_with, pillar_summary, quick_wins, by_functional_class, by_account_mean
		FROM %s
		WHERE tenant_id = $1`+filter+`
		ORDER BY snapshot_date DESC, computed_at DESC
		LIMIT 1`, s.Table(common.TDashboardCache))
	var c cacheRow
	err := s.DB.QueryRowContext(ctx, q, s.TenantID).Scan(
		&c.snapshot, &c.computed, &c.scanID,
		&c.score, &c.grade, &c.band, &c.scored,
		&c.healthy, &c.fair, &c.poor, &c.critical,
		&c.with, &c.pillars, &c.wins, &c.byClass, &c.byAccount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || common.IsUndefinedTable(err) {
			return nil, err
		}
		return nil, fmt.Errorf("load dashboard cache: %w", err)
	}
	return &c, nil
}

// FleetSnapshot is one class's cached fleet figures, as the Posture page
// shows them: the score and its change, how many identities were scored, the
// band counts and each account's mean (by_account_mean).
type FleetSnapshot struct {
	Score    *float64
	Change   *float64 // over the days asked for; nil while the history is shorter
	Scored   int
	Bands    BandDistribution
	Accounts map[string]AccountMean // by account ID
}

// AccountMean is one account's cached mean score.
type AccountMean struct {
	Name   string
	Mean   *float64
	Count  int
	Change *float64 // over the days asked for, when the engine recorded it
}

// Snapshot reads the cached fleet figures for class ("" = the ALL row, "HI",
// "NHI") exactly as Get reads them. nil while nothing has been computed.
func (r *PostureOverviewRepository) Snapshot(ctx context.Context, s *scope.DataScope, class string, days int) (*FleetSnapshot, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	row, filter, err := r.fleetRow(ctx, s, class)
	if errors.Is(err, sql.ErrNoRows) || (err != nil && (common.IsUndefinedTable(err) || common.IsUndefinedColumn(err))) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out := &FleetSnapshot{
		Score:    common.NullFloat(row.score),
		Scored:   common.IntVal(row.scored),
		Bands:    BandDistribution{Healthy: common.IntVal(row.healthy), Fair: common.IntVal(row.fair), Poor: common.IntVal(row.poor), Critical: common.IntVal(row.critical)},
		Accounts: map[string]AccountMean{},
	}
	if out.Score != nil && row.snapshot.Valid {
		prev, err := r.previousFleetScore(ctx, s, row.snapshot.Time, days, filter)
		if err != nil {
			return nil, err
		}
		if prev != nil {
			d := common.Round1(*out.Score - *prev)
			out.Change = &d
		}
	}
	w, _ := common.ParseWindow(fmt.Sprintf("%dd", days))
	if m, ok := common.DecodeAny(row.byAccount).(map[string]any); ok {
		for key, v := range m {
			obj, ok := v.(map[string]any)
			if !ok {
				continue
			}
			id := common.StringOf(obj, "account_id")
			if id == "" {
				id = key
			}
			a := AccountMean{Name: common.StringOf(obj, "account_name", "name"), Mean: common.FloatOf(obj, "mean", "mean_score", "avg", "score")}
			if n := common.IntOf(obj, "count", "identities", "total"); n != nil {
				a.Count = *n
			}
			if a.Change = common.PickWindow(obj["change"], w); a.Change == nil {
				a.Change = common.FloatOf(obj, fmt.Sprintf("change_%dd", days))
			}
			out.Accounts[id] = a
		}
	}
	return out, nil
}

// previousFleetScore is the daily fleet score from `days` days before the
// current snapshot, or nil when the history is not that long yet.
func (r *PostureOverviewRepository) previousFleetScore(ctx context.Context, s *scope.DataScope, current time.Time, days int, filter string) (*float64, error) {
	q := fmt.Sprintf(`SELECT fleet_score FROM %s
		WHERE tenant_id = $1 AND snapshot_date <= $2::date - $3::int AND fleet_score IS NOT NULL`+filter+`
		ORDER BY snapshot_date DESC, computed_at DESC LIMIT 1`, s.Table(common.TDashboardCache))
	var v sql.NullFloat64
	err := s.DB.QueryRowContext(ctx, q, s.TenantID, current, days).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load previous fleet score: %w", err)
	}
	return common.NullFloat(v), nil
}

// trend: one point per scan for 24h/3d/7d, one per day for 30d/60d/90d.
func (r *PostureOverviewRepository) trend(ctx context.Context, s *scope.DataScope, w common.Window, current sql.NullTime, class, filter string) ([]TrendPoint, error) {
	out := make([]TrendPoint, 0, 64)
	if w.PerScan {
		snapFilter := cacheClassSQL(class)
		q := fmt.Sprintf(`SELECT captured_at, fleet_score FROM %s
			WHERE tenant_id = $1 AND captured_at >= $2 AND fleet_score IS NOT NULL`+snapFilter+`
			ORDER BY captured_at`, s.Table(common.TSnapshots))
		rows, err := s.DB.QueryContext(ctx, q, s.TenantID, time.Now().Add(-w.Duration))
		if err != nil && class == "" && common.IsUndefinedColumn(err) {
			// Snapshots kept without a class: one per scan, read as they are.
			q = strings.Replace(q, snapFilter, "", 1)
			rows, err = s.DB.QueryContext(ctx, q, s.TenantID, time.Now().Add(-w.Duration))
		}
		if err != nil {
			return nil, fmt.Errorf("load posture snapshots: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var at time.Time
			var score float64
			if err := rows.Scan(&at, &score); err != nil {
				return nil, fmt.Errorf("scan posture snapshot: %w", err)
			}
			out = append(out, TrendPoint{At: at.UTC().Format(time.RFC3339), Score: common.Round1(score)})
		}
		return out, rows.Err()
	}

	anchor := time.Now()
	if current.Valid {
		anchor = current.Time
	}
	q := fmt.Sprintf(`SELECT snapshot_date, fleet_score FROM %s
		WHERE tenant_id = $1 AND snapshot_date >= $2::date - $3::int AND fleet_score IS NOT NULL`+filter+`
		ORDER BY snapshot_date`, s.Table(common.TDashboardCache))
	rows, err := s.DB.QueryContext(ctx, q, s.TenantID, anchor, w.Days)
	if err != nil {
		return nil, fmt.Errorf("load daily fleet scores: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var day time.Time
		var score float64
		if err := rows.Scan(&day, &score); err != nil {
			return nil, fmt.Errorf("scan daily fleet score: %w", err)
		}
		out = append(out, TrendPoint{At: day.Format("2006-01-02"), Score: common.Round1(score)})
	}
	return out, rows.Err()
}

// parseIdentitiesWith reads {"over_permissioned": 144, …}. A value may also be
// an object carrying the count. Documented keys are always present.
func parseIdentitiesWith(raw []byte) map[string]int {
	out := map[string]int{
		"over_permissioned": 0, "stale_credentials": 0, "escalation_paths": 0,
		"exposed": 0, "dormant": 0, "trust_issues": 0,
	}
	m, ok := common.DecodeAny(raw).(map[string]any)
	if !ok {
		return out
	}
	for k, v := range m {
		if f, ok := common.AsFloat(v); ok {
			out[k] = int(f)
			continue
		}
		if o, ok := v.(map[string]any); ok {
			if n := common.IntOf(o, "count", "identities", "total"); n != nil {
				out[k] = *n
			}
		}
	}
	return out
}

// pillars merges the stored per-pillar numbers with the pillar catalog (names
// and display order). Disabled pillars are hidden.
func (r *PostureOverviewRepository) pillars(ctx context.Context, s *scope.DataScope, raw []byte) ([]common.PillarScore, error) {
	catalog, err := common.LoadPillarCatalog(ctx, s)
	if err != nil {
		if common.IsUndefinedTable(err) {
			catalog = nil
		} else {
			return nil, err
		}
	}
	stats := common.ParsePillarStats(raw)
	out := make([]common.PillarScore, 0, len(stats))
	used := map[string]bool{}
	build := func(code, name string, st common.PillarStat) common.PillarScore {
		p := common.PillarScore{Pillar: code, Name: name, Status: st.Status}
		if st.Score != nil {
			v := common.Round1(*st.Score)
			p.Score = &v
			if p.Status == "" {
				p.Status = common.FleetPillarStatus(v)
			}
		}
		if st.Evaluated != nil {
			p.Evaluated = *st.Evaluated
		}
		if st.Failing != nil {
			p.Failing = *st.Failing
		}
		return p
	}
	for _, pm := range catalog {
		if st, ok := stats[pm.Code]; ok {
			out = append(out, build(pm.Code, pm.Name, st))
			used[pm.Code] = true
		}
	}
	if len(catalog) == 0 { // no catalog: show whatever the worker stored
		codes := make([]string, 0, len(stats))
		for code := range stats {
			if !used[code] {
				codes = append(codes, code)
			}
		}
		sort.Strings(codes)
		for _, code := range codes {
			out = append(out, build(code, common.Humanize(code), stats[code]))
		}
	}
	return out, nil
}

// quickWins reads the stored top rules and fills in titles and pillars from
// the rule catalog when the stored JSON does not carry them.
func (r *PostureOverviewRepository) quickWins(ctx context.Context, s *scope.DataScope, raw []byte) ([]QuickWin, error) {
	items := common.ObjectList(raw, "rule_id", "rule")
	out := make([]QuickWin, 0, len(items))
	ids := make([]string, 0, len(items))
	for _, it := range items {
		id := common.StringOf(it.Obj, "rule_id", "rule", "id")
		if id == "" {
			id = it.Name
		}
		if id == "" {
			continue
		}
		qw := QuickWin{
			RuleID: id,
			Title:  common.StringOf(it.Obj, "title", "check_title", "rule_name", "name"),
			Pillar: common.StringOf(it.Obj, "pillar", "pillar_code"),
		}
		if n := common.IntOf(it.Obj, "identities", "identities_failing", "failing", "count"); n != nil {
			qw.Identities = *n
		}
		if g := common.FloatOf(it.Obj, "fleet_gain", "gain", "fleet_mean_gain"); g != nil {
			qw.FleetGain = common.Round1(*g)
		}
		out = append(out, qw)
		ids = append(ids, id)
	}
	if len(out) == 0 {
		return out, nil
	}
	info, err := r.quickWinTitles(ctx, s, ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		ri := info[out[i].RuleID]
		if out[i].Title == "" {
			out[i].Title = ri[0]
		}
		if out[i].Pillar == "" {
			out[i].Pillar = ri[1]
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].FleetGain > out[j].FleetGain })
	return out, nil
}

// quickWinTitles maps rule id to {title, pillar} from the rule catalog.
func (r *PostureOverviewRepository) quickWinTitles(ctx context.Context, s *scope.DataScope, ids []string) (map[string][2]string, error) {
	q := fmt.Sprintf(`SELECT w.rule_id,
			COALESCE(NULLIF(w.check_title, ''), NULLIF(w.rule_name, ''), w.rule_id),
			COALESCE(c.pillar_code, '')
		FROM %s w LEFT JOIN %s c ON c.category_code = w.category_code
		WHERE w.rule_id = ANY($1::text[])`, s.Table(common.TRuleWeights), s.Table(common.TCategories))
	rows, err := s.DB.QueryContext(ctx, q, pq.Array(ids))
	if err != nil {
		return nil, fmt.Errorf("load quick-win rules: %w", err)
	}
	defer rows.Close()
	info := map[string][2]string{}
	for rows.Next() {
		var id string
		var ri [2]string
		if err := rows.Scan(&id, &ri[0], &ri[1]); err != nil {
			return nil, fmt.Errorf("scan quick-win rule: %w", err)
		}
		info[id] = ri
	}
	return info, rows.Err()
}

// weakest returns the lowest-scoring identities straight from the posture
// table (indexed by score).
func (r *PostureOverviewRepository) weakest(ctx context.Context, s *scope.DataScope, class string) ([]WeakIdentity, error) {
	q := fmt.Sprintf(`SELECT identity_id, COALESCE(identity_name, ''), functional_class,
			COALESCE(NULLIF(account_name, ''), account_id, ''), score, COALESCE(band, ''), COALESCE(checks_failed, 0)
		FROM %s WHERE tenant_id = $1`+classSQL(class, 2)+`
		ORDER BY score ASC, identity_name ASC, identity_id ASC
		LIMIT %d`, s.Table(common.TIdentityPosture), weakestIdentityCount)
	rows, err := s.DB.QueryContext(ctx, q, classArgs(s.TenantID, class)...)
	if err != nil {
		return nil, fmt.Errorf("load weakest identities: %w", err)
	}
	defer rows.Close()
	out := make([]WeakIdentity, 0, weakestIdentityCount)
	for rows.Next() {
		var wi WeakIdentity
		var class sql.NullString
		var score sql.NullFloat64
		var failed sql.NullInt64
		if err := rows.Scan(&wi.IdentityID, &wi.Name, &class, &wi.Account, &score, &wi.Band, &failed); err != nil {
			return nil, fmt.Errorf("scan weakest identity: %w", err)
		}
		wi.FunctionalClass = common.NullStr(class)
		wi.Score = common.NullFloat(score)
		wi.ChecksFailed = common.IntVal(failed)
		out = append(out, wi)
	}
	return out, rows.Err()
}

func parseCategoryStats(raw []byte, w common.Window) []CategoryStat {
	items := common.ObjectList(raw, "functional_class", "class", "category", "name")
	out := make([]CategoryStat, 0, len(items))
	for _, it := range items {
		name := common.StringOf(it.Obj, "functional_class", "class", "category", "name")
		if name == "" {
			name = it.Name
		}
		if name == "" {
			continue
		}
		st := CategoryStat{FunctionalClass: name}
		if n := common.IntOf(it.Obj, "count", "identities", "total"); n != nil {
			st.Count = *n
		}
		if m := common.FloatOf(it.Obj, "mean", "mean_score", "avg", "score"); m != nil {
			st.Mean = common.Round1(*m)
		}
		if c := common.PickWindow(it.Obj["change"], w); c != nil {
			v := common.Round1(*c)
			st.Change = &v
		}
		out = append(out, st)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Mean < out[j].Mean })
	return out
}

func parseAccountStats(raw []byte, w common.Window) []AccountStat {
	items := common.ObjectList(raw, "account", "account_name", "name", "account_id")
	out := make([]AccountStat, 0, len(items))
	for _, it := range items {
		name := common.StringOf(it.Obj, "account", "account_name", "name", "account_id")
		if name == "" {
			name = it.Name
		}
		if name == "" {
			continue
		}
		st := AccountStat{Account: name}
		if n := common.IntOf(it.Obj, "count", "identities", "total"); n != nil {
			st.Count = *n
		}
		if m := common.FloatOf(it.Obj, "mean", "mean_score", "avg", "score"); m != nil {
			st.Mean = common.Round1(*m)
		}
		if c := common.PickWindow(it.Obj["change"], w); c != nil {
			v := common.Round1(*c)
			st.Change = &v
		}
		out = append(out, st)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Mean < out[j].Mean })
	return out
}

// liveCategoryStats is the fallback when the cached JSON is empty: group the
// posture table by functional class. The change is the mean of the identities'
// own score change in the window.
func (r *PostureOverviewRepository) liveCategoryStats(ctx context.Context, s *scope.DataScope, w common.Window, class string) ([]CategoryStat, error) {
	q := fmt.Sprintf(`SELECT functional_class, count(*)::int, avg(score), avg(%s)
		FROM %s WHERE tenant_id = $1 AND functional_class IS NOT NULL AND functional_class <> ''`+classSQL(class, 2)+`
		GROUP BY functional_class ORDER BY avg(score) ASC, functional_class`, w.ChangeColumn, s.Table(common.TIdentityPosture))
	rows, err := s.DB.QueryContext(ctx, q, classArgs(s.TenantID, class)...)
	if err != nil {
		return nil, fmt.Errorf("load category stats: %w", err)
	}
	defer rows.Close()
	out := make([]CategoryStat, 0)
	for rows.Next() {
		var st CategoryStat
		var mean, change sql.NullFloat64
		if err := rows.Scan(&st.FunctionalClass, &st.Count, &mean, &change); err != nil {
			return nil, fmt.Errorf("scan category stat: %w", err)
		}
		if mean.Valid {
			st.Mean = common.Round1(mean.Float64)
		}
		st.Change = common.NullFloat(change)
		out = append(out, st)
	}
	return out, rows.Err()
}

func (r *PostureOverviewRepository) liveAccountStats(ctx context.Context, s *scope.DataScope, w common.Window, class string) ([]AccountStat, error) {
	q := fmt.Sprintf(`SELECT COALESCE(NULLIF(max(account_name), ''), account_id), count(*)::int, avg(score), avg(%s)
		FROM %s WHERE tenant_id = $1 AND account_id IS NOT NULL`+classSQL(class, 2)+`
		GROUP BY account_id ORDER BY avg(score) ASC, account_id`, w.ChangeColumn, s.Table(common.TIdentityPosture))
	rows, err := s.DB.QueryContext(ctx, q, classArgs(s.TenantID, class)...)
	if err != nil {
		return nil, fmt.Errorf("load account stats: %w", err)
	}
	defer rows.Close()
	out := make([]AccountStat, 0)
	for rows.Next() {
		var st AccountStat
		var mean, change sql.NullFloat64
		if err := rows.Scan(&st.Account, &st.Count, &mean, &change); err != nil {
			return nil, fmt.Errorf("scan account stat: %w", err)
		}
		if mean.Valid {
			st.Mean = common.Round1(mean.Float64)
		}
		st.Change = common.NullFloat(change)
		out = append(out, st)
	}
	return out, rows.Err()
}

// classSQL narrows a query to one identity class; n is the bind position its
// value takes (the last argument). Rows written before the class existed
// count as NHI.
func classSQL(class string, n int) string {
	if class == "" {
		return ""
	}
	return fmt.Sprintf(" AND %s = $%d", common.ClassExpr("identity_class"), n)
}

// classArgs is the tenant, the query's own arguments, then the class when given.
func classArgs(tenant string, class string, rest ...any) []any {
	args := append([]any{tenant}, rest...)
	if class != "" {
		args = append(args, class)
	}
	return args
}
