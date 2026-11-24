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

var cWave = map[string]rgb{"P1": {196, 32, 32}, "P2": {234, 106, 24}, "P3": {29, 99, 237}, "P4": {113, 113, 122}}

func (p *plan) header() {
	p.watermark()
	if p.pdf.PageNo() == 1 {
		return
	}
	p.fill(cBrandDeep)
	p.pdf.Rect(0, 0, p.W, 12, "F")
	p.pdf.ImageOptions("logo-inv", p.mx, 3.4, 24, 0, false, fpdfImage(), 0, "")
	p.font(fSemi, 7.5, rgb{191, 208, 245})
	p.at(p.mx+30, 3.5, p.body-30, 5, "Identity Risk Remediation Plan  ·  "+orDash(p.rep.PreparedFor)+"  ·  "+p.rep.ScopeLabel(), "L")
	p.font(fSemi, 7, rgb{255, 180, 170})
	p.at(p.mx, 3.5, p.body, 5, "CONFIDENTIAL", "R")
	p.pdf.SetY(p.top)
}

func (p *plan) footer() {
	if p.pdf.PageNo() == 1 {
		return
	}
	y := p.H - 9
	p.font(fReg, 7, cInk3)
	p.at(p.mx, y, p.body/2, 4, p.rep.ID()+"  ·  data as of "+controlLines(p.rep)[3][1], "L")
	p.at(p.mx+p.body/2, y, p.body/2, 4, fmt.Sprintf("Page %d of {nb}", p.pdf.PageNo()), "R")
}

func (p *plan) title(key, title, note string) {
	p.pdf.AddPage()
	p.mark(key)
	p.pdf.Bookmark(title, 0, -1)
	p.font(fBold, 16, cInk)
	p.at(p.mx, p.pdf.GetY(), p.body, 8, title, "L")
	p.pdf.SetY(p.pdf.GetY() + 9)
	if note != "" {
		p.font(fReg, 8.6, cInk3)
		p.para(p.mx, p.body*0.8, 4.4, note)
	}
	p.pdf.SetY(p.pdf.GetY() + 3)
}

// ---- cover with the plan at a glance ------------------------------------------

func (p *plan) cover() {
	pdf, rep := p.pdf, p.rep
	pdf.AddPage()
	pdf.Bookmark("Plan at a glance", 0, -1)
	lw := 108.0
	pdf.LinearGradient(0, 0, lw, p.H, cBrandDeep[0], cBrandDeep[1], cBrandDeep[2], 16, 48, 112, 0, 0, 0.3, 1)
	pdf.ImageOptions("logo-inv", 14, 14, 40, 0, false, fpdfImage(), 0, "")
	x, w := 14.0, lw-26
	y := 50.0
	p.fill(cBrand)
	pdf.Rect(x, y, 12, 1.1, "F")
	p.font(fBold, 20, cWhite)
	pdf.SetXY(x, y+5)
	for _, l := range p.wrap(BrandTitle, w, 0) {
		pdf.SetX(x)
		pdf.CellFormat(w, 8.6, l, "", 1, "L", false, 0, "")
	}
	p.font(fSemi, 11, rgb{176, 200, 250})
	for _, l := range p.wrap(BrandTagline, w, 0) {
		pdf.SetX(x)
		pdf.CellFormat(w, 5.6, l, "", 1, "L", false, 0, "")
	}
	pdf.SetY(pdf.GetY() + 9)
	p.font(fSemi, 13, cWhite)
	p.at(x, pdf.GetY(), w, 6, "Identity Risk Remediation Plan", "L")
	p.font(fReg, 8.6, rgb{191, 208, 245})
	p.at(x, pdf.GetY()+7, w, 4.4, "Prepared for "+orDash(rep.PreparedFor), "L")
	p.at(x, pdf.GetY()+11.5, w, 4.4, rep.ScopeLabel()+" · "+rep.GeneratedAt.UTC().Format("2 Jan 2006"), "L")
	cy := p.H - 50
	for _, r := range controlLines(rep) {
		if r[0] == "Prepared for" {
			continue
		}
		p.font(fSemi, 6.3, rgb{140, 165, 215})
		p.at(x, cy, 30, 4, strings.ToUpper(r[0]), "L")
		face := fReg
		if r[0] == "Report ID" {
			face = fMono
		}
		p.font(face, 7.6, cWhite)
		p.at(x+30, cy, w-30, 4, r[1], "L")
		cy += 5.6
	}
	if rep.Sample {
		p.font(fSemi, 7, rgb{255, 196, 140})
		p.at(x, p.H-14, w, 4, "Sample report: illustrative data, not a real environment.", "L")
	}

	// Right: the plan at a glance.
	rx := lw + 12
	rw := p.W - rx - 14
	ry := 16.0
	p.font(fSemi, 8, cBrand)
	p.at(rx, ry, rw, 4, "PLAN AT A GLANCE", "L")
	p.font(fBold, 17, cInk)
	p.at(rx, ry+5, rw, 8, p.headline(), "L")
	ry += 18
	figs := []struct{ label, value, sub string }{
		{"Average score", fmtScore(rep.AverageScore), changeText(rep.Change30d) + " in 30 days"},
		{"Identities to fix", num(rep.FailingCount), "of " + num(rep.ScoredCount) + " scored"},
		{"Actions", num(len(rep.Groups)), num(rep.CheckCount) + " findings"},
		{"Overdue findings", num(p.overdueTotal()), fmt.Sprintf("past their %d/%d/%d/%d-day targets", rep.SLA.Due("critical"), rep.SLA.Due("high"), rep.SLA.Due("medium"), rep.SLA.Due("low"))},
	}
	fw := (rw - 3*4) / 4
	for i, f := range figs {
		fx := rx + float64(i)*(fw+4)
		p.fill(cPanel)
		pdf.RoundedRect(fx, ry, fw, 21, 2, "1234", "F")
		p.font(fSemi, 6.6, cInk3)
		p.at(fx+3.5, ry+3.2, fw-7, 3.5, strings.ToUpper(f.label), "L")
		p.font(fBold, 15, cInk)
		p.at(fx+3.5, ry+7.5, fw-7, 7, f.value, "L")
		p.font(fReg, 6.8, cInk3)
		p.at(fx+3.5, ry+15, fw-7, 3.5, f.sub, "L")
	}
	ry += 28
	if rep.CheckCount == 0 {
		p.font(fReg, 10, cInk2)
		p.at(rx, ry, rw, 6, "No identity fails a check of the chosen severity. There is nothing to plan.", "L")
		return
	}

	// Waves.
	p.font(fSemi, 10, cInk)
	p.at(rx, ry, rw, 5, "Remediation waves", "L")
	ry += 7
	t := p.newTable([]tcol{{"Wave", 34, "L"}, {"When", 26, "L"}, {"Actions", 18, "R"}, {"Findings", 20, "R"}, {"Identities", 22, "R"}, {"Score gain", rw - 120, "R"}})
	t.x = rx
	pdf.SetY(ry)
	t.header()
	for i, wv := range waves {
		acts, finds, ids, gain := p.wave(wv)
		c := cWave[wv]
		t.row([]tcell{{text: wv + "  " + map[string]string{"P1": "Critical path", "P2": "High impact", "P3": "Planned", "P4": "Hygiene"}[wv], face: fSemi, color: &c},
			{text: PriorityText(wv)}, {text: num(acts), face: fSemi}, {text: num(finds)}, {text: num(ids)}, {text: fmt.Sprintf("+%.1f", gain), face: fSemi}}, i%2 == 1)
	}
	ry = pdf.GetY() + 7

	// The first actions.
	p.font(fSemi, 10, cInk)
	p.at(rx, ry, rw, 5, "Start here", "L")
	pdf.SetY(ry + 7)
	t = p.newTable([]tcol{{"#", 8, "L"}, {"Action", rw - 80, "L"}, {"Severity", 24, "L"}, {"Identities", 20, "R"}, {"Gain", 14, "R"}, {"Page", 14, "R"}})
	t.x, t.maxLine = rx, 2
	t.header()
	for i, g := range rep.Groups {
		if i == 6 {
			break
		}
		t.row([]tcell{{text: fmt.Sprint(i + 1), face: fBold, color: &cBrand}, {text: actionText(g), face: fMed, link: p.link(fmt.Sprintf("g%d", i))}, {sev: g.Severity},
			{text: num(len(g.Items))}, {text: fmt.Sprintf("+%.1f", rep.Uplift(g)), face: fSemi}, {text: p.pageOf(fmt.Sprintf("g%d", i)), color: &cBrand, link: p.link(fmt.Sprintf("g%d", i))}}, i%2 == 1)
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
		p.fill(c)
		p.pdf.Rect(p.mx, y+0.6, 1.4, 5, "F")
		p.font(fBold, 11, c)
		p.at(p.mx+4, y, 80, 6, wv+" · "+PriorityText(wv), "L")
		acts, finds, ids, gain := p.wave(wv)
		p.font(fReg, 8, cInk3)
		p.at(p.mx+4, y, p.body-4, 6, fmt.Sprintf("%s · %s · %s · up to +%.1f", count(acts, "action", "actions"), count(finds, "finding", "findings"), count(ids, "identity", "identities"), gain), "R")
		p.pdf.SetY(y + 8)
		t := p.newTable([]tcol{{"Ref", 15, "L"}, {"Action", 82, "L"}, {"Check", 46, "L"}, {"Severity", 22, "L"}, {"Identities", 18, "R"}, {"Overdue", 17, "R"}, {"Oldest", 17, "R"}, {"Gain", 13, "R"}, {"Owner", p.body - 230, "L"}})
		t.maxLine = 3
		t.header()
		for j, gi := range list {
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
				{text: fmt.Sprintf("+%.1f", rep.Uplift(g)), face: fSemi}, {text: owner, color: &oc}}, j%2 == 1)
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
	note := "Whether fixes keep up with new findings, and what is already late. " + slaLine(rep)
	p.title("pace", "Remediation pace", note)
	if cs := changeSentence(rep); cs != "" {
		p.font(fMed, 9.2, cBrandDeep)
		p.para(p.mx, p.body, 4.6, cs)
		pdf.SetY(pdf.GetY() + 3)
	}
	half := (p.body - 12) / 2
	p.remediationTable(p.mx, p.body)
	pdf.SetY(pdf.GetY() + 6)
	p.ensure(52)
	y := pdf.GetY()
	p.font(fSemi, 10, cInk)
	p.at(p.mx, y, half, 5, "Age of open findings", "L")
	left := p.agingChart(p.mx, y+7, half)
	p.font(fSemi, 10, cInk)
	p.at(p.mx+half+12, y, half, 5, "Owners", "L")
	pdf.SetY(y + 7)
	p.ownersTable(p.mx+half+12, half, 6)
	pdf.SetY(math.Max(left, pdf.GetY()) + 6)
	pdf.AddPage()

	// The late items, most late first: the list to chase.
	type late struct {
		id *ReportIdentity
		c  ReportCheck
		by int
		gi int
	}
	var list []late
	gidx := map[string]int{}
	for gi, g := range rep.Groups {
		gidx[g.RuleID] = gi
	}
	for i := range rep.Identities {
		id := &rep.Identities[i]
		for _, c := range id.Checks {
			if ok, by := rep.OverdueCheck(c); ok {
				list = append(list, late{id, c, by, gidx[c.RuleID]})
			}
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		if sevRank(list[i].c.Severity) != sevRank(list[j].c.Severity) {
			return sevRank(list[i].c.Severity) < sevRank(list[j].c.Severity)
		}
		return list[i].by > list[j].by
	})
	p.ensure(30)
	p.font(fSemi, 10, cInk)
	p.at(p.mx, pdf.GetY(), p.body, 5, fmt.Sprintf("Overdue now: %s", count(len(list), "finding", "findings")), "L")
	pdf.SetY(pdf.GetY() + 7)
	if len(list) == 0 {
		p.font(fReg, 8.6, cInk2)
		p.para(p.mx, p.body, 4.4, "No open finding is past its remediation target.")
		return
	}
	t := p.newTable([]tcol{{"Severity", 22, "L"}, {"Check", 70, "L"}, {"Identity", 62, "L"}, {"Account", 44, "L"}, {"Owner", 36, "L"}, {"Late by", p.body - 234, "R"}})
	t.maxLine = 1
	t.header()
	shown := min(20, len(list))
	for j, l := range list[:shown] {
		owner, oc := strings.TrimSpace(l.c.Owner), cInk2
		if owner == "" {
			owner, oc = "Unassigned", cSev["high"]
		}
		t.row([]tcell{{sev: l.c.Severity}, {text: l.c.Check, face: fMed, link: p.link(fmt.Sprintf("g%d", l.gi))}, {text: l.id.Name}, {text: orDash(l.id.Account), color: &cInk2},
			{text: owner, color: &oc}, {text: daysText(l.by), face: fSemi, color: ptr(cSev["critical"])}}, j%2 == 1)
	}
	if len(list) > shown {
		p.font(fReg, 7.4, cInk3)
		p.at(p.mx, pdf.GetY()+1, p.body, 4, fmt.Sprintf("and %s more overdue findings in the workbook", num(len(list)-shown)), "L")
		pdf.SetY(pdf.GetY() + 5)
	}
}

// ---- heat map -----------------------------------------------------------------------

func (p *plan) heatmap() {
	pdf, rep := p.pdf, p.rep
	p.title("heatmap", "Where to look: accounts by security area", "Findings per account and security area. Darker cells hold more findings; the number in each cell is the count, and the coloured bar under it shows how many are critical or high.")
	areas := rep.Areas()
	type cellv struct{ n, severe int }
	grid := map[string]map[string]*cellv{}
	maxN := 0
	for _, g := range rep.Groups {
		area := AreaLabel(g.Area)
		if area == "" {
			area = "Other"
		}
		for _, it := range g.Items {
			acct := rep.Identities[it.Identity].Account
			if acct == "" {
				acct = rep.Identities[it.Identity].AccountID
			}
			if grid[acct] == nil {
				grid[acct] = map[string]*cellv{}
			}
			c := grid[acct][area]
			if c == nil {
				c = &cellv{}
				grid[acct][area] = c
			}
			c.n++
			if g.Severity == "critical" || g.Severity == "high" {
				c.severe++
			}
			if c.n > maxN {
				maxN = c.n
			}
		}
	}
	accts := make([]string, 0, len(rep.Accounts))
	for _, a := range rep.Accounts {
		accts = append(accts, accountName(a))
	}
	nameW := 62.0
	colW := math.Min(34, (p.body-nameW-22)/float64(max(1, len(areas))))
	rowH := 11.0
	y := pdf.GetY()
	p.font(fSemi, 7, cInk3)
	for i, a := range areas {
		x := p.mx + nameW + float64(i)*colW
		for li, l := range p.wrap(strings.ToUpper(a.Area), colW-2, 2) {
			p.at(x, y+float64(li)*3.4, colW, 3.4, l, "C")
		}
	}
	p.at(p.mx+nameW+float64(len(areas))*colW, y, 22, 3.4, "TOTAL", "R")
	y += 9
	for _, acct := range accts {
		if y+rowH > p.H-p.bottom {
			pdf.AddPage()
			y = pdf.GetY()
		}
		p.font(fMed, 8.4, cInk)
		p.at(p.mx, y, nameW-4, rowH, acct, "L")
		total := 0
		for i, a := range areas {
			x := p.mx + nameW + float64(i)*colW
			c := grid[acct][a.Area]
			n, severe := 0, 0
			if c != nil {
				n, severe = c.n, c.severe
			}
			total += n
			shade := 0.0
			if maxN > 0 {
				shade = math.Sqrt(float64(n) / float64(maxN))
			}
			bg := mix(rgb{241, 245, 253}, rgb{23, 62, 150}, shade)
			p.fill(bg)
			pdf.Rect(x+0.6, y+0.6, colW-1.2, rowH-1.2, "F")
			fg := cInk
			if shade > 0.55 {
				fg = cWhite
			}
			p.font(fSemi, 8.6, fg)
			label := num(n)
			if n == 0 {
				label = "·"
			}
			p.at(x, y+1.4, colW, 5, label, "C")
			if n > 0 && severe > 0 {
				p.fill(cSevFill["critical"])
				pdf.Rect(x+3, y+rowH-3.4, (colW-6)*float64(severe)/float64(n), 1.2, "F")
			}
		}
		p.font(fBold, 8.6, cInk)
		p.at(p.mx+nameW+float64(len(areas))*colW, y, 22, rowH, num(total), "R")
		y += rowH
	}
	pdf.SetY(y + 4)
	p.font(fReg, 7.4, cInk3)
	p.at(p.mx, pdf.GetY(), p.body, 4, "Red bar: share of the cell's findings that are critical or high.", "L")
}

func mix(a, b rgb, t float64) rgb {
	t = math.Max(0, math.Min(1, t))
	return rgb{int(float64(a[0]) + (float64(b[0])-float64(a[0]))*t), int(float64(a[1]) + (float64(b[1])-float64(a[1]))*t), int(float64(a[2]) + (float64(b[2])-float64(a[2]))*t)}
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
		p.draw(cLine)
		pdf.SetLineWidth(0.25)
		pdf.RoundedRect(x, y, colW, h, 2, "1234", "D")
		p.font(fSemi, 10, cInk)
		p.at(x+4, y+3, colW-40, 5, accountName(a), "L")
		p.font(fMono, 7, cInk3)
		p.at(x+4, y+8.4, colW-40, 4, a.ID, "L")
		p.font(fBold, 13, cBand[bandFor(scoreOr(a.Average))])
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
		p.fill(c)
		pdf.Rect(p.mx, y, 1.4, 12, "F")
		p.font(fMono, 7.4, cInk3)
		p.at(p.mx+4, y, 18, 5, FindingRef(i), "L")
		pw := p.sevPill(p.mx+20, y+0.6, g.Severity, 6.6)
		p.font(fSemi, 7.4, c)
		p.at(p.mx+23+pw, y, 50, 5, rep.Priority(g)+" · "+PriorityText(rep.Priority(g)), "L")
		p.font(fReg, 7.4, cInk3)
		meta := fmt.Sprintf("%s · %s · up to +%.1f · %s", count(len(g.Items), "identity", "identities"), AreaLabel(g.Area), rep.Uplift(g), strings.Join(g.Controls, " "))
		p.at(p.mx+4, y, p.body-4, 5, meta, "R")
		p.font(fSemi, 11, cInk)
		p.at(p.mx+4, y+5.5, p.body-4, 6, g.Title, "L")
		pdf.SetY(y + 13)
		half := (p.body - 10) / 2
		by := pdf.GetY()
		p.font(fSemi, 7, cInk3)
		p.at(p.mx+4, by, half, 4, "HOW TO FIX", "L")
		p.at(p.mx+half+14, by, half, 4, "WHY IT MATTERS", "L")
		p.font(fReg, 8.4, cInk2)
		fixL := p.wrap(orDash(g.Fix), half-4, 4)
		why := g.Risk
		if why == "" {
			why = g.About
		}
		whyL := p.wrap(orDash(why), half-4, 4)
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
	p.font(fSemi, 10, cInk)
	p.at(p.mx, y, half, 5, "Priority waves", "L")
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
	p.font(fSemi, 10, cInk)
	p.at(p.mx, pdf.GetY(), half, 5, "Score gain", "L")
	pdf.SetY(pdf.GetY() + 6)
	p.font(fReg, 8.4, cInk2)
	p.para(p.mx, half, 4.3, "Each identity an action fixes is re-scored without that action's points (a score stays between 0 and 100), and the change is averaged over every scored identity. A wave's gain re-scores with all its actions at once, so gains are not added up.")
	pdf.SetY(pdf.GetY() + 4)
	p.font(fSemi, 10, cInk)
	p.at(p.mx, pdf.GetY(), half, 5, "Remediation targets", "L")
	pdf.SetY(pdf.GetY() + 6)
	p.font(fReg, 8.4, cInk2)
	p.para(p.mx, half, 4.3, slaLine(p.rep)+" A finding is overdue once it has been open longer than its target.")

	x := p.mx + half + 12
	pdf.SetY(y)
	p.font(fSemi, 10, cInk)
	p.at(x, y, half, 5, "Method", "L")
	pdf.SetY(y + 7)
	for _, m := range methodology {
		p.font(fReg, 8.2, cInk2)
		p.para(x, half, 4.2, m)
		pdf.SetY(pdf.GetY() + 1.5)
	}
}
