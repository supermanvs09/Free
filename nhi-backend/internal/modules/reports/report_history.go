package reports

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

// SLAPolicy is how many days a finding of each severity may stay open.
type SLAPolicy struct {
	Days   map[string]int
	Source string // where the days come from, said in the report
}

// DefaultSLA is used when the client has set no remediation SLA of their own.
// Critical and high follow the federal remediation clocks the industry has
// long benchmarked against (15 and 30 days from detection); medium and low
// take 90 and 180 days, so an estate with thousands of identities can meet
// them with planned work instead of a permanent backlog of overdue items.
func DefaultSLA() SLAPolicy {
	return SLAPolicy{
		Days:   map[string]int{"critical": 15, "high": 30, "medium": 90, "low": 180},
		Source: "Default remediation targets (critical 15, high 30, medium 90, low 180 days from first detection)",
	}
}

// Due is the SLA days for a severity; unrated findings get the low target.
func (p SLAPolicy) Due(sev string) int {
	if d, ok := p.Days[sev]; ok && d > 0 {
		return d
	}
	return p.Days["low"]
}

// PeriodStats is what changed in one reporting period.
type PeriodStats struct {
	Start, End     time.Time
	New, Resolved  int
	NewBySev       map[string]int
	ResolvedBySev  map[string]int
	MedianDays     map[string]float64 // median days from detection to fix, findings fixed in the period
	FixedInSLA     map[string]int     // fixed in the period within the SLA
	Accepted       int                // findings accepted or suppressed in the period
}

// History is the report's view over time: this period and the one before.
type History struct {
	Days     int
	Current  PeriodStats
	Previous PeriodStats
}

// Exception is a finding the client accepted or suppressed.
type Exception struct {
	Check, Severity, Identity, Account, Reason, Owner string
	Since, Until                                      *time.Time
}

// AgeBucket is how many open findings of each severity fall in an age range.
type AgeBucket struct {
	Label string
	BySev map[string]int
}

// AgeBuckets are the ranges open findings are counted in, in days.
var AgeBuckets = []struct {
	Label    string
	From, To int // inclusive; To < 0 = no end
}{{"0-15 days", 0, 15}, {"16-30 days", 16, 30}, {"31-90 days", 31, 90}, {"91-180 days", 91, 180}, {"Over 180 days", 181, -1}}

// Aging counts the report's open findings by age and severity.
func (rep *PostureReport) Aging() []AgeBucket {
	out := make([]AgeBucket, len(AgeBuckets))
	for i, b := range AgeBuckets {
		out[i] = AgeBucket{Label: b.Label, BySev: map[string]int{}}
	}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			d := rep.DaysFailing(c.FailingSince)
			if d < 0 {
				continue
			}
			for i, b := range AgeBuckets {
				if d >= b.From && (b.To < 0 || d <= b.To) {
					out[i].BySev[c.Severity]++
					break
				}
			}
		}
	}
	return out
}

// Overdue counts open findings past their SLA, by severity.
func (rep *PostureReport) Overdue() map[string]int {
	out := map[string]int{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			if d := rep.DaysFailing(c.FailingSince); d >= 0 && d > rep.SLA.Due(c.Severity) {
				out[c.Severity]++
			}
		}
	}
	return out
}

// OverdueCheck reports whether one finding is past its SLA, and by how much.
func (rep *PostureReport) OverdueCheck(c ReportCheck) (bool, int) {
	d := rep.DaysFailing(c.FailingSince)
	if d < 0 {
		return false, 0
	}
	due := rep.SLA.Due(c.Severity)
	return d > due, d - due
}

// DueDate is when a finding should be fixed by.
func (rep *PostureReport) DueDate(c ReportCheck) *time.Time {
	if c.FailingSince == nil {
		return nil
	}
	t := c.FailingSince.AddDate(0, 0, rep.SLA.Due(c.Severity))
	return &t
}

// loadSLA reads the client's remediation SLA (their Jira integration's
// sla_days) or falls back to DefaultSLA.
func loadSLA(ctx context.Context, s *scope.DataScope) SLAPolicy {
	def := DefaultSLA()
	var raw []byte
	err := s.DB.QueryRowContext(ctx, fmt.Sprintf(`SELECT config FROM %s WHERE upper(type) = 'JIRA' AND enabled ORDER BY integration_id LIMIT 1`,
		s.Table("remediation_integrations"))).Scan(&raw)
	if err != nil {
		return def
	}
	var cfg struct {
		SLADays map[string]int `json:"sla_days"`
	}
	if json.Unmarshal(raw, &cfg) != nil || len(cfg.SLADays) == 0 {
		return def
	}
	p := SLAPolicy{Days: map[string]int{}, Source: "Your remediation SLA (set in the Jira integration)"}
	for k, v := range cfg.SLADays {
		if v > 0 {
			p.Days[strings.ToLower(k)] = v
		}
	}
	for s, d := range def.Days {
		if _, ok := p.Days[s]; !ok {
			p.Days[s] = d
		}
	}
	return p
}

// loadHistory reads what changed in this period and the one before from the
// findings table: raised, fixed (and how fast), accepted; and the findings
// the client accepted or suppressed.
func loadHistory(ctx context.Context, s *scope.DataScope, rep *PostureReport, days int) error {
	o := rep.Options
	where := " AND f.tenant_id = $1"
	args := []interface{}{s.TenantID}
	switch o.Class {
	case ClassHuman:
		where += " AND " + common.ClassExpr("f.identity_class") + " = 'HI'"
	case ClassNHI:
		where += " AND " + common.ClassExpr("f.identity_class") + " = 'NHI'"
	}
	if len(o.Accounts) > 0 {
		args = append(args, pq.Array(o.Accounts))
		where += fmt.Sprintf(" AND f.account_id = ANY($%d::text[])", len(args))
	}
	if len(o.Severities) > 0 && len(o.Severities) < len(Severities) {
		args = append(args, pq.Array(o.Severities))
		where += fmt.Sprintf(" AND lower(f.severity) = ANY($%d::text[])", len(args))
	}
	end := rep.GeneratedAt
	h := &History{Days: days}
	h.Current = PeriodStats{Start: end.AddDate(0, 0, -days), End: end}
	h.Previous = PeriodStats{Start: end.AddDate(0, 0, -2*days), End: h.Current.Start}
	table := s.Table(common.TFindings)
	sla := fmt.Sprintf(`CASE lower(f.severity) WHEN 'critical' THEN %d WHEN 'high' THEN %d WHEN 'medium' THEN %d ELSE %d END`,
		rep.SLA.Due("critical"), rep.SLA.Due("high"), rep.SLA.Due("medium"), rep.SLA.Due("low"))
	for _, p := range []*PeriodStats{&h.Current, &h.Previous} {
		p.NewBySev, p.ResolvedBySev, p.MedianDays, p.FixedInSLA = map[string]int{}, map[string]int{}, map[string]float64{}, map[string]int{}
		a := append(append([]interface{}{}, args...), p.Start, p.End)
		ps, pe := len(a)-1, len(a)
		q := fmt.Sprintf(`SELECT lower(COALESCE(f.severity, '')),
				count(*) FILTER (WHERE f.first_seen >= $%[1]d AND f.first_seen < $%[2]d),
				count(*) FILTER (WHERE upper(f.status) = 'RESOLVED' AND f.resolved_at >= $%[1]d AND f.resolved_at < $%[2]d),
				count(*) FILTER (WHERE upper(f.status) = 'RESOLVED' AND f.resolved_at >= $%[1]d AND f.resolved_at < $%[2]d
					AND f.resolved_at - f.first_seen <= make_interval(days => %[4]s)),
				percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM f.resolved_at - f.first_seen) / 86400)
					FILTER (WHERE upper(f.status) = 'RESOLVED' AND f.resolved_at >= $%[1]d AND f.resolved_at < $%[2]d),
				count(*) FILTER (WHERE upper(f.status) IN ('ACCEPTED', 'SUPPRESSED') AND f.updated_at >= $%[1]d AND f.updated_at < $%[2]d)
			FROM %[3]s f WHERE true`+where+` GROUP BY 1`, ps, pe, table, sla)
		rows, err := s.DB.QueryContext(ctx, q, a...)
		if err != nil {
			if common.IsUndefinedTable(err) {
				return nil
			}
			return fmt.Errorf("posture report history: %w", err)
		}
		for rows.Next() {
			var sev string
			var nw, res, inSLA, acc int
			var med sql.NullFloat64
			if err := rows.Scan(&sev, &nw, &res, &inSLA, &med, &acc); err != nil {
				rows.Close()
				return err
			}
			p.NewBySev[sev] += nw
			p.ResolvedBySev[sev] += res
			p.FixedInSLA[sev] += inSLA
			p.New += nw
			p.Resolved += res
			p.Accepted += acc
			if med.Valid {
				p.MedianDays[sev] = round1(med.Float64)
			}
		}
		rows.Close()
	}
	rep.History = h

	// Accepted and suppressed findings: the exceptions an auditor asks for.
	q := fmt.Sprintf(`SELECT COALESCE(NULLIF(f.rule_name, ''), f.rule_id, ''), lower(COALESCE(f.severity, '')), COALESCE(f.identity_name, ''), COALESCE(f.account_id, ''),
			COALESCE(NULLIF(f.accepted_reason, ''), NULLIF(f.notes, ''), ''), COALESCE(f.assigned_to, ''), f.updated_at, f.suppressed_until
		FROM %s f WHERE upper(f.status) IN ('ACCEPTED', 'SUPPRESSED')`+where+`
		ORDER BY CASE lower(f.severity) WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, f.updated_at DESC LIMIT 5000`, table)
	rows, err := s.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("posture report exceptions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var e Exception
		var since, until sql.NullTime
		if err := rows.Scan(&e.Check, &e.Severity, &e.Identity, &e.Account, &e.Reason, &e.Owner, &since, &until); err != nil {
			return err
		}
		if since.Valid {
			t := since.Time
			e.Since = &t
		}
		if until.Valid {
			t := until.Time
			e.Until = &t
		}
		rep.Exceptions = append(rep.Exceptions, e)
	}
	return rows.Err()
}

// Delta is a count against the previous period: "+12", "-4", "no change".
func Delta(now, before int) string {
	switch d := now - before; {
	case d > 0:
		return fmt.Sprintf("+%s", num(d))
	case d < 0:
		return fmt.Sprintf("-%s", num(-d))
	}
	return "no change"
}

// SLACompliance is the share of findings fixed in the period within SLA.
func (p PeriodStats) SLACompliance() (pctv float64, ok bool) {
	in := 0
	for _, n := range p.FixedInSLA {
		in += n
	}
	if p.Resolved == 0 {
		return 0, false
	}
	return float64(in) / float64(p.Resolved), true
}

// OverallMedian is the median days to fix across severities, weighted by
// how many were fixed; NaN-free: ok is false when nothing was fixed.
func (p PeriodStats) OverallMedian() (float64, bool) {
	type kv struct {
		d float64
		n int
	}
	var list []kv
	total := 0
	for sev, d := range p.MedianDays {
		n := p.ResolvedBySev[sev]
		list = append(list, kv{d, n})
		total += n
	}
	if total == 0 {
		return 0, false
	}
	sort.Slice(list, func(i, j int) bool { return list[i].d < list[j].d })
	half, acc := float64(total)/2, 0
	for _, v := range list {
		acc += v.n
		if float64(acc) >= half {
			return v.d, true
		}
	}
	return list[len(list)-1].d, true
}
