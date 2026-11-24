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
	BrandTitle   = "Continuous AI Security Posture Management"
	BrandTagline = "Securing your Identities and Digital Ecosystem from AI-driven threats."
	ReportTitle  = "Identity Security Posture Report"
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

// Uplift is how much fixing a check everywhere could raise the average
// score: its points spread over every scored identity. An identity already
// at 0 regains less, so this is an upper bound.
func (rep *PostureReport) Uplift(g CheckGroup) float64 {
	if rep.ScoredCount == 0 {
		return 0
	}
	return g.Points / float64(rep.ScoredCount)
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
