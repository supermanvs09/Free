package reports

import (
	"fmt"
	"io"
	"strings"
)

// WriteBriefPDF is design A, the executive brief: for a CISO or a board.
// It leads with the answer (score, trend, what to do), keeps detail to the
// ten findings that matter most, and leaves the full lists to Excel.
//
//	Cover · Executive summary · Risk overview · Compliance impact ·
//	Top findings · Appendix: scope, method and definitions
func WriteBriefPDF(w io.Writer, rep *PostureReport) error {
	return twoPass(w, func(known map[string]int) *kit {
		k := newKit(rep, "P", 16, 22, 16, known)
		b := &brief{k}
		k.pdf.SetHeaderFuncMode(b.header, false)
		k.pdf.SetFooterFunc(b.footer)
		b.cover()
		b.summary()
		if rep.CheckCount > 0 {
			b.overview()
			b.compliance()
			b.findings()
		}
		b.appendix()
		return k
	})
}

type brief struct{ *kit }

const briefTop = 10 // findings described in full

func (b *brief) header() {
	b.watermark()
	if b.pdf.PageNo() == 1 {
		return
	}
	b.pdf.ImageOptions("logo", b.mx, 8, 26, 0, false, fpdfImage(), 0, "")
	b.font(fMed, 7.5, cInk3)
	b.at(b.mx, 8.5, b.body, 4, ReportTitle+"  ·  "+b.rep.ScopeLabel(), "R")
	b.draw(cLine)
	b.pdf.SetLineWidth(0.2)
	b.pdf.Line(b.mx, 15, b.W-b.mx, 15)
	b.pdf.SetY(b.top)
}

func (b *brief) footer() {
	if b.pdf.PageNo() == 1 {
		return
	}
	y := b.H - 11
	b.font(fSemi, 7, cSev["critical"])
	b.at(b.mx, y, 70, 4, "CONFIDENTIAL", "L")
	b.font(fReg, 7, cInk3)
	b.at(b.mx+24, y, 110, 4, b.rep.ID()+"  ·  "+b.rep.GeneratedAt.UTC().Format("2 Jan 2006"), "L")
	b.at(b.W-b.mx-40, y, 40, 4, fmt.Sprintf("Page %d of {nb}", b.pdf.PageNo()), "R")
}

// sectionTitle starts a section on a new page with an eyebrow and a title.
func (b *brief) sectionTitle(key, eyebrow, title string) {
	b.pdf.AddPage()
	b.mark(key)
	b.pdf.Bookmark(title, 0, -1)
	b.font(fSemi, 8, cBrand)
	b.at(b.mx, b.pdf.GetY(), b.body, 4, strings.ToUpper(eyebrow), "L")
	b.font(fBold, 19, cInk)
	b.at(b.mx, b.pdf.GetY()+4.5, b.body, 9, title, "L")
	b.pdf.SetY(b.pdf.GetY() + 13)
}

func (b *brief) sub(title, note string) {
	b.ensure(16)
	b.font(fSemi, 11, cInk)
	b.at(b.mx, b.pdf.GetY(), b.body, 6, title, "L")
	b.pdf.SetY(b.pdf.GetY() + 6.5)
	if note != "" {
		b.font(fReg, 8, cInk3)
		b.para(b.mx, b.body, 4, note)
	}
	b.pdf.SetY(b.pdf.GetY() + 1.5)
}

// ---- cover ---------------------------------------------------------------

func (b *brief) cover() {
	pdf, rep := b.pdf, b.rep
	pdf.AddPage()
	pdf.Bookmark("Cover", 0, -1)
	// Deep band with the brand lines.
	bandH := 168.0
	pdf.LinearGradient(0, 0, b.W, bandH, cBrandDeep[0], cBrandDeep[1], cBrandDeep[2], 16, 48, 112, 0, 0, 1, 1)
	pdf.ImageOptions("logo-inv", b.mx, 16, 46, 0, false, fpdfImage(), 0, "")
	b.font(fSemi, 7.5, rgb{191, 208, 245})
	b.at(b.W-b.mx-80, 19, 80, 4, "CONFIDENTIAL · INTERNAL USE ONLY", "R")

	y := 62.0
	b.fill(cBrand)
	pdf.Rect(b.mx, y, 14, 1.2, "F")
	b.font(fBold, 27, cWhite)
	pdf.SetXY(b.mx, y+6)
	for _, line := range b.wrap(BrandTitle, b.body-10, 0) {
		pdf.SetX(b.mx)
		pdf.CellFormat(b.body, 11.5, line, "", 1, "L", false, 0, "")
	}
	b.font(fSemi, 14, rgb{176, 200, 250})
	for _, line := range b.wrap(BrandTagline, b.body-30, 0) {
		pdf.SetX(b.mx)
		pdf.CellFormat(b.body, 7.5, line, "", 1, "L", false, 0, "")
	}
	pdf.SetY(pdf.GetY() + 10)
	b.font(fSemi, 15, cWhite)
	b.at(b.mx, pdf.GetY(), b.body, 7, ReportTitle, "L")
	b.font(fReg, 10, rgb{191, 208, 245})
	b.at(b.mx, pdf.GetY()+8, b.body, 5, rep.ScopeLabel()+"  ·  "+rep.GeneratedAt.UTC().Format("2 January 2006"), "L")

	// Prepared for and document control.
	y = bandH + 16
	b.font(fSemi, 8, cInk3)
	b.at(b.mx, y, b.body, 4, "PREPARED FOR", "L")
	b.font(fBold, 18, cInk)
	b.at(b.mx, y+5, b.body, 9, orDash(rep.PreparedFor), "L")
	y += 22
	b.draw(cLine)
	pdf.SetLineWidth(0.2)
	pdf.Line(b.mx, y, b.W-b.mx, y)
	y += 5
	var rows [][2]string
	for _, r := range append(controlLines(rep), scopeLines(rep)...) {
		if r[0] != "Prepared for" {
			rows = append(rows, r)
		}
	}
	colW := b.body / 2
	for i, r := range rows {
		x := b.mx + float64(i%2)*colW
		ry := y + float64(i/2)*11
		b.font(fSemi, 7, cInk3)
		b.at(x, ry, colW-6, 3.5, strings.ToUpper(r[0]), "L")
		face := fMed
		if r[0] == "Report ID" {
			face = fMono
		}
		b.font(face, 9.5, cInk)
		b.at(x, ry+4, colW-6, 5, r[1], "L")
	}
	b.font(fReg, 7, cInk3)
	note := "This report contains security-sensitive information about your cloud identities. Share it only with people who need it."
	if rep.Sample {
		note = "Sample report built from illustrative data, not from a real environment. " + note
	}
	b.font(fReg, 7, cInk3)
	for i, line := range b.wrap(note, b.body, 0) {
		b.at(b.mx, b.H-22+float64(i)*3.6, b.body, 3.6, line, "L")
	}
}

// ---- executive summary ----------------------------------------------------

func (b *brief) summary() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("summary", "Section 1", "Executive summary")

	// Score dial and trend, side by side.
	y := pdf.GetY()
	cardH := 58.0
	leftW := 62.0
	b.fill(cPanel)
	pdf.RoundedRect(b.mx, y, leftW, cardH, 2.5, "1234", "F")
	pdf.RoundedRect(b.mx+leftW+5, y, b.body-leftW-5, cardH, 2.5, "1234", "F")
	b.font(fSemi, 7.5, cInk3)
	b.at(b.mx+5, y+4, leftW-10, 4, "AVERAGE SECURITY SCORE", "L")
	cx, cy := b.mx+leftW/2, y+31
	b.gauge(cx, cy, 15, rep.AverageScore, cLine)
	b.font(fBold, 22, cInk)
	b.at(cx-20, cy-6.5, 40, 10, fmtScore(rep.AverageScore), "C")
	b.font(fReg, 7, cInk3)
	b.at(cx-20, cy+3, 40, 4, "out of 100", "C")
	if rep.AverageScore != nil {
		band := bandFor(*rep.AverageScore)
		label := strings.ToUpper(bandLabel(band))
		b.font(fSemi, 7.5, cBand[band])
		wl := b.width(label) + 5
		b.fill(cWhite)
		pdf.RoundedRect(cx-wl/2, y+cardH-11, wl, 5, 2.5, "1234", "F")
		b.at(cx-wl/2, y+cardH-11, wl, 5, label, "C")
	}
	tx := b.mx + leftW + 10
	tw := b.body - leftW - 15
	b.font(fSemi, 7.5, cInk3)
	b.at(tx, y+4, tw, 4, "30-DAY TREND", "L")
	b.font(fSemi, 9, cInk)
	b.at(tx, y+4, tw, 4, changeText(rep.Change30d)+" points in 30 days", "R")
	b.trendChart(tx, y+12, tw, cardH-22, rep.Trend, cBrand, cInk3, cLine)
	pdf.SetY(y + cardH + 6)

	// Figures.
	figs := []struct{ label, value, sub string }{
		{"Identities scored", num(rep.ScoredCount), "in " + count(rep.AccountsCovered, "account", "accounts")},
		{"With failing checks", num(rep.FailingCount), pct(rep.FailingCount, rep.ScoredCount) + " of scored"},
		{"Critical + high findings", num(rep.BySeverity["critical"] + rep.BySeverity["high"]), "of " + num(rep.CheckCount) + " findings"},
		{"Failing for 30+ days", num(rep.OldChecks), "findings not fixed in a month"},
	}
	y = pdf.GetY()
	fw := (b.body - 3*4) / 4
	for i, f := range figs {
		x := b.mx + float64(i)*(fw+4)
		b.draw(cLine)
		pdf.SetLineWidth(0.25)
		pdf.RoundedRect(x, y, fw, 22, 2, "1234", "D")
		b.font(fSemi, 6.8, cInk3)
		b.at(x+3.5, y+3.5, fw-7, 3.5, strings.ToUpper(f.label), "L")
		b.font(fBold, 16, cInk)
		b.at(x+3.5, y+8, fw-7, 8, f.value, "L")
		b.font(fReg, 7, cInk3)
		b.at(x+3.5, y+16.5, fw-7, 3.5, f.sub, "L")
	}
	pdf.SetY(y + 28)

	if rep.CheckCount == 0 {
		b.sub("Result", "")
		b.font(fReg, 10, cInk2)
		b.para(b.mx, b.body, 5, "No identity in scope fails a check of the chosen severity. Nothing needs fixing.")
		return
	}

	b.sub("Key messages", "")
	for _, p := range keyPoints(rep) {
		b.ensure(10)
		y := pdf.GetY()
		b.fill(cBrand)
		pdf.Rect(b.mx, y+1, 0.9, 3.4, "F")
		b.font(fReg, 9.2, cInk2)
		b.para(b.mx+4, b.body-4, 4.8, p)
		pdf.SetY(pdf.GetY() + 1.6)
	}
	pdf.SetY(pdf.GetY() + 3)

	b.sub("Priority actions", "The fixes that remove the most risk, most severe first. Each one fixes the check on every identity it fails on.")
	for i, g := range rep.Groups {
		if i == 5 {
			break
		}
		b.ensure(17)
		y := pdf.GetY()
		b.font(fBold, 15, cBrand)
		b.at(b.mx, y, 9, 8, fmt.Sprint(i+1), "L")
		pw := b.sevPill(b.mx+10, y+0.8, g.Severity, 6.8)
		b.font(fSemi, 9.5, cInk)
		b.at(b.mx+12+pw, y, b.body-50-pw, 5.5, g.Title, "L")
		pdf.Link(b.mx, y, b.body, 14, b.link(fmt.Sprintf("g%d", i)))
		b.font(fReg, 8, cInk3)
		b.at(b.W-b.mx-40, y, 40, 5.5, count(len(g.Items), "identity", "identities")+fmt.Sprintf("  ·  up to +%.1f", rep.Uplift(g)), "R")
		b.font(fReg, 8.2, cInk2)
		fix := g.Fix
		if fix == "" {
			fix = "See the finding for how to fix it."
		}
		lines := b.wrap(fix, b.body-12, 2)
		for li, line := range lines {
			b.at(b.mx+10, y+6+float64(li)*4, b.body-12, 4, line, "L")
		}
		pdf.SetY(y + 7 + float64(len(lines))*4 + 2.5)
	}
}

// ---- risk overview ---------------------------------------------------------

func (b *brief) overview() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("overview", "Section 2", "Risk overview")

	half := (b.body - 8) / 2
	y := pdf.GetY()
	b.distribution(b.mx, y, half, "Findings by severity", func() []segment {
		var s []segment
		for _, sev := range shownSeverities(rep.Options) {
			s = append(s, segment{SeverityLabel(sev), rep.BySeverity[sev], cSevFill[sev]})
		}
		return s
	}())
	b.distribution(b.mx+half+8, y, half, "Identities by score band", func() []segment {
		var s []segment
		for _, bc := range rep.Bands {
			s = append(s, segment{bandLabel(bc.Band) + " (" + BandRange[bc.Band] + ")", bc.Count, cBandFill[bc.Band]})
		}
		return s
	}())
	pdf.SetY(y + 44)

	b.sub("By security area", "Where the findings sit. Each bar splits an area's findings by severity.")
	t := b.newTable([]tcol{{"Security area", 52, "L"}, {"Checks", 18, "R"}, {"Identities", 22, "R"}, {"Findings", 20, "R"}, {"By severity", b.body - 112, "L"}})
	t.header()
	for i, a := range rep.Areas() {
		y := pdf.GetY()
		t.row([]tcell{{text: a.Area, face: fMed}, {text: num(a.Checks)}, {text: num(a.Identities)}, {text: num(a.Findings), face: fSemi}, {text: ""}}, i%2 == 1)
		var segs []segment
		for _, s := range Severities {
			segs = append(segs, segment{"", a.BySev[s], cSevFill[s]})
		}
		b.bar(b.mx+113.6, y+2.6, b.body-115.2, 2.6, segs)
	}
	pdf.SetY(pdf.GetY() + 7)

	if len(rep.Classes) > 0 {
		b.sub("Human and non-human identities", "")
		t := b.newTable([]tcol{{"Identities", 60, "L"}, {"Scored", 28, "R"}, {"Average score", 34, "R"}, {"With failing checks", b.body - 122, "R"}})
		t.header()
		for i, c := range rep.Classes {
			name := "Non-human (workloads, roles, keys)"
			if c.Human {
				name = "Human (people with cloud access)"
			}
			t.row([]tcell{{text: name, face: fMed}, {text: num(c.Scored)}, {text: fmtScore(c.Average), face: fSemi}, {text: withPct(c.Failing, c.Scored)}}, i%2 == 1)
		}
		pdf.SetY(pdf.GetY() + 7)
	}

	b.sub("Accounts with the most severe findings", fmt.Sprintf("Top %d of %s.", min(8, len(rep.Accounts)), count(len(rep.Accounts), "account", "accounts")))
	t = b.newTable([]tcol{{"AWS account", 58, "L"}, {"Avg score", 20, "R"}, {"Failing", 18, "R"}, {"Critical", 18, "R"}, {"High", 16, "R"}, {"Medium", 18, "R"}, {"Low", b.body - 148, "R"}})
	t.header()
	for i, a := range rep.Accounts {
		if i == 8 {
			break
		}
		cells := []tcell{{text: accountName(a), face: fMed}, {text: fmtScore(a.Average), face: fSemi}, {text: num(a.Failing)}}
		for _, s := range Severities {
			c := cInk3
			if a.BySev[s] > 0 {
				c = cSev[s]
			}
			cells = append(cells, tcell{text: num(a.BySev[s]), face: fSemi, color: &c})
		}
		t.row(cells, i%2 == 1)
	}
}

// distribution is a titled stacked bar with a legend underneath.
func (b *brief) distribution(x, y, w float64, title string, segs []segment) {
	total := 0
	for _, s := range segs {
		total += s.n
	}
	b.font(fSemi, 10, cInk)
	b.at(x, y, w, 5, title, "L")
	b.font(fReg, 8, cInk3)
	b.at(x, y, w, 5, num(total)+" total", "R")
	b.bar(x, y+8, w, 5, segs)
	ly := y + 17
	for _, s := range segs {
		b.fill(s.c)
		b.pdf.Rect(x, ly+1, 2.6, 2.6, "F")
		b.font(fReg, 8.2, cInk2)
		b.at(x+4.5, ly, w-30, 4.6, s.label, "L")
		b.font(fSemi, 8.2, cInk)
		b.at(x+w-28, ly, 28, 4.6, num(s.n)+"   "+pct(s.n, total), "R")
		ly += 5.4
	}
}

// ---- compliance -----------------------------------------------------------

func (b *brief) compliance() {
	pdf, rep := b.pdf, b.rep
	fws := rep.Frameworks()
	if len(fws) == 0 {
		return
	}
	b.sectionTitle("compliance", "Section 3", "Compliance impact")
	b.font(fReg, 9, cInk2)
	b.para(b.mx, b.body, 4.6, "Failing checks mapped to the controls they are evidence for. Use it to see which audits these findings would surface in; it is not a full compliance assessment.")
	pdf.SetY(pdf.GetY() + 4)

	// One tile per framework.
	y := pdf.GetY()
	n := len(fws)
	if n > 4 {
		n = 4
	}
	tw := (b.body - float64(n-1)*4) / float64(n)
	for i, f := range fws[:n] {
		x := b.mx + float64(i)*(tw+4)
		b.fill(cPanel)
		pdf.RoundedRect(x, y, tw, 27, 2, "1234", "F")
		b.fill(cSevFill[f.Worst])
		pdf.Rect(x, y+3, 0.9, 21, "F")
		b.font(fSemi, 7.6, cInk2)
		for li, line := range b.wrap(f.Name, tw-8, 2) {
			b.at(x+4, y+3+float64(li)*3.6, tw-8, 3.6, line, "L")
		}
		b.font(fBold, 15, cInk)
		b.at(x+4, y+11.5, tw-8, 7, num(f.Controls), "L")
		b.font(fReg, 7, cInk3)
		b.at(x+4, y+18.5, tw-8, 3.5, plural(f.Controls, "control affected", "controls affected"), "L")
		b.at(x+4, y+22, tw-8, 3.5, count(f.Identities, "identity", "identities"), "L")
	}
	pdf.SetY(y + 33)

	for _, f := range fws {
		b.sub(f.Name, fmt.Sprintf("%s, %s and %s affected.", count(f.Controls, "control", "controls"), count(f.Checks, "failing check", "failing checks"), count(f.Identities, "identity", "identities")))
		t := b.newTable([]tcol{{"Control", 26, "L"}, {"Worst", 24, "L"}, {"Failing checks mapped to it", b.body - 76, "L"}, {"Identities", 26, "R"}})
		t.maxLine = 2
		t.header()
		for i, r := range f.Rows {
			if i == 8 {
				break
			}
			var names []string
			for _, gi := range r.Checks {
				names = append(names, rep.Groups[gi].Title)
			}
			t.row([]tcell{{text: r.Control, face: fMono, size: 7.6}, {sev: r.Worst}, {text: strings.Join(names, "; ")}, {text: num(r.Identities), face: fSemi}}, i%2 == 1)
		}
		if len(f.Rows) > 8 {
			b.font(fReg, 7.5, cInk3)
			b.at(b.mx, pdf.GetY()+1, b.body, 4, fmt.Sprintf("And %s more in the Excel workbook.", count(len(f.Rows)-8, "control", "controls")), "L")
			pdf.SetY(pdf.GetY() + 5)
		}
		pdf.SetY(pdf.GetY() + 5)
	}
}

// ---- findings ---------------------------------------------------------------

func (b *brief) findings() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("findings", "Section 4", "Top findings")
	b.font(fReg, 9, cInk2)
	b.para(b.mx, b.body, 4.6, fmt.Sprintf("The %s that matter most, most severe first. Every finding and every affected identity is in the Excel workbook.", count(min(briefTop, len(rep.Groups)), "finding", "findings")))
	pdf.SetY(pdf.GetY() + 3)
	for i, g := range rep.Groups {
		if i == briefTop {
			break
		}
		b.card(i, g)
	}
	if len(rep.Groups) > briefTop {
		b.sub("Other findings", "")
		t := b.newTable([]tcol{{"Ref", 16, "L"}, {"Check", b.body - 76, "L"}, {"Severity", 24, "L"}, {"Identities", 20, "R"}, {"Days", 16, "R"}})
		t.maxLine = 1
		t.header()
		for i := briefTop; i < len(rep.Groups); i++ {
			g := rep.Groups[i]
			t.row([]tcell{{text: FindingRef(i), face: fMono, size: 7.4}, {text: g.Title}, {sev: g.Severity}, {text: num(len(g.Items)), face: fSemi}, {text: daysText(rep.DaysFailing(g.Since))}}, i%2 == 1)
		}
	}
}

// card is one finding: what, why, what to do, and who.
func (b *brief) card(i int, g CheckGroup) {
	pdf, rep := b.pdf, b.rep
	pad := 5.0
	inner := b.body - 2*pad
	why, fix := g.Risk, g.Fix
	if why == "" {
		why = g.About
	}
	b.font(fReg, 8.4, cInk2)
	whyL := b.wrap(why, inner-28, 3)
	fixL := b.wrap(orDash(fix), inner-28, 4)
	var names []string
	for j, it := range g.Items {
		if j == 6 {
			break
		}
		names = append(names, rep.Identities[it.Identity].Name)
	}
	who := strings.Join(names, ", ")
	if len(g.Items) > len(names) {
		who += fmt.Sprintf(" and %s more", num(len(g.Items)-len(names)))
	}
	whoL := b.wrap(who, inner-28, 2)
	h := 22 + float64(len(whyL)+len(fixL)+len(whoL))*4.2 + 6
	b.ensure(h + 4)
	y := pdf.GetY()
	b.mark(fmt.Sprintf("g%d", i))
	pdf.Bookmark(FindingRef(i)+" "+g.Title, 1, -1)
	b.draw(cLine)
	pdf.SetLineWidth(0.25)
	pdf.RoundedRect(b.mx, y, b.body, h, 2.5, "1234", "D")
	b.fill(cSevFill[g.Severity])
	pdf.RoundedRect(b.mx, y, 1.6, h, 0.8, "14", "F")

	x := b.mx + pad
	b.font(fMono, 7.5, cInk3)
	b.at(x, y+4, 18, 4, FindingRef(i), "L")
	pw := b.sevPill(x+17, y+3.6, g.Severity, 6.6)
	b.font(fSemi, 7.2, cBrand)
	b.at(x+19+pw, y+4, 40, 4, rep.Priority(g)+" · "+PriorityText(rep.Priority(g)), "L")
	b.font(fReg, 7.4, cInk3)
	b.at(x, y+4, inner, 4, AreaLabel(g.Area), "R")
	b.font(fSemi, 11, cInk)
	b.at(x, y+9.5, inner, 6, g.Title, "L")

	meta := []string{count(len(g.Items), "identity", "identities"), count(len(g.Accounts), "account", "accounts")}
	if d := rep.DaysFailing(g.Since); d >= 0 {
		meta = append(meta, "failing "+daysText(d))
	}
	meta = append(meta, fmt.Sprintf("fixing it: up to +%.1f average score", rep.Uplift(g)))
	if len(g.Controls) > 0 {
		meta = append(meta, strings.Join(g.Controls[:min(4, len(g.Controls))], " "))
	}
	b.font(fReg, 7.6, cInk3)
	b.at(x, y+15.5, inner, 4, strings.Join(meta, "  ·  "), "L")

	ly := y + 22.0
	block := func(label string, lines []string, face string) {
		b.font(fSemi, 7.2, cInk3)
		b.at(x, ly, 27, 4.2, strings.ToUpper(label), "L")
		b.font(face, 8.4, cInk2)
		for _, l := range lines {
			b.at(x+28, ly, inner-28, 4.2, l, "L")
			ly += 4.2
		}
		ly += 1.4
	}
	block("Why it matters", whyL, fReg)
	block("What to do", fixL, fReg)
	block("Identities", whoL, fReg)
	pdf.SetY(y + h + 4)
}

// ---- appendix ---------------------------------------------------------------

func (b *brief) appendix() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("appendix", "Appendix", "Scope, method and definitions")
	b.sub("Scope", "")
	t := b.newTable([]tcol{{"Item", 40, "L"}, {"Value", b.body - 40, "L"}})
	t.header()
	for i, r := range append(scopeLines(rep), controlLines(rep)...) {
		t.row([]tcell{{text: r[0], face: fMed}, {text: r[1]}}, i%2 == 1)
	}
	pdf.SetY(pdf.GetY() + 6)

	b.sub("How the figures are made", "")
	for _, m := range methodology {
		b.font(fReg, 8.6, cInk2)
		b.ensure(9)
		y := pdf.GetY()
		b.fill(cInk3)
		pdf.Circle(b.mx+1.2, y+2.2, 0.6, "F")
		b.para(b.mx+4, b.body-4, 4.4, m)
		pdf.SetY(pdf.GetY() + 1.2)
	}
	pdf.SetY(pdf.GetY() + 4)

	half := (b.body - 8) / 2
	b.sub("Severity", "")
	t = b.newTable([]tcol{{"Severity", 26, "L"}, {"What it means", b.body - 26, "L"}})
	t.header()
	for i, s := range Severities {
		t.row([]tcell{{sev: s, pill: true}, {text: SeverityMeaning[s]}}, i%2 == 1)
	}
	pdf.SetY(pdf.GetY() + 6)
	b.sub("Score bands", "")
	t = b.newTable([]tcol{{"Band", 30, "L"}, {"Score", 30, "L"}, {"Meaning", b.body - 60, "L"}})
	t.header()
	meaning := map[string]string{"healthy": "Few or minor gaps.", "fair": "Some gaps to plan for.", "poor": "Several serious gaps.", "critical": "Urgent attention needed."}
	for i, band := range []string{"healthy", "fair", "poor", "critical"} {
		c := cBand[band]
		t.row([]tcell{{text: bandLabel(band), face: fSemi, color: &c}, {text: BandRange[band]}, {text: meaning[band]}}, i%2 == 1)
	}
	_ = half
}

func daysText(d int) string {
	switch {
	case d < 0:
		return "-"
	case d == 1:
		return "1 day"
	}
	return num(d) + " days"
}
