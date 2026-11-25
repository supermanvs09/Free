package reports

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// A report is downloaded at any point of a customer's life: minutes after
// the first account is connected, or after a year of remediation. Stage
// says what the data can support, so each section shows what is true and
// useful now instead of zeros and dashes. Where there is no history yet, the
// sections look forward instead: first-detection dates and the remediation
// targets give every open finding a due date from day one.
type Stage struct {
	Baseline bool // first assessment: nothing fixed and no earlier period to compare with
	Fixes    bool // a finding was resolved in this period or the one before
	Trend    bool // two or more days of scores
	Owners   bool // at least one open finding has an owner
	Overdue  int  // open findings past their target
	Spread   bool // some open finding is older than 15 days, so age is worth showing
}

func (rep *PostureReport) Stage() Stage {
	st := Stage{Trend: len(rep.Trend) >= 2}
	if h := rep.History; h != nil {
		st.Fixes = h.Current.Resolved > 0 || h.Previous.Resolved > 0
	}
	st.Baseline = !st.Fixes && !hasPrevious(rep)
	for _, n := range rep.Overdue() {
		st.Overdue += n
	}
	assigned, _ := rep.Owners()
	st.Owners = len(assigned) > 0
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			if rep.DaysFailing(c.FailingSince) > 15 {
				st.Spread = true
			}
		}
	}
	return st
}

// Edition is which of the two report versions the data makes this one:
// a baseline assessment (first period, nothing fixed yet) or a progress
// report. It is chosen from the data, never by the user, so a new customer
// never gets empty progress sections and a mature one never hides progress.
func (rep *PostureReport) Edition() string {
	if rep.Stage().Baseline {
		return "Baseline assessment"
	}
	return "Progress report"
}

// dueIn is the days until a finding's target: negative when overdue, and
// ok false when its first detection is unknown.
func (rep *PostureReport) dueIn(c ReportCheck) (int, bool) {
	d := rep.DaysFailing(c.FailingSince)
	if d < 0 {
		return 0, false
	}
	return rep.SLA.Due(c.Severity) - d, true
}

// DueBucket is open findings whose target falls in a window.
type DueBucket struct {
	Label string
	Total int
	BySev map[string]int
}

// DueSchedule is when the open findings fall due: already overdue, then
// windows from today.
func (rep *PostureReport) DueSchedule() []DueBucket {
	out := []DueBucket{{Label: "Overdue"}, {Label: "≤ 7 d"}, {Label: "8–15 d"}, {Label: "16–30 d"}, {Label: "31–90 d"}, {Label: "> 90 d"}}
	for i := range out {
		out[i].BySev = map[string]int{}
	}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			in, ok := rep.dueIn(c)
			if !ok {
				continue
			}
			i := 5
			switch {
			case in < 0:
				i = 0
			case in <= 7:
				i = 1
			case in <= 15:
				i = 2
			case in <= 30:
				i = 3
			case in <= 90:
				i = 4
			}
			out[i].Total++
			out[i].BySev[c.Severity]++
		}
	}
	return out
}

// DueWithin counts open findings due in the next days (not yet overdue).
func (rep *PostureReport) DueWithin(days int) int {
	n := 0
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			if in, ok := rep.dueIn(c); ok && in >= 0 && in <= days {
				n++
			}
		}
	}
	return n
}

// FirstDue is the earliest due date of an open finding not yet overdue.
func (rep *PostureReport) FirstDue() *time.Time {
	var first *time.Time
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			if in, ok := rep.dueIn(c); ok && in >= 0 {
				if d := rep.DueDate(c); d != nil && (first == nil || d.Before(*first)) {
					first = d
				}
			}
		}
	}
	return first
}

// DueItem is one open finding with the days until its target.
type DueItem struct {
	ID    *ReportIdentity
	Check ReportCheck
	In    int // days until due; negative is late
	Group int
}

// NextDue is the open findings in due order (most late first, then the
// soonest due), most severe first on a tie.
func (rep *PostureReport) NextDue() []DueItem {
	gidx := map[string]int{}
	for gi, g := range rep.Groups {
		gidx[g.RuleID] = gi
	}
	var out []DueItem
	for i := range rep.Identities {
		id := &rep.Identities[i]
		for _, c := range id.Checks {
			if in, ok := rep.dueIn(c); ok {
				out = append(out, DueItem{id, c, in, gidx[c.RuleID]})
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].In != out[j].In {
			return out[i].In < out[j].In
		}
		return sevRank(out[i].Check.Severity) < sevRank(out[j].Check.Severity)
	})
	return out
}

// dueText is "due in 9 days", "due today" or "12 days late".
func dueText(in int) string {
	switch {
	case in < 0:
		return daysText(-in) + " late"
	case in == 0:
		return "due today"
	}
	return "due in " + daysText(in)
}

// baselineLine is the opening sentence of a first assessment.
func baselineLine(rep *PostureReport) string {
	s := fmt.Sprintf("This is your first assessment. The scan found %s on %s of %s scored identities across %s",
		count(rep.CheckCount, "finding", "findings"), num(rep.FailingCount), num(rep.ScoredCount), count(rep.AccountsCovered, "account", "accounts"))
	if rep.AverageScore != nil {
		s += fmt.Sprintf("; the average security score is %s out of 100 (%s)", score1(*rep.AverageScore), bandLabel(bandFor(*rep.AverageScore)))
	}
	s += ". Every finding now has a due date from its severity's target, and the next reports measure progress against this baseline."
	return s
}

// noFixText and noOwnerText are what a section says instead of an empty
// chart or table.
const (
	noFixText   = "Follow the remediation steps for this check in the console (Posture, Findings)."
	noOwnerText = "No finding has an owner yet. Assign owners in the console (Posture, Findings) so the next report shows who is fixing what and what is late per team."
)

// anyNHI reports whether a failing check maps to the OWASP NHI Top 10.
func anyNHI(rep *PostureReport) bool {
	for _, r := range rep.NHITop10() {
		if r.Identities > 0 {
			return true
		}
	}
	return false
}

// orText is s, or alt when s is blank.
func orText(s, alt string) string {
	if strings.TrimSpace(s) == "" {
		return alt
	}
	return s
}
