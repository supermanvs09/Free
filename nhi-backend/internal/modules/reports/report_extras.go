package reports

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Brand lines every report opens with.
const (
	BrandTitle     = "Continuous AI Security Posture Management"
	BrandTagline   = "Securing your Identities and Digital Ecosystem from AI-driven threats."
	ReportTitle    = "Identity Security Posture Report"
	Classification = "CONFIDENTIAL · Internal use only"
)

// NewReportID is a stable, human-quotable reference for one report:
// ISPM-<yyyymmdd>-<hhmm>-<4 hex of tenant and time>.
func NewReportID(tenant string, at time.Time) string {
	sum := sha256.Sum256([]byte(tenant + "|" + at.UTC().Format(time.RFC3339Nano)))
	return fmt.Sprintf("ISPM-%s-%s", at.UTC().Format("20060102-1504"), strings.ToUpper(hex.EncodeToString(sum[:2])))
}

// ID is the report's reference, made up when the caller set none.
func (rep *PostureReport) ID() string {
	if rep.ReportID == "" {
		rep.ReportID = NewReportID(rep.PreparedFor, rep.GeneratedAt)
	}
	return rep.ReportID
}

// mergeControls adds the controls in add that list does not have yet.
func mergeControls(list, add []string) []string {
	for _, c := range add {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		seen := false
		for _, have := range list {
			if have == c {
				seen = true
				break
			}
		}
		if !seen {
			list = append(list, c)
		}
	}
	return list
}

// Framework names a control tag's framework and the control within it:
// NIST-AC-6 -> ("NIST SP 800-53", "AC-6").
func Framework(tag string) (framework, control string) {
	t := strings.TrimSpace(tag)
	switch {
	case strings.HasPrefix(t, "NIST-"):
		return "NIST SP 800-53", strings.TrimPrefix(t, "NIST-")
	case strings.HasPrefix(t, "CIS-"):
		return "CIS AWS Foundations Benchmark", strings.TrimPrefix(t, "CIS-")
	case strings.HasPrefix(t, "SOC2-"):
		return "SOC 2 Trust Services Criteria", strings.TrimPrefix(t, "SOC2-")
	case strings.HasPrefix(t, "PCI-DSS-"):
		return "PCI DSS", strings.TrimPrefix(t, "PCI-DSS-")
	case strings.HasPrefix(t, "PCI-"):
		return "PCI DSS", strings.TrimPrefix(t, "PCI-")
	case strings.HasPrefix(t, "SH-"):
		return "AWS Security Hub controls", strings.TrimPrefix(t, "SH-")
	}
	return "Other", t
}

// FrameworkOrder is the order frameworks are listed in.
var FrameworkOrder = []string{"NIST SP 800-53", "CIS AWS Foundations Benchmark", "SOC 2 Trust Services Criteria", "PCI DSS", "AWS Security Hub controls", "Other"}

// ControlRow is one framework control and the failing checks mapped to it.
type ControlRow struct {
	Framework  string
	Control    string
	Checks     []int // indexes into PostureReport.Groups
	Identities int   // distinct identities failing any of them
	Worst      string
}

// FrameworkRow sums one framework.
type FrameworkRow struct {
	Name       string
	Controls   int // controls with at least one failing check
	Checks     int // failing checks mapped to it
	Identities int // distinct identities affected
	Worst      string
	Rows       []ControlRow
}

// Frameworks maps the failing checks onto framework controls, most affected
// first. A check without controls is left out.
func (rep *PostureReport) Frameworks() []FrameworkRow {
	type acc struct {
		row ControlRow
		ids map[int]bool
	}
	byKey := map[string]*acc{}
	fwIDs := map[string]map[int]bool{}
	fwChecks := map[string]map[int]bool{}
	for gi, g := range rep.Groups {
		for _, tag := range g.Controls {
			fw, ctl := Framework(tag)
			key := fw + "|" + ctl
			a, ok := byKey[key]
			if !ok {
				a = &acc{row: ControlRow{Framework: fw, Control: ctl, Worst: g.Severity}, ids: map[int]bool{}}
				byKey[key] = a
			}
			a.row.Checks = append(a.row.Checks, gi)
			if sevRank(g.Severity) < sevRank(a.row.Worst) {
				a.row.Worst = g.Severity
			}
			if fwIDs[fw] == nil {
				fwIDs[fw], fwChecks[fw] = map[int]bool{}, map[int]bool{}
			}
			fwChecks[fw][gi] = true
			for _, it := range g.Items {
				a.ids[it.Identity] = true
				fwIDs[fw][it.Identity] = true
			}
		}
	}
	out := []FrameworkRow{}
	for _, name := range FrameworkOrder {
		fr := FrameworkRow{Name: name, Worst: ""}
		for _, a := range byKey {
			if a.row.Framework != name {
				continue
			}
			a.row.Identities = len(a.ids)
			fr.Rows = append(fr.Rows, a.row)
			if fr.Worst == "" || sevRank(a.row.Worst) < sevRank(fr.Worst) {
				fr.Worst = a.row.Worst
			}
		}
		if len(fr.Rows) == 0 {
			continue
		}
		sort.Slice(fr.Rows, func(i, j int) bool {
			a, b := fr.Rows[i], fr.Rows[j]
			if sevRank(a.Worst) != sevRank(b.Worst) {
				return sevRank(a.Worst) < sevRank(b.Worst)
			}
			if a.Identities != b.Identities {
				return a.Identities > b.Identities
			}
			return a.Control < b.Control
		})
		fr.Controls, fr.Checks, fr.Identities = len(fr.Rows), len(fwChecks[name]), len(fwIDs[name])
		out = append(out, fr)
	}
	return out
}

// AreaRow is one security area's failing checks.
type AreaRow struct {
	Area       string
	Checks     int // distinct checks failing
	Findings   int // identity x check
	Identities int
	BySev      map[string]int // findings per severity
}

// Areas sums the failing checks per security area, most findings first.
func (rep *PostureReport) Areas() []AreaRow {
	idx := map[string]int{}
	var out []AreaRow
	ids := map[string]map[int]bool{}
	for _, g := range rep.Groups {
		area := AreaLabel(g.Area)
		if area == "" {
			area = "Other"
		}
		i, ok := idx[area]
		if !ok {
			out = append(out, AreaRow{Area: area, BySev: map[string]int{}})
			i = len(out) - 1
			idx[area] = i
			ids[area] = map[int]bool{}
		}
		out[i].Checks++
		out[i].Findings += len(g.Items)
		out[i].BySev[g.Severity] += len(g.Items)
		for _, it := range g.Items {
			ids[area][it.Identity] = true
		}
	}
	for i := range out {
		out[i].Identities = len(ids[out[i].Area])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Findings > out[j].Findings })
	return out
}

// Uplift is how much fixing one check everywhere would raise the average
// score (GainIfFixed for that check).
func (rep *PostureReport) Uplift(g CheckGroup) float64 {
	for i := range rep.Groups {
		if rep.Groups[i].RuleID == g.RuleID {
			return rep.GainIfFixed(i)
		}
	}
	return 0
}

// FindingRef is a check's stable reference in the report: F-001, F-002 ...
// in report order (most severe first).
func FindingRef(i int) string { return fmt.Sprintf("F-%03d", i+1) }

// Priority puts a check in a remediation wave: P1 fix now (critical, or high
// on many identities), P2 this sprint, P3 planned, P4 hygiene.
func (rep *PostureReport) Priority(g CheckGroup) string {
	wide := rep.ScoredCount > 0 && float64(len(g.Items)) >= 0.1*float64(rep.ScoredCount)
	switch {
	case g.Severity == "critical", g.Severity == "high" && wide:
		return "P1"
	case g.Severity == "high", g.Severity == "medium" && wide:
		return "P2"
	case g.Severity == "medium":
		return "P3"
	}
	return "P4"
}

// PriorityText says what a priority asks for.
func PriorityText(p string) string {
	switch p {
	case "P1":
		return "Fix now"
	case "P2":
		return "This sprint"
	case "P3":
		return "Planned"
	}
	return "Hygiene"
}

// DaysFailing is how long a check has failed, from the oldest identity.
func (rep *PostureReport) DaysFailing(since *time.Time) int {
	if since == nil {
		return -1
	}
	d := int(rep.GeneratedAt.Sub(*since).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}

// SeverityMeaning is what each severity asks of the reader.
var SeverityMeaning = map[string]string{
	"critical": "Exploitable now or gives broad control of the account. Fix immediately.",
	"high":     "A likely path to misuse or data access. Fix within days.",
	"medium":   "Weakens defences or hides misuse. Fix in the next planned change.",
	"low":      "Hygiene and governance gaps. Fix as part of routine clean-up.",
}

// BandRange is a score band's range on the Posture page.
var BandRange = map[string]string{
	"healthy":  "80 to 100",
	"fair":     "60 to 79",
	"poor":     "40 to 59",
	"critical": "0 to 39",
}

// OWASP Non-Human Identities Top 10 (2025).
var OWASPNHI = []struct{ ID, Title string }{
	{"NHI1", "Improper Offboarding"}, {"NHI2", "Secret Leakage"}, {"NHI3", "Vulnerable Third-Party NHI"},
	{"NHI4", "Insecure Authentication"}, {"NHI5", "Overprivileged NHI"}, {"NHI6", "Insecure Cloud Deployment Configurations"},
	{"NHI7", "Long-Lived Secrets"}, {"NHI8", "Environment Isolation"}, {"NHI9", "NHI Reuse"}, {"NHI10", "Human Use of NHI"},
}

// nhiRisk maps each posture check to the OWASP NHI Top 10 risks it is
// evidence of, by hand from the check's definition. Checks about general
// cloud configuration (data exposure, workload hardening, behaviour) map to
// none.
var nhiRisk = map[string][]string{
	"IAM-02": {"NHI1"}, "IAM-21": {"NHI1"}, "IAM-22": {"NHI1"}, "IAM-23": {"NHI1"}, "IAM-24": {"NHI1"}, "IAM-30": {"NHI1"},
	"STS-02": {"NHI1"}, "STS-05": {"NHI1"}, "LC-010": {"NHI1"}, "I11": {"NHI1"},
	"CR-006": {"NHI2"}, "ECR-02": {"NHI2"}, "ECS-01": {"NHI2"}, "LAM-01": {"NHI2"}, "S3-02": {"NHI2"}, "SSM-02": {"NHI2"}, "LAM-06": {"NHI2"},
	"IAM-15": {"NHI3"}, "IAM-16": {"NHI3"}, "IAM-17": {"NHI3"}, "KMS-02": {"NHI3"},
	"CH-005": {"NHI4", "NHI10"}, "IAM-04": {"NHI4"}, "I08": {"NHI4"}, "IAM-29": {"NHI4"}, "I01": {"NHI4"}, "CR-002": {"NHI4"}, "CR-003": {"NHI4"}, "I02": {"NHI4"},
	"IAM-06": {"NHI5"}, "IAM-07": {"NHI5"}, "IAM-31": {"NHI5"}, "ECS-04": {"NHI5"}, "EKS-03": {"NHI5"}, "RDS-01": {"NHI5"}, "RS-01": {"NHI5"},
	"SSM-03": {"NHI5"}, "ACM-02": {"NHI5"}, "E-I09": {"NHI5"}, "CICD-02": {"NHI5", "NHI6"}, "IAM-10": {"NHI5"}, "IAM-11": {"NHI5"}, "IAM-12": {"NHI5"},
	"IAM-13": {"NHI5"}, "IAM-25": {"NHI5"}, "IAM-26": {"NHI5"}, "PE-010": {"NHI5"}, "PE-013": {"NHI5"}, "IAM-18": {"NHI5"}, "IAM-27": {"NHI5"},
	"IAM-28": {"NHI5"}, "ORG-02": {"NHI5"}, "PATH-03": {"NHI5"}, "PATH-05": {"NHI5"}, "CB-01": {"NHI5", "NHI6"}, "SEC-02": {"NHI5"},
	"CICD-01": {"NHI6"}, "CICD-03": {"NHI6", "NHI7"}, "STS-04": {"NHI6"}, "STS-01": {"NHI6"}, "EKS-04": {"NHI6"}, "STS-03": {"NHI6"},
	"IAM-03": {"NHI7"}, "SEC-01": {"NHI7"}, "KMS-03": {"NHI7"}, "CH-009": {"NHI7"}, "CH-011": {"NHI7"}, "ACM-01": {"NHI7"}, "I06": {"NHI7"},
	"IAM-19": {"NHI7"}, "I10": {"NHI7"},
	"PATH-02": {"NHI8"},
	"LAM-03":  {"NHI9"}, "EKS-01": {"NHI9"}, "EKS-02": {"NHI9"}, "EKS-06": {"NHI9"},
	"BEH-04": {"NHI10"},
}

// NHIRisks is the OWASP NHI Top 10 risks a check is evidence of.
func NHIRisks(ruleID string) []string { return nhiRisk[strings.ToUpper(strings.TrimSpace(ruleID))] }

// NHIRow is one OWASP NHI risk and the failing checks that evidence it.
type NHIRow struct {
	ID, Title  string
	Checks     []int // indexes into Groups
	Findings   int
	Identities int
	Worst      string
}

// NHITop10 is the report's failing checks against the OWASP NHI Top 10, in
// list order; risks with no failing check are kept, with zeros.
func (rep *PostureReport) NHITop10() []NHIRow {
	out := make([]NHIRow, len(OWASPNHI))
	ids := make([]map[int]bool, len(OWASPNHI))
	for i, r := range OWASPNHI {
		out[i] = NHIRow{ID: r.ID, Title: r.Title}
		ids[i] = map[int]bool{}
	}
	for gi, g := range rep.Groups {
		for _, risk := range NHIRisks(g.RuleID) {
			for i := range out {
				if out[i].ID != risk {
					continue
				}
				out[i].Checks = append(out[i].Checks, gi)
				out[i].Findings += len(g.Items)
				if out[i].Worst == "" || sevRank(g.Severity) < sevRank(out[i].Worst) {
					out[i].Worst = g.Severity
				}
				for _, it := range g.Items {
					ids[i][it.Identity] = true
				}
			}
		}
	}
	for i := range out {
		out[i].Identities = len(ids[i])
	}
	return out
}

// GainIfFixed is how much the average score would rise if every check in
// groups were fixed: each affected identity is re-scored without those
// checks' points (a score cannot go above 100 or below 0), then averaged over
// every scored identity. Unlike adding up each check's gain, this counts an
// identity's floor at 0 once.
func (rep *PostureReport) GainIfFixed(groups ...int) float64 {
	if rep.ScoredCount == 0 || len(groups) == 0 {
		return 0
	}
	fix := map[string]bool{}
	for _, gi := range groups {
		if gi >= 0 && gi < len(rep.Groups) {
			fix[rep.Groups[gi].RuleID] = true
		}
	}
	gain := 0.0
	for _, id := range rep.Identities {
		if id.Score == nil {
			continue
		}
		lost, freed := 0.0, 0.0
		for _, c := range id.Checks {
			lost += c.Points
			if fix[c.RuleID] {
				freed += c.Points
			}
		}
		if freed == 0 {
			continue
		}
		// The engine scores 100 minus every point lost; checks outside this
		// report (other severities) still count, so start from the score.
		before := *id.Score
		after := 100 - (lost - freed)
		if before > 0 {
			after = before + freed
		}
		if after > 100 {
			after = 100
		}
		if after < 0 {
			after = 0
		}
		gain += after - before
	}
	return gain / float64(rep.ScoredCount)
}

// GroupIndexes is every check's index, in report order.
func (rep *PostureReport) GroupIndexes(keep func(CheckGroup) bool) []int {
	var out []int
	for i, g := range rep.Groups {
		if keep == nil || keep(g) {
			out = append(out, i)
		}
	}
	return out
}

// Owners counts findings per owner; "" is unassigned.
func (rep *PostureReport) Owners() (assigned map[string]int, unassigned int) {
	assigned = map[string]int{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			if strings.TrimSpace(c.Owner) == "" {
				unassigned++
			} else {
				assigned[c.Owner]++
			}
		}
	}
	return assigned, unassigned
}

// ReachText says what an identity can get to, or "".
func ReachText(r *Reach) string {
	if r == nil || r.Resources == 0 {
		return ""
	}
	parts := []string{fmt.Sprintf("can reach %s", count(r.Resources, "resource", "resources"))}
	if r.Secrets {
		parts = append(parts, "including secrets")
	}
	if r.CrossAccount > 0 {
		parts = append(parts, fmt.Sprintf("%s into other accounts", count(r.CrossAccount, "path", "paths")))
	}
	return strings.Join(parts, ", ")
}

// GroupState is where one check stands across the identities it fails on.
type GroupState struct {
	Owners     []string // owners of its findings, most findings first
	Unassigned int      // findings with no owner
	Overdue    int      // findings past their remediation target
	MostReach  *ReportIdentity
}

// State sums a check's owners, overdue findings and the identity with the
// largest blast radius.
func (rep *PostureReport) State(g CheckGroup) GroupState {
	var st GroupState
	owners := map[string]int{}
	for _, it := range g.Items {
		id := &rep.Identities[it.Identity]
		for _, c := range id.Checks {
			if c.RuleID != g.RuleID {
				continue
			}
			if o := strings.TrimSpace(c.Owner); o != "" {
				owners[o]++
			} else {
				st.Unassigned++
			}
			if late, _ := rep.OverdueCheck(c); late {
				st.Overdue++
			}
		}
		if id.Reach != nil && (st.MostReach == nil || id.Reach.Resources > st.MostReach.Reach.Resources) {
			st.MostReach = id
		}
	}
	for o := range owners {
		st.Owners = append(st.Owners, o)
	}
	sort.Slice(st.Owners, func(i, j int) bool {
		if owners[st.Owners[i]] != owners[st.Owners[j]] {
			return owners[st.Owners[i]] > owners[st.Owners[j]]
		}
		return st.Owners[i] < st.Owners[j]
	})
	return st
}

// Criteria is what a check expects, for audit findings: what it looks at
// and the controls it is evidence for.
func Criteria(g CheckGroup) string {
	var parts []string
	if a := strings.TrimSpace(g.About); a != "" {
		parts = append(parts, a)
	}
	if len(g.Controls) > 0 {
		parts = append(parts, "Controls: "+strings.Join(g.Controls, ", ")+".")
	}
	if r := NHIRisks(g.RuleID); len(r) > 0 {
		var names []string
		for _, id := range r {
			for _, o := range OWASPNHI {
				if o.ID == id {
					names = append(names, id+" "+o.Title)
				}
			}
		}
		parts = append(parts, "OWASP NHI Top 10: "+strings.Join(names, ", ")+".")
	}
	if len(parts) == 0 {
		return "Posture check " + g.RuleID + ": " + g.Title + "."
	}
	return strings.Join(parts, " ")
}
