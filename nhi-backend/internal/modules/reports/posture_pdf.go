package reports

import (
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/go-pdf/fpdf"
)

// A4 portrait, millimetres.
const (
	pageW   = 210.0
	marginX = 16.0
	bodyW   = pageW - 2*marginX
)

var (
	inkRGB   = [3]int{17, 24, 39}
	ink2RGB  = [3]int{55, 65, 81}
	ink3RGB  = [3]int{107, 114, 128}
	lineRGB  = [3]int{229, 231, 235}
	panelRGB = [3]int{248, 250, 252}
	sevRGB   = map[string][3]int{
		"critical": {185, 28, 28},
		"high":     {194, 65, 12},
		"medium":   {161, 98, 7},
		"low":      {21, 128, 61},
	}
)

// WritePosturePDF writes the report for reading and sharing: a one-page
// summary (score, counts by severity, the checks failing most often), then
// each identity with its failing checks, worst identity first.
func WritePosturePDF(w io.Writer, rep *PostureReport) error {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(marginX, 16, marginX)
	pdf.SetAutoPageBreak(true, 18)
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	t := func(s string) string { return tr(plain(s)) }
	o := rep.Options

	pdf.SetFooterFunc(func() {
		pdf.SetY(-12)
		setText(pdf, ink3RGB)
		pdf.SetFont("Helvetica", "", 8)
		pdf.CellFormat(bodyW/2, 5, t("Posture report · "+ClassLabel(o.Class)), "", 0, "L", false, 0, "")
		pdf.CellFormat(bodyW/2, 5, fmt.Sprintf("Page %d of {nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
	})
	pdf.AliasNbPages("")
	pdf.AddPage()

	// Title.
	setText(pdf, inkRGB)
	pdf.SetFont("Helvetica", "B", 20)
	pdf.CellFormat(bodyW, 10, "Posture report", "", 1, "L", false, 0, "")
	setText(pdf, ink2RGB)
	pdf.SetFont("Helvetica", "", 10)
	sevs := "every severity"
	if len(o.Severities) > 0 && len(o.Severities) < len(Severities) {
		names := make([]string, 0, len(o.Severities))
		for _, s := range o.Severities {
			names = append(names, SeverityLabel(s))
		}
		sevs = strings.Join(names, ", ") + " severity"
	}
	pdf.CellFormat(bodyW, 6, t(fmt.Sprintf("%s · failing checks of %s", ClassLabel(o.Class), sevs)), "", 1, "L", false, 0, "")
	setText(pdf, ink3RGB)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.CellFormat(bodyW, 5, t(fmt.Sprintf("Generated %s UTC from the latest posture scan · %d %s covered",
		rep.GeneratedAt.Format("2 Jan 2006, 15:04"), rep.AccountsCovered, plural(rep.AccountsCovered, "account", "accounts"))), "", 1, "L", false, 0, "")
	pdf.Ln(5)

	// Summary figures.
	avg := "-"
	if rep.AverageScore != nil {
		avg = strconv.Itoa(int(*rep.AverageScore+0.5)) + " / 100"
	}
	figures := []struct{ label, value string }{
		{"Average score", avg},
		{"Identities scored", strconv.Itoa(rep.ScoredCount)},
		{"With failing checks", strconv.Itoa(rep.FailingCount)},
		{"Failing checks", strconv.Itoa(rep.CheckCount)},
	}
	boxW := (bodyW - 3*4) / 4
	y := pdf.GetY()
	for i, f := range figures {
		x := marginX + float64(i)*(boxW+4)
		setFill(pdf, panelRGB)
		setDraw(pdf, lineRGB)
		pdf.RoundedRect(x, y, boxW, 20, 2, "1234", "FD")
		pdf.SetXY(x+4, y+3)
		setText(pdf, ink3RGB)
		pdf.SetFont("Helvetica", "", 8)
		pdf.CellFormat(boxW-8, 4, t(f.label), "", 0, "L", false, 0, "")
		pdf.SetXY(x+4, y+9)
		setText(pdf, inkRGB)
		pdf.SetFont("Helvetica", "B", 15)
		pdf.CellFormat(boxW-8, 8, t(f.value), "", 0, "L", false, 0, "")
	}
	pdf.SetY(y + 26)

	// Failing checks by severity.
	pdf.SetFont("Helvetica", "B", 10)
	setText(pdf, inkRGB)
	pdf.CellFormat(bodyW, 6, "Failing checks by severity", "", 1, "L", false, 0, "")
	pdf.Ln(1)
	shown := Severities
	if len(o.Severities) > 0 {
		shown = o.Severities
	}
	for _, s := range shown {
		c := sevRGB[s]
		setFill(pdf, c)
		pdf.Rect(pdf.GetX(), pdf.GetY()+1.3, 2.6, 2.6, "F")
		pdf.SetX(pdf.GetX() + 4)
		setText(pdf, ink2RGB)
		pdf.SetFont("Helvetica", "", 9.5)
		label := fmt.Sprintf("%s  ", SeverityLabel(s))
		pdf.CellFormat(pdf.GetStringWidth(label), 5, label, "", 0, "L", false, 0, "")
		pdf.SetFont("Helvetica", "B", 9.5)
		n := strconv.Itoa(rep.BySeverity[s])
		pdf.CellFormat(pdf.GetStringWidth(n)+9, 5, n, "", 0, "L", false, 0, "")
	}
	pdf.Ln(10)

	if rep.CheckCount == 0 {
		setText(pdf, ink2RGB)
		pdf.SetFont("Helvetica", "", 10)
		pdf.MultiCell(bodyW, 5.5, t("No identity in this report fails a check of the chosen severity. Nothing to fix."), "", "L", false)
		return finish(pdf, w)
	}

	// The failing checks, most severe first.
	pdf.SetFont("Helvetica", "B", 10)
	setText(pdf, inkRGB)
	pdf.CellFormat(bodyW, 6, "Checks to fix first", "", 1, "L", false, 0, "")
	setText(pdf, ink3RGB)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.CellFormat(bodyW, 4.5, "Most severe first, then by how many identities fail the check.", "", 1, "L", false, 0, "")
	pdf.Ln(1.5)
	cols := []float64{bodyW - 50, 26, 24}
	tableHeader(pdf, t, cols, []string{"Check", "Severity", "Identities"})
	for _, c := range rep.TopChecks {
		setText(pdf, inkRGB)
		pdf.SetFont("Helvetica", "", 9)
		pdf.CellFormat(cols[0], 6.5, t(truncate(pdf, c.Title, cols[0]-2)), "B", 0, "L", false, 0, "")
		setText(pdf, sevColor(c.Severity))
		pdf.SetFont("Helvetica", "B", 9)
		pdf.CellFormat(cols[1], 6.5, SeverityLabel(c.Severity), "B", 0, "L", false, 0, "")
		setText(pdf, inkRGB)
		pdf.SetFont("Helvetica", "", 9)
		pdf.CellFormat(cols[2], 6.5, strconv.Itoa(c.Identities), "B", 1, "R", false, 0, "")
	}
	if more := rep.CheckKinds - len(rep.TopChecks); more > 0 {
		pdf.Ln(1.5)
		setText(pdf, ink3RGB)
		pdf.SetFont("Helvetica", "", 8.5)
		pdf.CellFormat(bodyW, 4.5, fmt.Sprintf("And %d more %s, listed with each identity in the pages that follow.", more, plural(more, "check", "checks")), "", 1, "L", false, 0, "")
	}

	// Each identity, worst first.
	pdf.AddPage()
	setText(pdf, inkRGB)
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(bodyW, 8, "Identities and what they fail", "", 1, "L", false, 0, "")
	setText(pdf, ink3RGB)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.CellFormat(bodyW, 5, "Lowest score first. Within an identity, the most severe check first.", "", 1, "L", false, 0, "")
	pdf.Ln(3)

	for _, id := range rep.Identities {
		if pdf.GetY() > 250 {
			pdf.AddPage()
		}
		// Identity header band.
		y := pdf.GetY()
		setFill(pdf, panelRGB)
		setDraw(pdf, lineRGB)
		pdf.Rect(marginX, y, bodyW, 13, "FD")
		pdf.SetXY(marginX+3, y+2)
		setText(pdf, inkRGB)
		pdf.SetFont("Helvetica", "B", 10.5)
		pdf.CellFormat(bodyW-50, 5, t(truncate(pdf, id.Name, bodyW-56)), "", 0, "L", false, 0, "")
		score := "Not scored"
		if id.Score != nil {
			score = fmt.Sprintf("Score %d", int(*id.Score+0.5))
			if id.Band != "" {
				score += " · " + bandLabel(id.Band)
			}
		}
		pdf.SetFont("Helvetica", "B", 9.5)
		pdf.CellFormat(44, 5, t(score), "", 0, "R", false, 0, "")
		pdf.SetXY(marginX+3, y+7.5)
		setText(pdf, ink3RGB)
		pdf.SetFont("Helvetica", "", 8)
		kind := "Non-human"
		if id.Human {
			kind = "Human"
		}
		meta := strings.Join(nonEmpty(typeLabel(id.Type), kind, accountLabel(id),
			fmt.Sprintf("%d failing %s", len(id.Checks), plural(len(id.Checks), "check", "checks"))), " · ")
		pdf.CellFormat(bodyW-6, 4, t(truncate(pdf, meta, bodyW-8)), "", 0, "L", false, 0, "")
		pdf.SetY(y + 15)

		for i, c := range id.Checks {
			if pdf.GetY() > 262 {
				pdf.AddPage()
			}
			x := marginX + 3
			if o.IncludeSev {
				setText(pdf, sevColor(c.Severity))
				pdf.SetFont("Helvetica", "B", 8.5)
				pdf.SetX(x)
				pdf.CellFormat(18, 5.5, SeverityLabel(c.Severity), "", 0, "L", false, 0, "")
				x += 18
			}
			setText(pdf, inkRGB)
			pdf.SetFont("Helvetica", "B", 9.5)
			pdf.SetX(x)
			pdf.MultiCell(bodyW-(x-marginX)-2, 5.5, t(c.Title), "", "L", false)
			labelled(pdf, t, x, "Found", c.Found)
			if o.IncludeInfo {
				labelled(pdf, t, x, "About this check", c.About)
			}
			if o.IncludeFix {
				labelled(pdf, t, x, "How to fix", c.Fix)
			}
			pdf.Ln(1.5)
			if i < len(id.Checks)-1 {
				setDraw(pdf, lineRGB)
				pdf.Line(x, pdf.GetY(), marginX+bodyW-2, pdf.GetY())
				pdf.Ln(2)
			}
		}
		pdf.Ln(5)
	}
	return finish(pdf, w)
}

// labelled writes "Label: text" as one wrapped paragraph; nothing when empty.
func labelled(pdf *fpdf.Fpdf, t func(string) string, x float64, label, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	pdf.SetX(x)
	setText(pdf, ink3RGB)
	pdf.SetFont("Helvetica", "B", 8.5)
	lw := pdf.GetStringWidth(label+": ") + 0.5
	pdf.CellFormat(lw, 4.8, t(label+":"), "", 0, "L", false, 0, "")
	setText(pdf, ink2RGB)
	pdf.SetFont("Helvetica", "", 8.5)
	pdf.MultiCell(bodyW-(x-marginX)-2-lw, 4.8, t(text), "", "L", false)
}

func tableHeader(pdf *fpdf.Fpdf, t func(string) string, cols []float64, names []string) {
	setFill(pdf, panelRGB)
	setText(pdf, ink3RGB)
	pdf.SetFont("Helvetica", "B", 8)
	for i, n := range names {
		align := "L"
		if i == len(names)-1 {
			align = "R"
		}
		ln := 0
		if i == len(names)-1 {
			ln = 1
		}
		pdf.CellFormat(cols[i], 6.5, t(n), "B", ln, align, true, 0, "")
	}
}

func finish(pdf *fpdf.Fpdf, w io.Writer) error {
	if err := pdf.Error(); err != nil {
		return err
	}
	return pdf.Output(w)
}

func sevColor(s string) [3]int {
	if c, ok := sevRGB[s]; ok {
		return c
	}
	return ink3RGB
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
	return string(r) + "..."
}

// plain swaps characters the PDF core fonts cannot draw for close ASCII.
func plain(s string) string {
	// The core fonts are Windows-1252: it has · – — “ ” ‘ ’ … • but no arrows.
	return strings.NewReplacer("→", "->", "←", "<-", "✓", "v", "✗", "x").Replace(s)
}

func nonEmpty(v ...string) []string {
	out := v[:0]
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
