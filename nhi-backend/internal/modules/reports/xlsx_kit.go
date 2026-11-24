package reports

import (
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// wb is one workbook being written, with what every design shares: a cover
// with document control and a linked contents list, data sheets as real
// Excel tables (typed cells, filters, frozen header, print titles), the same
// header and footer on every printed page, and a data dictionary.
type wb struct {
	f    *excelize.File
	rep  *PostureReport
	st   map[string]int
	sev  map[string]int // severity cell style, by severity
	dict [][4]string    // sheet, column, meaning, format
}

// Column kinds: how a value is typed and formatted.
const (
	kText = iota
	kWrap
	kMono
	kInt
	kDec1
	kPct
	kDate
	kSev
	kBold
)

// xcol is one column of a data sheet.
type xcol struct {
	name    string
	width   float64
	kind    int
	meaning string // for the data dictionary
}

func newWB(rep *PostureReport) (*wb, error) {
	x := &wb{f: excelize.NewFile(), rep: rep, st: map[string]int{}, sev: map[string]int{}}
	if err := x.styles(); err != nil {
		return nil, err
	}
	return x, nil
}

const (
	xFont   = "Aptos" // Microsoft 365 default; older Office substitutes its own
	xInk    = "0A0A0A"
	xInk2   = "404040"
	xInk3   = "737373"
	xLine   = "E5E5E5"
	xPanel  = "FAFAFA"
	xBrand  = "155DFC"
	xDeep   = "172554"
	xBrandS = "EFF6FF"
)

// Severity as the PDF's badges: destructive for critical, solid for high,
// muted for medium, plain for low. Charts use the blue ramp, darker = worse.
var xSevInk = map[string]string{"critical": "E7000B", "high": "FFFFFF", "medium": "171717", "low": "171717"}
var xSevSoft = map[string]string{"critical": "FEF2F2", "high": "171717", "medium": "F5F5F5", "low": "FFFFFF"}
var xSevFill = map[string]string{"critical": "193CB8", "high": "155DFC", "medium": "51A2FF", "low": "BEDBFF"}

const xGood = "BEDBFF" // healthy score band: the lightest blue

func (x *wb) styles() error {
	var err error
	mk := func(name string, s *excelize.Style) {
		if err != nil {
			return
		}
		x.st[name], err = x.f.NewStyle(s)
	}
	font := func(size float64, bold bool, color string) *excelize.Font {
		return &excelize.Font{Family: xFont, Size: size, Bold: bold, Color: color}
	}
	top := &excelize.Alignment{Vertical: "top"}
	topWrap := &excelize.Alignment{Vertical: "top", WrapText: true}
	solid := func(c string) excelize.Fill { return excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{c}} }
	mk("brand", &excelize.Style{Font: font(20, true, xDeep), Alignment: &excelize.Alignment{Vertical: "center"}})
	mk("tagline", &excelize.Style{Font: font(12, true, xBrand)})
	mk("title", &excelize.Style{Font: font(14, true, xInk)})
	mk("sub", &excelize.Style{Font: font(10, false, xInk3)})
	mk("h", &excelize.Style{Font: font(12, true, xInk), Border: []excelize.Border{{Type: "bottom", Color: xBrand, Style: 2}}})
	mk("k", &excelize.Style{Font: font(10, true, xInk3), Alignment: top})
	mk("v", &excelize.Style{Font: font(10.5, false, xInk), Alignment: topWrap})
	mk("vmono", &excelize.Style{Font: &excelize.Font{Family: "Consolas", Size: 10, Color: xInk}, Alignment: top})
	mk("link", &excelize.Style{Font: &excelize.Font{Family: xFont, Size: 10.5, Color: xBrand, Underline: "single"}, Alignment: top})
	mk("note", &excelize.Style{Font: &excelize.Font{Family: xFont, Size: 9.5, Italic: true, Color: xInk3}, Alignment: topWrap})
	mk("banner", &excelize.Style{Font: font(9, true, "E7000B"), Fill: solid("FEF2F2"), Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"}})
	mk("head", &excelize.Style{Font: font(10, true, xInk2), Fill: solid("F5F5F5"), Border: []excelize.Border{{Type: "bottom", Color: xLine, Style: 1}}, Alignment: &excelize.Alignment{Vertical: "center", WrapText: true}})
	mk("text", &excelize.Style{Font: font(10.5, false, xInk), Alignment: top})
	mk("wrap", &excelize.Style{Font: font(10.5, false, xInk2), Alignment: topWrap})
	mk("mono", &excelize.Style{Font: &excelize.Font{Family: "Consolas", Size: 9.5, Color: xInk2}, Alignment: top})
	mk("bold", &excelize.Style{Font: font(10.5, true, xInk), Alignment: top})
	mk("int", &excelize.Style{Font: font(10.5, false, xInk), NumFmt: 3, Alignment: top})
	mk("dec1", &excelize.Style{Font: font(10.5, true, xInk), CustomNumFmt: strPtr("0.0"), Alignment: top})
	mk("pct", &excelize.Style{Font: font(10.5, false, xInk), CustomNumFmt: strPtr("0.0%"), Alignment: top})
	mk("date", &excelize.Style{Font: font(10.5, false, xInk), CustomNumFmt: strPtr("yyyy-mm-dd"), Alignment: top})
	mk("kpiLabel", &excelize.Style{Font: font(9, true, xInk3), Fill: solid(xPanel), Alignment: &excelize.Alignment{Vertical: "bottom", Indent: 1}})
	mk("kpiValue", &excelize.Style{Font: font(22, true, xInk), Fill: solid(xPanel), CustomNumFmt: strPtr("#,##0.0;-#,##0.0;0"), Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1}})
	mk("kpiInt", &excelize.Style{Font: font(22, true, xInk), Fill: solid(xPanel), NumFmt: 3, Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1}})
	mk("kpiSub", &excelize.Style{Font: font(9, false, xInk3), Fill: solid(xPanel), Alignment: &excelize.Alignment{Vertical: "top", Indent: 1}})
	mk("input", &excelize.Style{Font: font(10.5, false, xInk), Fill: solid("FFFBEA"), Alignment: top, Border: []excelize.Border{{Type: "bottom", Color: "E6D48A", Style: 1}}})
	mk("inputDate", &excelize.Style{Font: font(10.5, false, xInk), Fill: solid("FFFBEA"), CustomNumFmt: strPtr("yyyy-mm-dd"), Alignment: top, Border: []excelize.Border{{Type: "bottom", Color: "E6D48A", Style: 1}}})
	// Front-page styles: the navy band, figure cards, sections, contents
	// rows and the document-control panel.
	navy := solid(xDeep)
	mk("band", &excelize.Style{Fill: navy})
	mk("bandTitle", &excelize.Style{Font: font(24, true, "FFFFFF"), Fill: navy, Alignment: &excelize.Alignment{Vertical: "center"}})
	mk("bandTag", &excelize.Style{Font: font(12, false, "BEDBFF"), Fill: navy, Alignment: &excelize.Alignment{Vertical: "top"}})
	mk("bandSub", &excelize.Style{Font: font(14, true, "FFFFFF"), Fill: navy, Alignment: &excelize.Alignment{Vertical: "bottom"}})
	mk("bandMeta", &excelize.Style{Font: font(10, false, "CBD5E1"), Fill: navy, Alignment: &excelize.Alignment{Vertical: "top"}})
	mk("bandConf", &excelize.Style{Font: font(8, true, "94A3B8"), Fill: navy, Alignment: &excelize.Alignment{Horizontal: "right", Vertical: "center"}})
	gap := []excelize.Border{{Type: "left", Color: "FFFFFF", Style: 5}, {Type: "right", Color: "FFFFFF", Style: 5}}
	card := solid("F5F7FA")
	mk("tileLabel", &excelize.Style{Font: font(9, false, xInk3), Fill: card, Border: gap, Alignment: &excelize.Alignment{Vertical: "bottom", Indent: 1}})
	mk("tileInt", &excelize.Style{Font: font(22, true, xInk), Fill: card, Border: gap, NumFmt: 3, Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1}})
	mk("tileDec", &excelize.Style{Font: font(22, true, xInk), Fill: card, Border: gap, CustomNumFmt: strPtr("0.0"), Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1}})
	mk("tileText", &excelize.Style{Font: font(22, true, xInk), Fill: card, Border: gap, Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1}})
	mk("tileSub", &excelize.Style{Font: font(9, false, xInk3), Fill: card, Border: gap, Alignment: &excelize.Alignment{Vertical: "top", Indent: 1}})
	mk("tileSubUp", &excelize.Style{Font: font(9, true, "008236"), Fill: card, Border: gap, Alignment: &excelize.Alignment{Vertical: "top", Indent: 1}})
	mk("tileSubDown", &excelize.Style{Font: font(9, true, "E7000B"), Fill: card, Border: gap, Alignment: &excelize.Alignment{Vertical: "top", Indent: 1}})
	mk("sec", &excelize.Style{Font: font(13, true, xInk), Alignment: &excelize.Alignment{Vertical: "bottom"}})
	mk("secCap", &excelize.Style{Font: font(9.5, false, xInk3), Alignment: &excelize.Alignment{Vertical: "top"}})
	rule := []excelize.Border{{Type: "bottom", Color: xLine, Style: 1}}
	mk("navName", &excelize.Style{Font: font(11, true, xInk), Border: rule, Alignment: &excelize.Alignment{Vertical: "center"}})
	mk("navDesc", &excelize.Style{Font: font(9.5, false, xInk3), Border: rule, Alignment: &excelize.Alignment{Vertical: "center", WrapText: true}})
	mk("navGo", &excelize.Style{Font: font(10, true, xBrand), Border: rule, Alignment: &excelize.Alignment{Horizontal: "right", Vertical: "center"}})
	panel := solid("F5F7FA")
	prule := []excelize.Border{{Type: "bottom", Color: "FFFFFF", Style: 2}}
	mk("dcLabel", &excelize.Style{Font: font(9, false, xInk3), Fill: panel, Border: prule, Alignment: &excelize.Alignment{Vertical: "center", Indent: 1}})
	mk("dcValue", &excelize.Style{Font: font(10, false, xInk), Fill: panel, Border: prule, Alignment: &excelize.Alignment{Vertical: "center", Indent: 1}})
	mk("dcMono", &excelize.Style{Font: &excelize.Font{Family: "Consolas", Size: 9.5, Color: xInk}, Fill: panel, Border: prule, Alignment: &excelize.Alignment{Vertical: "center", Indent: 1}})
	mk("foot", &excelize.Style{Font: &excelize.Font{Family: xFont, Size: 8.5, Color: xInk3}, Alignment: &excelize.Alignment{Vertical: "top", WrapText: true}})
	for _, s := range Severities {
		if err != nil {
			break
		}
		x.sev[s], err = x.f.NewStyle(&excelize.Style{Font: font(10.5, true, xSevInk[s]), Fill: solid(xSevSoft[s]), Alignment: top})
	}
	if err == nil {
		x.sev[""], err = x.f.NewStyle(&excelize.Style{Font: font(10.5, false, xInk3), Alignment: top})
	}
	return err
}

func strPtr(s string) *string { return &s }

// excelDay is a UTC day as an Excel date serial: written as a number in a
// date-formatted column, it is a real date to Excel without excelize making
// a style per cell.
func excelDay(t time.Time) float64 {
	d := t.UTC().Truncate(24 * time.Hour)
	return d.Sub(time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)).Hours() / 24
}

// cleanCell keeps text safe to show: no control characters, within Excel's
// cell limit. Cells are written as values, never formulas, so text starting
// with = + - @ stays text.
func cleanCell(s string) string {
	s = clean(s)
	if len(s) > 32000 {
		s = s[:32000] + "…"
	}
	return s
}

// value types v for its column kind and returns the cell to stream.
func (x *wb) value(kind int, v interface{}) excelize.Cell {
	switch kind {
	case kWrap:
		return excelize.Cell{StyleID: x.st["wrap"], Value: nilOr(v)}
	case kMono:
		return excelize.Cell{StyleID: x.st["mono"], Value: nilOr(v)}
	case kBold:
		return excelize.Cell{StyleID: x.st["bold"], Value: nilOr(v)}
	case kInt:
		if v == nil || v == "" {
			return excelize.Cell{StyleID: x.st["int"], Value: nil}
		}
		return excelize.Cell{StyleID: x.st["int"], Value: v}
	case kDec1:
		if v == nil {
			return excelize.Cell{StyleID: x.st["dec1"], Value: nil}
		}
		if f, ok := v.(*float64); ok {
			if f == nil {
				return excelize.Cell{StyleID: x.st["dec1"], Value: nil}
			}
			return excelize.Cell{StyleID: x.st["dec1"], Value: round1(*f)}
		}
		return excelize.Cell{StyleID: x.st["dec1"], Value: v}
	case kPct:
		return excelize.Cell{StyleID: x.st["pct"], Value: v}
	case kDate:
		if v == nil {
			return excelize.Cell{StyleID: x.st["date"], Value: nil}
		}
		if t, ok := v.(*time.Time); ok {
			if t == nil {
				return excelize.Cell{StyleID: x.st["date"], Value: nil}
			}
			return excelize.Cell{StyleID: x.st["date"], Value: excelDay(*t)}
		}
		if t, ok := v.(time.Time); ok {
			return excelize.Cell{StyleID: x.st["date"], Value: excelDay(t)}
		}
		return excelize.Cell{StyleID: x.st["date"], Value: v}
	case kSev:
		s, _ := v.(string)
		if v == nil {
			return excelize.Cell{StyleID: x.st["text"], Value: nil}
		}
		return excelize.Cell{StyleID: x.sev[s], Value: SeverityLabel(s)}
	}
	if v == nil {
		return excelize.Cell{StyleID: x.st["text"], Value: nil}
	}
	return excelize.Cell{StyleID: x.st["text"], Value: cleanStr(v)}
}

func nilOr(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	return cleanStr(v)
}

func cleanStr(v interface{}) string {
	switch t := v.(type) {
	case string:
		return cleanCell(t)
	case nil:
		return ""
	}
	return cleanCell(fmt.Sprint(v))
}

// dataSheet writes rows into a new sheet as an Excel table named table, with
// a frozen header, print titles and the page header and footer. It uses the
// regular cell API, not the stream writer: formats, validation and print
// settings added to a streamed sheet are lost when the file is saved.
func (x *wb) dataSheet(sheet, table, style string, cols []xcol, rows func(emit func([]interface{}) error) error) (int, error) {
	f := x.f
	if _, err := f.NewSheet(sheet); err != nil {
		return 0, err
	}
	var sevCols []int
	for i, c := range cols {
		col := colLetter(i + 1)
		if err := f.SetColWidth(sheet, col, col, c.width); err != nil {
			return 0, err
		}
		if err := f.SetColStyle(sheet, col, x.value(c.kind, nil).StyleID); err != nil {
			return 0, err
		}
		if c.kind == kSev {
			sevCols = append(sevCols, i)
		}
		x.dict = append(x.dict, [4]string{sheet, c.name, c.meaning, kindName(c.kind)})
	}
	head := make([]interface{}, len(cols))
	for i, c := range cols {
		head[i] = c.name
	}
	if err := f.SetSheetRow(sheet, "A1", &head); err != nil {
		return 0, err
	}
	_ = f.SetCellStyle(sheet, "A1", colLetter(len(cols))+"1", x.st["head"])
	_ = f.SetRowHeight(sheet, 1, 30)
	n := 0
	err := rows(func(vals []interface{}) error {
		n++
		row := make([]interface{}, len(cols))
		for i, c := range cols {
			var v interface{}
			if i < len(vals) {
				v = vals[i]
			}
			row[i] = x.value(c.kind, v).Value
		}
		cell, _ := excelize.CoordinatesToCellName(1, n+1)
		if err := f.SetSheetRow(sheet, cell, &row); err != nil {
			return err
		}
		for _, i := range sevCols {
			s, _ := vals[i].(string)
			c, _ := excelize.CoordinatesToCellName(i+1, n+1)
			_ = f.SetCellStyle(sheet, c, c, x.sev[s])
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	last, _ := excelize.CoordinatesToCellName(len(cols), max(n, 1)+1)
	if style == "" {
		style = "TableStyleLight1"
	}
	if err := f.AddTable(sheet, &excelize.Table{Range: "A1:" + last, Name: table, StyleName: style, ShowRowStripes: boolPtr(true)}); err != nil {
		return 0, err
	}
	if err := f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"}); err != nil {
		return 0, err
	}
	x.printSetup(sheet, true)
	return n, nil
}

func kindName(k int) string {
	switch k {
	case kInt:
		return "Whole number"
	case kDec1:
		return "Number, one decimal"
	case kPct:
		return "Percentage"
	case kDate:
		return "Date (yyyy-mm-dd, UTC)"
	case kSev:
		return "Critical, High, Medium or Low"
	case kMono:
		return "Identifier (text)"
	}
	return "Text"
}

// printSetup makes a sheet print well: landscape, one page wide, the header
// row on every page, the classification and page numbers on every page.
func (x *wb) printSetup(sheet string, titles bool) {
	f := x.f
	land, one, zero := "landscape", 1, 0
	tall := &zero
	if !titles {
		tall = &one // cover, dashboards, method: one page
	}
	_ = f.SetPageLayout(sheet, &excelize.PageLayoutOptions{Orientation: &land, FitToWidth: &one, FitToHeight: tall, Size: intPtr(9)})
	_ = f.SetSheetProps(sheet, &excelize.SheetPropsOptions{FitToPage: boolPtr(true)})
	_ = f.SetPageMargins(sheet, &excelize.PageLayoutMarginsOptions{Left: fptr(0.4), Right: fptr(0.4), Top: fptr(0.6), Bottom: fptr(0.6), Header: fptr(0.25), Footer: fptr(0.25)})
	_ = f.SetHeaderFooter(sheet, &excelize.HeaderFooterOptions{
		OddHeader: "&L&8" + hfEscape(ReportTitle) + "&C&8&\"-,Bold\"CONFIDENTIAL · INTERNAL USE ONLY&R&8" + hfEscape(orDash(x.rep.PreparedFor)),
		OddFooter: "&L&8" + hfEscape(x.rep.ID()) + "&C&8&A&R&8Page &P of &N",
	})
	if titles {
		_ = f.SetDefinedName(&excelize.DefinedName{Name: "_xlnm.Print_Titles", RefersTo: fmt.Sprintf("'%s'!$1:$1", sheet), Scope: sheet})
	}
}

func hfEscape(s string) string { return strings.ReplaceAll(s, "&", "&&") }
func intPtr(i int) *int        { return &i }
func fptr(f float64) *float64  { return &f }

// sheetInfo is one entry of the cover's contents.
type sheetInfo struct{ name, about string }

// cover writes the first sheet: brand, title, document control, scope and
// the contents with a link to each sheet.
func (x *wb) cover(title string, sheets []sheetInfo, extra func(row int) int) error {
	f, rep := x.f, x.rep
	sh := "Cover"
	if err := f.SetSheetName("Sheet1", sh); err != nil {
		return err
	}
	x.brandTheme()
	x.canvas(sh)
	meta := "Prepared for " + orDash(rep.PreparedFor) + "  ·  " + rep.ScopeLabel() + "  ·  " + rep.GeneratedAt.UTC().Format("2 January 2006")
	if rep.Sample {
		meta += "  ·  sample data"
	}
	r := x.header(sh, title, meta, true)

	// At a glance.
	r = x.section(sh, r, 0, 11, "At a glance", "Where things stand at the last posture scan.")
	_ = f.SetRowHeight(sh, r, 6)
	r++
	overdue := 0
	for _, n := range rep.Overdue() {
		overdue += n
	}
	score, sub, trend := interface{}("-"), "not scored yet", 0
	if rep.AverageScore != nil {
		score = round1(*rep.AverageScore)
		sub = bandLabel(bandFor(*rep.AverageScore)) + " band"
		if c := rep.Change30d; c != nil {
			sub += ",  " + map[bool]string{true: "↗ ", false: "↘ "}[*c >= 0] + changeText(c) + " in 30 days"
			trend = map[bool]int{true: 1, false: -1}[*c >= 0]
		}
	}
	r = x.tiles(sh, r, 3, []tile{
		{"Average security score", score, "dec", sub, trend},
		{"Identities with failing checks", rep.FailingCount, "int", pct(rep.FailingCount, rep.ScoredCount) + " of " + num(rep.ScoredCount) + " scored", 0},
		{"Critical and high findings open", rep.BySeverity["critical"] + rep.BySeverity["high"], "int", "of " + num(rep.CheckCount) + " open findings", 0},
		{"Past remediation target", overdue, "int", pct(overdue, rep.CheckCount) + " of open findings", map[bool]int{true: -1, false: 0}[overdue > 0]},
	})

	// Contents on the left, document control on the right.
	top := r
	r = x.section(sh, r, 0, 6, "In this workbook", "Select a sheet name or Open to go there.")
	for _, s := range sheets {
		x.navRow(sh, r, 0, 6, s.name, s.about)
		r++
	}
	dr := x.section(sh, top, 8, 11, "Document control", "")
	_ = f.SetRowHeight(sh, dr, 14)
	dr++
	for _, kv := range append(controlLines(rep), scopeLines(rep)...) {
		_ = f.SetRowHeight(sh, dr, 24)
		x.put(sh, dr, 8, 8, kv[0], "dcLabel")
		style := "dcValue"
		if kv[0] == "Report ID" {
			style = "dcMono"
		}
		x.put(sh, dr, 9, 11, kv[1], style)
		dr++
	}
	if dr > r {
		r = dr
	}
	if extra != nil {
		r = extra(r + 1)
	}
	r++
	_ = f.SetRowHeight(sh, r, 30)
	x.put(sh, r, 0, 11, "This workbook holds security-sensitive information about your cloud identities. Share it only with people who need it. Figures are values, not formulas, except on sheets that say they calculate.", "foot")
	_ = f.SetCellValue(sh, "A1", "")
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{TopLeftCell: strPtr("A1")})
	x.printSetup(sh, false)
	return nil
}

func (x *wb) dictionary() error {
	rows := x.dict
	_, err := x.dataSheet("Data dictionary", "Dictionary", "TableStyleLight1", []xcol{
		{"Sheet", 22, kBold, "The sheet the column is on."},
		{"Column", 26, kText, "The column header."},
		{"Meaning", 80, kWrap, "What the column holds."},
		{"Format", 26, kText, "How values are written."},
	}, func(emit func([]interface{}) error) error {
		for _, d := range rows {
			if err := emit([]interface{}{d[0], d[1], d[2], d[3]}); err != nil {
				return err
			}
		}
		return nil
	})
	return err
}

// finish sets the document properties and writes nothing else.
func (x *wb) finish(title string) {
	rep := x.rep
	_ = x.f.SetDocProps(&excelize.DocProperties{
		Title: title + " · " + rep.ScopeLabel(), Subject: BrandTitle, Creator: "Deep Algorithms NHI Console",
		Keywords: "identity security posture; NHI; ISPM; " + rep.ID(), Description: BrandTagline,
		Category: Classification, Identifier: rep.ID(), ContentStatus: "Final", Language: "en-GB",
		Created: rep.GeneratedAt.UTC().Format(time.RFC3339), Modified: rep.GeneratedAt.UTC().Format(time.RFC3339),
	})
	x.tabColors()
	x.f.SetActiveSheet(0)
}

// colLetter is a 1-based column number as letters.
func colLetter(n int) string {
	s, _ := excelize.ColumnNumberToName(n)
	return s
}

// severityFormats colours a column's severity words by conditional format
// as well, so sorting and filtering keep the colour.
func (x *wb) kpi(sheet, cell, label string, value interface{}, sub string, intVal bool) {
	f := x.f
	col, row, _ := excelize.SplitCellName(cell)
	_ = f.SetCellValue(sheet, cell, label)
	_ = f.SetCellStyle(sheet, cell, cell, x.st["kpiLabel"])
	v := fmt.Sprintf("%s%d", col, row+1)
	_ = f.SetCellValue(sheet, v, value)
	if intVal {
		_ = f.SetCellStyle(sheet, v, v, x.st["kpiInt"])
	} else {
		_ = f.SetCellStyle(sheet, v, v, x.st["kpiValue"])
	}
	s := fmt.Sprintf("%s%d", col, row+2)
	_ = f.SetCellValue(sheet, s, sub)
	_ = f.SetCellStyle(sheet, s, s, x.st["kpiSub"])
}
