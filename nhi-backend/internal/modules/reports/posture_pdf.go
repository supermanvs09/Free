package reports

import (
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
)

// A4 portrait, millimetres.
const (
	pageW   = 210.0
	pageH   = 297.0
	marginX = 16.0
	bottom  = 18.0
	bodyW   = pageW - 2*marginX
)

// What the PDF lists in full and what it leaves to the Excel workbook, so a
// report on thousands of identities stays a document someone reads.
const (
	maxRowsPerCheck = 20 // identities listed under each failing check
	maxPriority     = 25 // identities in "Identities to fix first"
	maxAccounts     = 12 // accounts in "By account"
	maxTopChecks    = 10 // checks on the summary page
)

var (
	inkRGB   = [3]int{17, 24, 39}
	ink2RGB  = [3]int{55, 65, 81}
	ink3RGB  = [3]int{107, 114, 128}
	lineRGB  = [3]int{229, 231, 235}
	panelRGB = [3]int{248, 250, 252}
	linkRGB  = [3]int{29, 78, 216}
	sevRGB   = map[string][3]int{
		"critical": {185, 28, 28},
		"high":     {194, 65, 12},
		"medium":   {161, 98, 7},
		"low":      {21, 128, 61},
	}
	// Score bands share the severity colours: critical band red ... healthy green.
	bandRGB = map[string][3]int{"critical": sevRGB["critical"], "poor": sevRGB["high"], "fair": sevRGB["medium"], "healthy": sevRGB["low"]}
)

// doc is one PDF being written.
type doc struct {
	pdf   *fpdf.Fpdf
	t     func(string) string // UTF-8 to the core fonts' Windows-1252
	rep   *PostureReport
	links []int                                 // per check group: where its details start
	sect  struct{ risk, priority, details int } // links to the sections
	pages pageMap                               // where things landed in this pass
	known *pageMap                              // where they landed in the first pass; nil during it
}

// pageMap is the page each section and each check's details start on.
type pageMap struct {
	risk, priority, details int
	groups                  []int
}

// WritePosturePDF writes the report for reading and sharing, printed or on
// screen. It is built to stay readable however many identities fail:
//
//  1. Summary: the figures with the 30-day trend, key points in sentences,
//     failing checks by severity and identities by score band, contents, and
//     the checks to fix first with the page of each one's details.
//  2. Where the risk is: human and non-human, the accounts with the most
//     severe failing checks, and the identities to fix first.
//  3. Failing checks in detail: each check once, with what it looks at, how
//     to fix it, where it fails and for how long, then the identities that
//     fail it, lowest score first, up to maxRowsPerCheck; the Excel workbook
//     lists every identity.
//
// Contents entries and checks link to their pages, and PDF bookmarks mirror
// the sections and every check. The document is laid out twice: the first
// pass learns which page each part lands on, the second prints those page
// numbers. Both passes lay out the same lines, so nothing moves between them.
func WritePosturePDF(w io.Writer, rep *PostureReport) error {
	first := render(rep, nil)
	if err := first.pdf.Error(); err != nil {
		return err
	}
	final := render(rep, &first.pages)
	if err := final.pdf.Error(); err != nil {
		return err
	}
	return final.pdf.Output(w)
}

func render(rep *PostureReport, known *pageMap) *doc {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(marginX, 16, marginX)
	pdf.SetAutoPageBreak(true, bottom)
	pdf.SetTitle("Posture report", true)
	pdf.SetSubject(rep.ScopeLabel(), true)
	pdf.SetCreator("NHI console", true)
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	d := &doc{pdf: pdf, t: func(s string) string { return tr(plain(s)) }, rep: rep, known: known}
	for range rep.Groups {
		d.links = append(d.links, pdf.AddLink())
	}
	d.pages.groups = make([]int, len(rep.Groups))
	d.sect.risk, d.sect.priority, d.sect.details = pdf.AddLink(), pdf.AddLink(), pdf.AddLink()

	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		d.font("", 7.5, ink3RGB)
		left := fmt.Sprintf("Posture report · %s · %s", rep.ScopeLabel(), rep.GeneratedAt.Format("2 Jan 2006"))
		pdf.CellFormat(bodyW*0.75, 5, d.t(truncate(pdf, left, bodyW*0.75)), "", 0, "L", false, 0, "")
		pdf.CellFormat(bodyW*0.25, 5, fmt.Sprintf("Page %d of {nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("")

	d.summary()
	if rep.CheckCount > 0 {
		d.whereTheRiskIs()
		d.details()
	}
	return d
}

// pageOf is a page number from the first pass, as text.
func (d *doc) pageOf(pick func(*pageMap) int) string {
	if d.known == nil {
		return "00" // the first pass only needs the width
	}
	return strconv.Itoa(pick(d.known))
}

// ---- page 1 --------------------------------------------------------------

func (d *doc) summary() {
	pdf, rep, o := d.pdf, d.rep, d.rep.Options
	pdf.AddPage()
	pdf.Bookmark(d.t("Summary"), 0, -1)

	d.font("B", 20, inkRGB)
	pdf.CellFormat(bodyW, 10, "Posture report", "", 1, "L", false, 0, "")
	d.font("", 10, ink2RGB)
	sevs := "every severity"
	if len(o.Severities) > 0 && len(o.Severities) < len(Severities) {
		names := make([]string, 0, len(o.Severities))
		for _, s := range o.Severities {
			names = append(names, SeverityLabel(s))
		}
		sevs = strings.Join(names, ", ") + " severity"
	}
	pdf.CellFormat(bodyW, 6, d.t(fmt.Sprintf("%s · failing checks of %s", rep.ScopeLabel(), sevs)), "", 1, "L", false, 0, "")
	d.font("", 8.5, ink3RGB)
	pdf.CellFormat(bodyW, 5, d.t(fmt.Sprintf("Generated %s UTC from the latest posture scan · %s covered",
		rep.GeneratedAt.Format("2 Jan 2006, 15:04"), count(rep.AccountsCovered, "account", "accounts"))), "", 1, "L", false, 0, "")
	if rep.CheckCount > 0 {
		d.contents()
	}
	pdf.Ln(5)

	// Figures.
	avg, avgSub := "-", ""
	if rep.AverageScore != nil {
		avg = strconv.Itoa(int(*rep.AverageScore+0.5)) + " / 100"
		avgSub = bandLabel(bandFor(*rep.AverageScore)) + " band"
		if t := trend(rep.Change30d); t != "" {
			avgSub = bandLabel(bandFor(*rep.AverageScore)) + " · " + t
		}
	}
	failSub := ""
	if rep.ScoredCount > 0 {
		failSub = pct(rep.FailingCount, rep.ScoredCount) + " of scored"
	}
	d.figures([]figure{
		{"Average score", avg, avgSub},
		{"Identities scored", num(rep.ScoredCount), "in " + count(rep.AccountsCovered, "account", "accounts")},
		{"With failing checks", num(rep.FailingCount), failSub},
		{"Failing checks", num(rep.CheckCount), "across " + count(len(rep.Groups), "check", "checks")},
	})

	if rep.CheckCount == 0 {
		d.font("", 10, ink2RGB)
		pdf.MultiCell(bodyW, 5.5, d.t("No identity in this report fails a check of the chosen severity. Nothing to fix."), "", "L", false)
		return
	}

	// Key points.
	d.heading("Key points", 10.5)
	for _, p := range keyPoints(rep) {
		x := pdf.GetX()
		setFill(pdf, ink3RGB)
		pdf.Circle(x+1.4, pdf.GetY()+2.6, 0.7, "F")
		pdf.SetX(x + 4.5)
		d.font("", 9.5, ink2RGB)
		pdf.MultiCell(bodyW-4.5, 5.2, d.t(p), "", "L", false)
		pdf.Ln(0.6)
	}
	pdf.Ln(4)

	// Two distributions side by side.
	half := (bodyW - 10) / 2
	y := pdf.GetY()
	sevParts := []part{}
	for _, s := range shownSeverities(o) {
		sevParts = append(sevParts, part{SeverityLabel(s), rep.BySeverity[s], sevColor(s)})
	}
	end := d.stackedBar(marginX, y, half, "Failing checks by severity", sevParts)
	bandParts := []part{}
	for _, b := range rep.Bands {
		c, ok := bandRGB[b.Band]
		if !ok {
			c = ink3RGB
		}
		bandParts = append(bandParts, part{bandLabel(b.Band), b.Count, c})
	}
	if e := d.stackedBar(marginX+half+10, y, half, "Scored identities by score band", bandParts); e > end {
		end = e
	}
	pdf.SetY(end + 8)

	// Checks to fix first.
	d.heading("Checks to fix first", 10.5)
	d.note("Most severe first, then by how many identities fail the check. Select a check to go to its details.")
	cols := []col{{w: bodyW - 76, align: "L"}, {w: 24, align: "L"}, {w: 38, align: "R"}, {w: 14, align: "R"}}
	d.header(cols, []string{"Check", "Severity", "Identities", "Page"})
	for i, g := range rep.Groups {
		if i == maxTopChecks {
			break
		}
		y := pdf.GetY()
		ids := num(len(g.Items))
		if rep.ScoredCount > 0 {
			ids += "  (" + pct(len(g.Items), rep.ScoredCount) + ")"
		}
		h := d.row(cols, []cell{
			{text: g.Title, color: linkRGB},
			{text: SeverityLabel(g.Severity), bold: true, color: sevColor(g.Severity)},
			{text: ids},
			{text: d.pageOf(func(m *pageMap) int { return m.groups[i] }), color: linkRGB},
		}, 1, nil)
		pdf.Link(marginX, y, bodyW, h, d.links[i])
	}
	if more := len(rep.Groups) - maxTopChecks; more > 0 {
		pdf.Ln(1.5)
		d.note(fmt.Sprintf("And %s more, in Failing checks in detail.", count(more, "check", "checks")))
	}
}

// keyPoints are the summary in sentences, most important first.
func keyPoints(rep *PostureReport) []string {
	var out []string
	chosen := shownSeverities(rep.Options)
	for _, s := range chosen {
		n := rep.BySeverity[s]
		if n == 0 || (s != "critical" && s != "high") {
			continue
		}
		ids := 0
		for _, id := range rep.Identities {
			if id.CountSev(s) > 0 {
				ids++
			}
		}
		var of []CheckGroup
		for _, g := range rep.Groups {
			if g.Severity == s {
				of = append(of, g)
			}
		}
		sev := strings.ToLower(SeverityLabel(s))
		if len(of) == 1 {
			out = append(out, fmt.Sprintf("%s a %s check: “%s”. Fix this first.", count(ids, "identity fails", "identities fail"), sev, of[0].Title))
		} else {
			out = append(out, fmt.Sprintf("%s fail %s %s checks. Start with “%s”, on %s.", count(ids, "identity", "identities"), num(len(of)), sev, of[0].Title, count(len(of[0].Items), "identity", "identities")))
		}
		break
	}
	if len(out) == 0 && (has(chosen, "critical") || has(chosen, "high")) {
		out = append(out, "No critical or high severity check fails.")
	}
	if rep.ScoredCount > 0 {
		out = append(out, fmt.Sprintf("%s of %s scored identities (%s) fail at least one check.", num(rep.FailingCount), num(rep.ScoredCount), pct(rep.FailingCount, rep.ScoredCount)))
	}
	switch {
	case rep.NewChecks > 0 && rep.OldChecks > 0:
		out = append(out, fmt.Sprintf("%s started failing in the last 7 days; %s been failing for more than 30 days.",
			count(rep.NewChecks, "check", "checks"), count(rep.OldChecks, "has", "have")))
	case rep.NewChecks > 0:
		out = append(out, fmt.Sprintf("%s started failing in the last 7 days.", count(rep.NewChecks, "check", "checks")))
	case rep.OldChecks > 0:
		out = append(out, fmt.Sprintf("%s %s been failing for more than 30 days.", count(rep.OldChecks, "check", "checks"), plural(rep.OldChecks, "has", "have")))
	}
	if len(rep.Accounts) > 1 && rep.Accounts[0].Checks > 0 {
		a := rep.Accounts[0]
		parts := []string{}
		for _, s := range Severities {
			if a.BySev[s] > 0 {
				parts = append(parts, fmt.Sprintf("%s %s", num(a.BySev[s]), strings.ToLower(SeverityLabel(s))))
			}
			if len(parts) == 2 {
				break
			}
		}
		out = append(out, fmt.Sprintf("Account %s holds the most severe failing checks: %s, across %s.", accountName(a), strings.Join(parts, " and "), count(a.Failing, "identity", "identities")))
	}
	if len(rep.Classes) == 2 && rep.Classes[0].Average != nil && rep.Classes[1].Average != nil {
		var h, n ClassRow
		for _, c := range rep.Classes {
			if c.Human {
				h = c
			} else {
				n = c
			}
		}
		out = append(out, fmt.Sprintf("Human identities average %d / 100 and non-human identities %d / 100.", int(*h.Average+0.5), int(*n.Average+0.5)))
	}
	return out
}

// ---- page 2 --------------------------------------------------------------

func (d *doc) whereTheRiskIs() {
	pdf, rep := d.pdf, d.rep
	pdf.AddPage()
	d.pages.risk = pdf.PageNo()
	pdf.SetLink(d.sect.risk, -1, -1)
	pdf.Bookmark(d.t("Where the risk is"), 0, -1)
	d.title("Where the risk is")

	if len(rep.Classes) == 2 {
		d.heading("Human and non-human", 10.5)
		cols := []col{{w: bodyW - 114, align: "L"}, {w: 38, align: "R"}, {w: 42, align: "R"}, {w: 34, align: "R"}}
		d.header(cols, []string{"Identities", "Scored", "With failing checks", "Average score"})
		for _, c := range rep.Classes {
			name := "Non-human"
			if c.Human {
				name = "Human"
			}
			d.row(cols, []cell{{text: name, bold: true}, {text: num(c.Scored)}, {text: withPct(c.Failing, c.Scored)}, {text: scoreOf(c.Average)}}, 1, nil)
		}
		pdf.Ln(7)
	}

	d.heading("By account", 10.5)
	d.note("Accounts with the most severe failing checks first.")
	cols := []col{{w: bodyW - 118, align: "L"}, {w: 22, align: "R"}, {w: 34, align: "R"}, {w: 20, align: "R"}, {w: 16, align: "R"}, {w: 26, align: "R"}}
	d.header(cols, []string{"Account", "Scored", "With failing checks", "Critical", "High", "Average score"})
	for i, a := range rep.Accounts {
		if i == maxAccounts {
			break
		}
		name := accountName(a)
		if a.Name != "" && a.ID != "" && a.Name != a.ID {
			name += " (" + a.ID + ")"
		}
		d.row(cols, []cell{
			{text: name},
			{text: num(a.Scored)},
			{text: withPct(a.Failing, a.Scored)},
			{text: num(a.BySev["critical"]), bold: a.BySev["critical"] > 0, color: zeroGrey(a.BySev["critical"], sevRGB["critical"])},
			{text: num(a.BySev["high"]), bold: a.BySev["high"] > 0, color: zeroGrey(a.BySev["high"], sevRGB["high"])},
			{text: scoreOf(a.Average)},
		}, 1, nil)
	}
	if more := len(rep.Accounts) - maxAccounts; more > 0 {
		pdf.Ln(1.5)
		d.note(fmt.Sprintf("And %s more. The Excel report has every account.", count(more, "account", "accounts")))
	}
	pdf.Ln(7)

	if pdf.GetY() > pageH-bottom-50 { // the heading and a few rows, or a new page
		pdf.AddPage()
	}
	d.pages.priority = pdf.PageNo()
	pdf.SetLink(d.sect.priority, -1, -1)
	pdf.Bookmark(d.t("Identities to fix first"), 0, -1)
	d.heading("Identities to fix first", 10.5)
	prio := rep.PriorityIdentities()
	if len(prio) > maxPriority {
		d.note(fmt.Sprintf("The %d identities with the most severe failing checks, of %s. The Excel report lists every identity.", maxPriority, num(len(prio))))
		prio = prio[:maxPriority]
	} else {
		d.note("Most severe failing check first, then the lowest score.")
	}
	cols = []col{{w: bodyW - 128, align: "L"}, {w: 30, align: "L"}, {w: 40, align: "L"}, {w: 14, align: "R"}, {w: 16, align: "R"}, {w: 12, align: "R"}, {w: 16, align: "R"}}
	head := func() { d.header(cols, []string{"Identity", "Type", "Account", "Score", "Critical", "High", "Checks"}) }
	head()
	for _, id := range prio {
		crit, high := id.CountSev("critical"), id.CountSev("high")
		d.row(cols, []cell{
			{text: id.Name, bold: true},
			{text: typeLabel(id.Type)},
			{text: accountName(AccountRow{ID: id.AccountID, Name: id.Account})},
			{text: scoreOf(id.Score)},
			{text: num(crit), bold: crit > 0, color: zeroGrey(crit, sevRGB["critical"])},
			{text: num(high), bold: high > 0, color: zeroGrey(high, sevRGB["high"])},
			{text: num(len(id.Checks))},
		}, 1, head)
	}
}

// ---- detail pages --------------------------------------------------------

func (d *doc) details() {
	pdf, rep, o := d.pdf, d.rep, d.rep.Options
	pdf.AddPage()
	d.pages.details = pdf.PageNo()
	pdf.SetLink(d.sect.details, -1, -1)
	pdf.Bookmark(d.t("Failing checks in detail"), 0, -1)
	d.title("Failing checks in detail")
	intro := "Each check once: what it looks at, how to fix it and the identities that fail it, lowest score first."
	if d.longest() > maxRowsPerCheck {
		intro += fmt.Sprintf(" Up to %d identities are listed per check; the Excel report lists all of them.", maxRowsPerCheck)
	}
	d.note(intro)
	pdf.Ln(3)

	cols := []col{{w: 46, align: "L"}, {w: 40, align: "L"}, {w: 14, align: "R"}, {w: bodyW - 100, align: "L"}}
	for gi, g := range rep.Groups {
		if pdf.GetY() > pageH-bottom-55 {
			pdf.AddPage()
		}
		top := pdf.GetY()
		pdf.SetLink(d.links[gi], top, pdf.PageNo())
		d.pages.groups[gi] = pdf.PageNo()
		pdf.Bookmark(d.t(g.Title), 1, top)

		// Heading: severity, the check, how many identities fail it.
		x := marginX + 4
		if o.IncludeSev {
			d.pill(marginX+4, top+0.6, SeverityLabel(g.Severity), sevColor(g.Severity))
		}
		d.font("", 8.5, ink3RGB)
		right := count(len(g.Items), "identity", "identities")
		pdf.SetXY(marginX+bodyW-40, top+0.6)
		pdf.CellFormat(40, 5, d.t(right), "", 0, "R", false, 0, "")
		titleY := top
		if o.IncludeSev {
			titleY += 7 // under the severity pill
		}
		pdf.SetXY(x, titleY)
		d.font("B", 11, inkRGB)
		pdf.MultiCell(bodyW-48, 5.6, d.t(g.Title), "", "L", false)
		meta := nonEmpty(AreaLabel(g.Area), g.RuleID)
		if g.Since != nil {
			if days := int(rep.GeneratedAt.Sub(*g.Since).Hours() / 24); days >= 1 {
				meta = append(meta, fmt.Sprintf("failing for up to %s", count(days, "day", "days")))
			}
		}
		if len(meta) > 0 {
			pdf.SetX(x)
			d.font("", 8, ink3RGB)
			pdf.CellFormat(bodyW-8, 4.5, d.t(strings.Join(meta, " · ")), "", 1, "L", false, 0, "")
		}
		pdf.Ln(1.2)
		if o.IncludeInfo {
			d.labelled(x, "About this check", g.About)
		}
		if len(g.Accounts) > 1 {
			top := []string{}
			for i, a := range g.Accounts {
				if i == 3 {
					break
				}
				top = append(top, fmt.Sprintf("%s (%s)", a.Name, num(a.Count)))
			}
			switch {
			case len(g.Accounts) > 3 && g.Accounts[0].Count == 1:
				d.labelled(x, "Accounts", fmt.Sprintf("one identity in each of %d accounts", len(g.Accounts)))
			case len(g.Accounts) > 3:
				d.labelled(x, fmt.Sprintf("In %d accounts, most in", len(g.Accounts)), strings.Join(top, ", "))
			default:
				d.labelled(x, "Accounts", strings.Join(top, ", "))
			}
		}
		if o.IncludeFix {
			label := "How to fix"
			if g.FixFrom != "" {
				label += " (as found on " + g.FixFrom + ")"
			}
			d.labelled(x, label, g.Fix)
			if g.ManyFix {
				pdf.SetX(x)
				d.font("I", 8, ink3RGB)
				pdf.CellFormat(bodyW-8, 4.5, d.t("Some identities have fix steps of their own; the Excel report has each one."), "", 1, "L", false, 0, "")
			}
		}
		// A coloured rule down the left of the heading ties it to its severity.
		setFill(pdf, sevColor(g.Severity))
		pdf.Rect(marginX, top, 1.2, pdf.GetY()-top, "F")
		pdf.Ln(2)

		head := func() { d.header(cols, []string{"Identity", "Account", "Score", "What was found"}) }
		head()
		for i, it := range g.Items {
			if i == maxRowsPerCheck {
				break
			}
			id := rep.Identities[it.Identity]
			d.row(cols, []cell{
				{text: id.Name, bold: true, sub: typeLabel(id.Type)},
				{text: accountLabel(id)},
				{text: scoreOf(id.Score)},
				{text: orDash(it.Found)},
			}, 2, head)
		}
		if more := len(g.Items) - maxRowsPerCheck; more > 0 {
			pdf.Ln(1.5)
			d.note(fmt.Sprintf("%s more %s this check. The Excel report lists every one.", num(more), plural(more, "identity fails", "identities fail")))
		}
		pdf.Ln(8)
	}
}

func (d *doc) longest() int {
	n := 0
	for _, g := range d.rep.Groups {
		if len(g.Items) > n {
			n = len(g.Items)
		}
	}
	return n
}

// contents is one line of links to the sections, with their pages.
func (d *doc) contents() {
	pdf := d.pdf
	pdf.Ln(2.5)
	d.font("B", 8.5, ink2RGB)
	pdf.CellFormat(pdf.GetStringWidth("Contents")+4, 5, "Contents", "", 0, "L", false, 0, "")
	entries := []struct {
		label string
		page  func(*pageMap) int
		link  int
	}{
		{"Where the risk is", func(m *pageMap) int { return m.risk }, d.sect.risk},
		{"Identities to fix first", func(m *pageMap) int { return m.priority }, d.sect.priority},
		{"Failing checks in detail", func(m *pageMap) int { return m.details }, d.sect.details},
	}
	for i, e := range entries {
		text := fmt.Sprintf("%s  p. %s", e.label, d.pageOf(e.page))
		if i > 0 {
			d.font("", 8.5, ink3RGB)
			pdf.CellFormat(5, 5, d.t("·"), "", 0, "C", false, 0, "")
		}
		d.font("", 8.5, linkRGB)
		w := pdf.GetStringWidth(d.t(text)) + 2
		pdf.CellFormat(w, 5, d.t(text), "", 0, "L", false, e.link, "")
	}
	pdf.Ln(5)
}

// trend reads the average 30-day score change: "up 4 in 30 days".
func trend(change *float64) string {
	if change == nil {
		return ""
	}
	n := int(math.Round(*change))
	switch {
	case n > 0:
		return fmt.Sprintf("up %d in 30 days", n)
	case n < 0:
		return fmt.Sprintf("down %d in 30 days", -n)
	}
	return "no change in 30 days"
}

// ---- building blocks -----------------------------------------------------

type figure struct{ label, value, sub string }

func (d *doc) figures(figs []figure) {
	pdf := d.pdf
	boxW := (bodyW - 3*4) / 4
	y := pdf.GetY()
	for i, f := range figs {
		x := marginX + float64(i)*(boxW+4)
		setFill(pdf, panelRGB)
		setDraw(pdf, lineRGB)
		pdf.RoundedRect(x, y, boxW, 23, 2, "1234", "FD")
		pdf.SetXY(x+4, y+3)
		d.font("", 8, ink3RGB)
		pdf.CellFormat(boxW-8, 4, d.t(f.label), "", 0, "L", false, 0, "")
		pdf.SetXY(x+4, y+8.5)
		d.font("B", 15, inkRGB)
		pdf.CellFormat(boxW-8, 8, d.t(f.value), "", 0, "L", false, 0, "")
		if f.sub != "" {
			pdf.SetXY(x+4, y+16.5)
			d.font("", 7.5, ink3RGB)
			pdf.CellFormat(boxW-8, 4, d.t(f.sub), "", 0, "L", false, 0, "")
		}
	}
	pdf.SetY(y + 30)
}

type part struct {
	label string
	n     int
	rgb   [3]int
}

// stackedBar draws a labelled 100% bar with a legend under it.
func (d *doc) stackedBar(x, y, w float64, title string, parts []part) (bottomY float64) {
	pdf := d.pdf
	pdf.SetXY(x, y)
	d.font("B", 9.5, inkRGB)
	pdf.CellFormat(w, 5, d.t(title), "", 0, "L", false, 0, "")
	total := 0
	for _, p := range parts {
		total += p.n
	}
	by := y + 7
	if total == 0 {
		setFill(pdf, lineRGB)
		pdf.Rect(x, by, w, 4, "F")
	} else {
		cx := x
		for _, p := range parts {
			if p.n == 0 {
				continue
			}
			pw := w * float64(p.n) / float64(total)
			setFill(pdf, p.rgb)
			pdf.Rect(cx, by, pw, 4, "F")
			cx += pw
		}
	}
	lx, ly := x, by+7
	for _, p := range parts {
		d.font("", 8, ink2RGB)
		itemW := 3.4 + pdf.GetStringWidth(d.t(p.label+" "))
		d.font("B", 8, inkRGB)
		itemW += pdf.GetStringWidth(num(p.n)) + 5
		if lx > x && lx+itemW > x+w { // next line rather than past the edge
			lx, ly = x, ly+5
		}
		setFill(pdf, p.rgb)
		pdf.Rect(lx, ly+1.1, 2.4, 2.4, "F")
		d.font("", 8, ink2RGB)
		label := p.label + " "
		pdf.SetXY(lx+3.4, ly)
		pdf.CellFormat(pdf.GetStringWidth(d.t(label)), 4.6, d.t(label), "", 0, "L", false, 0, "")
		d.font("B", 8, inkRGB)
		n := num(p.n)
		pdf.CellFormat(pdf.GetStringWidth(n)+5, 4.6, n, "", 0, "L", false, 0, "")
		lx = pdf.GetX()
	}
	return ly + 4.6
}

func (d *doc) pill(x, y float64, text string, rgb [3]int) {
	pdf := d.pdf
	d.font("B", 7.5, [3]int{255, 255, 255})
	w := pdf.GetStringWidth(text) + 5
	setFill(pdf, rgb)
	pdf.RoundedRect(x, y, w, 4.8, 1.2, "1234", "F")
	pdf.SetXY(x, y)
	pdf.CellFormat(w, 4.8, text, "", 0, "C", false, 0, "")
}

func (d *doc) title(s string) {
	d.font("B", 15, inkRGB)
	d.pdf.CellFormat(bodyW, 8, d.t(s), "", 1, "L", false, 0, "")
	d.pdf.Ln(2)
}

func (d *doc) heading(s string, size float64) {
	d.font("B", size, inkRGB)
	d.pdf.CellFormat(bodyW, 6, d.t(s), "", 1, "L", false, 0, "")
}

func (d *doc) note(s string) {
	d.font("", 8.5, ink3RGB)
	d.pdf.MultiCell(bodyW, 4.4, d.t(s), "", "L", false)
	d.pdf.Ln(1)
}

// labelled writes "Label: text" as one wrapped paragraph; nothing when empty.
func (d *doc) labelled(x float64, label, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	pdf := d.pdf
	pdf.SetX(x)
	d.font("B", 8.5, ink2RGB)
	lw := pdf.GetStringWidth(d.t(label+": ")) + 0.5
	pdf.CellFormat(lw, 4.8, d.t(label+":"), "", 0, "L", false, 0, "")
	d.font("", 8.5, ink2RGB)
	pdf.MultiCell(bodyW-(x-marginX)-2-lw, 4.8, d.t(text), "", "L", false)
	pdf.Ln(0.4)
}

type col struct {
	w     float64
	align string
}

type cell struct {
	text  string
	sub   string // a second, smaller grey line
	bold  bool
	color [3]int
}

const (
	cellPad = 1.6
	lineH   = 4.2
)

func (d *doc) header(cols []col, names []string) {
	pdf := d.pdf
	setFill(pdf, panelRGB)
	setDraw(pdf, lineRGB)
	d.font("B", 7.5, ink3RGB)
	pdf.SetX(marginX)
	for i, n := range names {
		ln := 0
		if i == len(names)-1 {
			ln = 1
		}
		pdf.CellFormat(cols[i].w, 6.2, " "+d.t(n)+" ", "B", ln, cols[i].align, true, 0, "")
	}
}

// row draws one table row, each cell wrapped to at most maxLines lines, and
// returns its height. A row that would cross the page end starts a new page
// and repeats the header (head) there.
func (d *doc) row(cols []col, cells []cell, maxLines int, head func()) float64 {
	pdf := d.pdf
	lines := make([][]string, len(cells))
	h := 0.0
	for i, c := range cells {
		d.font(boldStyle(c.bold), 8.5, inkRGB)
		lines[i] = d.wrap(c.text, cols[i].w-2*cellPad, maxLines)
		ch := float64(len(lines[i])) * lineH
		if c.sub != "" {
			ch += 3.8
		}
		if ch > h {
			h = ch
		}
	}
	h += 2 * cellPad
	if pdf.GetY()+h > pageH-bottom {
		pdf.AddPage()
		if head != nil {
			head()
		}
	}
	y := pdf.GetY()
	x := marginX
	for i, c := range cells {
		rgb := c.color
		if rgb == ([3]int{}) {
			rgb = inkRGB
		}
		d.font(boldStyle(c.bold), 8.5, rgb)
		for li, l := range lines[i] {
			pdf.SetXY(x+cellPad, y+cellPad+float64(li)*lineH)
			pdf.CellFormat(cols[i].w-2*cellPad, lineH, d.t(l), "", 0, cols[i].align, false, 0, "")
		}
		if c.sub != "" {
			d.font("", 7, ink3RGB)
			pdf.SetXY(x+cellPad, y+cellPad+float64(len(lines[i]))*lineH)
			pdf.CellFormat(cols[i].w-2*cellPad, 3.8, d.t(truncate(pdf, c.sub, cols[i].w-2*cellPad)), "", 0, cols[i].align, false, 0, "")
		}
		x += cols[i].w
	}
	setDraw(pdf, lineRGB)
	pdf.Line(marginX, y+h, marginX+bodyW, y+h)
	pdf.SetXY(marginX, y+h)
	return h
}

// wrap splits s into lines no wider than w at the current font, at most max
// lines; the last kept line ends in "..." when text was cut.
func (d *doc) wrap(s string, w float64, max int) []string {
	words := strings.Fields(plain(s))
	if len(words) == 0 {
		return []string{""}
	}
	fits := func(x string) bool { return d.pdf.GetStringWidth(d.t(x)) <= w }
	var out []string
	cur := ""
	for i := 0; i < len(words); i++ {
		next := words[i]
		if cur != "" {
			next = cur + " " + words[i]
		}
		if fits(next) {
			cur = next
			continue
		}
		if cur == "" { // one word wider than the cell
			cur = truncate(d.pdf, words[i], w)
			out = append(out, cur)
			cur = ""
		} else {
			out = append(out, cur)
			cur = words[i]
			if !fits(cur) {
				cur = truncate(d.pdf, cur, w)
			}
		}
		if len(out) == max {
			rest := strings.Join(append([]string{cur}, words[i+1:]...), " ")
			if strings.TrimSpace(rest) != "" {
				out[max-1] = truncate(d.pdf, out[max-1]+" "+rest, w)
			}
			return out
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	if len(out) > max {
		out = out[:max]
	}
	return out
}

func (d *doc) font(style string, size float64, rgb [3]int) {
	d.pdf.SetFont("Helvetica", style, size)
	setText(d.pdf, rgb)
}

func boldStyle(b bool) string {
	if b {
		return "B"
	}
	return ""
}

func sevColor(s string) [3]int {
	if c, ok := sevRGB[s]; ok {
		return c
	}
	return ink3RGB
}

func zeroGrey(n int, rgb [3]int) [3]int {
	if n == 0 {
		return ink3RGB
	}
	return rgb
}

func setText(pdf *fpdf.Fpdf, c [3]int) { pdf.SetTextColor(c[0], c[1], c[2]) }
func setFill(pdf *fpdf.Fpdf, c [3]int) { pdf.SetFillColor(c[0], c[1], c[2]) }
func setDraw(pdf *fpdf.Fpdf, c [3]int) { pdf.SetDrawColor(c[0], c[1], c[2]) }

// truncate shortens s with an ellipsis to fit width at the current font.
func truncate(pdf *fpdf.Fpdf, s string, width float64) string {
	if pdf.GetStringWidth(s) <= width {
		return s
	}
	r := []rune(s)
	for len(r) > 1 && pdf.GetStringWidth(string(r)+"...") > width {
		r = r[:len(r)-1]
	}
	return strings.TrimRight(string(r), " ") + "..."
}

// plain swaps characters the PDF core fonts cannot draw for close ASCII.
func plain(s string) string {
	// The core fonts are Windows-1252: it has · – — “ ” ‘ ’ … • but no arrows.
	return strings.NewReplacer("→", "->", "←", "<-", "✓", "v", "✗", "x").Replace(s)
}

func nonEmpty(v ...string) []string {
	out := make([]string, 0, len(v))
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// num writes 6512 as "6,512".
func num(n int) string {
	s := strconv.Itoa(n)
	if n < 0 {
		return "-" + num(-n)
	}
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

func count(n int, one, many string) string { return num(n) + " " + plural(n, one, many) }

// pct is n of total as a whole percentage; "<1%" rather than a misleading 0%.
func pct(n, total int) string {
	if total == 0 {
		return "0%"
	}
	p := float64(n) * 100 / float64(total)
	if p > 0 && p < 1 {
		return "<1%"
	}
	return strconv.Itoa(int(p+0.5)) + "%"
}

func withPct(n, total int) string {
	if total == 0 {
		return num(n)
	}
	return num(n) + "  (" + pct(n, total) + ")"
}

func scoreOf(v *float64) string {
	if v == nil {
		return "-"
	}
	return strconv.Itoa(int(*v + 0.5))
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

// bandFor is the Posture page's band for a score.
func bandFor(score float64) string {
	switch {
	case score >= 80:
		return "healthy"
	case score >= 60:
		return "fair"
	case score >= 40:
		return "poor"
	}
	return "critical"
}

func shownSeverities(o PostureOptions) []string {
	if len(o.Severities) > 0 {
		return o.Severities
	}
	return Severities
}

func has(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
