package reports

import (
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

// The front pages of every workbook (cover, dashboard, summary) are laid
// out on one canvas: a 2-wide gutter, twelve equal columns (B to M) and a
// gutter, with row and column headers hidden. They open on a navy band with
// the brand, then figure cards, then content. Raw chart data lives on a
// hidden sheet, so nothing on a front page is plumbing.

const (
	canvasFirst = 2  // column B
	canvasCols  = 12 // B..M
	chartData   = "Chart data"
)

// brandTheme replaces the default Office theme: the accents are the report's
// blue ramp (accent 1 to 4 run from darkest to lightest, the order severities
// and score bands are charted in, darker = worse) and the theme font is
// Aptos, the Microsoft 365 default. Charts that colour by point (doughnuts)
// and anything theme-aware then match the PDF.
func (x *wb) brandTheme() {
	v, ok := x.f.Pkg.Load("xl/theme/theme1.xml")
	if !ok {
		return
	}
	s := string(v.([]byte))
	for old, now := range map[string]string{
		`name="Office Theme"`:                                               `name="Deep Algorithms"`,
		`<a:clrScheme name="Office">`:                                       `<a:clrScheme name="Deep Algorithms">`,
		`<a:dk2><a:srgbClr val="44546A"/></a:dk2>`:                          `<a:dk2><a:srgbClr val="172554"/></a:dk2>`,
		`<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>`:                          `<a:lt2><a:srgbClr val="F5F5F5"/></a:lt2>`,
		`<a:accent1><a:srgbClr val="5B9BD5"/></a:accent1>`:                  `<a:accent1><a:srgbClr val="193CB8"/></a:accent1>`,
		`<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>`:                  `<a:accent2><a:srgbClr val="155DFC"/></a:accent2>`,
		`<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>`:                  `<a:accent3><a:srgbClr val="51A2FF"/></a:accent3>`,
		`<a:accent4><a:srgbClr val="FFC000"/></a:accent4>`:                  `<a:accent4><a:srgbClr val="BEDBFF"/></a:accent4>`,
		`<a:accent5><a:srgbClr val="4472C4"/></a:accent5>`:                  `<a:accent5><a:srgbClr val="1447E6"/></a:accent5>`,
		`<a:accent6><a:srgbClr val="70AD47"/></a:accent6>`:                  `<a:accent6><a:srgbClr val="8EC5FF"/></a:accent6>`,
		`<a:hlink><a:srgbClr val="0563C1"/></a:hlink>`:                      `<a:hlink><a:srgbClr val="155DFC"/></a:hlink>`,
		`<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>`: `<a:latin typeface="Aptos Display"/>`,
		`<a:latin typeface="Calibri" panose="020F0502020204030204"/>`:       `<a:latin typeface="Aptos"/>`,
	} {
		s = strings.Replace(s, old, now, 1)
	}
	x.f.Pkg.Store("xl/theme/theme1.xml", []byte(s))
	x.f.Theme = nil // keep the patched bytes: excelize re-serialises a decoded theme on save
}

// canvas sets up a front-page sheet: no gridlines, no headers, the grid.
func (x *wb) canvas(sh string) {
	f := x.f
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(false), ShowRowColHeaders: boolPtr(false), ZoomScale: fptr(100)})
	_ = f.SetColWidth(sh, "A", "A", 2.2)
	_ = f.SetColWidth(sh, "B", colLetter(canvasFirst+canvasCols-1), 12.6)
	_ = f.SetColWidth(sh, colLetter(canvasFirst+canvasCols), colLetter(canvasFirst+canvasCols), 2.2)
}

// span is the canvas range for columns from..to (0-based within B..M) on row r.
func span(r, from, to int) (string, string) {
	return fmt.Sprintf("%s%d", colLetter(canvasFirst+from), r), fmt.Sprintf("%s%d", colLetter(canvasFirst+to), r)
}

// put merges from..to on row r, writes v and styles the whole range.
func (x *wb) put(sh string, r, from, to int, v interface{}, style string) string {
	a, b := span(r, from, to)
	if from != to {
		_ = x.f.MergeCell(sh, a, b)
	}
	if v != nil {
		_ = x.f.SetCellValue(sh, a, v)
	}
	_ = x.f.SetCellStyle(sh, a, b, x.st[style])
	return a
}

// band paints rows from..to navy across the whole canvas, gutters included.
func (x *wb) band(sh string, from, to int) {
	last := colLetter(canvasFirst + canvasCols)
	_ = x.f.SetCellStyle(sh, fmt.Sprintf("A%d", from), fmt.Sprintf("%s%d", last, to), x.st["band"])
}

// header is the navy band at the top of a front page: logo and
// classification, the two brand lines (cover only), the page's title and a
// line under it. It returns the first row after the band.
func (x *wb) header(sh, title, sub string, brand bool) int {
	f := x.f
	heights := map[int]float64{1: 8, 2: 30, 3: 10}
	r := 4
	if brand {
		heights[4], heights[5], heights[6] = 34, 22, 20
		r = 7
	}
	heights[r], heights[r+1], heights[r+2] = 24, 18, 14
	for row, h := range heights {
		_ = f.SetRowHeight(sh, row, h)
	}
	x.band(sh, 1, r+2)
	_ = f.AddPictureFromBytes(sh, "B2", &excelize.Picture{Extension: ".png", File: logoInversePNG, Format: &excelize.GraphicOptions{ScaleX: 0.19, ScaleY: 0.19, OffsetY: 4, AltText: "Deep Algorithms", LockAspectRatio: true, Locked: boolPtr(true)}})
	x.put(sh, 2, 7, 11, "CONFIDENTIAL  ·  INTERNAL USE ONLY", "bandConf")
	if brand {
		x.put(sh, 4, 0, 11, BrandTitle, "bandTitle")
		x.put(sh, 5, 0, 11, BrandTagline, "bandTag")
	}
	x.put(sh, r, 0, 11, title, "bandSub")
	x.put(sh, r+1, 0, 11, sub, "bandMeta")
	return r + 4
}

// section writes a section title and its caption on rows r and r+1 over
// columns from..to, and returns the row after.
func (x *wb) section(sh string, r, from, to int, title, caption string) int {
	_ = x.f.SetRowHeight(sh, r, 22)
	x.put(sh, r, from, to, title, "sec")
	if caption != "" {
		x.put(sh, r+1, from, to, caption, "secCap")
		return r + 2
	}
	return r + 1
}

// tile is one figure card: a label, the figure, and a line of context.
type tile struct {
	label string
	value interface{}
	kind  string // "int", "dec" or "text"
	sub   string
	trend int // +1 good, -1 bad, 0 neutral: colours the context line
}

// tiles writes figure cards across the canvas on rows r..r+2, each width
// columns wide, and returns the row after a gap.
func (x *wb) tiles(sh string, r, width int, list []tile) int {
	f := x.f
	_ = f.SetRowHeight(sh, r, 20)
	_ = f.SetRowHeight(sh, r+1, 34)
	_ = f.SetRowHeight(sh, r+2, 20)
	for i, t := range list {
		from, to := i*width, i*width+width-1
		if to >= canvasCols {
			break
		}
		x.put(sh, r, from, to, t.label, "tileLabel")
		vs := map[string]string{"int": "tileInt", "dec": "tileDec", "text": "tileText"}[t.kind]
		x.put(sh, r+1, from, to, t.value, vs)
		ss := "tileSub"
		if t.trend > 0 {
			ss = "tileSubUp"
		} else if t.trend < 0 {
			ss = "tileSubDown"
		}
		x.put(sh, r+2, from, to, t.sub, ss)
	}
	return r + 4
}

// navRow writes one contents entry: the sheet's name, what it holds and an
// "Open →" link, all of it clickable, over columns from..to.
func (x *wb) navRow(sh string, r, from, to int, name, about string) {
	f := x.f
	_ = f.SetRowHeight(sh, r, 24)
	a := x.put(sh, r, from, from+1, name, "navName")
	d := x.put(sh, r, from+2, to-1, about, "navDesc")
	g := x.put(sh, r, to, to, "Open  →", "navGo")
	_ = d
	for _, c := range []string{a, g} {
		_ = f.SetCellHyperLink(sh, c, fmt.Sprintf("'%s'!A1", name), "Location", excelize.HyperlinkOpts{Tooltip: strPtr("Go to " + name)})
	}
}

// chartSheet returns the hidden sheet that holds chart data, creating it.
func (x *wb) chartSheet() string {
	if i, _ := x.f.GetSheetIndex(chartData); i < 0 {
		_, _ = x.f.NewSheet(chartData)
		_ = x.f.SetSheetVisible(chartData, false)
	}
	return chartData
}

// chartRows writes a block of label/value rows to the chart sheet at column
// col from row 1 (a header, then rows) and returns the categories and values
// ranges.
func (x *wb) chartRows(col int, head string, labels []string, values [][]float64, names []string) (string, []string) {
	sh := x.chartSheet()
	c0 := colLetter(col)
	_ = x.f.SetCellValue(sh, c0+"1", head)
	for i, l := range labels {
		_ = x.f.SetCellValue(sh, fmt.Sprintf("%s%d", c0, i+2), l)
	}
	var ranges []string
	for s, vals := range values {
		c := colLetter(col + 1 + s)
		_ = x.f.SetCellValue(sh, c+"1", names[s])
		for i, v := range vals {
			_ = x.f.SetCellValue(sh, fmt.Sprintf("%s%d", c, i+2), v)
		}
		ranges = append(ranges, fmt.Sprintf("'%s'!$%s$2:$%s$%d", sh, c, c, len(vals)+1))
	}
	return fmt.Sprintf("'%s'!$%s$2:$%s$%d", sh, c0, c0, len(labels)+1), ranges
}

// chartFont is the muted axis and legend type of every chart.
var chartFont = excelize.Font{Family: xFont, Size: 9, Color: xInk3}

// cleanChart applies the shared look to a chart: no border, no title (the
// sheet's section title names it), muted type.
func cleanChart(c *excelize.Chart) *excelize.Chart {
	c.Border = excelize.ChartLine{Type: excelize.ChartLineNone}
	c.XAxis.Font = chartFont
	c.YAxis.Font = chartFont
	return c
}

// tabColors colours the sheet tabs by role: front pages navy, data sheets
// blue, reference sheets grey.
func (x *wb) tabColors() {
	for _, sh := range x.f.GetSheetList() {
		c := "155DFC"
		switch sh {
		case "Cover", "Dashboard", "Summary", "Pivot":
			c = "172554"
		case "Data dictionary", "Method", chartData:
			c = "A3A3A3"
		}
		_ = x.f.SetSheetProps(sh, &excelize.SheetPropsOptions{TabColorRGB: strPtr(c)})
	}
}
func uintPtr(u uint) *uint { return &u }
