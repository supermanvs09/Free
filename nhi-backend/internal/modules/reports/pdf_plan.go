package reports

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strings"
)

// WritePlanPDF is design C, the remediation action plan: for the security
// and engineering teams who do the work. A4 landscape. Every failing check
// becomes an action in a priority wave, with what fixing it buys; then an
// account-by-area heat map, work packages per account, and the evidence
// behind each action.
func WritePlanPDF(w io.Writer, rep *PostureReport) error {
	return twoPass(w, func(known map[string]int) *kit {
		k := newKit(rep, "L", 14, 20, 14, known)
		p := &plan{kit: k}
		k.pdf.SetHeaderFuncMode(p.header, false)
		k.pdf.SetFooterFunc(p.footer)
		p.cover()
		if rep.CheckCount > 0 {
			p.actions()
			p.pace()
			p.heatmap()
			p.packages()
			p.evidence()
		}
		p.method()
		return k
	})
}

type plan struct{ *kit }

const planEvidenceRows = 15

var waves = []string{"P1", "P2", "P3", "P4"}

// Priorities are ordered, so they take one hue, darkest first.
var cWave = map[string]rgb{"P1": {19, 41, 75}, "P2": {44, 77, 122}, "P3": {78, 106, 143}, "P4": {113, 120, 130}}

func (p *plan) header() {
	p.watermark()
	if p.pdf.PageNo() == 1 {
		return
	}
	p.pdf.ImageOptions("logo", p.mx, 7, 24, 0, false, fpdfImage(), 0, "")
	p.font(fMed, 7.4, cInk3)
	p.at(p.mx, 7.5, p.body, 4, "Identity Risk Remediation Plan  ·  "+orDash(p.rep.PreparedFor)+"  ·  "+p.rep.ScopeLabel(), "R")
	p.draw(cLine)
	p.pdf.SetLineWidth(0.2)
	p.pdf.Line(p.mx, 13.5, p.W-p.mx, 13.5)
	p.pdf.SetY(p.top)
}

func (p *plan) footer() {
	if p.pdf.PageNo() == 1 {
		return
	}
	y := p.H - 9
	p.font(fSemi, 7, cSev["critical"])
	p.at(p.mx, y, 30, 4, "CONFIDENTIAL", "L")
	p.font(fReg, 7, cInk3)
	p.at(p.mx+24, y, p.body/2, 4, p.rep.ID()+"  ·  data as of "+controlLines(p.rep)[3][1], "L")
	p.at(p.mx+p.body/2, y, p.body/2, 4, fmt.Sprintf("Page %d of {nb}", p.pdf.PageNo()), "R")
}

func (p *plan) title(key, title, note string) {
	p.pdf.AddPage()
	p.mark(key)
	p.pdf.Bookmark(title, 0, -1)
	p.sectionHead("Remediation plan", title)
	p.pdf.SetY(p.pdf.GetY() - 3)
	if note != "" {
		p.font(fReg, 8.6, cInk3)
		p.para(p.mx, p.body*0.8, 4.4, note)
	}
	p.pdf.SetY(p.pdf.GetY() + 4)
}

// sub is a serif heading at x, w.
func (p *plan) sub(x, y, w float64, title string) {
	p.font(fSemi, 12, cInk)
	p.at(x, y, w, 6, title, "L")
}

// ---- cover with the plan at a glance ------------------------------------------

// cover carries the brand lines across the page, each on one line, and
// the plan at a glance beside the document control. No slide band.
func (p *plan) cover() {
	pdf, rep := p.pdf, p.rep
	pdf.AddPage()
	pdf.Bookmark("Plan at a glance", 0, -1)
	pdf.ImageOptions("logo", p.mx, 12, 38, 0, false, fpdfImage(), 0, "")
	p.font(fSemi, 7, cSev["critical"])
	p.at(p.W-p.mx-80, 14, 80, 4, "CONFIDENTIAL  ·  INTERNAL USE ONLY", "R")
	y := 32.0
	p.fill(cBrand)
	pdf.Rect(p.mx, y, 12, 0.9, "F")
	size := p.fitSize(fSemi, 25, p.body, BrandTitle)
	p.font(fSemi, size, cInk)
	p.at(p.mx, y+4, p.body, size*0.48, BrandTitle, "L")
	y += 4 + size*0.48 + 2
	ts := p.fitSize(fReg, 12.5, p.body, BrandTagline)
	p.font(fReg, ts, cInk2)
	p.at(p.mx, y, p.body, ts*0.5, BrandTagline, "L")
	y += ts*0.5 + 7
	p.draw(cRule)
	pdf.SetLineWidth(0.35)
	pdf.Line(p.mx, y, p.W-p.mx, y)
	y += 7

	// Left: the document.
	lw := 76.0
	x := p.mx
	p.font(fSemi, 6.8, cInk3)
	p.at(x, y, lw, 4, "REPORT", "L")
	p.font(fSemi, p.fitSize(fSemi, 15, lw, "Identity Risk Remediation Plan"), cInk)
	p.at(x, y+4.5, lw, 7, "Identity Risk Remediation Plan", "L")
	p.font(fReg, 8.4, cInk2)
	p.at(x, y+12.5, lw, 4, rep.ScopeLabel()+"  ·  "+rep.GeneratedAt.UTC().Format("2 Jan 2006"), "L")
	p.font(fSemi, 6.8, cInk3)
	p.at(x, y+24, lw, 4, "PREPARED FOR", "L")
	p.font(fSemi, 17, cInk)
	p.at(x, y+28.5, lw, 8, orDash(rep.PreparedFor), "L")
	cy := y + 44
	for _, r := range controlLines(rep) {
		if r[0] == "Prepared for" {
			continue
		}
		p.draw(cLine)
		pdf.SetLineWidth(0.15)
		pdf.Line(x, cy, x+lw, cy)
		p.font(fSemi, 6.2, cInk3)
		p.at(x, cy+1.4, 28, 4, strings.ToUpper(r[0]), "L")
		face := fReg
		if r[0] == "Report ID" {
			face = fMono
		}
		p.font(face, 7.8, cInk)
		p.at(x+28, cy+1.4, lw-28, 4, r[1], "L")
		cy += 7
	}

	// Right: the plan at a glance.
	rx := p.mx + lw + 14
	rw := p.W - p.mx - rx
	p.font(fSemi, 6.8, cInk3)
	p.at(rx, y, rw, 4, "PLAN AT A GLANCE", "L")
	p.font(fReg, 13, cInk)
	p.at(rx, y+4.5, rw, 7, p.headline(), "L")
	ry := y + 16
	figs := []struct{ label, value, sub string }{
		{"Average score", fmtScore(rep.AverageScore), scoreSub(rep)},
		{"Identities to fix", num(rep.FailingCount), "of " + num(rep.ScoredCount) + " scored"},
		{"Actions", num(len(rep.Groups)), num(rep.CheckCount) + " findings"},
		p.dueFigure(),
	}
	fw := rw / 4
	for i, f := range figs {
		fx := rx + float64(i)*fw
		p.draw(cRule)
		pdf.SetLineWidth(0.3)
		pdf.Line(fx, ry, fx+fw-6, ry)
		p.font(fSemi, 6.2, cInk3)
		p.at(fx, ry+1.8, fw-6, 3.4, strings.ToUpper(f.label), "L")
		p.font(fSemi, 16, cInk)
		p.at(fx, ry+5.6, fw-6, 7.5, f.value, "L")
		p.font(fReg, 6.8, cInk3)
		p.at(fx, ry+13.2, fw-6, 3.4, f.sub, "L")
	}
	ry += 22
	if rep.CheckCount == 0 {
		p.font(fReg, 10, cInk2)
		p.at(rx, ry, rw, 6, "No identity fails a check of the chosen severity. There is nothing to plan.", "L")
		return
	}
	p.sub(rx, ry, rw, "Remediation waves")
	pdf.SetY(ry + 7)
	t := p.newTable([]tcol{{"Wave", 40, "L"}, {"When", 28, "L"}, {"Actions", 20, "R"}, {"Findings", 22, "R"}, {"Identities", 24, "R"}, {"Score gain", rw - 134, "R"}})
	t.x, t.size, t.pad = rx, 7.6, 1.2
	t.header()
	for _, wv := range waves {
		acts, finds, ids, gain := p.wave(wv)
		c := cWave[wv]
		t.row([]tcell{{text: wv + "  " + map[string]string{"P1": "Critical path", "P2": "High impact", "P3": "Planned", "P4": "Hygiene"}[wv], face: fSemi, color: &c},
			{text: PriorityText(wv)}, {text: num(acts), face: fSemi}, {text: num(finds)}, {text: num(ids)}, {text: fmt.Sprintf("+%.1f", gain), face: fSemi}}, false)
	}
	ry = pdf.GetY() + 6
	p.sub(rx, ry, rw, "Start here")
	pdf.SetY(ry + 7)
	t = p.newTable([]tcol{{"", 7, "L"}, {"Action", rw - 79, "L"}, {"Severity", 24, "L"}, {"Identities", 20, "R"}, {"Gain", 14, "R"}, {"Page", 14, "R"}})
	t.x, t.maxLine, t.size, t.pad = rx, 1, 7.6, 1.2
	t.header()
	for i, g := range rep.Groups {
		if i == 4 {
			break
		}
		t.row([]tcell{{text: fmt.Sprint(i + 1), face: fSemi, color: &cBrand}, {text: actionText(g), face: fMed, link: p.link(fmt.Sprintf("g%d", i))}, {sev: g.Severity},
			{text: num(len(g.Items))}, {text: fmt.Sprintf("+%.1f", rep.Uplift(g)), face: fSemi}, {text: p.pageOf(fmt.Sprintf("g%d", i)), color: &cBrand, link: p.link(fmt.Sprintf("g%d", i))}}, false)
	}
	if rep.Sample {
		p.font(fReg, 6.8, cInk3)
		p.at(p.mx, p.H-10, p.body, 4, "Sample report: illustrative data, not a real environment.", "L")
	}
}

// headline is one sentence the plan is about.
func (p *plan) headline() string {
	rep := p.rep
	if rep.CheckCount == 0 {
		return "No failing checks in scope"
	}
	var idx []int
	for gi, g := range rep.Groups {
		if rep.Priority(g) == "P1" {
			idx = append(idx, gi)
		}
	}
	n, gain := len(idx), rep.GainIfFixed(idx...)
	if n == 0 {
		return fmt.Sprintf("%s to close; no fix-now items", count(len(rep.Groups), "action", "actions"))
	}
	return fmt.Sprintf("%s fix-now %s would lift the score by %.1f points", num(n), plural(n, "action", "actions"), gain)
}

func (p *plan) waveCount(w string) int {
	n, _, _, _ := p.wave(w)
	return n
}

// wave sums one priority wave.
func (p *plan) wave(w string) (actions, findings, identities int, gain float64) {
	ids := map[int]bool{}
	var idx []int
	for gi, g := range p.rep.Groups {
		if p.rep.Priority(g) != w {
			continue
		}
		actions++
		findings += len(g.Items)
		idx = append(idx, gi)
		for _, it := range g.Items {
			ids[it.Identity] = true
		}
	}
	return actions, findings, len(ids), p.rep.GainIfFixed(idx...)
}

// actionText is a check as a thing to do: its fix's first sentence, else
// "Fix: <check>".
func actionText(g CheckGroup) string {
	fix := strings.TrimSpace(g.Fix)
	if fix == "" {
		return "Fix: " + g.Title
	}
	if i := sentenceEnd(fix); i > 0 && i < 140 {
		fix = fix[:i+1]
	}
	return fix
}

// sentenceEnd is the index of the full stop ending s's first sentence, or -1.
// Abbreviations such as "e.g." do not end a sentence.
func sentenceEnd(s string) int {
	for off := 0; ; {
		i := strings.Index(s[off:], ". ")
		if i < 0 {
			return -1
		}
		i += off
		low := strings.ToLower(s[:i+1])
		if !strings.HasSuffix(low, "e.g.") && !strings.HasSuffix(low, "i.e.") && !strings.HasSuffix(low, "etc.") && !strings.HasSuffix(low, "vs.") {
			return i
		}
		off = i + 2
	}
}

// ---- action plan ---------------------------------------------------------------

func (p *plan) actions() {
	rep := p.rep
	p.title("actions", "Action plan", "Every failing check as one action, grouped into waves. Fixing an action clears the check on every identity listed for it. Score gain is how much the average score rises when that action is done everywhere, re-scoring each identity.")
	for _, wv := range waves {
		var list []int
		for i, g := range rep.Groups {
			if rep.Priority(g) == wv {
				list = append(list, i)
			}
		}
		if len(list) == 0 {
			continue
		}
		p.ensure(26)
		y := p.pdf.GetY()
		c := cWave[wv]
		p.font(fSemi, 13, c)
		p.at(p.mx, y, 80, 6, wv+" · "+PriorityText(wv), "L")
		acts, finds, ids, gain := p.wave(wv)
		p.font(fReg, 8, cInk3)
		p.at(p.mx, y, p.body, 6, fmt.Sprintf("%s · %s · %s · up to +%.1f", count(acts, "action", "actions"), count(finds, "finding", "findings"), count(ids, "identity", "identities"), gain), "R")
		p.pdf.SetY(y + 8)
		t := p.newTable([]tcol{{"Ref", 15, "L"}, {"Action", 82, "L"}, {"Check", 46, "L"}, {"Severity", 22, "L"}, {"Identities", 18, "R"}, {"Overdue", 17, "R"}, {"Oldest", 17, "R"}, {"Gain", 13, "R"}, {"Owner", p.body - 230, "L"}})
		t.maxLine = 3
		t.header()
		for _, gi := range list {
			g := rep.Groups[gi]
			st := rep.State(g)
			owner, oc := "Unassigned", cSev["high"]
			if len(st.Owners) > 0 {
				owner, oc = st.Owners[0], cInk2
				if len(st.Owners) > 1 {
					owner += fmt.Sprintf(" +%d", len(st.Owners)-1)
				}
			}
			lc := cInk3
			if st.Overdue > 0 {
				lc = cSev["critical"]
			}
			t.row([]tcell{{text: FindingRef(gi), face: fMono, size: 7.2, link: p.link(fmt.Sprintf("g%d", gi))}, {text: actionText(g), face: fMed}, {text: g.Title, color: &cInk2},
				{sev: g.Severity}, {text: num(len(g.Items)), face: fSemi}, {text: num(st.Overdue), face: fSemi, color: &lc}, {text: daysText(rep.DaysFailing(g.Since))},
				{text: fmt.Sprintf("+%.1f", rep.Uplift(g)), face: fSemi}, {text: owner, color: &oc}}, false)
		}
		p.pdf.SetY(p.pdf.GetY() + 6)
	}
}

// ---- remediation pace -----------------------------------------------------------

func (p *plan) overdueTotal() int {
	n := 0
	for _, v := range p.rep.Overdue() {
		n += v
	}
	return n
}

func (p *plan) pace() {
	pdf, rep := p.pdf, p.rep
	st := rep.Stage()
	if st.Fixes {
		p.title("pace", "Remediation pace", "Whether fixes keep up with new findings, and what is already late. "+slaLine(rep))
		if cs := changeSentence(rep); cs != "" {
			p.statement(p.mx, p.body*0.85, cs)
		}
		p.remediationTable(p.mx, p.body)
	} else {
		p.title("pace", "Remediation schedule", "Nothing has been fixed yet, so this page sets the schedule: every open finding is due at its first detection plus the target for its severity. "+slaLine(rep))
		if cs := changeSentence(rep); cs != "" {
			p.statement(p.mx, p.body*0.85, cs)
		}
		p.dueTable(p.mx, p.body)
	}
	pdf.SetY(pdf.GetY() + 6)
	p.ensure(78)
	y := pdf.GetY()
	third := (p.body - 10) / 3
	if st.Fixes {
		p.daysToFix(p.mx, third)
	} else {
		p.dueChart(p.mx, y, third, 74)
	}
	end := y + 74
	if st.Spread {
		end = p.agingChart(p.mx+third+5, y, third)
		end = math.Max(end, p.ownersOrNote(p.mx+2*(third+5), y, third, 74))
	} else {
		end = math.Max(end, p.ownersOrNote(p.mx+third+5, y, 2*third+5, 74))
	}
	pdf.SetY(end + 9)

	// The list to chase: what is late, or, when nothing is late yet, what
	// falls due first.
	all := rep.NextDue()
	var list []DueItem
	for _, d := range all {
		if d.In < 0 {
			list = append(list, d)
		}
	}
	title, lastCol := fmt.Sprintf("Overdue now: %s", count(len(list), "finding", "findings")), "Late by"
	if len(list) > 0 {
		sort.SliceStable(list, func(i, j int) bool {
			if sevRank(list[i].Check.Severity) != sevRank(list[j].Check.Severity) {
				return sevRank(list[i].Check.Severity) < sevRank(list[j].Check.Severity)
			}
			return list[i].In < list[j].In
		})
	} else {
		list, title, lastCol = all, "Due next", "Due"
	}
	p.ensure(30)
	p.sub(p.mx, pdf.GetY(), p.body, title)
	pdf.SetY(pdf.GetY() + 8)
	if len(list) == 0 {
		p.font(fReg, 8.6, cInk2)
		p.para(p.mx, p.body, 4.4, "No open finding has a due date.")
		return
	}
	t := p.newTable([]tcol{{"Severity", 22, "L"}, {"Check", 70, "L"}, {"Identity", 62, "L"}, {"Account", 44, "L"}, {"Owner", 36, "L"}, {lastCol, p.body - 234, "R"}})
	t.maxLine = 1
	t.header()
	shown := min(20, len(list))
	for _, l := range list[:shown] {
		owner, oc := strings.TrimSpace(l.Check.Owner), cInk2
		if owner == "" {
			owner, oc = "Unassigned", cInk3
		}
		dc, due := cInk, dueText(l.In)
		if l.In < 0 {
			dc = cRed
		} else if d := rep.DueDate(l.Check); d != nil {
			due = d.UTC().Format("2 Jan") + " (" + daysText(l.In) + ")"
		}
		t.row([]tcell{{sev: l.Check.Severity}, {text: l.Check.Check, face: fMed, link: p.link(fmt.Sprintf("g%d", l.Group))}, {text: l.ID.Name}, {text: orDash(l.ID.Account), color: &cInk2},
			{text: owner, color: &oc}, {text: due, face: fSemi, color: &dc}}, false)
	}
	if len(list) > shown {
		p.font(fReg, 7.4, cInk3)
		p.at(p.mx, pdf.GetY()+1, p.body, 4, fmt.Sprintf("and %s more in the workbook", num(len(list)-shown)), "L")
		pdf.SetY(pdf.GetY() + 5)
	}
}

// ---- heat map -----------------------------------------------------------------------

// heatmap is where the findings sit: one stacked bar per account split
// by security area, in a card with a legend, and the critical and high
// count per account beside it.
func (p *plan) heatmap() {
	pdf, rep := p.pdf, p.rep
	p.title("heatmap", "Where to look: accounts by security area", "Findings per account, split by security area. The longest bars are where a fix campaign pays off first.")
	areas := rep.Areas()
	idx := map[string]int{}
	for i, a := range areas {
		idx[a.Area] = i
	}
	type acc struct {
		rows   []int
		severe int
	}
	by := map[string]*acc{}
	for _, g := range rep.Groups {
		area := AreaLabel(g.Area)
		if area == "" {
			area = "Other"
		}
		for _, it := range g.Items {
			id := rep.Identities[it.Identity].AccountID
			a := by[id]
			if a == nil {
				a = &acc{rows: make([]int, len(areas))}
				by[id] = a
			}
			a.rows[idx[area]]++
			if g.Severity == "critical" || g.Severity == "high" {
				a.severe++
			}
		}
	}
	var labels []string
	var rows [][]int
	var severe []int
	for _, a := range rep.Accounts {
		if v := by[a.ID]; v != nil {
			labels, rows, severe = append(labels, accountName(a)), append(rows, v.rows), append(severe, v.severe)
		}
	}
	// Darkest blue for the area with most findings, lighter after.
	palette := []rgb{cBlue[7], cBlue[5], cBlue[4], cBlue[2], cBlue[1], cBlue[0], {212, 212, 212}}
	colors := make([]rgb, len(areas))
	var legend []segment
	for i, a := range areas {
		colors[i] = palette[min(i, len(palette)-1)]
		legend = append(legend, segment{a.Area, a.Findings, colors[i]})
	}
	rowH := 9.0
	y := pdf.GetY()
	ch := 17 + float64(len(rows))*rowH + 13
	p.card(p.mx, y, p.body, ch)
	cy := p.cardHead(p.mx, y, p.body, "Findings by account and security area", fmt.Sprintf("%s accounts, %s findings", num(len(rows)), num(rep.CheckCount)))
	w := p.body - 50
	p.font(fMed, 7.2, cInk3)
	p.at(p.mx+w+6, cy-5, 40, 4, "Critical and high", "R")
	end := p.stackedBars(p.mx+5, cy, w, 52, rowH, labels, rows, colors)
	for i := range rows {
		p.font(fMed, 8, cRed)
		p.at(p.mx+w+6, cy+float64(i)*rowH, 40, rowH, num(severe[i]), "R")
	}
	p.legend(p.mx+57, end+3, w-52, legend)
	pdf.SetY(y + ch + 6)
}

// ---- work packages -----------------------------------------------------------------

func (p *plan) packages() {
	pdf, rep := p.pdf, p.rep
	p.title("packages", "Work packages by account", "What each account's owners need to do: the actions that touch their account, most urgent first, with how many of their identities each one fixes.")
	type line struct {
		gi, n int
	}
	per := map[string][]line{}
	for gi, g := range rep.Groups {
		counts := map[string]int{}
		for _, it := range g.Items {
			counts[rep.Identities[it.Identity].AccountID]++
		}
		for a, n := range counts {
			per[a] = append(per[a], line{gi, n})
		}
	}
	colW := (p.body - 8) / 2
	col := 0
	top := pdf.GetY()
	colY := [2]float64{top, top}
	for _, a := range rep.Accounts {
		lines := per[a.ID]
		if len(lines) == 0 {
			continue
		}
		sort.SliceStable(lines, func(i, j int) bool { return lines[i].gi < lines[j].gi })
		shown := min(7, len(lines))
		h := 17 + float64(shown)*5.6 + 4
		// Two columns of cards; a new page when neither has room.
		col = 0
		if colY[1] < colY[0] {
			col = 1
		}
		if colY[col]+h > p.H-p.bottom {
			pdf.AddPage()
			top = pdf.GetY()
			colY = [2]float64{top, top}
			col = 0
		}
		x, y := p.mx+float64(col)*(colW+8), colY[col]
		p.draw(cRule)
		pdf.SetLineWidth(0.35)
		pdf.Line(x, y, x+colW, y)
		p.font(fSemi, 11, cInk)
		p.at(x+4, y+3, colW-40, 5, accountName(a), "L")
		p.font(fMono, 7, cInk3)
		p.at(x+4, y+8.4, colW-40, 4, a.ID, "L")
		p.font(fSemi, 13, cBand[bandFor(scoreOr(a.Average))])
		p.at(x+colW-34, y+2.6, 30, 6, fmtScore(a.Average), "R")
		p.font(fReg, 7, cInk3)
		p.at(x+colW-44, y+8.6, 40, 4, fmt.Sprintf("%s failing of %s", num(a.Failing), num(a.Scored)), "R")
		ly := y + 15
		for _, l := range lines[:shown] {
			g := rep.Groups[l.gi]
			p.font(fSemi, 6.8, cWave[rep.Priority(g)])
			p.at(x+4, ly, 8, 5, rep.Priority(g), "L")
			p.font(fReg, 8, cInk)
			p.at(x+12, ly, colW-48, 5, g.Title, "L")
			p.sevMark(x+colW-34, ly, 5, g.Severity, 7.4)
			p.font(fSemi, 8, cInk)
			p.at(x+colW-14, ly, 10, 5, num(l.n), "R")
			pdf.Link(x, ly, colW, 5, p.link(fmt.Sprintf("g%d", l.gi)))
			ly += 5.6
		}
		if len(lines) > shown {
			p.font(fReg, 7, cInk3)
			p.at(x+12, ly, colW-16, 4, fmt.Sprintf("and %s more", count(len(lines)-shown, "action", "actions")), "L")
		}
		colY[col] = y + h + 5
	}
	pdf.SetY(math.Max(colY[0], colY[1]))
}

// ---- evidence per action -------------------------------------------------------------

func (p *plan) evidence() {
	pdf, rep := p.pdf, p.rep
	p.title("evidence", "Actions in detail", fmt.Sprintf("Each action with its steps and the identities it fixes, lowest score first (up to %d; the workbook lists all).", planEvidenceRows))
	for i, g := range rep.Groups {
		p.ensure(46)
		y := pdf.GetY()
		p.mark(fmt.Sprintf("g%d", i))
		pdf.Bookmark(FindingRef(i)+" "+g.Title, 1, -1)
		c := cWave[rep.Priority(g)]
		p.draw(cRule)
		pdf.SetLineWidth(0.35)
		pdf.Line(p.mx, y-2, p.W-p.mx, y-2)
		p.font(fSemi, 9, cBrand)
		p.at(p.mx+4, y, 18, 5, FindingRef(i), "L")
		pw := p.sevPill(p.mx+20, y+0.6, g.Severity, 6.6)
		p.font(fSemi, 7.4, c)
		p.at(p.mx+23+pw, y, 50, 5, rep.Priority(g)+" · "+PriorityText(rep.Priority(g)), "L")
		p.font(fReg, 7.4, cInk3)
		meta := fmt.Sprintf("%s · %s · up to +%.1f · %s", count(len(g.Items), "identity", "identities"), AreaLabel(g.Area), rep.Uplift(g), strings.Join(g.Controls, " "))
		p.at(p.mx+4, y, p.body-4, 5, meta, "R")
		p.font(fSemi, 12, cInk)
		p.at(p.mx+4, y+5.5, p.body-4, 6, g.Title, "L")
		pdf.SetY(y + 13)
		half := (p.body - 10) / 2
		by := pdf.GetY()
		p.font(fSemi, 7, cInk3)
		p.at(p.mx+4, by, half, 4, "HOW TO FIX", "L")
		p.at(p.mx+half+14, by, half, 4, "WHY IT MATTERS", "L")
		p.font(fReg, 8.4, cInk2)
		fixL := p.wrap(orText(g.Fix, noFixText), half-4, 4)
		why := g.Risk
		if why == "" {
			why = g.About
		}
		whyL := p.wrap(orText(why, "Not described for this check."), half-4, 4)
		for li, l := range fixL {
			p.at(p.mx+4, by+4.5+float64(li)*4.2, half-4, 4.2, l, "L")
		}
		for li, l := range whyL {
			p.at(p.mx+half+14, by+4.5+float64(li)*4.2, half-4, 4.2, l, "L")
		}
		pdf.SetY(by + 6 + float64(max(len(fixL), len(whyL)))*4.2)

		items := append([]GroupItem(nil), g.Items...)
		sortItemsByScore(rep, items)
		t := p.newTable([]tcol{{"Identity", 58, "L"}, {"Account", 42, "L"}, {"Owner", 32, "L"}, {"Score", 13, "R"}, {"Due", 22, "R"}, {"What the scan found", p.body - 167, "L"}})
		t.size, t.maxLine = 7.4, 2
		t.header()
		for j, it := range items {
			if j == planEvidenceRows {
				break
			}
			id := rep.Identities[it.Identity]
			due, owner := "-", "Unassigned"
			dc, oc := cInk2, cInk3
			for _, ch := range id.Checks {
				if ch.RuleID != g.RuleID {
					continue
				}
				if dd := rep.DueDate(ch); dd != nil {
					due = dd.UTC().Format("2 Jan 06")
				}
				if late, by := rep.OverdueCheck(ch); late {
					due, dc = daysText(by)+" late", cSev["critical"]
				}
				if o := strings.TrimSpace(ch.Owner); o != "" {
					owner, oc = o, cInk2
				}
			}
			t.row([]tcell{{text: id.Name, face: fMed}, {text: orDash(id.Account)}, {text: owner, color: &oc}, {text: fmtScore(id.Score), face: fSemi}, {text: due, face: fSemi, color: &dc}, {text: it.Found, color: &cInk2}}, j%2 == 1)
		}
		if len(items) > planEvidenceRows {
			p.font(fReg, 7.2, cInk3)
			p.at(p.mx, pdf.GetY()+1, p.body, 4, fmt.Sprintf("and %s more in the workbook", count(len(items)-planEvidenceRows, "identity", "identities")), "L")
			pdf.SetY(pdf.GetY() + 5)
		}
		pdf.SetY(pdf.GetY() + 7)
	}
}

// ---- method ---------------------------------------------------------------------------

func (p *plan) method() {
	pdf := p.pdf
	p.title("method", "How this plan is built", "")
	half := (p.body - 12) / 2
	y := pdf.GetY()
	p.sub(p.mx, y, half, "Priority waves")
	pdf.SetY(y + 7)
	t := p.newTable([]tcol{{"Wave", 22, "L"}, {"Rule", half - 22, "L"}})
	t.header()
	rules := map[string]string{
		"P1": "Critical checks, and high checks failing on 10% or more of scored identities.",
		"P2": "Other high checks, and medium checks failing on 10% or more.",
		"P3": "Other medium checks.",
		"P4": "Low checks: hygiene and governance.",
	}
	for i, w := range waves {
		c := cWave[w]
		t.row([]tcell{{text: w + " " + PriorityText(w), face: fSemi, color: &c}, {text: rules[w]}}, i%2 == 1)
	}
	pdf.SetY(pdf.GetY() + 5)
	p.sub(p.mx, pdf.GetY(), half, "Score gain")
	pdf.SetY(pdf.GetY() + 6)
	p.font(fReg, 8.4, cInk2)
	p.para(p.mx, half, 4.3, "Each identity an action fixes is re-scored without that action's points (a score stays between 0 and 100), and the change is averaged over every scored identity. A wave's gain re-scores with all its actions at once, so gains are not added up.")
	pdf.SetY(pdf.GetY() + 4)
	p.sub(p.mx, pdf.GetY(), half, "Remediation targets")
	pdf.SetY(pdf.GetY() + 6)
	p.font(fReg, 8.4, cInk2)
	p.para(p.mx, half, 4.3, slaLine(p.rep)+" A finding is overdue once it has been open longer than its target.")

	x := p.mx + half + 12
	pdf.SetY(y)
	p.sub(x, y, half, "Method")
	pdf.SetY(y + 7)
	for _, m := range methodology {
		p.font(fReg, 8.2, cInk2)
		p.para(x, half, 4.2, m)
		pdf.SetY(pdf.GetY() + 1.5)
	}
}

// dueFigure is the cover's fourth figure: overdue findings, or what falls
// due in the next 7 days when nothing is late yet.
func (p *plan) dueFigure() struct{ label, value, sub string } {
	if n := p.overdueTotal(); n > 0 {
		return struct{ label, value, sub string }{"Overdue findings", num(n), "past their remediation target"}
	}
	return struct{ label, value, sub string }{"Due in the next 7 days", num(p.rep.DueWithin(7)), "none is past its target yet"}
}

// scoreSub is the line under the score: its 30-day change, or that it is
// the baseline.
func scoreSub(rep *PostureReport) string {
	if rep.Change30d == nil {
		return "the baseline: change shows from here"
	}
	return changeText(rep.Change30d) + " in 30 days"
}
