package reports

import (
	"fmt"
	"io"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Sheet names, in the order the workbook opens them.
const (
	sheetSummary    = "Summary"
	sheetIdentities = "Identities"
	sheetChecks     = "Failing checks"
)

// WritePostureXLSX writes the report as a workbook to work through:
//
//   - Summary: the figures, key points, severity and score band breakdowns,
//     human and non-human, every account and every failing check with what it
//     looks at and how to fix it.
//   - Identities: one row per scored identity, passing ones included (the
//     whole population, as an auditor samples it), most urgent first.
//   - Failing checks: one row per failing check on an identity.
//
// The two lists are Excel tables: filters on every column, banded rows and a
// frozen header. Cells are written as text, never as formulas.
func WritePostureXLSX(w io.Writer, rep *PostureReport) error {
	f := excelize.NewFile()
	defer f.Close()
	x := &book{f: f, rep: rep}
	if err := x.styles(); err != nil {
		return err
	}
	if err := f.SetSheetName("Sheet1", sheetSummary); err != nil {
		return err
	}
	if err := x.summary(); err != nil {
		return err
	}
	if _, err := f.NewSheet(sheetIdentities); err != nil {
		return err
	}
	if err := x.identities(); err != nil {
		return err
	}
	if _, err := f.NewSheet(sheetChecks); err != nil {
		return err
	}
	if err := x.checks(); err != nil {
		return err
	}
	f.SetActiveSheet(0)
	_ = f.SetDocProps(&excelize.DocProperties{Title: "Posture report", Subject: rep.ScopeLabel(), Creator: "NHI console"})
	return f.Write(w)
}

type book struct {
	f   *excelize.File
	rep *PostureReport
	st  struct {
		title, sub, heading, label, value, figure, head, wrap, note, num, pct int
		sev                                                                   map[string]int
	}
}

func (x *book) styles() error {
	f := x.f
	font := func(size float64, bold bool, color string) *excelize.Font {
		return &excelize.Font{Family: "Calibri", Size: size, Bold: bold, Color: color}
	}
	var err error
	mk := func(s *excelize.Style) int {
		if err != nil {
			return 0
		}
		var id int
		id, err = f.NewStyle(s)
		return id
	}
	top := &excelize.Alignment{Vertical: "top"}
	x.st.title = mk(&excelize.Style{Font: font(18, true, "111827")})
	x.st.sub = mk(&excelize.Style{Font: font(10.5, false, "6B7280")})
	x.st.heading = mk(&excelize.Style{Font: font(12, true, "111827")})
	x.st.label = mk(&excelize.Style{Font: font(10.5, false, "374151"), Alignment: top})
	x.st.value = mk(&excelize.Style{Font: font(10.5, true, "111827"), Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "top"}})
	x.st.figure = mk(&excelize.Style{Font: font(14, true, "111827"), NumFmt: 3, Alignment: &excelize.Alignment{Horizontal: "left"}})
	x.st.head = mk(&excelize.Style{
		Font:      font(10, true, "374151"),
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"F3F4F6"}},
		Border:    []excelize.Border{{Type: "bottom", Color: "D1D5DB", Style: 1}},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
	})
	x.st.wrap = mk(&excelize.Style{Font: font(10.5, false, "111827"), Alignment: &excelize.Alignment{Vertical: "top", WrapText: true}})
	x.st.num = mk(&excelize.Style{Font: font(10.5, false, "374151"), NumFmt: 3, Alignment: top}) // 6,508
	x.st.pct = mk(&excelize.Style{Font: font(10.5, false, "374151"), NumFmt: 9, Alignment: top}) // 66%
	x.st.note = mk(&excelize.Style{Font: &excelize.Font{Family: "Calibri", Size: 10, Italic: true, Color: "6B7280"}})
	x.st.sev = map[string]int{}
	for s, hex := range map[string]string{"critical": "B91C1C", "high": "C2410C", "medium": "A16207", "low": "15803D"} {
		x.st.sev[s] = mk(&excelize.Style{Font: font(10.5, true, hex), Alignment: top})
	}
	return err
}

// ---- Summary -------------------------------------------------------------

func (x *book) summary() error {
	f, rep, o := x.f, x.rep, x.rep.Options
	sh := sheetSummary
	widths := map[string]float64{"A": 46, "B": 16, "C": 16, "D": 18, "E": 14, "F": 14, "G": 60, "H": 60, "I": 16}
	for c, w := range widths {
		if err := f.SetColWidth(sh, c, c, w); err != nil {
			return err
		}
	}
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(false)})

	r := 1
	put := func(cell string, v interface{}, style int) {
		switch val := v.(type) {
		case share:
			v = float64(val)
			if style == x.st.label {
				style = x.st.pct
			}
		case int:
			if style == x.st.label {
				style = x.st.num
			}
		}
		_ = f.SetCellValue(sh, cell, v)
		if style != 0 {
			_ = f.SetCellStyle(sh, cell, cell, style)
		}
	}
	at := func(col string) string { return fmt.Sprintf("%s%d", col, r) }

	put(at("A"), "Posture report", x.st.title)
	_ = f.SetRowHeight(sh, r, 26)
	r++
	sevs := "every severity"
	if len(o.Severities) > 0 && len(o.Severities) < len(Severities) {
		names := make([]string, 0, len(o.Severities))
		for _, s := range o.Severities {
			names = append(names, SeverityLabel(s))
		}
		sevs = strings.Join(names, ", ") + " severity"
	}
	put(at("A"), fmt.Sprintf("%s · failing checks of %s", rep.ScopeLabel(), sevs), x.st.sub)
	r++
	put(at("A"), fmt.Sprintf("Generated %s UTC from the latest posture scan · %s covered", rep.GeneratedAt.Format("2 Jan 2006, 15:04"), count(rep.AccountsCovered, "account", "accounts")), x.st.sub)
	r += 2

	// Figures, as label / value pairs.
	var avg interface{} = "-"
	avgSub := ""
	if rep.AverageScore != nil {
		avg = score1(*rep.AverageScore)
		avgSub = "out of 100 · " + bandLabel(bandFor(*rep.AverageScore)) + " band"
		if rep.FleetScope == "NHI" {
			avgSub = "non-human identities' fleet score, as on the Posture page · " + avgSub
		}
		if t := trend(rep.Change30d); t != "" {
			avgSub += " · " + t
		}
	}
	figs := [][3]interface{}{
		{"Average score", avg, avgSub},
		{"Identities scored", rep.ScoredCount, "in " + count(rep.AccountsCovered, "account", "accounts")},
		{"With failing checks", rep.FailingCount, pct(rep.FailingCount, rep.ScoredCount) + " of scored"},
		{"Failing checks", rep.CheckCount, "across " + count(len(rep.Groups), "check", "checks")},
	}
	for _, fg := range figs {
		put(at("A"), fg[0], x.st.label)
		put(at("B"), fg[1], x.st.figure)
		put(at("C"), fg[2], x.st.sub)
		r++
	}
	r++

	if rep.CheckCount == 0 {
		put(at("A"), "No identity in this report fails a check of the chosen severity. Nothing to fix.", x.st.label)
		return nil
	}

	put(at("A"), "Key points", x.st.heading)
	r++
	for _, p := range keyPoints(rep) {
		put(at("A"), "• "+p, x.st.label)
		_ = f.MergeCell(sh, at("A"), at("H"))
		r++
	}
	r++

	table := func(title, note string, headers []string, rows [][]interface{}, styles func(row, col int) int) {
		put(at("A"), title, x.st.heading)
		r++
		if note != "" {
			put(at("A"), note, x.st.note)
			r++
		}
		for i, h := range headers {
			put(cellRef(i, r), h, x.st.head)
		}
		r++
		for ri, row := range rows {
			for ci, v := range row {
				st := x.st.label
				if styles != nil {
					if s := styles(ri, ci); s != 0 {
						st = s
					}
				}
				put(cellRef(ci, r), v, st)
			}
			r++
		}
		r++
	}

	// By severity.
	var sevRows [][]interface{}
	shown := shownSeverities(o)
	for _, s := range shown {
		ids := 0
		for _, id := range rep.Identities {
			if id.CountSev(s) > 0 {
				ids++
			}
		}
		sevRows = append(sevRows, []interface{}{SeverityLabel(s), rep.BySeverity[s], ids})
	}
	table("Failing checks by severity", "", []string{"Severity", "Failing checks", "Identities affected"}, sevRows, func(row, c int) int {
		if c == 0 {
			return x.st.sev[shown[row]]
		}
		return 0
	})

	// By score band.
	var bandRows [][]interface{}
	for _, b := range rep.Bands {
		bandRows = append(bandRows, []interface{}{bandLabel(b.Band), b.Count, shareOf(b.Count, rep.ScoredCount)})
	}
	if len(bandRows) > 0 {
		table("Scored identities by score band", "Bands as on the Posture page: Critical below 40, Poor 40 to 59, Fair 60 to 79, Healthy 80 and above.",
			[]string{"Band", "Identities", "Share"}, bandRows, nil)
	}

	if len(rep.Classes) == 2 {
		var rows [][]interface{}
		for _, c := range rep.Classes {
			name := "Non-human"
			if c.Human {
				name = "Human"
			}
			rows = append(rows, []interface{}{name, c.Scored, c.Failing, shareOf(c.Failing, c.Scored), avgCell(c.Average)})
		}
		table("Human and non-human", "", []string{"Identities", "Scored", "With failing checks", "Share failing", "Average score"}, rows, nil)
	}

	var acctRows [][]interface{}
	for _, a := range rep.Accounts {
		name := a.Name
		if name == "" {
			name = a.ID
		}
		acctRows = append(acctRows, []interface{}{name, a.ID, a.Scored, a.Failing, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"], avgCell(a.Average)})
	}
	table("By account", "Accounts with the most severe failing checks first.",
		[]string{"Account", "Account ID", "Scored", "With failing checks", "Critical", "High", "Medium", "Low", "Average score"}, acctRows, nil)

	// Every failing check, with what it looks at and how to fix it.
	var checkRows [][]interface{}
	for _, g := range rep.Groups {
		row := []interface{}{g.Title, g.RuleID, SeverityLabel(g.Severity), AreaLabel(g.Area), len(g.Items), shareOf(len(g.Items), rep.ScoredCount)}
		about, fix := "", ""
		if o.IncludeInfo {
			about = g.About
		}
		if o.IncludeFix {
			fix = g.Fix
			if g.FixFrom != "" {
				fix = "As found on " + g.FixFrom + ": " + fix
			}
			if g.ManyFix {
				fix += "\n(Some identities have steps of their own: see the Failing checks sheet.)"
			}
		}
		since := ""
		if g.Since != nil {
			since = g.Since.UTC().Format("2006-01-02")
		}
		row = append(row, strings.TrimSpace(about), strings.TrimSpace(fix), since)
		checkRows = append(checkRows, row)
	}
	table("Checks to fix first", "Most severe first, then by how many identities fail the check. Filter the Failing checks sheet on a check to see every identity.",
		[]string{"Check", "Check ID", "Severity", "Area", "Identities failing", "Share of scored", "What the check looks at", "How to fix", "Failing since (earliest)"}, checkRows,
		func(row, c int) int {
			switch c {
			case 2:
				return x.st.sev[rep.Groups[row].Severity]
			case 0, 6, 7:
				return x.st.wrap
			}
			return 0
		})
	return nil
}

// ---- Identities ----------------------------------------------------------

func (x *book) identities() error {
	rep := x.rep
	sw, err := x.f.NewStreamWriter(sheetIdentities)
	if err != nil {
		return err
	}
	headers := []string{"Identity", "Type", "Human or non-human", "Account", "Account ID", "Score", "Band", "Failing checks", "Critical", "High", "Medium", "Low", "Most severe", "ARN"}
	widths := []float64{34, 18, 12, 24, 16, 9, 10, 10, 9, 9, 9, 9, 12, 60}
	for i, w := range widths {
		if err := sw.SetColWidth(i+1, i+1, w); err != nil {
			return err
		}
	}
	if err := sw.SetPanes(frozenHeader()); err != nil {
		return err
	}
	if err := sw.SetRow("A1", strs(headers), excelize.RowOpts{StyleID: x.st.head, Height: 30}); err != nil {
		return err
	}

	// The identities to fix first, then everyone else lowest score first.
	list := rep.PriorityIdentities()
	if len(rep.Population) > 0 {
		failing := map[string]bool{}
		for _, id := range list {
			failing[id.ID] = true
		}
		for _, id := range rep.Population {
			if !failing[id.ID] {
				list = append(list, id)
			}
		}
	}
	row := 2
	for _, id := range list {
		worst := id.Worst()
		worstCell := interface{}("")
		if worst != "" {
			worstCell = excelize.Cell{StyleID: x.st.sev[worst], Value: SeverityLabel(worst)}
		}
		vals := []interface{}{
			text(id.Name), typeLabel(id.Type), classWord(id.Human), text(id.Account), text(id.AccountID), scoreCell(id.Score), bandLabel(id.Band),
			len(id.Checks), id.CountSev("critical"), id.CountSev("high"), id.CountSev("medium"), id.CountSev("low"), worstCell, text(id.ARN),
		}
		if err := sw.SetRow(fmt.Sprintf("A%d", row), vals); err != nil {
			return err
		}
		row++
	}
	if row > 2 {
		if err := sw.AddTable(&excelize.Table{Range: fmt.Sprintf("A1:%s%d", colName(len(headers)-1), row-1), Name: "Identities", StyleName: "TableStyleLight9", ShowRowStripes: boolPtr(true)}); err != nil {
			return err
		}
	}
	return sw.Flush()
}

// ---- Failing checks ------------------------------------------------------

func (x *book) checks() error {
	rep, o := x.rep, x.rep.Options
	sw, err := x.f.NewStreamWriter(sheetChecks)
	if err != nil {
		return err
	}
	type column struct {
		name  string
		width float64
	}
	cols := []column{{"Identity", 30}, {"Type", 16}, {"Human or non-human", 12}, {"Account", 22}, {"Score", 8}}
	if o.IncludeSev {
		cols = append(cols, column{"Severity", 10})
	}
	cols = append(cols, column{"Check", 38}, column{"Check ID", 12}, column{"Problem on this identity", 44}, column{"What was found", 48})
	if o.IncludeInfo {
		cols = append(cols, column{"What the check looks at", 48})
	}
	if o.IncludeFix {
		cols = append(cols, column{"How to fix", 48})
	}
	cols = append(cols, column{"Area", 16}, column{"Failing since", 12}, column{"ARN", 60})
	headers := make([]string, len(cols))
	for i, c := range cols {
		headers[i] = c.name
		if err := sw.SetColWidth(i+1, i+1, c.width); err != nil {
			return err
		}
	}
	if err := sw.SetPanes(frozenHeader()); err != nil {
		return err
	}
	if err := sw.SetRow("A1", strs(headers), excelize.RowOpts{StyleID: x.st.head, Height: 30}); err != nil {
		return err
	}
	row := 2
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			vals := []interface{}{text(id.Name), typeLabel(id.Type), classWord(id.Human), text(accountLabel(id)), scoreCell(id.Score)}
			if o.IncludeSev {
				vals = append(vals, excelize.Cell{StyleID: x.st.sev[c.Severity], Value: SeverityLabel(c.Severity)})
			}
			vals = append(vals, text(c.Check), text(c.RuleID), text(c.Title), text(c.Found))
			if o.IncludeInfo {
				vals = append(vals, text(c.About))
			}
			if o.IncludeFix {
				vals = append(vals, text(c.Fix))
			}
			since := ""
			if c.FailingSince != nil {
				since = c.FailingSince.UTC().Format("2006-01-02")
			}
			vals = append(vals, AreaLabel(c.Area), since, text(id.ARN))
			if err := sw.SetRow(fmt.Sprintf("A%d", row), vals); err != nil {
				return err
			}
			row++
		}
	}
	if row > 2 {
		if err := sw.AddTable(&excelize.Table{Range: fmt.Sprintf("A1:%s%d", colName(len(headers)-1), row-1), Name: "FailingChecks", StyleName: "TableStyleLight9", ShowRowStripes: boolPtr(true)}); err != nil {
			return err
		}
	}
	return sw.Flush()
}

// ---- helpers -------------------------------------------------------------

func frozenHeader() *excelize.Panes {
	return &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft",
		Selection: []excelize.Selection{{SQRef: "A2", ActiveCell: "A2", Pane: "bottomLeft"}}}
}

func cellRef(col, row int) string { return fmt.Sprintf("%s%d", colName(col), row) }

// colName is the column letter for a zero-based index: 0 -> A, 26 -> AA.
func colName(i int) string {
	name, _ := excelize.ColumnNumberToName(i + 1)
	return name
}

func strs(v []string) []interface{} {
	out := make([]interface{}, len(v))
	for i, s := range v {
		out[i] = s
	}
	return out
}

func classWord(human bool) string {
	if human {
		return "Human"
	}
	return "Non-human"
}

// scoreCell is the rounded score as a number, so the column sorts; empty when unscored.
func scoreCell(v *float64) interface{} {
	if v == nil {
		return ""
	}
	return int(*v + 0.5)
}

// text keeps a value inside Excel's 32,767-character cell limit.
func text(s string) string {
	const max = 32000
	if len(s) > max {
		return strings.ToValidUTF8(s[:max], "") + "..."
	}
	return s
}

func boolPtr(b bool) *bool { return &b }

// avgCell is an average to one decimal, as a number; empty when none.
func avgCell(v *float64) interface{} {
	if v == nil {
		return ""
	}
	return round1(*v)
}

// share is a fraction written as an Excel percentage, so it sorts as a number.
type share float64

func shareOf(n, total int) share {
	if total == 0 {
		return 0
	}
	return share(float64(n) / float64(total))
}
