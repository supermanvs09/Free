// Package reports builds downloadable reports from data the console already
// stores. The posture report lists, per identity, the security checks it
// fails: what the check is, what was found, how severe it is and how to fix
// it, as a PDF to read or a CSV to filter.
package reports

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
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
}

// PostureReport is everything one report shows.
type PostureReport struct {
	GeneratedAt     time.Time
	Options         PostureOptions
	ScoredCount     int // identities in the chosen class with a score
	AverageScore    *float64
	FailingCount    int // identities with at least one failing check in the report
	CheckCount      int // failing checks in the report
	BySeverity      map[string]int
	TopChecks       []TopCheck
	Identities      []ReportIdentity
	AccountsCovered int
}

// TopCheck is one check and how many identities fail it.
type TopCheck struct {
	Title      string
	Severity   string
	Identities int
}

// ReportIdentity is one identity with its failing checks, worst first.
type ReportIdentity struct {
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

// ReportCheck is one failing check on one identity.
type ReportCheck struct {
	RuleID       string
	Title        string // the problem, as a sentence
	Severity     string // lower case
	Area         string
	Found        string // what the scan found on this identity
	About        string // what the check looks at
	Fix          string // how to fix it
	FailingSince *time.Time
}

// LoadPosture reads the report from the posture tables. Like the Posture
// page, it covers every connected account of the tenant.
func LoadPosture(ctx context.Context, s *scope.DataScope, o PostureOptions) (*PostureReport, error) {
	if s == nil || s.DB == nil {
		return nil, fmt.Errorf("posture report: no data scope")
	}
	rep := &PostureReport{GeneratedAt: time.Now().UTC(), Options: o, BySeverity: map[string]int{}}

	classWhere := ""
	switch o.Class {
	case ClassHuman:
		classWhere = " AND " + common.ClassExpr("p.identity_class") + " = 'HI'"
	case ClassNHI:
		classWhere = " AND " + common.ClassExpr("p.identity_class") + " = 'NHI'"
	}

	// Identities in the class: the denominator of the summary.
	var avg sql.NullFloat64
	if err := s.DB.QueryRowContext(ctx, fmt.Sprintf(`SELECT count(*) FILTER (WHERE p.score IS NOT NULL), avg(p.score),
			count(DISTINCT p.account_id)
		FROM %s p WHERE p.tenant_id = $1`+classWhere, s.Table(common.TIdentityPosture)), s.TenantID).Scan(&rep.ScoredCount, &avg, &rep.AccountsCovered); err != nil {
		if common.IsUndefinedTable(err) {
			return rep, nil
		}
		return nil, fmt.Errorf("posture report summary: %w", err)
	}
	if avg.Valid {
		v := avg.Float64
		rep.AverageScore = &v
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
			COALESCE(NULLIF(w.description, ''), NULLIF(f.description, ''), ''),
			COALESCE(NULLIF(f.remediation, ''), %[6]s, NULLIF(w.fix_label, ''), '')
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

	type topKey struct{ title, sev string }
	top := map[topKey]map[string]bool{}
	var cur *ReportIdentity
	var curID string
	for rows.Next() {
		var id string
		var ri ReportIdentity
		var score sql.NullFloat64
		var ck ReportCheck
		var since sql.NullTime
		if err := rows.Scan(&id, &ri.Name, &ri.ARN, &ri.Type, &ri.Human, &ri.AccountID, &ri.Account, &score, &ri.Band,
			&ck.RuleID, &ck.Severity, &ck.Area, &ck.Found, &since, &ck.Title, &ck.About, &ck.Fix); err != nil {
			return nil, fmt.Errorf("scan posture report row: %w", err)
		}
		if since.Valid {
			t := since.Time
			ck.FailingSince = &t
		}
		if id != curID || cur == nil {
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
		k := topKey{ck.Title, ck.Severity}
		if top[k] == nil {
			top[k] = map[string]bool{}
		}
		top[k][id] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rep.FailingCount = len(rep.Identities)
	for k, ids := range top {
		rep.TopChecks = append(rep.TopChecks, TopCheck{Title: k.title, Severity: k.sev, Identities: len(ids)})
	}
	sort.Slice(rep.TopChecks, func(i, j int) bool {
		a, b := rep.TopChecks[i], rep.TopChecks[j]
		if a.Identities != b.Identities {
			return a.Identities > b.Identities
		}
		if sevRank(a.Severity) != sevRank(b.Severity) {
			return sevRank(a.Severity) < sevRank(b.Severity)
		}
		return a.Title < b.Title
	})
	if len(rep.TopChecks) > 10 {
		rep.TopChecks = rep.TopChecks[:10]
	}
	return rep, nil
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
