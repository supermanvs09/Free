package reports

import (
	"fmt"
	"io"
	"strings"
)

// WriteDossierPDF is design B, the audit dossier: for auditors, GRC and the
// security team. A formal, numbered document: document control, contents,
// scope and method stated before results, every finding as a register entry
// with evidence, risk, recommendation and the controls it bears on.
func WriteDossierPDF(w io.Writer, rep *PostureReport) error {
	return twoPass(w, func(known map[string]int) *kit {
		k := newKit(rep, "P", 20, 24, 18, known)
		d := &dossier{kit: k}
		k.pdf.SetHeaderFuncMode(d.header, false)
		k.pdf.SetFooterFunc(d.footer)
		d.titlePage()
		d.contents()
		d.execSummary()
		d.method()
		if rep.CheckCount > 0 {
			d.results()
			d.controls()
			d.register()
			d.acceptances()
			d.appendixIdentities()
		}
		d.glossary()
		return k
	})
}

type dossier struct {
	*kit
	toc []tocEntry
}

type tocEntry struct {
	key, num, title string
	level           int
}

const dossierIdentities = 6 // identities listed under each register entry

var cNavy = rgb{16, 42, 84}

func (d *dossier) header() {
	d.watermark()
	if d.pdf.PageNo() == 1 {
		return
	}
	// Classification banner, as on controlled documents.
	d.font(fSemi, 6.8, cSev["critical"])
	d.draw(cSev["critical"])
	d.pdf.SetLineWidth(0.25)
	w := 74.0
	d.pdf.Rect((d.W-w)/2, 7, w, 4.6, "D")
	d.at((d.W-w)/2, 7, w, 4.6, "CONFIDENTIAL · INTERNAL USE ONLY", "C")
	d.font(fReg, 7, cInk3)
	d.at(d.mx, 14, d.body/2, 4, ReportTitle, "L")
	d.at(d.mx+d.body/2, 14, d.body/2, 4, orDash(d.rep.PreparedFor), "R")
	d.draw(cNavy)
	d.pdf.SetLineWidth(0.35)
	d.pdf.Line(d.mx, 18.5, d.W-d.mx, 18.5)
	d.pdf.SetY(d.top)
}

func (d *dossier) footer() {
	y := d.H - 12
	d.draw(cLine)
	d.pdf.SetLineWidth(0.2)
	d.pdf.Line(d.mx, y-1.5, d.W-d.mx, y-1.5)
	d.font(fReg, 7, cInk3)
	d.at(d.mx, y, d.body*0.7, 4, d.rep.ID()+"  ·  Version 1.0  ·  "+d.rep.GeneratedAt.UTC().Format("2 Jan 2006"), "L")
	d.at(d.mx+d.body*0.7, y, d.body*0.3, 4, fmt.Sprintf("Page %d of {nb}", d.pdf.PageNo()), "R")
}

// h1 starts a numbered section on a new page.
func (d *dossier) h1(key, num, title string) {
	d.pdf.AddPage()
	d.toc = append(d.toc, tocEntry{key, num, title, 0})
	d.mark(key)
	d.pdf.Bookmark(strings.TrimSpace(num+" "+title), 0, -1)
	d.font(fBold, 16, cNavy)
	d.at(d.mx, d.pdf.GetY(), d.body, 8, strings.TrimSpace(num+"  "+title), "L")
	d.pdf.SetY(d.pdf.GetY() + 11)
}

// h2 is a numbered subsection.
func (d *dossier) h2(key, num, title string) {
	d.ensure(18)
	d.pdf.SetY(d.pdf.GetY() + 2)
	if key != "" {
		d.toc = append(d.toc, tocEntry{key, num, title, 1})
		d.mark(key)
		d.pdf.Bookmark(num+" "+title, 1, -1)
	}
	d.font(fSemi, 11, cNavy)
	d.at(d.mx, d.pdf.GetY(), d.body, 6, strings.TrimSpace(num+"  "+title), "L")
	d.pdf.SetY(d.pdf.GetY() + 7.5)
}

func (d *dossier) text(s string) {
	d.font(fReg, 9.2, cInk2)
	d.para(d.mx, d.body, 4.9, s)
	d.pdf.SetY(d.pdf.GetY() + 2.5)
}

// kv is a two-column key / value table.
func (d *dossier) kv(rows [][2]string, keyW float64) {
	t := d.newTable([]tcol{{"", keyW, "L"}, {"", d.body - keyW, "L"}})
	t.size, t.maxLine = 8.4, 6
	d.draw(cLine)
	d.pdf.SetLineWidth(0.15)
	d.pdf.Line(d.mx, d.pdf.GetY(), d.W-d.mx, d.pdf.GetY())
	for _, r := range rows {
		face := fReg
		if r[0] == "Report ID" {
			face = fMono
		}
		t.row([]tcell{{text: r[0], face: fSemi, color: &cInk3}, {text: r[1], face: face}}, false)
	}
	d.pdf.SetY(d.pdf.GetY() + 4)
}

// ---- title and contents --------------------------------------------------------

func (d *dossier) titlePage() {
	pdf, rep := d.pdf, d.rep
	pdf.AddPage()
	pdf.Bookmark("Title page", 0, -1)
	d.font(fSemi, 7, cSev["critical"])
	d.draw(cSev["critical"])
	pdf.SetLineWidth(0.3)
	pdf.Rect((d.W-74)/2, 10, 74, 5, "D")
	d.at((d.W-74)/2, 10, 74, 5, "CONFIDENTIAL · INTERNAL USE ONLY", "C")
	pdf.ImageOptions("logo", d.mx, 26, 52, 0, false, fpdfImage(), 0, "")

	y := 74.0
	d.fill(cNavy)
	pdf.Rect(d.mx, y, 1.4, 42, "F")
	x := d.mx + 7
	d.font(fBold, 23, cNavy)
	pdf.SetXY(x, y)
	for _, l := range d.wrap(BrandTitle, d.body-10, 0) {
		pdf.SetX(x)
		pdf.CellFormat(d.body-10, 10, l, "", 1, "L", false, 0, "")
	}
	d.font(fSemi, 12.5, cBrand)
	for _, l := range d.wrap(BrandTagline, d.body-20, 0) {
		pdf.SetX(x)
		pdf.CellFormat(d.body-10, 6.4, l, "", 1, "L", false, 0, "")
	}
	pdf.SetY(pdf.GetY() + 12)
	d.font(fSemi, 15, cInk)
	d.at(x, pdf.GetY(), d.body, 7, "Identity Security Posture Assessment", "L")
	d.font(fReg, 10.5, cInk2)
	d.at(x, pdf.GetY()+8, d.body, 5, "Assessment report · "+rep.ScopeLabel(), "L")
	d.font(fReg, 10.5, cInk2)
	d.at(x, pdf.GetY()+14, d.body, 5, "Prepared for "+orDash(rep.PreparedFor), "L")

	pdf.SetY(176)
	d.font(fSemi, 8, cInk3)
	d.at(d.mx, pdf.GetY(), d.body, 4, "DOCUMENT CONTROL", "L")
	pdf.SetY(pdf.GetY() + 6)
	rows := [][2]string{
		{"Report ID", rep.ID()},
		{"Version", "1.0 · Final · system generated"},
	}
	for _, r := range controlLines(rep) {
		if r[0] != "Report ID" {
			rows = append(rows, r)
		}
	}
	if pt := periodText(rep); pt != "" {
		rows = append(rows, [2]string{"Reporting period", pt})
	}
	rows = append(rows, [2]string{"Remediation targets", fmt.Sprintf("Critical %d, high %d, medium %d, low %d days (%s)", rep.SLA.Due("critical"), rep.SLA.Due("high"), rep.SLA.Due("medium"), rep.SLA.Due("low"), strings.ToLower(strings.SplitN(rep.SLA.Source, ";", 2)[0]))})
	rows = append(rows, [2]string{"Distribution", "Restricted to the people " + orDash(rep.PreparedFor) + " authorises. Do not forward outside the organisation."})
	d.kv(rows, 36)
	if rep.Sample {
		d.font(fSemi, 7.5, cSev["high"])
		d.at(d.mx, d.H-26, d.body, 4, "Sample report built from illustrative data, not from a real environment.", "L")
	}
}

func (d *dossier) contents() {
	pdf := d.pdf
	pdf.AddPage()
	pdf.Bookmark("Contents", 0, -1)
	d.font(fBold, 16, cNavy)
	d.at(d.mx, pdf.GetY(), d.body, 8, "Contents", "L")
	pdf.SetY(pdf.GetY() + 12)
	// The first pass does not know the sections yet: lay out the same number
	// of lines from what the report will hold, so pages do not shift.
	entries := d.plannedTOC()
	for _, e := range entries {
		indent, face, size, gap := 0.0, fSemi, 10.0, 7.4
		if e.level == 1 {
			indent, face, size, gap = 8, fReg, 8.8, 5.3
		}
		d.ensure(gap)
		y := pdf.GetY()
		d.font(face, size, cInk)
		label := strings.TrimSpace(e.num + "   " + e.title)
		lw := d.width(label)
		d.at(d.mx+indent, y, d.body-indent-14, gap, label, "L")
		page := d.pageOf(e.key)
		pw := d.width(page)
		// Dot leader.
		d.font(fReg, size, cLine)
		dots := ""
		for d.width(dots+" .") < d.body-indent-lw-pw-6 {
			dots += " ."
		}
		d.at(d.mx+indent+lw+1, y, d.body-indent-lw-pw-4, gap, dots, "L")
		d.font(face, size, cInk)
		d.at(d.W-d.mx-14, y, 14, gap, page, "R")
		pdf.Link(d.mx, y, d.body, gap, d.link(e.key))
		pdf.SetY(y + gap)
	}
}

// plannedTOC is the contents the document will have.
func (d *dossier) plannedTOC() []tocEntry {
	rep := d.rep
	e := []tocEntry{
		{"s1", "1", "Executive summary", 0},
		{"s2", "2", "Scope and methodology", 0},
		{"s2.1", "2.1", "Scope", 1}, {"s2.2", "2.2", "Data sources", 1}, {"s2.3", "2.3", "Scoring model", 1},
		{"s2.4", "2.4", "Remediation targets", 1}, {"s2.5", "2.5", "Limitations", 1},
	}
	if rep.CheckCount > 0 {
		e = append(e,
			tocEntry{"s3", "3", "Results", 0},
			tocEntry{"s3.1", "3.1", "Findings by severity", 1}, tocEntry{"s3.2", "3.2", "Findings by security area", 1}, tocEntry{"s3.3", "3.3", "Findings by account", 1},
			tocEntry{"s3.4", "3.4", "Remediation in the period", 1}, tocEntry{"s3.5", "3.5", "Age of open findings", 1}, tocEntry{"s3.6", "3.6", "Ownership", 1},
			tocEntry{"s4", "4", "Control mapping", 0}, tocEntry{"s4.1", "4.1", "OWASP Non-Human Identities Top 10", 1},
		)
		if len(rep.Frameworks()) > 0 {
			e = append(e, tocEntry{"s4.2", "4.2", "Security frameworks", 1})
		}
		e = append(e, tocEntry{"s5", "5", "Findings register", 0})
		for i, g := range rep.Groups {
			e = append(e, tocEntry{fmt.Sprintf("g%d", i), FindingRef(i), g.Title, 1})
		}
		e = append(e, tocEntry{"s6", "6", "Risk acceptances", 0}, tocEntry{"aA", "A", "Identities with the lowest scores", 0})
	}
	return append(e, tocEntry{"aB", "B", "Glossary", 0})
}

// ---- 1 executive summary ---------------------------------------------------

func (d *dossier) execSummary() {
	rep := d.rep
	d.h1("s1", "1", "Executive summary")
	rating := "not rated"
	if rep.AverageScore != nil {
		rating = fmt.Sprintf("%s, with an average security score of %s out of 100", strings.ToUpper(bandLabel(bandFor(*rep.AverageScore))), fmtScore(rep.AverageScore))
	}
	d.text(fmt.Sprintf("This report assesses the security posture of %s across %s for %s. The overall posture is %s (%s points over 30 days).",
		strings.ToLower(ClassLabel(rep.Options.Class)), count(rep.AccountsCovered, "AWS account", "AWS accounts"), orDash(rep.PreparedFor), rating, changeText(rep.Change30d)))
	if rep.CheckCount == 0 {
		d.text("No identity in scope fails a check of the chosen severity. No findings are reported.")
		return
	}
	d.text(fmt.Sprintf("Of %s scored, %s (%s) fail at least one check. The assessment raised %s on %s; %s are rated critical or high, and %s have been failing for more than 30 days.",
		count(rep.ScoredCount, "identity", "identities"), num(rep.FailingCount), pct(rep.FailingCount, rep.ScoredCount),
		count(rep.CheckCount, "finding", "findings"), count(len(rep.Groups), "distinct check", "distinct checks"),
		num(rep.BySeverity["critical"]+rep.BySeverity["high"]), num(rep.OldChecks)))
	overdue := 0
	for _, n := range rep.Overdue() {
		overdue += n
	}
	para := changeSentence(rep)
	para += fmt.Sprintf(" Against the remediation targets (critical %d, high %d, medium %d, low %d days), %s of the open findings (%s) are overdue.",
		rep.SLA.Due("critical"), rep.SLA.Due("high"), rep.SLA.Due("medium"), rep.SLA.Due("low"), num(overdue), pct(overdue, rep.CheckCount))
	d.text(strings.TrimSpace(para))

	d.h2("", "", "Key figures")
	t := d.newTable([]tcol{{"Measure", 90, "L"}, {"Value", d.body - 90, "R"}})
	t.header()
	figs := [][2]string{
		{"Average security score (0 to 100)", fmtScore(rep.AverageScore)},
		{"Change over 30 days", changeText(rep.Change30d)},
		{"Identities scored", num(rep.ScoredCount)},
		{"Identities with at least one failing check", withPct(rep.FailingCount, rep.ScoredCount)},
		{"Findings (failing check on one identity)", num(rep.CheckCount)},
		{"Distinct checks failing", num(len(rep.Groups))},
		{"Critical findings", num(rep.BySeverity["critical"])},
		{"High findings", num(rep.BySeverity["high"])},
		{"Findings failing for more than 30 days", num(rep.OldChecks)},
		{"Open findings past their remediation target", withPct(overdue, rep.CheckCount)},
	}
	_, unassigned := rep.Owners()
	figs = append(figs, [2]string{"Open findings with no owner", withPct(unassigned, rep.CheckCount)})
	if h := rep.History; h != nil {
		was := func(n int) string {
			if !hasPrevious(rep) {
				return ""
			}
			return " (previous period " + num(n) + ")"
		}
		figs = append(figs,
			[2]string{fmt.Sprintf("Findings raised in the last %d days", h.Days), num(h.Current.New) + was(h.Previous.New)},
			[2]string{fmt.Sprintf("Findings fixed in the last %d days", h.Days), num(h.Current.Resolved) + was(h.Previous.Resolved)})
		if m, ok := h.Current.OverallMedian(); ok {
			figs = append(figs, [2]string{"Median days from detection to fix", medianText(m, true)})
		}
		if r, ok := h.Current.SLACompliance(); ok {
			figs = append(figs, [2]string{"Fixes completed within target", fmt.Sprintf("%.0f%%", r*100)})
		}
	}
	for i, f := range figs {
		t.row([]tcell{{text: f[0]}, {text: f[1], face: fSemi}}, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 4)

	d.h2("", "", "Recommendations")
	for i, g := range rep.Groups {
		if i == 5 {
			break
		}
		d.ensure(12)
		y := d.pdf.GetY()
		d.font(fSemi, 9.2, cNavy)
		d.at(d.mx, y, 8, 4.9, fmt.Sprintf("%d.", i+1), "L")
		d.font(fReg, 9.2, cInk2)
		fix := g.Fix
		if fix == "" {
			fix = "Fix the check on every identity it fails on."
		}
		d.para(d.mx+8, d.body-8, 4.9, fmt.Sprintf("%s (%s, %s, %s). %s", g.Title, FindingRef(i), SeverityLabel(g.Severity), count(len(g.Items), "identity", "identities"), fix))
		d.pdf.SetY(d.pdf.GetY() + 1.2)
	}
}

// ---- 2 scope and method ------------------------------------------------------

func (d *dossier) method() {
	rep := d.rep
	d.h1("s2", "2", "Scope and methodology")
	d.h2("s2.1", "2.1", "Scope")
	rows := scopeLines(rep)
	rows = append(rows, [2]string{"Checks evaluated", "Every posture check that applies to each identity's type"}, [2]string{"Point in time", controlLines(rep)[3][1]})
	d.kv(rows, 42)
	d.h2("s2.2", "2.2", "Data sources")
	d.text("Identity, credential, policy and trust configuration discovered in each connected AWS account through a read-only role, and API activity from the AWS activity log (CloudTrail). Posture is computed by the continuous posture engine after each discovery scan.")
	d.h2("s2.3", "2.3", "Scoring model")
	d.text(methodology[0] + " " + methodology[1])
	t := d.newTable([]tcol{{"Severity", 30, "L"}, {"Definition", d.body - 30, "L"}})
	t.header()
	for i, s := range Severities {
		t.row([]tcell{{sev: s}, {text: SeverityMeaning[s]}}, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 4)
	t = d.newTable([]tcol{{"Score band", 30, "L"}, {"Score range", 36, "L"}, {"Interpretation", d.body - 66, "L"}})
	t.header()
	meaning := map[string]string{"healthy": "Controls largely effective; minor gaps.", "fair": "Partially effective; gaps to plan for.", "poor": "Significant gaps; remediation required.", "critical": "Ineffective; urgent remediation required."}
	for i, b := range []string{"healthy", "fair", "poor", "critical"} {
		c := cBand[b]
		t.row([]tcell{{text: bandLabel(b), face: fSemi, color: &c}, {text: BandRange[b]}, {text: meaning[b]}}, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 4)
	d.h2("s2.4", "2.4", "Remediation targets")
	d.text("A finding is overdue once it has been open longer than the target for its severity, counted from first detection. " + strings.TrimSuffix(rep.SLA.Source, ".") + ".")
	t = d.newTable([]tcol{{"Severity", 30, "L"}, {"Target", 30, "R"}, {"Basis", d.body - 60, "L"}})
	t.header()
	basis := map[string]string{
		"critical": "Within the 15-day federal remediation clock long used as the benchmark for critical issues.",
		"high":     "Within the 30-day benchmark for high issues.",
		"medium":   "Planned work; within FedRAMP 2026 ranges for issues not known to be exploited.",
		"low":      "Routine hygiene; within the 192-day upper bound in FedRAMP 2026 for non-exploited issues.",
	}
	for i, s := range Severities {
		t.row([]tcell{{sev: s}, {text: fmt.Sprintf("%d days", rep.SLA.Due(s)), face: fSemi}, {text: basis[s], color: &cInk2}}, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 4)
	d.h2("s2.5", "2.5", "Limitations")
	d.text(methodology[3] + " " + methodology[4] + " " + methodology[6] + " Findings accepted or suppressed in the console are excluded from the score at the next scan and listed in section 6.")
}

// ---- 3 results -----------------------------------------------------------------

func (d *dossier) results() {
	rep := d.rep
	d.h1("s3", "3", "Results")
	d.h2("s3.1", "3.1", "Findings by severity")
	checks := map[string]int{}
	ids := map[string]int{}
	for _, g := range rep.Groups {
		checks[g.Severity]++
	}
	for s, n := range rep.IdentitiesBySev {
		ids[s] = n
	}
	t := d.newTable([]tcol{{"Severity", 34, "L"}, {"Findings", 26, "R"}, {"Share", 22, "R"}, {"Distinct checks", 34, "R"}, {"Identities (worst)", d.body - 116, "R"}})
	t.header()
	for i, s := range shownSeverities(rep.Options) {
		t.row([]tcell{{sev: s}, {text: num(rep.BySeverity[s]), face: fSemi}, {text: pct(rep.BySeverity[s], rep.CheckCount)}, {text: num(checks[s])}, {text: num(ids[s])}}, i%2 == 1)
	}
	t.row([]tcell{{text: "Total", face: fSemi}, {text: num(rep.CheckCount), face: fBold}, {text: "100%"}, {text: num(len(rep.Groups))}, {text: num(rep.FailingCount)}}, false)
	d.pdf.SetY(d.pdf.GetY() + 3)

	d.h2("s3.2", "3.2", "Findings by security area")
	t = d.newTable([]tcol{{"Security area", 50, "L"}, {"Checks", 20, "R"}, {"Identities", 24, "R"}, {"Critical", 20, "R"}, {"High", 18, "R"}, {"Medium", 20, "R"}, {"Low", d.body - 152, "R"}})
	t.header()
	for i, a := range rep.Areas() {
		cells := []tcell{{text: a.Area, face: fMed}, {text: num(a.Checks)}, {text: num(a.Identities)}}
		for _, s := range Severities {
			cells = append(cells, tcell{text: num(a.BySev[s])})
		}
		t.row(cells, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 3)

	d.h2("s3.3", "3.3", "Findings by account")
	t = d.newTable([]tcol{{"AWS account", d.body - 118, "L"}, {"Score", 16, "R"}, {"Scored", 16, "R"}, {"Failing", 16, "R"}, {"Critical", 18, "R"}, {"High", 16, "R"}, {"Medium", 20, "R"}, {"Low", 16, "R"}})
	t.header()
	for i, a := range rep.Accounts {
		cells := []tcell{{text: accountName(a) + "\n" + a.ID, face: fMed}, {text: fmtScore(a.Average), face: fSemi}, {text: num(a.Scored)}, {text: num(a.Failing)}}
		for _, s := range Severities {
			cells = append(cells, tcell{text: num(a.BySev[s])})
		}
		t.row(cells, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 3)

	d.h2("s3.4", "3.4", "Remediation in the period")
	if pt := periodText(rep); pt != "" {
		d.text("Reporting period: " + pt + ". " + changeSentence(rep))
	}
	d.remediationTable(d.mx, d.body)
	d.pdf.SetY(d.pdf.GetY() + 4)

	d.h2("s3.5", "3.5", "Age of open findings")
	d.text("Open findings by how long they have been failing, against the remediation targets in 2.4.")
	d.ensure(48)
	d.pdf.SetY(d.agingChart(d.mx, d.pdf.GetY(), d.body*0.8) + 2)

	d.h2("s3.6", "3.6", "Ownership")
	d.text("Findings are assigned to an owner in the console. An unassigned finding has nobody accountable for fixing it.")
	d.ownersTable(d.mx, d.body*0.8, 15)
}

// ---- 4 control mapping -------------------------------------------------------------

func (d *dossier) controls() {
	rep := d.rep
	fws := rep.Frameworks()
	d.h1("s4", "4", "Control mapping")
	d.text("Each failing check is mapped to the risks and framework controls it provides evidence for. References point to the findings register (section 5).")
	d.h2("s4.1", "4.1", "OWASP Non-Human Identities Top 10")
	nt := d.newTable([]tcol{{"Risk", 50, "L"}, {"Highest severity", 30, "L"}, {"Findings register", d.body - 120, "L"}, {"Identities", 20, "R"}, {"Findings", 20, "R"}})
	nt.maxLine = 5
	nt.header()
	for i, r := range rep.NHITop10() {
		var refs []string
		for _, gi := range r.Checks {
			refs = append(refs, FindingRef(gi)+" "+rep.Groups[gi].Title)
		}
		if len(refs) == 0 {
			nt.row([]tcell{{text: r.ID + " " + r.Title, face: fMed}, {text: "-", color: &cInk3}, {text: "No failing check in scope", color: &cInk3}, {text: "0"}, {text: "0"}}, i%2 == 1)
			continue
		}
		nt.row([]tcell{{text: r.ID + " " + r.Title, face: fMed}, {sev: r.Worst}, {text: strings.Join(refs, "\n")}, {text: num(r.Identities), face: fSemi}, {text: num(r.Findings)}}, i%2 == 1)
	}
	d.pdf.SetY(d.pdf.GetY() + 3)
	if len(fws) > 0 {
		d.h2("s4.2", "4.2", "Security frameworks")
	}
	for _, f := range fws {
		d.h2("", "", f.Name)
		t := d.newTable([]tcol{{"Control", 28, "L"}, {"Highest severity", 32, "L"}, {"Findings register", d.body - 86, "L"}, {"Identities", 26, "R"}})
		t.maxLine = 4
		t.header()
		for i, r := range f.Rows {
			var refs []string
			for _, gi := range r.Checks {
				refs = append(refs, FindingRef(gi)+" "+rep.Groups[gi].Title)
			}
			t.row([]tcell{{text: r.Control, face: fMono, size: 7.8}, {sev: r.Worst}, {text: strings.Join(refs, "\n")}, {text: num(r.Identities), face: fSemi}}, i%2 == 1)
		}
		d.pdf.SetY(d.pdf.GetY() + 3)
	}
}

// ---- 5 findings register ----------------------------------------------------------

func (d *dossier) register() {
	rep := d.rep
	d.h1("s5", "5", "Findings register")
	d.text(fmt.Sprintf("%s, most severe first. Each entry lists up to %d affected identities, lowest score first; the Excel workbook lists every one.", count(len(rep.Groups), "entry", "entries"), dossierIdentities))
	for i, g := range rep.Groups {
		d.entry(i, g)
	}
}

func (d *dossier) entry(i int, g CheckGroup) {
	pdf, rep := d.pdf, d.rep
	d.ensure(72) // the heading and the first register rows stay together
	pdf.SetY(pdf.GetY() + 3)
	d.toc = append(d.toc, tocEntry{fmt.Sprintf("g%d", i), FindingRef(i), g.Title, 1})
	d.mark(fmt.Sprintf("g%d", i))
	pdf.Bookmark(FindingRef(i)+" "+g.Title, 1, -1)
	y := pdf.GetY()
	d.fill(cNavy)
	pdf.Rect(d.mx, y, d.body, 8, "F")
	d.font(fMono, 8, cWhite)
	d.at(d.mx+3, y, 20, 8, FindingRef(i), "L")
	d.font(fSemi, 9.5, cWhite)
	d.at(d.mx+22, y, d.body-60, 8, g.Title, "L")
	pw := d.width(strings.ToUpper(SeverityLabel(g.Severity))) + 4
	d.pill(d.W-d.mx-pw-4, y+1.8, strings.ToUpper(SeverityLabel(g.Severity)), cSevSoft[g.Severity], cSev[g.Severity], 7)
	pdf.SetY(y + 8)

	evidence := ""
	if len(g.Items) > 0 {
		first := g.Items[0]
		evidence = rep.Identities[first.Identity].Name + ": " + first.Found
	}
	since := "-"
	if g.Since != nil {
		since = g.Since.UTC().Format("2 Jan 2006") + " (" + daysText(rep.DaysFailing(g.Since)) + ")"
	}
	accts := make([]string, 0, len(g.Accounts))
	for _, a := range g.Accounts {
		accts = append(accts, fmt.Sprintf("%s (%d)", a.Name, a.Count))
	}
	fix := g.Fix
	if g.ManyFix {
		fix += " Some identities have specific steps; see the workbook."
	}
	st := rep.State(g)
	owner := "Unassigned"
	if len(st.Owners) > 0 {
		owner = strings.Join(st.Owners, ", ")
		if st.Unassigned > 0 {
			owner += fmt.Sprintf("; %s unassigned", count(st.Unassigned, "finding", "findings"))
		}
	}
	target := fmt.Sprintf("%d days from first detection (%s)", rep.SLA.Due(g.Severity), SeverityLabel(g.Severity))
	if st.Overdue > 0 {
		target += fmt.Sprintf("; %s of %s overdue", num(st.Overdue), count(len(g.Items), "finding", "findings"))
	}
	condition := count(len(g.Items), "identity", "identities") + " in " + count(len(g.Accounts), "account", "accounts") + " (" + strings.Join(accts, ", ") + ")."
	if evidence != "" {
		condition += " Example: " + evidence
	}
	if st.MostReach != nil {
		condition += " Widest reach: " + st.MostReach.Name + " " + ReachText(st.MostReach.Reach) + "."
	}
	why := g.Risk
	if why == "" {
		why = g.About
	}
	// The register follows the elements of an audit finding: criteria,
	// condition, cause, effect, recommendation (IIA Global Internal Audit
	// Standards, 14.3), with the owner and the remediation target.
	rows := [][2]string{
		{"Check ID", g.RuleID + "  ·  " + AreaLabel(g.Area) + "  ·  " + rep.Priority(g) + " " + PriorityText(rep.Priority(g))},
		{"Criteria", Criteria(g)},
		{"Condition", condition},
		{"First observed", since},
		{"Cause", "To be confirmed by the owner. The check shows the condition; why it arose (manual change, template default, missing guardrail) is recorded when the finding is fixed or accepted."},
		{"Effect", why},
		{"Recommendation", orDash(fix)},
		{"Owner", owner},
		{"Target", target},
	}
	t := d.newTable([]tcol{{"", 34, "L"}, {"", d.body - 34, "L"}})
	t.size, t.maxLine = 8.2, 5
	for j, r := range rows {
		if strings.TrimSpace(r[1]) == "" {
			continue
		}
		face := fReg
		if r[0] == "Check ID" {
			face = fMono
		}
		if r[0] == "Recommendation" {
			face = fMed
		}
		t.row([]tcell{{text: r[0], face: fSemi, color: &cInk3}, {text: r[1], face: face, size: map[bool]float64{true: 7.6, false: 0}[face == fMono]}}, j%2 == 1)
	}
	pdf.SetY(pdf.GetY() + 2)

	items := append([]GroupItem(nil), g.Items...)
	sortItemsByScore(rep, items)
	it := d.newTable([]tcol{{"Affected identity", d.body - 124, "L"}, {"Account", 38, "L"}, {"Owner", 32, "L"}, {"Score", 14, "R"}, {"Days open", 20, "R"}, {"Due", 20, "R"}})
	it.size, it.maxLine = 7.6, 1
	it.header()
	for j, item := range items {
		if j == dossierIdentities {
			break
		}
		id := rep.Identities[item.Identity]
		days, due, owner := "-", "-", "Unassigned"
		dueColor := cInk2
		for _, c := range id.Checks {
			if c.RuleID != g.RuleID {
				continue
			}
			if c.FailingSince != nil {
				days = num(rep.DaysFailing(c.FailingSince))
				if dd := rep.DueDate(c); dd != nil {
					due = dd.UTC().Format("2 Jan 06")
				}
				if late, by := rep.OverdueCheck(c); late {
					due, dueColor = fmt.Sprintf("%s late", daysText(by)), cSev["critical"]
				}
			}
			if o := strings.TrimSpace(c.Owner); o != "" {
				owner = o
			}
		}
		oc := cInk2
		if owner == "Unassigned" {
			oc = cInk3
		}
		it.row([]tcell{{text: id.Name, face: fMed}, {text: orDash(id.Account)}, {text: owner, color: &oc}, {text: fmtScore(id.Score)}, {text: days}, {text: due, color: &dueColor, face: fSemi}}, j%2 == 1)
	}
	if len(items) > dossierIdentities {
		d.font(fReg, 7.4, cInk3)
		d.at(d.mx, pdf.GetY()+1, d.body, 4, fmt.Sprintf("And %s more in the workbook.", count(len(items)-dossierIdentities, "identity", "identities")), "L")
		pdf.SetY(pdf.GetY() + 5)
	}
	pdf.SetY(pdf.GetY() + 5)
}

// ---- 6 risk acceptances ----------------------------------------------------------

func (d *dossier) acceptances() {
	rep := d.rep
	d.h1("s6", "6", "Risk acceptances")
	d.text("Findings the organisation chose to keep (accepted) or to hide until a date (suppressed), with the reason recorded and who decided. They are excluded from the score. Review each one before its end date.")
	d.exceptionsTable(d.mx, d.body, 60)
	_ = rep
}

// ---- appendices ---------------------------------------------------------------------

func (d *dossier) appendixIdentities() {
	rep := d.rep
	d.h1("aA", "Appendix A", "Identities with the lowest scores")
	d.text("The 25 identities with the lowest scores in scope. Lower scores carry more severe or more numerous failing checks.")
	list := rep.Population
	if len(list) == 0 {
		list = rep.Identities
	}
	t := d.newTable([]tcol{{"Identity", d.body - 124, "L"}, {"Type", 28, "L"}, {"Account", 44, "L"}, {"Score", 16, "R"}, {"Failing", 18, "R"}, {"Worst", 18, "L"}})
	t.size, t.maxLine = 7.8, 1
	t.header()
	for i, id := range sortedByScore(list) {
		if i == 25 {
			break
		}
		cells := []tcell{{text: id.Name, face: fMed}, {text: typeLabel(id.Type)}, {text: orDash(id.Account)}, {text: fmtScore(id.Score), face: fSemi}, {text: num(len(id.Checks))}}
		if w := id.Worst(); w != "" {
			cells = append(cells, tcell{text: SeverityLabel(w), face: fSemi, color: ptr(cSev[w])})
		} else {
			cells = append(cells, tcell{text: "-"})
		}
		t.row(cells, i%2 == 1)
	}
}

func (d *dossier) glossary() {
	d.h1("aB", "Appendix B", "Glossary")
	terms := [][2]string{
		{"Identity", "Anything that can act in an AWS account: a person (human identity) or a workload, role, key or service (non-human identity)."},
		{"Non-human identity (NHI)", "A workload or machine identity: IAM roles used by Lambda, ECS, EC2 and CI/CD, access keys and service accounts."},
		{"Check", "A posture rule evaluated on an identity. It passes or fails."},
		{"Finding", "One failing check on one identity."},
		{"Security score", "100 minus the points the identity's failing checks take off, never below 0."},
		{"Security area", "The family a check belongs to: least privilege, credential hygiene, trust and access, escalation, exposure, lifecycle."},
		{"Control", "A requirement in a security framework (NIST SP 800-53, CIS, SOC 2, PCI DSS) that a check provides evidence for."},
		{"Priority", "P1 fix now, P2 this sprint, P3 planned, P4 hygiene; from severity and how many identities a check fails on."},
	}
	d.kv(terms, 48)
}

// ---- helpers --------------------------------------------------------------------------

func ptr(c rgb) *rgb { return &c }

func sortItemsByScore(rep *PostureReport, items []GroupItem) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && scoreOr(rep.Identities[items[j].Identity].Score) < scoreOr(rep.Identities[items[j-1].Identity].Score); j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}

func sortedByScore(list []ReportIdentity) []ReportIdentity {
	out := append([]ReportIdentity(nil), list...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && scoreOr(out[j].Score) < scoreOr(out[j-1].Score); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}
