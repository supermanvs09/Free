// Package reports builds downloadable reports from data the console already
// stores. The posture report says which identities fail which security
// checks, how severe each is and how to fix it: a PDF to read and share, an
// Excel workbook to work through, or a CSV to import elsewhere.
package reports

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/modules/posture/overview"
	"nhi-backend-api/internal/platform/scope"
)

// Identity classes a report can cover.
const (
	ClassAll   = "all"
	ClassHuman = "human"
	ClassNHI   = "nhi"
)

// Severities in report order, highest first.
var Severities = []string{"critical", "high", "medium", "low"}

// PostureOptions is what the person chose on the Reports page.
type PostureOptions struct {
	Class       string   // all | human | nhi
	Severities  []string // subset of Severities; empty = all
	IncludeInfo bool     // what each check looks at
	IncludeFix  bool     // how to fix it
	IncludeSev  bool     // severity column
	Accounts    []string // account IDs to cover; empty = every account
	Population  bool     // also load every scored identity, passing ones too (Excel)
}

// PostureReport is everything one report shows.
type PostureReport struct {
	GeneratedAt     time.Time
	Options         PostureOptions
	ScoredCount     int // identities in the chosen class with a score
	AverageScore    *float64
	Change30d       *float64 // change in the average score over 30 days, as on the Posture page; nil when not tracked
	FleetScore      bool     // the score figures are the engine's, from the dashboard cache
	FailingCount    int      // identities with at least one failing check in the report
	NewChecks       int      // failing checks that started failing in the last 7 days
	OldChecks       int      // failing checks failing for more than 30 days
	CheckCount      int      // failing checks in the report
	BySeverity      map[string]int
	IdentitiesBySev map[string]int // identities whose most severe failing check has this severity
	Bands           []BandCount    // scored identities per score band, worst band first
	Classes         []ClassRow     // human and non-human, when the report covers both
	Accounts        []AccountRow   // most critical failing checks first
	Groups          []CheckGroup   // every failing check, most severe first, then the widest spread
	Identities      []ReportIdentity
	Population      []ReportIdentity // every scored identity, worst first; only with Options.Population
	AccountsCovered int

	// Document control, shown on the cover and in every page footer.
	ReportID    string     // stable reference for this report, e.g. ISPM-20261124-0912-7F3A
	PreparedFor string     // the organisation (tenant) the report is about
	GeneratedBy string     // who asked for it
	DataAsOf    *time.Time // when the posture data was last computed
	Trend       []TrendPoint
	Sample      bool // built from sample data: every page says so
}

// TrendPoint is the average score on one day.
type TrendPoint struct {
	Day   time.Time
	Score float64
}

// BandCount is how many scored identities sit in one score band.
type BandCount struct {
	Band  string
	Count int
}

// ClassRow is the posture of human or non-human identities.
type ClassRow struct {
	Human   bool
	Scored  int
	Average *float64
	Failing int
}

// AccountRow is one account's share of the report.
type AccountRow struct {
	ID, Name string
	Scored   int
	Average  *float64
	Failing  int // identities with a failing check
	Checks   int // failing checks
	BySev    map[string]int
}

// CheckGroup is one check and every identity that fails it.
type CheckGroup struct {
	RuleID   string
	Title    string // the check, the same on every identity
	Severity string
	Area     string
	About    string
	Fix      string // the check's own fix, else the one most identities share
	ManyFix  bool   // some identities have fix steps of their own
	FixFrom  string // when Fix is one finding's and not every identity's: who it was found on ("web-1", "3 of 59 identities")
	Items    []GroupItem
	Accounts []AccountCount // where the identities failing it are, most first
	Since    *time.Time     // when the longest-failing identity started failing it
	Risk     string         // why it matters
	Controls []string       // framework controls it maps to (NIST-AC-6, CIS-1.15, SOC2-CC6.1 ...)
	Points   float64        // score points it takes off, summed over the identities failing it
}

// AccountCount is how many identities failing a check sit in one account.
type AccountCount struct {
	Name  string
	Count int
}

// GroupItem is one identity failing a check.
type GroupItem struct {
	Identity int // index into PostureReport.Identities
	Found    string
	Fix      string
}

// ReportIdentity is one identity with its failing checks, worst first.
type ReportIdentity struct {
	ID        string
	Name      string
	ARN       string
	Type      string
	Human     bool
	AccountID string
	Account   string
	Score     *float64
	Band      string
	Checks    []ReportCheck
}

// Worst is the identity's most severe failing check severity, "" when none.
func (r ReportIdentity) Worst() string {
	worst := ""
	for _, c := range r.Checks {
		if worst == "" || sevRank(c.Severity) < sevRank(worst) {
			worst = c.Severity
		}
	}
	return worst
}

// CountSev counts the identity's failing checks of one severity.
func (r ReportIdentity) CountSev(sev string) int {
	n := 0
	for _, c := range r.Checks {
		if c.Severity == sev {
			n++
		}
	}
	return n
}

// ReportCheck is one failing check on one identity.
type ReportCheck struct {
	RuleID       string
	Check        string // the check's name, the same on every identity
	Title        string // the problem on this identity, as a sentence
	Severity     string // lower case
	Area         string
	Found        string // what the scan found on this identity
	About        string // what the check looks at
	Fix          string // how to fix it on this identity
	RuleFix      string // the check's own fix, the same on every identity
	FailingSince *time.Time
	Risk         string   // why it matters
	Controls     []string // framework controls it maps to
	Points       float64  // score points it takes off this identity
}

// Bands in report order, worst first; the Posture page's bands.
var Bands = []string{"critical", "poor", "fair", "healthy"}

// LoadPosture reads the report from the posture tables. Like the Posture
// page, it covers every connected account of the tenant.
func LoadPosture(ctx context.Context, s *scope.DataScope, o PostureOptions) (*PostureReport, error) {
	if s == nil || s.DB == nil {
		return nil, fmt.Errorf("posture report: no data scope")
	}
	rep := &PostureReport{GeneratedAt: time.Now().UTC(), Options: o, BySeverity: map[string]int{}}

	classWhere := accountWhere(o.Accounts)
	switch o.Class {
	case ClassHuman:
		classWhere += " AND " + common.ClassExpr("p.identity_class") + " = 'HI'"
	case ClassNHI:
		classWhere += " AND " + common.ClassExpr("p.identity_class") + " = 'NHI'"
	}

	// Identities in the class: the denominator of the summary.
	var avg, change sql.NullFloat64
	if err := s.DB.QueryRowContext(ctx, fmt.Sprintf(`SELECT count(*) FILTER (WHERE p.score IS NOT NULL), avg(p.score),
			count(DISTINCT p.account_id), avg(p.score_change_30d)
		FROM %s p WHERE p.tenant_id = $1`+classWhere, s.Table(common.TIdentityPosture)), s.TenantID).Scan(&rep.ScoredCount, &avg, &rep.AccountsCovered, &change); err != nil {
		if common.IsUndefinedTable(err) {
			return rep, nil
		}
		return nil, fmt.Errorf("posture report summary: %w", err)
	}
	if avg.Valid {
		v := avg.Float64
		rep.AverageScore = &v
	}
	if err := loadBreakdowns(ctx, s, rep, classWhere); err != nil {
		return nil, err
	}
	if err := applyCache(ctx, s, rep, change); err != nil {
		return nil, err
	}

	sev := o.Severities
	if len(sev) == 0 {
		// Every severity, and checks the engine left unrated.
		sev = append(append([]string{}, Severities...), "")
	}
	// The by-hand fix per rule (remediation_guides) fills "how to fix" when no
	// finding carries one. Joined only when the table exists for this tenant.
	guideJoin, guideCol := "", "''"
	var guides sql.NullString
	if err := s.DB.QueryRowContext(ctx, `SELECT to_regclass($1)::text`, s.Table("remediation_guides")).Scan(&guides); err == nil && guides.Valid {
		guideJoin = fmt.Sprintf(" LEFT JOIN %s g ON g.rule_id = c.rule_id", s.Table("remediation_guides"))
		guideCol = "NULLIF(g.description, '')"
	}
	q := fmt.Sprintf(`SELECT p.identity_id::text, COALESCE(p.identity_name, ''), COALESCE(p.identity_arn, ''), COALESCE(p.identity_type, ''),
			%[5]s = 'HI', COALESCE(p.account_id, ''), COALESCE(p.account_name, ''), p.score, COALESCE(p.band, ''),
			c.rule_id, lower(COALESCE(c.severity, '')), COALESCE(c.pillar_code, ''), COALESCE(c.detail, ''), c.failing_since,
			COALESCE(NULLIF(f.title, ''), NULLIF(w.rule_name, ''), NULLIF(w.check_title, ''), c.rule_id),
			COALESCE(NULLIF(w.rule_name, ''), NULLIF(w.check_title, ''), NULLIF(f.title, ''), c.rule_id),
			COALESCE(NULLIF(w.description, ''), NULLIF(f.description, ''), ''),
			COALESCE(NULLIF(f.remediation, ''), %[6]s, NULLIF(w.fix_label, ''), ''),
			COALESCE(%[6]s, NULLIF(w.fix_label, ''), '')
		FROM %[1]s p
		JOIN %[2]s c ON c.tenant_id = p.tenant_id AND c.identity_id = p.identity_id
		LEFT JOIN %[3]s w ON w.rule_id = c.rule_id
		/* The check's own finding, else the latest finding raised for the same
		   identity and rule: that is where the finding page's title, risk
		   and "how to fix" text live. */
		LEFT JOIN LATERAL (
			SELECT f.title, f.description, f.remediation FROM %[4]s f
			WHERE f.tenant_id = c.tenant_id
			  AND (f.finding_id = c.finding_id OR (c.finding_id IS NULL AND f.identity_id::text = c.identity_id::text AND f.rule_id = c.rule_id))
			ORDER BY (f.finding_id = c.finding_id) DESC NULLS LAST, f.last_seen DESC NULLS LAST
			LIMIT 1) f ON true`+guideJoin+`
		WHERE p.tenant_id = $1 AND upper(c.status) IN ('FAIL', 'FAILED')
		  AND lower(COALESCE(c.severity, '')) = ANY($2::text[])`+classWhere+`
		ORDER BY p.score ASC NULLS LAST, p.identity_name, p.identity_id,
			CASE lower(COALESCE(c.severity, '')) WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
			COALESCE(c.points_lost, 0) DESC, c.rule_id`,
		s.Table(common.TIdentityPosture), s.Table(common.TIdentityChecks), s.Table(common.TRuleWeights), s.Table(common.TFindings),
		common.ClassExpr("p.identity_class"), guideCol)
	rows, err := s.DB.QueryContext(ctx, q, s.TenantID, pq.Array(sev))
	if err != nil {
		if common.IsUndefinedTable(err) {
			return rep, nil
		}
		return nil, fmt.Errorf("posture report checks: %w", err)
	}
	defer rows.Close()

	var cur *ReportIdentity
	var curID string
	for rows.Next() {
		var id string
		var ri ReportIdentity
		var score sql.NullFloat64
		var ck ReportCheck
		var since sql.NullTime
		if err := rows.Scan(&id, &ri.Name, &ri.ARN, &ri.Type, &ri.Human, &ri.AccountID, &ri.Account, &score, &ri.Band,
			&ck.RuleID, &ck.Severity, &ck.Area, &ck.Found, &since, &ck.Title, &ck.Check, &ck.About, &ck.Fix, &ck.RuleFix); err != nil {
			return nil, fmt.Errorf("scan posture report row: %w", err)
		}
		if since.Valid {
			t := since.Time
			ck.FailingSince = &t
		}
		if id != curID || cur == nil {
			ri.ID = id
			ri.Band = strings.ToLower(ri.Band)
			if score.Valid {
				v := score.Float64
				ri.Score = &v
			}
			rep.Identities = append(rep.Identities, ri)
			cur = &rep.Identities[len(rep.Identities)-1]
			curID = id
		}
		cur.Checks = append(cur.Checks, ck)
		rep.CheckCount++
		rep.BySeverity[ck.Severity]++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rep.FailingCount = len(rep.Identities)
	summarise(rep)
	if o.Population {
		if err := loadPopulation(ctx, s, rep, classWhere); err != nil {
			return nil, err
		}
	}
	return rep, nil
}

// summarise builds the per-check groups and the per-account and per-class
// failing counts from the identities.
func summarise(rep *PostureReport) {
	rep.IdentitiesBySev = map[string]int{}
	byRule := map[string]int{}
	fixes := map[string]map[string]int{}     // per check: fix on the identity -> identities
	ruleFixes := map[string]map[string]int{} // per check: the rule's own fix -> identities
	accts := map[string]map[string]int{}     // per check: account -> identities
	acct := map[string]int{}
	for i, a := range rep.Accounts {
		acct[a.ID] = i
	}
	failingHuman, failingNHI := 0, 0
	for idx, id := range rep.Identities {
		rep.IdentitiesBySev[id.Worst()]++
		if id.Human {
			failingHuman++
		} else {
			failingNHI++
		}
		ai, ok := acct[id.AccountID]
		if !ok {
			rep.Accounts = append(rep.Accounts, AccountRow{ID: id.AccountID, Name: id.Account, BySev: map[string]int{}})
			ai = len(rep.Accounts) - 1
			acct[id.AccountID] = ai
		}
		rep.Accounts[ai].Failing++
		for _, c := range id.Checks {
			rep.Accounts[ai].Checks++
			rep.Accounts[ai].BySev[c.Severity]++
			key := c.RuleID
			if key == "" {
				key = c.Check
			}
			gi, ok := byRule[key]
			if !ok {
				rep.Groups = append(rep.Groups, CheckGroup{RuleID: c.RuleID, Title: c.Check, Severity: c.Severity, Area: c.Area, About: c.About})
				gi = len(rep.Groups) - 1
				byRule[key] = gi
				fixes[key] = map[string]int{}
				ruleFixes[key] = map[string]int{}
				accts[key] = map[string]int{}
			}
			g := &rep.Groups[gi]
			if sevRank(c.Severity) < sevRank(g.Severity) {
				g.Severity = c.Severity
			}
			if c.FailingSince != nil {
				if g.Since == nil || c.FailingSince.Before(*g.Since) {
					g.Since = c.FailingSince
				}
				switch age := rep.GeneratedAt.Sub(*c.FailingSince); {
				case age <= 7*24*time.Hour:
					rep.NewChecks++
				case age > 30*24*time.Hour:
					rep.OldChecks++
				}
			}
			if g.About == "" {
				g.About = c.About
			}
			if g.Risk == "" {
				g.Risk = c.Risk
			}
			g.Controls = mergeControls(g.Controls, c.Controls)
			g.Points += c.Points
			if strings.TrimSpace(c.Fix) != "" {
				fixes[key][c.Fix]++
			}
			if strings.TrimSpace(c.RuleFix) != "" {
				ruleFixes[key][c.RuleFix]++
			}
			accts[key][accountName(AccountRow{ID: id.AccountID, Name: id.Account})]++
			g.Items = append(g.Items, GroupItem{Identity: idx, Found: c.Found, Fix: c.Fix})
		}
	}
	for key, gi := range byRule {
		g := &rep.Groups[gi]
		// The rule's own fix reads right for every identity; a finding's fix
		// can name one identity ("... the actions web-1 uses"), so it is used
		// only when the rule has none.
		g.Fix = mostCommon(ruleFixes[key])
		if g.Fix == "" {
			g.Fix = mostCommon(fixes[key])
			if n := fixes[key][g.Fix]; g.Fix != "" && n < len(g.Items) {
				g.FixFrom = fmt.Sprintf("%s of %s", num(n), count(len(g.Items), "identity", "identities"))
				if n == 1 {
					for _, it := range g.Items {
						if it.Fix == g.Fix {
							g.FixFrom = rep.Identities[it.Identity].Name
							break
						}
					}
				}
			}
		}
		for fix := range fixes[key] {
			if fix != g.Fix {
				g.ManyFix = true
				break
			}
		}
		for name, n := range accts[key] {
			g.Accounts = append(g.Accounts, AccountCount{Name: name, Count: n})
		}
		sort.Slice(g.Accounts, func(i, j int) bool {
			if g.Accounts[i].Count != g.Accounts[j].Count {
				return g.Accounts[i].Count > g.Accounts[j].Count
			}
			return g.Accounts[i].Name < g.Accounts[j].Name
		})
	}
	sortGroups(rep.Groups)
	for i := range rep.Classes {
		if rep.Classes[i].Human {
			rep.Classes[i].Failing = failingHuman
		} else {
			rep.Classes[i].Failing = failingNHI
		}
	}
	sort.SliceStable(rep.Accounts, func(i, j int) bool {
		a, b := rep.Accounts[i], rep.Accounts[j]
		for _, s := range Severities {
			if a.BySev[s] != b.BySev[s] {
				return a.BySev[s] > b.BySev[s]
			}
		}
		if a.Failing != b.Failing {
			return a.Failing > b.Failing
		}
		return accountName(a) < accountName(b)
	})
}

// applyCache puts the engine's own figures in the report: the average score,
// its 30-day change, how many identities were scored, the bands, the human and
// non-human scores and each account's mean all come from the dashboard cache
// (ispm_nhi_dashboard_cache), the rows the Posture page shows: ALL, HUMAN or
// NHI for the class. A report on chosen accounts takes those accounts' cached
// means (by_account_mean), weighted by how many identities each scored; the
// cache keeps no human / non-human split per account, so that report leaves
// it out. Only a tenant whose cache is not computed yet keeps the figures read
// from the identities themselves.
func applyCache(ctx context.Context, s *scope.DataScope, rep *PostureReport, identityChange sql.NullFloat64) error {
	repo := overview.NewPostureOverviewRepository()
	snap, err := repo.Snapshot(ctx, s, cacheClass[rep.Options.Class], 30)
	if err != nil {
		return fmt.Errorf("posture report fleet score: %w", err)
	}
	if snap == nil {
		if rep.AverageScore != nil {
			v := round1(*rep.AverageScore)
			rep.AverageScore = &v
		}
		if identityChange.Valid {
			v := round1(identityChange.Float64)
			rep.Change30d = &v
		}
		return nil
	}
	rep.FleetScore = true

	if len(rep.Options.Accounts) == 0 {
		rep.AverageScore, rep.Change30d, rep.ScoredCount = snap.Score, snap.Change, snap.Scored
		rep.Bands = bandCounts(snap.Bands)
		for i := range rep.Classes {
			class := "NHI"
			if rep.Classes[i].Human {
				class = "HI"
			}
			cs, err := repo.Snapshot(ctx, s, class, 30)
			if err != nil {
				return fmt.Errorf("posture report class fleet score: %w", err)
			}
			if cs != nil {
				rep.Classes[i].Average, rep.Classes[i].Scored = cs.Score, cs.Scored
			}
		}
	} else {
		var sum, n, csum, cn float64
		for _, id := range rep.Options.Accounts {
			a, ok := snap.Accounts[id]
			if !ok || a.Mean == nil {
				continue
			}
			w := float64(a.Count)
			if w <= 0 {
				w = 1
			}
			sum, n = sum+*a.Mean*w, n+w
			if a.Change != nil {
				csum, cn = csum+*a.Change*w, cn+w
			}
		}
		rep.AverageScore, rep.Change30d = nil, nil
		if n > 0 {
			v := round1(sum / n)
			rep.AverageScore, rep.ScoredCount = &v, int(n)
		}
		if cn > 0 {
			v := round1(csum / cn)
			rep.Change30d = &v
		}
		rep.Classes = nil
	}

	for i := range rep.Accounts {
		if a, ok := snap.Accounts[rep.Accounts[i].ID]; ok && a.Mean != nil {
			rep.Accounts[i].Average, rep.Accounts[i].Scored = a.Mean, a.Count
		}
	}
	return nil
}

// cacheClass is the report's identity choice as the cache's class.
var cacheClass = map[string]string{ClassAll: "", ClassHuman: "HI", ClassNHI: "NHI"}

// bandCounts lists the cached band counts in report order, empty bands left out.
func bandCounts(b overview.BandDistribution) []BandCount {
	var out []BandCount
	for _, bc := range []BandCount{{"critical", b.Critical}, {"poor", b.Poor}, {"fair", b.Fair}, {"healthy", b.Healthy}} {
		if bc.Count > 0 {
			out = append(out, bc)
		}
	}
	return out
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// accountWhere limits the posture rows (alias p) to the chosen accounts. The
// IDs are written as quoted SQL literals, so the clause composes with each
// query's own placeholders; they are length-checked when the request is read.
func accountWhere(ids []string) string {
	if len(ids) == 0 {
		return ""
	}
	quoted := make([]string, len(ids))
	for i, id := range ids {
		quoted[i] = pq.QuoteLiteral(id)
	}
	return " AND p.account_id IN (" + strings.Join(quoted, ", ") + ")"
}

// ScopeLabel names who the report covers: "All identities", or
// "Human identities in team-4 and team-6".
func (rep *PostureReport) ScopeLabel() string {
	label := ClassLabel(rep.Options.Class)
	if len(rep.Options.Accounts) == 0 {
		return label
	}
	names := map[string]string{}
	for _, a := range rep.Accounts {
		names[a.ID] = accountName(a)
	}
	var shown []string
	for _, id := range rep.Options.Accounts {
		if n := names[id]; n != "" {
			shown = append(shown, n)
		} else {
			shown = append(shown, id)
		}
	}
	switch {
	case len(shown) == 1:
		return label + " in " + shown[0]
	case len(shown) <= 3:
		return label + " in " + strings.Join(shown[:len(shown)-1], ", ") + " and " + shown[len(shown)-1]
	}
	return fmt.Sprintf("%s in %s and %d more accounts", label, strings.Join(shown[:2], ", "), len(shown)-2)
}

// mostCommon is the value counted most often; ties go to the first in order.
func mostCommon(counts map[string]int) string {
	best, n := "", 0
	for v, c := range counts {
		if c > n || (c == n && v < best) {
			best, n = v, c
		}
	}
	return best
}

// PriorityIdentities is the identities to fix first: the most severe failing
// check first, then the most such checks, then the lowest score.
func (rep *PostureReport) PriorityIdentities() []ReportIdentity {
	out := append([]ReportIdentity(nil), rep.Identities...)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if ra, rb := sevRank(a.Worst()), sevRank(b.Worst()); ra != rb {
			return ra < rb
		}
		if na, nb := a.CountSev(a.Worst()), b.CountSev(b.Worst()); na != nb {
			return na > nb
		}
		return scoreOr(a.Score) < scoreOr(b.Score)
	})
	return out
}

func scoreOr(v *float64) float64 {
	if v == nil {
		return 101
	}
	return *v
}

func accountName(a AccountRow) string {
	if a.Name != "" {
		return a.Name
	}
	return a.ID
}

// loadBreakdowns reads the scored identities per band, per class and per
// account: the denominators the summary compares failing counts with.
func loadBreakdowns(ctx context.Context, s *scope.DataScope, rep *PostureReport, classWhere string) error {
	t := s.Table(common.TIdentityPosture)
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT lower(COALESCE(p.band, '')), count(*)
		FROM %s p WHERE p.tenant_id = $1 AND p.score IS NOT NULL`+classWhere+` GROUP BY 1`, t), s.TenantID)
	if err != nil {
		return fmt.Errorf("posture report bands: %w", err)
	}
	got := map[string]int{}
	for rows.Next() {
		var b string
		var n int
		if err := rows.Scan(&b, &n); err != nil {
			rows.Close()
			return err
		}
		got[b] = n
	}
	rows.Close()
	for _, b := range Bands {
		if got[b] > 0 {
			rep.Bands = append(rep.Bands, BandCount{Band: b, Count: got[b]})
		}
		delete(got, b)
	}
	for b, n := range got { // a band the Posture page does not know, last
		rep.Bands = append(rep.Bands, BandCount{Band: b, Count: n})
	}

	if rep.Options.Class == ClassAll || rep.Options.Class == "" {
		rows, err = s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT %[2]s = 'HI', count(*), avg(p.score)
			FROM %[1]s p WHERE p.tenant_id = $1 AND p.score IS NOT NULL`+accountWhere(rep.Options.Accounts)+` GROUP BY 1 ORDER BY 1`, t, common.ClassExpr("p.identity_class")), s.TenantID)
		if err != nil {
			return fmt.Errorf("posture report classes: %w", err)
		}
		for rows.Next() {
			var c ClassRow
			var avg sql.NullFloat64
			if err := rows.Scan(&c.Human, &c.Scored, &avg); err != nil {
				rows.Close()
				return err
			}
			if avg.Valid {
				v := avg.Float64
				c.Average = &v
			}
			rep.Classes = append(rep.Classes, c)
		}
		rows.Close()
	}

	rows, err = s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT COALESCE(p.account_id, ''), COALESCE(max(NULLIF(p.account_name, '')), ''),
			count(*) FILTER (WHERE p.score IS NOT NULL), avg(p.score)
		FROM %s p WHERE p.tenant_id = $1`+classWhere+` GROUP BY 1`, t), s.TenantID)
	if err != nil {
		return fmt.Errorf("posture report accounts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		a := AccountRow{BySev: map[string]int{}}
		var avg sql.NullFloat64
		if err := rows.Scan(&a.ID, &a.Name, &a.Scored, &avg); err != nil {
			return err
		}
		if avg.Valid {
			v := avg.Float64
			a.Average = &v
		}
		rep.Accounts = append(rep.Accounts, a)
	}
	return rows.Err()
}

// loadPopulation reads every scored identity, passing ones included, so the
// workbook's Identities sheet shows the whole population an auditor samples.
func loadPopulation(ctx context.Context, s *scope.DataScope, rep *PostureReport, classWhere string) error {
	failing := map[string]int{}
	for i, id := range rep.Identities {
		failing[id.ID] = i
	}
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT p.identity_id::text, COALESCE(p.identity_name, ''), COALESCE(p.identity_arn, ''),
			COALESCE(p.identity_type, ''), %[2]s = 'HI', COALESCE(p.account_id, ''), COALESCE(p.account_name, ''), p.score, lower(COALESCE(p.band, ''))
		FROM %[1]s p WHERE p.tenant_id = $1`+classWhere+`
		ORDER BY p.score ASC NULLS LAST, p.identity_name, p.identity_id`, s.Table(common.TIdentityPosture), common.ClassExpr("p.identity_class")), s.TenantID)
	if err != nil {
		return fmt.Errorf("posture report identities: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var ri ReportIdentity
		var score sql.NullFloat64
		if err := rows.Scan(&ri.ID, &ri.Name, &ri.ARN, &ri.Type, &ri.Human, &ri.AccountID, &ri.Account, &score, &ri.Band); err != nil {
			return err
		}
		if score.Valid {
			v := score.Float64
			ri.Score = &v
		}
		if i, ok := failing[ri.ID]; ok {
			ri.Checks = rep.Identities[i].Checks
		}
		rep.Population = append(rep.Population, ri)
	}
	return rows.Err()
}

func sevRank(s string) int {
	for i, v := range Severities {
		if v == s {
			return i
		}
	}
	return len(Severities)
}

// SeverityLabel is "Critical", "High" ...; an unrated check reads "Unrated".
func SeverityLabel(s string) string {
	if s == "" {
		return "Unrated"
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// ClassLabel names the report's scope.
func ClassLabel(c string) string {
	switch c {
	case ClassHuman:
		return "Human identities"
	case ClassNHI:
		return "Non-human identities"
	}
	return "All identities"
}

// AreaLabel turns a pillar code into words: least_privilege -> Least privilege.
func AreaLabel(code string) string {
	t := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(code, "_", " "), "-", " "))
	if t == "" {
		return ""
	}
	return strings.ToUpper(t[:1]) + strings.ToLower(t[1:])
}

// sortGroups orders checks most severe first, then by how many identities
// fail them: the order an auditor, the security team or a CISO reads in.
func sortGroups(groups []CheckGroup) {
	sort.SliceStable(groups, func(i, j int) bool {
		a, b := groups[i], groups[j]
		if sevRank(a.Severity) != sevRank(b.Severity) {
			return sevRank(a.Severity) < sevRank(b.Severity)
		}
		if len(a.Items) != len(b.Items) {
			return len(a.Items) > len(b.Items)
		}
		return a.Title < b.Title
	})
}
