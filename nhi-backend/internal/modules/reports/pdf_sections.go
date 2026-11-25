package reports

import (
	"fmt"
	"sort"
	"strings"
)

// Sections every PDF design shares. Each takes the left edge and width so a
// design can place it in its own grid.

// remediationTable is remediation by severity: what is open and overdue now,
// and what was raised, fixed and how fast in the period against the one
// before.
func (k *kit) remediationTable(x, w float64) {
	rep := k.rep
	overdue := rep.Overdue()
	open := map[string]int{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			open[c.Severity]++
		}
	}
	h := rep.History
	prev := hasPrevious(rep)
	k.ensure(48)
	cols := []tcol{{"Severity", 22, "L"}, {"Target", 16, "R"}, {"Open", 15, "R"}, {"Overdue", 18, "R"}, {"New", 0, "R"}, {"Fixed", 0, "R"}, {"Days to fix", 0, "R"}, {"Fixed in time", 0, "R"}}
	rest := (w - 71) / 4
	for i := 4; i < len(cols); i++ {
		cols[i].w = rest
	}
	t := k.newTable(cols)
	t.x, t.maxLine = x, 2
	t.header()
	pair := func(now, before string) string {
		if !prev || h == nil {
			return now
		}
		return now + "\n(was " + before + ")"
	}
	for i, s := range shownSeverities(rep.Options) {
		cells := []tcell{{sev: s}, {text: fmt.Sprintf("%d days", rep.SLA.Due(s)), color: &cInk3}, {text: num(open[s]), face: fSemi}}
		oc := cInk3
		if overdue[s] > 0 {
			oc = cSev["critical"]
		}
		cells = append(cells, tcell{text: num(overdue[s]), face: fSemi, color: &oc})
		if h == nil {
			cells = append(cells, tcell{text: "-"}, tcell{text: "-"}, tcell{text: "-"}, tcell{text: "-"})
		} else {
			cur, pr := h.Current, h.Previous
			md := func(p PeriodStats) string {
				v, ok := p.MedianDays[s]
				return medianText(v, ok)
			}
			inSLA := func(p PeriodStats) string {
				if p.ResolvedBySev[s] == 0 {
					return "-"
				}
				return pct(p.FixedInSLA[s], p.ResolvedBySev[s])
			}
			cells = append(cells,
				tcell{text: pair(num(cur.NewBySev[s]), num(pr.NewBySev[s]))},
				tcell{text: pair(num(cur.ResolvedBySev[s]), num(pr.ResolvedBySev[s]))},
				tcell{text: pair(md(cur), md(pr))},
				tcell{text: pair(inSLA(cur), inSLA(pr))})
		}
		t.row(cells, i%2 == 1)
	}
}

// agingChart is the open findings by age as a card with a vertical bar
// chart (critical and high in the darker bar beside the total). It returns
// the y under the card.
func (k *kit) agingChart(x, y, w float64) float64 {
	rep := k.rep
	buckets := rep.Aging()
	var cats []string
	all, severe := make([]float64, len(buckets)), make([]float64, len(buckets))
	for i, b := range buckets {
		cats = append(cats, strings.TrimSuffix(b.Label, " days"))
		for _, v := range b.BySev {
			all[i] += float64(v)
		}
		severe[i] = float64(b.BySev["critical"] + b.BySev["high"])
	}
	h := 74.0
	k.card(x, y, w, h)
	cy := k.cardHead(x, y, w, "Age of open findings", "Days since first detection")
	k.vBars(x+6, cy+6, w-12, 30, cats, [][]float64{all, severe}, []rgb{cBlue[2], cBlue[6]}, nil)
	k.legend(x+6, cy+42, w-12, []segment{{"All open", 0, cBlue[2]}, {"Critical and high", 0, cBlue[6]}})
	old := 0
	if n := len(all); n >= 2 {
		old = int(all[n-1] + all[n-2])
	}
	k.cardFoot(x, y+h, w, fmt.Sprintf("%s open for more than 90 days", num(old)), nil, "")
	return y + h
}

// nhiIndex is the OWASP NHI Top 10 as a card with horizontal bars of the
// identities failing a check that is evidence of each risk.
func (k *kit) nhiIndex(x, y, w float64) float64 {
	rows := k.rep.NHITop10()
	var bars []hbar
	worst, top := 0, ""
	for _, r := range rows {
		text := num(r.Identities)
		if r.Findings == 0 {
			text = "none failing"
		}
		bars = append(bars, hbar{r.ID + "  " + r.Title, float64(r.Identities), text, cBlue[4]})
		if r.Identities > worst {
			worst, top = r.Identities, r.ID+" "+r.Title
		}
	}
	h := 17 + float64(len(bars))*6.2 + 14
	k.card(x, y, w, h)
	cy := k.cardHead(x, y, w, "OWASP Non-Human Identities Top 10", "Identities failing a check that is evidence of each risk (OWASP NHI Top 10, 2025)")
	k.hBars(x+5, cy, w-10, 70, 6.2, bars)
	if top != "" {
		k.cardFoot(x, y+h, w, fmt.Sprintf("Most exposed: %s, %s", top, count(worst, "identity", "identities")), nil, "")
	}
	return y + h
}

// daysToFix is the median days to fix per severity as a grouped bar chart:
// the previous period beside this one, with each severity's target as a
// dashed line.
func (k *kit) daysToFix(x, w float64) {
	rep := k.rep
	h := rep.History
	if h == nil {
		return
	}
	var cats []string
	var prev, cur, targets []float64
	for _, s := range shownSeverities(rep.Options) {
		cats = append(cats, SeverityLabel(s))
		pv, _ := h.Previous.MedianDays[s]
		cv, _ := h.Current.MedianDays[s]
		if !hasPrevious(rep) {
			pv = 0
		}
		prev, cur = append(prev, pv), append(cur, cv)
		targets = append(targets, float64(rep.SLA.Due(s)))
	}
	ch := 74.0
	k.ensure(ch + 4)
	y := k.pdf.GetY()
	k.card(x, y, w, ch)
	cy := k.cardHead(x, y, w, "Median days to fix", "This period against the previous one; the dashed line is the target for the severity")
	k.vBars(x+6, cy+6, w-12, 30, cats, [][]float64{prev, cur}, []rgb{cBlue[1], cBlue[5]}, targets)
	k.legend(x+6, cy+42, w-12, []segment{{"Previous period", 0, cBlue[1]}, {"This period", 0, cBlue[5]}, {"Target", 0, cInk3}})
	var up *bool
	trend := ""
	if m, ok := h.Current.OverallMedian(); ok {
		trend = "Median " + medianText(m, true)
		if pm, pok := h.Previous.OverallMedian(); pok && hasPrevious(rep) {
			faster := m < pm
			up = &faster
			if faster {
				trend = fmt.Sprintf("Fixing faster: median %s, was %s", medianText(m, true), medianText(pm, true))
			} else {
				trend = fmt.Sprintf("Fixing slower: median %s, was %s", medianText(m, true), medianText(pm, true))
			}
		}
	}
	k.cardFoot(x, y+ch, w, trend, up, "")
	k.pdf.SetY(y + ch + 5)
}

// ownersTable is the findings per owner, unassigned first when any.
func (k *kit) ownersTable(x, w float64, max int) {
	rep := k.rep
	type row struct {
		owner              string
		n, severe, overdue int
	}
	by := map[string]*row{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			o := strings.TrimSpace(c.Owner)
			r := by[o]
			if r == nil {
				r = &row{owner: o}
				by[o] = r
			}
			r.n++
			if c.Severity == "critical" || c.Severity == "high" {
				r.severe++
			}
			if late, _ := rep.OverdueCheck(c); late {
				r.overdue++
			}
		}
	}
	var list []*row
	for _, r := range by {
		list = append(list, r)
	}
	sort.Slice(list, func(i, j int) bool {
		if (list[i].owner == "") != (list[j].owner == "") {
			return list[i].owner == ""
		}
		return list[i].n > list[j].n
	})
	t := k.newTable([]tcol{{"Owner", w - 41, "L"}, {"Findings", 13, "R"}, {"Crit/high", 15, "R"}, {"Overdue", 13, "R"}})
	t.x, t.maxLine = x, 1
	t.header()
	for i, r := range list {
		if i == max {
			break
		}
		name, face, col := r.owner, fMed, cInk
		if name == "" {
			name, face, col = "Unassigned", fSemi, cSev["high"]
		}
		oc := cInk3
		if r.overdue > 0 {
			oc = cSev["critical"]
		}
		t.row([]tcell{{text: name, face: face, color: &col}, {text: num(r.n), face: fSemi}, {text: num(r.severe)}, {text: num(r.overdue), color: &oc}}, i%2 == 1)
	}
}

// ownersCard is the owners table in a card h high.
func (k *kit) ownersCard(x, y, w, h float64) {
	k.card(x, y, w, h)
	cy := k.cardHead(x, y, w, "Who owns them", "As assigned in the console (Posture, Findings)")
	k.pdf.SetY(cy)
	k.ownersTable(x+4, w-8, 6)
}

// exceptionsTable is the accepted and suppressed findings, or a line saying
// there are none.
func (k *kit) exceptionsTable(x, w float64, max int) {
	rep := k.rep
	if len(rep.Exceptions) == 0 {
		k.font(fReg, 8.6, cInk2)
		k.para(x, w, 4.4, "No finding in scope has been accepted as a risk or suppressed. Every failing check is counted in the score and in this report.")
		return
	}
	t := k.newTable([]tcol{{"Finding", 50, "L"}, {"Severity", 20, "L"}, {"Reason", w - 138, "L"}, {"Decided by", 32, "L"}, {"Decided", 18, "L"}, {"Until", 18, "L"}})
	t.x, t.maxLine, t.size = x, 3, 7.4
	t.header()
	for i, e := range rep.Exceptions {
		if i == max {
			break
		}
		until := "No end date"
		if e.Until != nil {
			until = e.Until.UTC().Format("2 Jan 2006")
		}
		since := "-"
		if e.Since != nil {
			since = e.Since.UTC().Format("2 Jan 2006")
		}
		t.row([]tcell{{text: e.Check + "\n" + e.Identity, face: fMed}, {sev: e.Severity}, {text: orDash(e.Reason), color: &cInk2}, {text: orDash(e.DecidedBy)}, {text: since}, {text: until}}, i%2 == 1)
	}
	if len(rep.Exceptions) > max {
		k.font(fReg, 7.4, cInk3)
		k.at(x, k.pdf.GetY()+1, w, 4, fmt.Sprintf("And %s more in the workbook.", num(len(rep.Exceptions)-max)), "L")
		k.pdf.SetY(k.pdf.GetY() + 5)
	}
}

// dueTable is remediation by severity before anything has been fixed: the
// target, what is open, and when it falls due.
func (k *kit) dueTable(x, w float64) {
	rep := k.rep
	open, week, month, late := map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}
	first := map[string]int{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			open[c.Severity]++
			in, ok := rep.dueIn(c)
			if !ok {
				continue
			}
			switch {
			case in < 0:
				late[c.Severity]++
			case in <= 7:
				week[c.Severity]++
				month[c.Severity]++
			case in <= 30:
				month[c.Severity]++
			}
			if in >= 0 {
				if f, seen := first[c.Severity]; !seen || in < f {
					first[c.Severity] = in
				}
			}
		}
	}
	k.ensure(40)
	rest := (w - 60) / 4
	t := k.newTable([]tcol{{"Severity", 24, "L"}, {"Target", 18, "R"}, {"Open", 18, "R"}, {"Due in 7 days", rest, "R"}, {"Due in 30 days", rest, "R"}, {"Overdue", rest, "R"}, {"Next due", rest, "R"}})
	t.x = x
	t.header()
	for _, s := range shownSeverities(rep.Options) {
		next := "-"
		if f, ok := first[s]; ok {
			next = rep.GeneratedAt.AddDate(0, 0, f).UTC().Format("2 Jan 2006")
		}
		lc := cInk3
		if late[s] > 0 {
			lc = cRed
		}
		t.row([]tcell{{sev: s}, {text: fmt.Sprintf("%d days", rep.SLA.Due(s)), color: &cInk3}, {text: num(open[s]), face: fSemi},
			{text: num(week[s])}, {text: num(month[s])}, {text: num(late[s]), color: &lc}, {text: next}}, false)
	}
}

// dueChart is a card with the open findings by when they fall due.
func (k *kit) dueChart(x, y, w, h float64) {
	rep := k.rep
	var cats []string
	all, severe := []float64{}, []float64{}
	for _, b := range rep.DueSchedule() {
		cats = append(cats, b.Label)
		all = append(all, float64(b.Total))
		severe = append(severe, float64(b.BySev["critical"]+b.BySev["high"]))
	}
	k.card(x, y, w, h)
	cy := k.cardHead(x, y, w, "When open findings fall due", "First detection plus the target for the severity")
	k.vBars(x+6, cy+6, w-12, h-48, cats, [][]float64{all, severe}, []rgb{cBlue[2], cBlue[6]}, nil)
	k.legend(x+6, y+h-22, w-12, []segment{{"All open", 0, cBlue[2]}, {"Critical and high", 0, cBlue[6]}})
	foot := "Nothing falls due in the next 30 days"
	if n := rep.DueWithin(30); n > 0 {
		foot = fmt.Sprintf("%s due in 30 days", num(n))
		if f := rep.FirstDue(); f != nil {
			foot += ", first on " + f.UTC().Format("2 Jan")
		}
	}
	k.cardFoot(x, y+h, w, foot, nil, "")
}

// ownersOrNote is the owners card when findings have owners, otherwise a
// note on how to get them.
func (k *kit) ownersOrNote(x, y, w, h float64) float64 {
	if k.rep.Stage().Owners {
		k.ownersCard(x, y, w, h)
		return y + h
	}
	k.pdf.SetY(y)
	k.note(x, w, "Ownership", noOwnerText)
	return k.pdf.GetY()
}

// slaLine says which remediation targets the report uses.
func slaLine(rep *PostureReport) string {
	return fmt.Sprintf("Remediation targets: critical %d, high %d, medium %d, low %d days from first detection. Source: %s.",
		rep.SLA.Due("critical"), rep.SLA.Due("high"), rep.SLA.Due("medium"), rep.SLA.Due("low"), strings.TrimSuffix(rep.SLA.Source, "."))
}

// changeSentence is the period in one sentence for summaries.
func changeSentence(rep *PostureReport) string {
	h := rep.History
	if h == nil {
		return ""
	}
	if rep.Stage().Baseline {
		return "" // a first assessment has no change to report; baselineLine says so
	}
	c, p := h.Current, h.Previous
	s := fmt.Sprintf("In the last %d days %s were found and %s fixed", h.Days, count(c.New, "finding", "findings"), num(c.Resolved))
	if hasPrevious(rep) {
		s += fmt.Sprintf(" (previous %d days: %s raised, %s fixed)", h.Days, num(p.New), num(p.Resolved))
	}
	s += "."
	if r, ok := c.SLACompliance(); ok {
		s += fmt.Sprintf(" %.0f%% of fixes landed within target", r*100)
		if r2, ok2 := p.SLACompliance(); ok2 && hasPrevious(rep) {
			s += fmt.Sprintf(" (was %.0f%%)", r2*100)
		}
		s += "."
	}
	return s
}
