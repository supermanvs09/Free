package reports

import (
	"fmt"
	"io"
	"math"
	"strings"
)

// WriteBriefPDF is design A, the executive brief: for a CISO or a board.
// It leads with the answer (score, trend, what changed, what to do), keeps
// detail to the ten findings that matter most, and leaves the full lists to
// Excel.
//
//	Cover · Executive summary · Remediation performance · Risk overview ·
//	Compliance impact · Top findings · Appendix: scope, method, definitions
func WriteBriefPDF(w io.Writer, rep *PostureReport) error {
	return twoPass(w, func(known map[string]int) *kit {
		k := newKit(rep, "P", 16, 22, 16, known)
		b := &brief{k}
		k.pdf.SetHeaderFuncMode(b.header, false)
		k.pdf.SetFooterFunc(b.footer)
		b.cover()
		b.summary()
		if rep.CheckCount > 0 {
			b.remediation()
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

// sectionTitle starts a section on a new page.
func (b *brief) sectionTitle(key, eyebrow, title string) {
	b.pdf.AddPage()
	b.mark(key)
	b.pdf.Bookmark(title, 0, -1)
	b.sectionHead(eyebrow, title)
}

func (b *brief) sub(title, note string) { b.subHead(title, note) }

// ---- cover ---------------------------------------------------------------

// cover is a document cover, not a slide: white, the two brand lines each on
// one line in serif, the report's name, and the document control below a
// rule. A thin navy band at the foot carries the classification.
func (b *brief) cover() {
	pdf, rep := b.pdf, b.rep
	pdf.AddPage()
	pdf.Bookmark("Cover", 0, -1)
	pdf.ImageOptions("logo", b.mx, 18, 42, 0, false, fpdfImage(), 0, "")
	b.font(fSemi, 7, cSev["critical"])
	b.at(b.W-b.mx-80, 21, 80, 4, "CONFIDENTIAL  ·  INTERNAL USE ONLY", "R")

	y := 78.0
	b.fill(cBrand)
	pdf.Rect(b.mx, y, 12, 0.9, "F")
	size := b.fitSize(fSemi, 26, b.body, BrandTitle)
	b.font(fSemi, size, cInk)
	b.at(b.mx, y+6, b.body, size*0.48, BrandTitle, "L")
	y += 6 + size*0.48 + 3
	tsize := b.fitSize(fReg, 13, b.body, BrandTagline)
	b.font(fReg, tsize, cInk2)
	b.at(b.mx, y, b.body, tsize*0.5, BrandTagline, "L")
	y += tsize*0.5 + 22

	b.font(fSemi, 7.4, cInk3)
	b.at(b.mx, y, b.body, 4, strings.ToUpper(rep.Edition()), "L")
	b.font(fSemi, 17, cInk)
	b.at(b.mx, y+5, b.body, 8, ReportTitle, "L")
	b.font(fReg, 9.5, cInk2)
	b.at(b.mx, y+14, b.body, 5, rep.ScopeLabel()+"  ·  "+rep.GeneratedAt.UTC().Format("2 January 2006"), "L")

	y = 178
	b.font(fSemi, 7.4, cInk3)
	b.at(b.mx, y, b.body, 4, "PREPARED FOR", "L")
	b.font(fSemi, 20, cInk)
	b.at(b.mx, y+5, b.body, 9, orDash(rep.PreparedFor), "L")
	y += 19
	b.draw(cRule)
	pdf.SetLineWidth(0.35)
	pdf.Line(b.mx, y, b.W-b.mx, y)
	y += 4
	var rows [][2]string
	for _, r := range append(controlLines(rep), scopeLines(rep)...) {
		if r[0] != "Prepared for" && r[0] != "Classification" {
			rows = append(rows, r)
		}
	}
	colW := b.body / 2
	for i, r := range rows {
		x := b.mx + float64(i%2)*colW
		ry := y + float64(i/2)*10.5
		b.font(fSemi, 6.6, cInk3)
		b.at(x, ry, colW-6, 3.5, strings.ToUpper(r[0]), "L")
		face := fReg
		if r[0] == "Report ID" {
			face = fMono
		}
		b.font(face, 9.2, cInk)
		b.at(x, ry+3.8, colW-6, 5, r[1], "L")
	}
	b.fill(cBrandDeep)
	pdf.Rect(0, b.H-14, b.W, 14, "F")
	b.font(fReg, 7, rgb{196, 208, 226})
	note := "Contains security-sensitive information about your cloud identities. Share it only with people who need it."
	if rep.Sample {
		note = "Sample report from illustrative data. " + note
	}
	b.at(b.mx, b.H-9, b.body, 4, note, "L")
}

// ---- executive summary ----------------------------------------------------

// bottomLine is the answer in one or two sentences, for the top of the page.
func bottomLine(rep *PostureReport, overdue int) string {
	if rep.AverageScore == nil {
		return "No identity in scope has been scored yet."
	}
	s := fmt.Sprintf("The average security score is %s out of 100, %s", score1(*rep.AverageScore), strings.ToLower(bandLabel(bandFor(*rep.AverageScore))))
	if c := rep.Change30d; c != nil {
		switch {
		case *c > 0.05:
			s += fmt.Sprintf(", up %.1f points in 30 days", *c)
		case *c < -0.05:
			s += fmt.Sprintf(", down %.1f points in 30 days", -*c)
		default:
			s += ", unchanged in 30 days"
		}
	}
	s += "."
	if rep.CheckCount == 0 {
		return s + " No check of the chosen severity fails."
	}
	s += fmt.Sprintf(" %s of %s open findings are past their remediation target", num(overdue), num(rep.CheckCount))
	if n := rep.BySeverity["critical"]; n > 0 {
		s += "; " + num(n) + map[bool]string{true: " is critical", false: " are critical"}[n == 1]
	}
	return s + "."
}

func (b *brief) summary() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("summary", "Section 01", "Executive summary")
	st := rep.Stage()
	period := ""
	if pt := periodText(rep); pt != "" && !st.Baseline {
		period = "Reporting period: " + pt + "."
	} else if rep.DataAsOf != nil {
		period = "Baseline assessment from the scan of " + rep.DataAsOf.UTC().Format("2 January 2006") + "."
	}
	if period != "" {
		b.font(fReg, 8, cInk3)
		b.at(b.mx, pdf.GetY()-3, b.body, 4, period, "L")
		pdf.SetY(pdf.GetY() + 5)
	}
	overdue := st.Overdue
	if st.Baseline {
		b.statement(b.mx, b.body, baselineLine(rep))
	} else {
		b.statement(b.mx, b.body, bottomLine(rep, overdue))
	}

	// Score (radial) and trend (area), side by side as cards.
	y := pdf.GetY()
	ch := 62.0
	lw := 62.0
	b.card(b.mx, y, lw, ch)
	b.cardHead(b.mx, y, lw, "Security score", "Average of every scored identity")
	b.radial(b.mx+lw/2, y+32, 13, rep.AverageScore, "out of 100")
	var up *bool
	trend := "Baseline score"
	if c := rep.Change30d; c != nil {
		u := *c >= 0
		up = &u
		trend = fmt.Sprintf("%s %.1f points in 30 days", map[bool]string{true: "Up", false: "Down"}[u], math.Abs(*c))
	}
	band := ""
	if rep.AverageScore != nil {
		band = bandLabel(bandFor(*rep.AverageScore)) + " band (" + BandRange[bandFor(*rep.AverageScore)] + "). Healthy is 80+."
	}
	b.cardFoot(b.mx, y+ch, lw, trend, up, band)
	tx, tw := b.mx+lw+5, b.body-lw-5
	b.card(tx, y, tw, ch)
	if !st.Trend {
		// No history yet: where the score stands by account instead.
		b.cardHead(tx, y, tw, "Score by account", "Average security score of each account's scored identities")
		var bars []hbar
		for i, a := range rep.Accounts {
			if i == 5 {
				break
			}
			bars = append(bars, hbar{accountName(a), scoreOr(a.Average), fmtScore(a.Average), cBlue[4]})
		}
		b.hBars(tx+5, y+17, tw-10, 46, 6, bars)
		b.cardFoot(tx, y+ch, tw, "", nil, "The day-by-day trend starts after a few days of scans.")
	} else {
		b.cardHead(tx, y, tw, "Score over time", "Average security score, day by day")
		b.areaChart(tx+5, y+18, tw-10, 27, rep.Trend)
	}
	if n := len(rep.Trend); n > 1 {
		lo, hi := rep.Trend[0].Score, rep.Trend[0].Score
		for _, p := range rep.Trend {
			lo, hi = math.Min(lo, p.Score), math.Max(hi, p.Score)
		}
		b.cardFoot(tx, y+ch, tw, "", nil, fmt.Sprintf("Range %s to %s over %d days", score1(lo), score1(hi), int(rep.Trend[n-1].Day.Sub(rep.Trend[0].Day).Hours()/24)))
	}
	pdf.SetY(y + ch + 5)

	// Key figures as shadcn section cards: label, figure, change badge and
	// a footer line.
	_, unassigned := rep.Owners()
	type fig struct {
		label, value, badge, foot string
		good                      *bool
	}
	yes, no := true, false
	figs := []fig{
		{"Identities failing", num(rep.FailingCount), pct(rep.FailingCount, rep.ScoredCount), "of " + num(rep.ScoredCount) + " scored", nil},
		{"Critical and high open", num(rep.BySeverity["critical"] + rep.BySeverity["high"]), pct(rep.BySeverity["critical"]+rep.BySeverity["high"], rep.CheckCount), "of " + num(rep.CheckCount) + " open findings", nil},
		{"Past target", num(overdue), pct(overdue, rep.CheckCount), "open findings past their target", nil},
	}
	if overdue == 0 {
		figs[2] = fig{"Due in the next 7 days", num(rep.DueWithin(7)), "", "none is past its target yet", nil}
	}
	if h := rep.History; h != nil {
		med, ok := h.Current.OverallMedian()
		pmed, pok := h.Previous.OverallMedian()
		delta := func(now, before int, lowerIsBetter bool) (string, *bool) {
			if !hasPrevious(rep) || before == 0 {
				return "", nil
			}
			d := float64(now-before) / float64(before) * 100
			better := (d < 0) == lowerIsBetter
			if d == 0 {
				return "0%", nil
			}
			return fmt.Sprintf("%+.0f%%", d), map[bool]*bool{true: &yes, false: &no}[better]
		}
		nb, ng := delta(h.Current.New, h.Previous.New, true)
		fb, fg := delta(h.Current.Resolved, h.Previous.Resolved, false)
		medFoot, mb := "nothing fixed in the period", ""
		var mg *bool
		if ok {
			medFoot = "first period"
			if hasPrevious(rep) && pok {
				medFoot = "was " + medianText(pmed, true)
				d := (med - pmed) / pmed * 100
				mb = fmt.Sprintf("%+.0f%%", d)
				mg = map[bool]*bool{true: &yes, false: &no}[d < 0]
			}
		}
		figs = append(figs, fig{"New in the period", num(h.Current.New), nb, wasText(rep, h.Previous.New), ng},
			fig{"Fixed in the period", num(h.Current.Resolved), fb, wasText(rep, h.Previous.Resolved), fg},
			fig{"Median time to fix", medianText(med, ok), mb, medFoot, mg})
	} else {
		figs = append(figs, fig{"Without an owner", num(unassigned), pct(unassigned, rep.CheckCount), "open findings", nil},
			fig{"Identities scored", num(rep.ScoredCount), "", "in " + count(rep.AccountsCovered, "account", "accounts"), nil},
			fig{"Failing 30+ days", num(rep.OldChecks), "", "open findings", nil})
	}
	if !st.Fixes {
		// Nothing fixed yet: the figures that matter are what falls due
		// and who owns it, not "0 fixed".
		first := "nothing due in 30 days"
		if f := rep.FirstDue(); f != nil {
			first = "first on " + f.UTC().Format("2 Jan 2006")
		}
		figs = append(figs[:3], fig{"Due within 30 days", num(rep.DueWithin(30)), "", first, nil},
			fig{"Checks failing", num(len(rep.Groups)), "", "across " + count(len(rep.Areas()), "security area", "security areas"), nil},
			fig{"Without an owner", num(unassigned), pct(unassigned, rep.CheckCount), "assign them in the console", nil})
	}
	y = pdf.GetY()
	gap := 4.0
	fw := (b.body - 2*gap) / 3
	for i, fg := range figs {
		x := b.mx + float64(i%3)*(fw+gap)
		fy := y + float64(i/3)*25
		b.card(x, fy, fw, 22)
		b.font(fReg, 7.6, cInk3)
		b.at(x+4.5, fy+3.8, fw-26, 4, fg.label, "L")
		if fg.badge != "" {
			col := cInk
			if fg.good != nil {
				col = map[bool]rgb{true: cGreen, false: cRed}[*fg.good]
				arrow := map[bool]string{true: "↗ ", false: "↘ "}[strings.HasPrefix(fg.badge, "+")]
				fg.badge = arrow + fg.badge
			}
			b.font(fMed, 6.6, col)
			bw := b.width(fg.badge) + 4
			b.badge(x+fw-4.5-bw, fy+3.6, fg.badge, 6.6, cWhite, col, &cLine)
		}
		b.font(fSemi, 17, cInk)
		b.at(x+4.5, fy+8.4, fw-9, 8, fg.value, "L")
		b.font(fReg, 7.2, cInk3)
		b.at(x+4.5, fy+17, fw-9, 3.6, fg.foot, "L")
	}
	pdf.SetY(y + 25*float64((len(figs)+2)/3) + 1)

	if rep.CheckCount == 0 {
		return
	}
	b.sub("Key messages", "")
	msgs := keyPoints(rep)
	if st.Baseline {
		// Everything was found by the first scans: "started failing in the
		// last 7 days" would mislead.
		var keep []string
		for _, m := range msgs {
			if !strings.Contains(m, "started failing") {
				keep = append(keep, m)
			}
		}
		msgs = keep
		if n := rep.DueWithin(30); n > 0 {
			msgs = append(msgs, fmt.Sprintf("%s fall due in the next 30 days at the current targets; the first on %s.", count(n, "finding", "findings"), rep.FirstDue().UTC().Format("2 January")))
		}
	}
	if cs := changeSentence(rep); cs != "" {
		msgs = append([]string{cs}, msgs...)
	}
	if len(msgs) > 3 {
		msgs = msgs[:3]
	}
	for i, m := range msgs {
		b.ensure(10)
		y := pdf.GetY()
		b.font(fSemi, 10, cBrand)
		b.at(b.mx, y-0.2, 6, 5, fmt.Sprint(i+1), "L")
		b.font(fReg, 9, cInk2)
		b.para(b.mx+7, b.body-7, 4.7, m)
		pdf.SetY(pdf.GetY() + 1.8)
	}
	pdf.SetY(pdf.GetY() + 3)

	b.sub("Priority actions", "The fixes that remove the most risk. Each one clears the check on every identity it fails on.")
	t := b.newTable([]tcol{{"", 8, "L"}, {"Action", b.body - 82, "L"}, {"Severity", 24, "L"}, {"Identities", 22, "R"}, {"Score gain", 28, "R"}})
	t.maxLine = 2
	t.header()
	for i, g := range rep.Groups {
		if i == 3 {
			break
		}
		t.row([]tcell{{text: fmt.Sprint(i + 1), face: fSemi, color: &cBrand}, {text: g.Title + "\n" + actionText(g), face: fMed, link: b.link(fmt.Sprintf("g%d", i))},
			{sev: g.Severity}, {text: num(len(g.Items)), face: fSemi}, {text: fmt.Sprintf("+%.1f", rep.Uplift(g)), face: fSemi}}, false)
	}
}

// ---- remediation performance -------------------------------------------------

func (b *brief) remediation() {
	pdf, rep := b.pdf, b.rep
	st := rep.Stage()
	if !st.Fixes {
		// Nothing fixed yet: the section sets the targets and shows what
		// falls due when, instead of an empty performance history.
		b.sectionTitle("remediation", "Section 02", "Remediation targets")
		b.font(fReg, 9, cInk2)
		b.para(b.mx, b.body, 4.6, "No finding has been fixed yet, so there is no remediation history to measure. Every open finding has a due date: its first detection plus the target for its severity. "+slaLine(rep))
		pdf.SetY(pdf.GetY() + 4)
		if cs := changeSentence(rep); cs != "" {
			b.statement(b.mx, b.body, cs)
		}
		b.sub("By severity", "Open findings and when they fall due.")
		b.dueTable(b.mx, b.body)
		pdf.SetY(pdf.GetY() + 7)
		b.ensure(76)
		y := pdf.GetY()
		half := (b.body - 5) / 2
		b.dueChart(b.mx, y, half, 74)
		end := b.ownersOrNote(b.mx+half+5, y, half, 74)
		pdf.SetY(math.Max(y+74, end) + 7)
	} else {
		b.sectionTitle("remediation", "Section 02", "Remediation performance")
		b.font(fReg, 9, cInk2)
		b.para(b.mx, b.body, 4.6, "How fast findings are fixed against the remediation targets, and whether the backlog is growing. "+slaLine(rep))
		pdf.SetY(pdf.GetY() + 4)
		if cs := changeSentence(rep); cs != "" {
			b.statement(b.mx, b.body, cs)
		}
		b.sub("By severity", "Open and overdue now; new, fixed, median days to fix and the share fixed within target in this period, with the previous period in brackets.")
		b.remediationTable(b.mx, b.body)
		pdf.SetY(pdf.GetY() + 7)
		b.daysToFix(b.mx, b.body)
		half := (b.body - 5) / 2
		b.ensure(76)
		y := pdf.GetY()
		var end float64
		if st.Spread {
			end = b.agingChart(b.mx, y, half)
		} else {
			b.dueChart(b.mx, y, half, 74)
			end = y + 74
		}
		end = math.Max(end, b.ownersOrNote(b.mx+half+5, y, half, 74))
		pdf.SetY(end + 7)
	}
	if len(rep.Exceptions) > 0 {
		b.sub("Accepted risks", "Findings the organisation decided to keep, with the reason and who decided. They are excluded from the score.")
		b.exceptionsTable(b.mx, b.body, 12)
	}
}

// ---- risk overview ---------------------------------------------------------

func (b *brief) overview() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("overview", "Section 03", "Risk overview")
	if anyNHI(rep) {
		pdf.SetY(b.nhiIndex(b.mx, pdf.GetY(), b.body) + 5)
	} else {
		b.note(b.mx, b.body, "OWASP Non-Human Identities Top 10", "None of the checks failing in scope is evidence of an OWASP NHI Top 10 (2025) risk.")
	}

	half := (b.body - 5) / 2
	b.ensure(64)
	y := pdf.GetY()
	ch := 60.0
	var sev, bands []segment
	for _, s := range shownSeverities(rep.Options) {
		sev = append(sev, segment{SeverityLabel(s), rep.BySeverity[s], cSevFill[s]})
	}
	for _, bc := range rep.Bands {
		bands = append(bands, segment{bandLabel(bc.Band), bc.Count, cBandFill[bc.Band]})
	}
	for i, d := range []struct {
		title, desc, caption string
		parts                []segment
		total                int
	}{
		{"Findings by severity", "Open findings in scope", "findings", sev, rep.CheckCount},
		{"Identities by score band", "Healthy 80+, fair 60–79, poor 40–59, critical below 40", "identities", bands, rep.ScoredCount},
	} {
		x := b.mx + float64(i)*(half+5)
		b.card(x, y, half, ch)
		b.cardHead(x, y, half, d.title, d.desc)
		b.donut(x+22, y+37, 15, 10, d.parts, num(d.total), d.caption)
		ly := y + 22
		for _, p := range d.parts {
			b.fill(p.c)
			pdf.RoundedRect(x+43, ly+1.1, 2.3, 2.3, 0.5, "1234", "F")
			b.font(fReg, 7.8, cInk2)
			b.at(x+47, ly, half-70, 4.6, p.label, "L")
			b.font(fMed, 7.8, cInk)
			b.at(x+half-26, ly, 12, 4.6, num(p.n), "R")
			b.font(fReg, 7.8, cInk3)
			b.at(x+half-14, ly, 10, 4.6, pct(p.n, d.total), "R")
			ly += 6
		}
	}
	pdf.SetY(y + ch + 7)

	b.sub("By security area", "Where the findings sit, with their severities.")
	t := b.newTable([]tcol{{"Security area", 40, "L"}, {"Checks", 15, "R"}, {"Identities", 19, "R"}, {"Findings", b.body - 146, "R"}, {"Critical", 18, "R"}, {"High", 18, "R"}, {"Medium", 18, "R"}, {"Low", 18, "R"}})
	t.header()
	areas := rep.Areas()
	maxF := 1
	for _, a := range areas {
		maxF = max(maxF, a.Findings)
	}
	for _, a := range areas {
		y := pdf.GetY()
		cells := []tcell{{text: a.Area, face: fMed}, {text: num(a.Checks)}, {text: num(a.Identities)}, {text: num(a.Findings), face: fSemi}}
		for _, s := range Severities {
			c := cInk3
			if a.BySev[s] > 0 {
				c = cSev[s]
			}
			cells = append(cells, tcell{text: num(a.BySev[s]), color: &c})
		}
		t.row(cells, false)
		bw := (b.body - 146 - 16) * float64(a.Findings) / float64(maxF)
		b.fill(cBlue[4])
		pdf.RoundedRect(b.mx+76, y+2.4, math.Max(bw, 1.5), 2.6, 0.9, "1234", "F")
	}
	pdf.SetY(pdf.GetY() + 8)

	if len(rep.Classes) > 0 {
		b.sub("Human and non-human identities", "")
		t := b.newTable([]tcol{{"Identities", 64, "L"}, {"Scored", 28, "R"}, {"Average score", 34, "R"}, {"With failing checks", b.body - 126, "R"}})
		t.header()
		for _, c := range rep.Classes {
			name := "Non-human (workloads, roles, keys)"
			if c.Human {
				name = "Human (people with cloud access)"
			}
			t.row([]tcell{{text: name, face: fMed}, {text: num(c.Scored)}, {text: fmtScore(c.Average), face: fSemi}, {text: withPct(c.Failing, c.Scored)}}, false)
		}
		pdf.SetY(pdf.GetY() + 8)
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
			cells = append(cells, tcell{text: num(a.BySev[s]), color: &c})
		}
		t.row(cells, false)
	}
}

// ---- compliance -----------------------------------------------------------

func (b *brief) compliance() {
	pdf, rep := b.pdf, b.rep
	fws := rep.Frameworks()
	if len(fws) == 0 {
		return
	}
	b.sectionTitle("compliance", "Section 04", "Compliance impact")
	b.font(fReg, 9, cInk2)
	b.para(b.mx, b.body, 4.6, "Failing checks mapped to the controls they are evidence for. Use it to see which audits these findings would surface in; it is not a full compliance assessment.")
	pdf.SetY(pdf.GetY() + 5)
	t := b.newTable([]tcol{{"Framework", b.body - 108, "L"}, {"Controls affected", 30, "R"}, {"Failing checks", 26, "R"}, {"Identities", 24, "R"}, {"Worst", 28, "L"}})
	t.header()
	for _, f := range fws {
		t.row([]tcell{{text: f.Name, face: fMed}, {text: num(f.Controls), face: fSemi}, {text: num(f.Checks)}, {text: num(f.Identities)}, {sev: f.Worst}}, false)
	}
	pdf.SetY(pdf.GetY() + 9)

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
			t.row([]tcell{{text: r.Control, face: fMono, size: 7.6}, {sev: r.Worst}, {text: strings.Join(names, "; ")}, {text: num(r.Identities), face: fSemi}}, false)
		}
		if len(f.Rows) > 8 {
			b.font(fReg, 7.5, cInk3)
			b.at(b.mx, pdf.GetY()+1, b.body, 4, fmt.Sprintf("And %s more in the Excel workbook.", count(len(f.Rows)-8, "control", "controls")), "L")
			pdf.SetY(pdf.GetY() + 5)
		}
		pdf.SetY(pdf.GetY() + 6)
	}
}

// ---- findings ---------------------------------------------------------------

func (b *brief) findings() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("findings", "Section 05", "Top findings")
	b.font(fReg, 9, cInk2)
	b.para(b.mx, b.body, 4.6, fmt.Sprintf("The %s that matter most, most severe first. Every finding and every affected identity is in the Excel workbook.", count(min(briefTop, len(rep.Groups)), "finding", "findings")))
	pdf.SetY(pdf.GetY() + 4)
	for i, g := range rep.Groups {
		if i == briefTop {
			break
		}
		b.entry(i, g)
	}
	if len(rep.Groups) > briefTop {
		b.sub("Other findings", "")
		t := b.newTable([]tcol{{"Ref", 16, "L"}, {"Check", b.body - 76, "L"}, {"Severity", 24, "L"}, {"Identities", 20, "R"}, {"Days", 16, "R"}})
		t.maxLine = 1
		t.header()
		for i := briefTop; i < len(rep.Groups); i++ {
			g := rep.Groups[i]
			t.row([]tcell{{text: FindingRef(i), face: fMono, size: 7.4}, {text: g.Title}, {sev: g.Severity}, {text: num(len(g.Items)), face: fSemi}, {text: daysText(rep.DaysFailing(g.Since))}}, false)
		}
	}
}

// entry is one finding set as a numbered entry, the way an assessment report
// sets them: the reference in the margin, then criteria, condition, effect,
// recommendation and owner. No box: a rule above separates entries.
func (b *brief) entry(i int, g CheckGroup) {
	pdf, rep := b.pdf, b.rep
	margin := 24.0
	inner := b.body - margin
	labelW := 28.0
	st := rep.State(g)
	why := g.Risk
	if why == "" {
		why = g.About
	}
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
	if st.MostReach != nil {
		who += ". Widest reach: " + st.MostReach.Name + " " + ReachText(st.MostReach.Reach) + "."
	}
	owner := "Unassigned"
	if len(st.Owners) > 0 {
		owner = strings.Join(st.Owners[:min(3, len(st.Owners))], ", ")
		if st.Unassigned > 0 {
			owner += fmt.Sprintf("; %s unassigned", num(st.Unassigned))
		}
	}
	blocks := []struct{ label, text string }{
		{"Criteria", Criteria(g)},
		{"Condition", fmt.Sprintf("Fails on %s in %s. %s", count(len(g.Items), "identity", "identities"), count(len(g.Accounts), "account", "accounts"), who)},
		{"Effect", why},
		{"Recommendation", orText(g.Fix, noFixText)},
		{"Owner", owner},
	}
	kept := blocks[:0]
	for _, bl := range blocks {
		if strings.TrimSpace(bl.text) != "" {
			kept = append(kept, bl)
		}
	}
	blocks = kept
	b.font(fReg, 8.3, cInk2)
	lines := make([][]string, len(blocks))
	total := 0
	for j, bl := range blocks {
		lines[j] = b.wrap(bl.text, inner-labelW, 4)
		total += len(lines[j])
	}
	h := 20 + float64(total)*4.1 + float64(len(blocks))*1.4
	b.ensure(h + 6)
	y := pdf.GetY()
	b.mark(fmt.Sprintf("g%d", i))
	pdf.Bookmark(FindingRef(i)+" "+g.Title, 1, -1)
	b.draw(cRule)
	pdf.SetLineWidth(0.35)
	pdf.Line(b.mx, y, b.W-b.mx, y)

	// Margin: reference, severity, priority.
	b.font(fSemi, 13, cBrand)
	b.at(b.mx, y+3, margin-2, 6, FindingRef(i), "L")
	b.sevPill(b.mx, y+11, g.Severity, 6.6)
	p := rep.Priority(g)
	b.font(fReg, 6.8, cInk3)
	b.at(b.mx, y+15.5, margin-2, 3.4, p+" · "+PriorityText(p), "L")

	x := b.mx + margin
	b.font(fSemi, 12, cInk)
	b.at(x, y+3, inner, 6, g.Title, "L")
	meta := []string{AreaLabel(g.Area), count(len(g.Items), "identity", "identities"), count(len(g.Accounts), "account", "accounts")}
	if d := rep.DaysFailing(g.Since); d >= 0 {
		meta = append(meta, "oldest "+daysText(d))
	}
	meta = append(meta, fmt.Sprintf("target %d days", rep.SLA.Due(g.Severity)), fmt.Sprintf("score +%.1f if fixed", rep.Uplift(g)))
	b.font(fReg, 7.4, cInk3)
	metaText := strings.Join(meta, "  ·  ")
	b.at(x, y+10, inner, 4, metaText, "L")
	if st.Overdue > 0 {
		b.font(fSemi, 7.4, cSev["critical"])
		b.at(x, y+10, inner, 4, num(st.Overdue)+" overdue", "R")
	}

	ly := y + 17.0
	for j, bl := range blocks {
		b.font(fSemi, 6.6, cInk3)
		b.at(x, ly+0.3, labelW, 4.1, strings.ToUpper(bl.label), "L")
		face, col := fReg, cInk2
		if bl.label == "Recommendation" {
			face, col = fMed, cInk
		}
		if bl.label == "Owner" && owner == "Unassigned" {
			face, col = fSemi, cSev["high"]
		}
		b.font(face, 8.3, col)
		for _, l := range lines[j] {
			b.at(x+labelW, ly, inner-labelW, 4.1, l, "L")
			ly += 4.1
		}
		ly += 1.4
	}
	pdf.SetY(ly + 5)
}

// ---- appendix ---------------------------------------------------------------

func (b *brief) appendix() {
	pdf, rep := b.pdf, b.rep
	b.sectionTitle("appendix", "Appendix", "Scope, method and definitions")
	b.sub("Scope", "")
	t := b.newTable([]tcol{{"Item", 40, "L"}, {"Value", b.body - 40, "L"}})
	t.header()
	for _, r := range append(scopeLines(rep), controlLines(rep)...) {
		t.row([]tcell{{text: r[0], face: fMed}, {text: r[1]}}, false)
	}
	pdf.SetY(pdf.GetY() + 6)

	b.sub("Remediation targets", "")
	b.font(fReg, 8.6, cInk2)
	b.para(b.mx, b.body, 4.4, slaLine(rep)+" A finding is overdue once it has been open longer than its target. Recent federal guidance (CISA BOD 26-04, FedRAMP 2026) sets clocks by exposure and exploitability rather than severity alone; these targets sit within those ranges for findings that are not known to be exploited.")
	pdf.SetY(pdf.GetY() + 5)
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
