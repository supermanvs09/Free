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

// agingChart is the open findings by age, one stacked bar per age range,
// with the SLA targets marked in words below.
func (k *kit) agingChart(x, y, w float64) float64 {
	rep := k.rep
	buckets := rep.Aging()
	maxN := 1
	for _, b := range buckets {
		n := 0
		for _, v := range b.BySev {
			n += v
		}
		if n > maxN {
			maxN = n
		}
	}
	labelW := 26.0
	barW := w - labelW - 18
	for i, b := range buckets {
		by := y + float64(i)*7.2
		k.font(fReg, 8, cInk2)
		k.at(x, by, labelW, 5, b.Label, "L")
		total := 0
		var segs []segment
		for _, s := range Severities {
			total += b.BySev[s]
			segs = append(segs, segment{"", b.BySev[s], cSevFill[s]})
		}
		bw := barW * float64(total) / float64(maxN)
		k.fill(cPanel)
		k.pdf.Rect(x+labelW, by+0.8, barW, 3.6, "F")
		if total > 0 {
			k.bar(x+labelW, by+0.8, bw, 3.6, segs)
		}
		k.font(fSemi, 8, cInk)
		k.at(x+labelW+barW+2, by, 16, 5, num(total), "R")
	}
	ly := y + float64(len(buckets))*7.2 + 1
	lx := x + labelW
	k.font(fReg, 7.2, cInk3)
	for _, s := range Severities {
		label := fmt.Sprintf("%s · %dd target", SeverityLabel(s), rep.SLA.Due(s))
		if lx+3.4+k.width(label) > x+w {
			lx, ly = x+labelW, ly+4.6
		}
		k.fill(cSevFill[s])
		k.pdf.Rect(lx, ly+1.2, 2.4, 2.4, "F")
		k.font(fReg, 7.2, cInk3)
		k.at(lx+3.4, ly, 40, 4.6, label, "L")
		lx += 3.4 + k.width(label) + 4
	}
	return ly + 6
}

// nhiGrid is the OWASP NHI Top 10 as tiles, five to a row.
func (k *kit) nhiGrid(x, y, w float64) float64 {
	rows := k.rep.NHITop10()
	per := 5
	tw := (w - float64(per-1)*3) / float64(per)
	th := 27.0
	for i, r := range rows {
		tx := x + float64(i%per)*(tw+3)
		ty := y + float64(i/per)*(th+3)
		k.fill(cPanel)
		k.pdf.RoundedRect(tx, ty, tw, th, 1.8, "1234", "F")
		c := cLine
		if r.Findings > 0 {
			c = cSevFill[r.Worst]
		}
		k.fill(c)
		k.pdf.Rect(tx, ty+2.5, 0.9, th-5, "F")
		k.font(fBold, 7.4, cBrand)
		k.at(tx+3.5, ty+2.6, tw-6, 3.6, r.ID, "L")
		k.font(fSemi, 7.2, cInk)
		for li, l := range k.wrap(r.Title, tw-6, 3) {
			k.at(tx+3.5, ty+6.6+float64(li)*3.4, tw-6, 3.4, l, "L")
		}
		if r.Findings == 0 {
			k.font(fReg, 7, cInk3)
			k.at(tx+3.5, ty+th-6.5, tw-6, 4, "No failing check", "L")
			continue
		}
		k.font(fBold, 11, cInk)
		k.at(tx+3.5, ty+th-9.5, tw-6, 5.5, num(r.Identities), "L")
		k.font(fReg, 6.6, cInk3)
		k.at(tx+3.5, ty+th-4.4, tw-6, 3.4, plural(r.Identities, "identity", "identities")+" · "+SeverityLabel(r.Worst), "L")
	}
	return y + 2*(th+3)
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
	t := k.newTable([]tcol{{"Owner", w - 56, "L"}, {"Findings", 16, "R"}, {"Crit + high", 24, "R"}, {"Overdue", 16, "R"}})
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
	c, p := h.Current, h.Previous
	s := fmt.Sprintf("In the last %d days %s were raised and %s fixed", h.Days, count(c.New, "finding", "findings"), num(c.Resolved))
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
