package reports

import (
	"bytes"
	_ "embed"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
)

// Fonts and the logo travel inside the binary. Inter and JetBrains Mono are
// embedded (subset) in every PDF, so names in any Latin, Greek or Cyrillic
// script print as they are, on any reader, and the report looks like the
// console it came from.
var (
	//go:embed assets/Inter-Regular.ttf
	fontRegular []byte
	//go:embed assets/Inter-Medium.ttf
	fontMedium []byte
	//go:embed assets/Inter-SemiBold.ttf
	fontSemi []byte
	//go:embed assets/Inter-Bold.ttf
	fontBold []byte
	//go:embed assets/JetBrainsMono-Regular.ttf
	fontMono []byte
	//go:embed assets/logo.png
	logoPNG []byte
	//go:embed assets/logo-inverse.png
	logoInversePNG []byte
)

// Font faces.
const (
	fReg  = "inter"
	fMed  = "inter-md"
	fSemi = "inter-sb"
	fBold = "inter-bd"
	fMono = "mono"
)

type rgb = [3]int

// Palette: the console's tokens. Severity is never shown by colour alone:
// every coloured mark carries its word.
var (
	cBrand     = rgb{29, 99, 237}
	cBrandDeep = rgb{11, 26, 51}
	cBrandSoft = rgb{232, 239, 253}
	cInk       = rgb{23, 23, 23}
	cInk2      = rgb{64, 64, 72}
	cInk3      = rgb{113, 113, 122}
	cLine      = rgb{228, 228, 231}
	cPanel     = rgb{248, 249, 251}
	cWhite     = rgb{255, 255, 255}
	cSev       = map[string]rgb{"critical": {180, 35, 24}, "high": {181, 74, 7}, "medium": {143, 95, 2}, "low": {5, 115, 75}, "": {113, 113, 122}}
	// Fills for bars and marks: brighter than the text colours and spaced in
	// lightness, so the four severities stay apart in grey and for colour-blind
	// readers; text always uses cSev on white.
	cSevFill  = map[string]rgb{"critical": {196, 32, 32}, "high": {234, 106, 24}, "medium": {226, 172, 28}, "low": {46, 150, 100}, "": {161, 161, 170}}
	cSevSoft  = map[string]rgb{"critical": {253, 236, 234}, "high": {254, 240, 228}, "medium": {253, 246, 225}, "low": {231, 246, 239}, "": {241, 241, 243}}
	cBand     = map[string]rgb{"critical": {180, 35, 24}, "poor": {181, 74, 7}, "fair": {143, 95, 2}, "healthy": {5, 115, 75}}
	cBandFill = map[string]rgb{"critical": {196, 32, 32}, "poor": {234, 106, 24}, "fair": {226, 172, 28}, "healthy": {46, 150, 100}}
)

// kit is one PDF being laid out, with what every design shares: the fonts,
// the page frame, tables that carry their header over page breaks, and page
// numbers found in a first pass and printed in the second.
type kit struct {
	pdf    *fpdf.Fpdf
	rep    *PostureReport
	W, H   float64        // page size
	mx     float64        // side margin
	top    float64        // where the body starts under the page header
	bottom float64        // reserved for the footer
	body   float64        // body width
	known  map[string]int // pages from the first pass; nil during it
	pages  map[string]int // pages in this pass
	links  map[string]int
}

func newKit(rep *PostureReport, orientation string, mx, top, bottom float64, known map[string]int) *kit {
	pdf := fpdf.New(orientation, "mm", "A4", "")
	w, h := pdf.GetPageSize()
	k := &kit{pdf: pdf, rep: rep, W: w, H: h, mx: mx, top: top, bottom: bottom, body: w - 2*mx, known: known, pages: map[string]int{}, links: map[string]int{}}
	pdf.AddUTF8FontFromBytes(fReg, "", fontRegular)
	pdf.AddUTF8FontFromBytes(fMed, "", fontMedium)
	pdf.AddUTF8FontFromBytes(fSemi, "", fontSemi)
	pdf.AddUTF8FontFromBytes(fBold, "", fontBold)
	pdf.AddUTF8FontFromBytes(fMono, "", fontMono)
	pdf.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(logoPNG))
	pdf.RegisterImageOptionsReader("logo-inv", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(logoInversePNG))
	pdf.SetMargins(mx, top, mx)
	pdf.SetAutoPageBreak(true, bottom)
	pdf.SetCellMargin(0)
	pdf.AliasNbPages("{nb}")

	// Document properties readers and search tools use.
	pdf.SetTitle(ReportTitle+" · "+rep.ScopeLabel(), true)
	pdf.SetSubject(BrandTitle, true)
	pdf.SetAuthor(orDash(rep.PreparedFor)+" · Deep Algorithms", true)
	pdf.SetCreator("Deep Algorithms NHI Console", true)
	pdf.SetProducer("Deep Algorithms report service", true)
	pdf.SetKeywords("identity security posture; non-human identities; NHI; ISPM; "+rep.ID(), true)
	pdf.SetLang("en-GB")
	pdf.SetCreationDate(rep.GeneratedAt)
	return k
}

// twoPass lays a document out twice: the first pass learns where marked
// parts land, the second prints those page numbers.
func twoPass(w io.Writer, build func(known map[string]int) *kit) error {
	first := build(nil)
	if err := first.pdf.Error(); err != nil {
		return err
	}
	final := build(first.pages)
	if err := final.pdf.Error(); err != nil {
		return err
	}
	return final.pdf.Output(w)
}

// ---- marks, links and page numbers ----------------------------------------

func (k *kit) link(key string) int {
	if l, ok := k.links[key]; ok {
		return l
	}
	l := k.pdf.AddLink()
	k.links[key] = l
	return l
}

// mark records that key starts here, and points its link at this spot.
func (k *kit) mark(key string) {
	k.pages[key] = k.pdf.PageNo()
	k.pdf.SetLink(k.link(key), k.pdf.GetY(), -1)
}

// pageOf is where key landed in the first pass, as text.
func (k *kit) pageOf(key string) string {
	if k.known == nil {
		return "00"
	}
	return strconv.Itoa(k.known[key])
}

// ---- text -----------------------------------------------------------------

func (k *kit) font(face string, size float64, c rgb) {
	k.pdf.SetFont(face, "", size)
	k.pdf.SetTextColor(c[0], c[1], c[2])
}

func (k *kit) fill(c rgb) { k.pdf.SetFillColor(c[0], c[1], c[2]) }
func (k *kit) draw(c rgb) { k.pdf.SetDrawColor(c[0], c[1], c[2]) }

func (k *kit) width(s string) float64 { return k.pdf.GetStringWidth(s) }

// at writes one line at (x, y) in a box w wide: align L, C or R.
// It never starts a new page: callers place it, and check room first.
func (k *kit) at(x, y, w, h float64, s, align string) {
	k.pdf.SetAutoPageBreak(false, k.bottom)
	k.pdf.SetXY(x, y)
	k.pdf.CellFormat(w, h, k.fit(s, w), "", 0, align, false, 0, "")
	k.pdf.SetAutoPageBreak(true, k.bottom)
}

// fit shortens s with an ellipsis until it fits w in the current font.
func (k *kit) fit(s string, w float64) string {
	s = clean(s)
	if w <= 0 || k.width(s) <= w {
		return s
	}
	r := []rune(s)
	for len(r) > 0 && k.width(string(r)+"…") > w {
		r = r[:len(r)-1]
	}
	return strings.TrimRight(string(r), " ") + "…"
}

// wrap breaks s into lines no wider than w in the current font; max > 0
// keeps that many lines and ends the last with an ellipsis.
func (k *kit) wrap(s string, w float64, max int) []string {
	s = clean(s)
	if s == "" {
		return []string{""}
	}
	var lines []string
	for _, para := range strings.Split(s, "\n") {
		words := strings.Fields(para)
		line := ""
		for _, word := range words {
			// A word wider than the line (an ARN) is broken by characters.
			for k.width(word) > w {
				r := []rune(word)
				n := len(r)
				for n > 1 && k.width(string(r[:n])) > w {
					n--
				}
				if line != "" {
					lines = append(lines, line)
					line = ""
				}
				lines = append(lines, string(r[:n]))
				word = string(r[n:])
			}
			try := word
			if line != "" {
				try = line + " " + word
			}
			if k.width(try) <= w {
				line = try
				continue
			}
			lines = append(lines, line)
			line = word
		}
		lines = append(lines, line)
	}
	if max > 0 && len(lines) > max {
		lines = lines[:max]
		lines[max-1] = k.fit(lines[max-1]+" …", w)
	}
	return lines
}

// para writes wrapped text at the left margin (or x) and moves below it.
func (k *kit) para(x, w, lh float64, s string) {
	for _, line := range k.wrap(s, w, 0) {
		k.ensure(lh)
		k.pdf.SetX(x)
		k.pdf.CellFormat(w, lh, line, "", 1, "L", false, 0, "")
	}
}

// ensure starts a new page when h would cross the bottom margin.
func (k *kit) ensure(h float64) {
	if k.pdf.GetY()+h > k.H-k.bottom {
		k.pdf.AddPage()
	}
}

// clean removes control characters and collapses runs of spaces.
func clean(s string) string {
	s = strings.Map(func(r rune) rune {
		switch {
		case r == '\n':
			return r
		case r < 32 || r == 0x7f:
			return ' '
		}
		return r
	}, s)
	return strings.TrimSpace(s)
}

// ---- marks ----------------------------------------------------------------

// pill draws a rounded label and returns its width.
func (k *kit) pill(x, y float64, text string, bg, fg rgb, size float64) float64 {
	k.font(fSemi, size, fg)
	w := k.width(text) + size*0.55
	h := size * 0.52
	k.fill(bg)
	k.pdf.RoundedRect(x, y, w, h, h/2, "1234", "F")
	k.at(x, y, w, h, text, "C")
	return w
}

// sevPill is a severity's word on its colour: readable without colour.
func (k *kit) sevPill(x, y float64, sev string, size float64) float64 {
	return k.pill(x, y, strings.ToUpper(SeverityLabel(sev)), cSevSoft[sev], cSev[sev], size)
}

// sevMark is a small square and the severity's word.
func (k *kit) sevMark(x, y, h float64, sev string, size float64) {
	k.fill(cSevFill[sev])
	s := size * 0.27
	k.pdf.Rect(x, y+(h-s)/2, s, s, "F")
	k.font(fSemi, size, cSev[sev])
	k.at(x+s+1.4, y, 30, h, SeverityLabel(sev), "L")
}

// part is one segment of a bar.
type segment struct {
	label string
	n     int
	c     rgb
}

// bar draws parts as one stacked bar w wide; a zero total draws an empty bar.
func (k *kit) bar(x, y, w, h float64, parts []segment) {
	total := 0
	for _, p := range parts {
		total += p.n
	}
	k.fill(cLine)
	k.pdf.Rect(x, y, w, h, "F")
	if total == 0 {
		return
	}
	cx := x
	for _, p := range parts {
		if p.n == 0 {
			continue
		}
		pw := w * float64(p.n) / float64(total)
		k.fill(p.c)
		k.pdf.Rect(cx, y, pw, h, "F")
		cx += pw
	}
}

// meter is a single value out of max as a thin bar.
func (k *kit) meter(x, y, w, h, value, max float64, c rgb) {
	k.fill(cLine)
	k.pdf.Rect(x, y, w, h, "F")
	if max <= 0 || value <= 0 {
		return
	}
	k.fill(c)
	k.pdf.Rect(x, y, w*math.Min(1, value/max), h, "F")
}

// gauge draws a 240° score dial centred at (cx, cy).
func (k *kit) gauge(cx, cy, r float64, score *float64, track rgb) {
	pdf := k.pdf
	pdf.SetLineCapStyle("round")
	pdf.SetLineWidth(r * 0.16)
	k.draw(track)
	pdf.Arc(cx, cy, r, r, 0, -30, 210, "D")
	if score != nil {
		c := cBandFill[bandFor(*score)]
		k.draw(c)
		end := 210 - 240*math.Max(0, math.Min(100, *score))/100
		if *score > 0 {
			pdf.Arc(cx, cy, r, r, 0, end, 210, "D")
		}
	}
	pdf.SetLineCapStyle("butt")
	pdf.SetLineWidth(0.2)
}

// trendChart draws the score over time in (x, y, w, h). The axis fits the
// data (rounded out to 5 points, at least 10 wide) so a change of a few
// points is visible; the axis labels say where it starts.
func (k *kit) trendChart(x, y, w, h float64, pts []TrendPoint, line rgb, ink rgb, grid rgb) {
	pdf := k.pdf
	if len(pts) < 2 {
		k.draw(grid)
		pdf.SetLineWidth(0.15)
		pdf.Line(x+7, y+h, x+w, y+h)
		k.font(fReg, 8, ink)
		k.at(x+7, y+h/2-4, w-7, 4, "The trend starts after a few days of scans.", "C")
		if len(pts) == 1 {
			k.at(x+7, y+h/2+1, w-7, 4, fmt.Sprintf("%s: %s", pts[0].Day.Format("2 Jan"), score1(pts[0].Score)), "C")
		}
		return
	}
	lo, hi := 100.0, 0.0
	for _, p := range pts {
		lo, hi = math.Min(lo, p.Score), math.Max(hi, p.Score)
	}
	lo, hi = math.Floor((lo-2)/5)*5, math.Ceil((hi+2)/5)*5
	if hi-lo < 10 {
		mid := (hi + lo) / 2
		lo, hi = math.Floor((mid-5)/5)*5, math.Floor((mid-5)/5)*5+10
	}
	lo, hi = math.Max(0, lo), math.Min(100, hi)
	if hi-lo < 10 {
		if lo == 0 {
			hi = 10
		} else {
			lo = hi - 10
		}
	}
	py := func(v float64) float64 { return y + h - h*(math.Max(lo, math.Min(hi, v))-lo)/(hi-lo) }
	pdf.SetLineWidth(0.15)
	k.draw(grid)
	k.font(fReg, 6.5, ink)
	for _, v := range []float64{lo, (lo + hi) / 2, hi} {
		gy := py(v)
		pdf.Line(x+7, gy, x+w, gy)
		k.at(x, gy-1.6, 6, 3.2, strconv.Itoa(int(math.Round(v))), "R")
	}
	x0, span := x+9, w-11
	first, last := pts[0].Day, pts[len(pts)-1].Day
	days := last.Sub(first).Hours() / 24
	px := func(i int) float64 {
		if days <= 0 {
			return x0 + span*float64(i)/float64(len(pts)-1)
		}
		return x0 + span*(pts[i].Day.Sub(first).Hours()/24)/days
	}
	poly := []fpdf.PointType{{X: px(0), Y: y + h}}
	for i, p := range pts {
		poly = append(poly, fpdf.PointType{X: px(i), Y: py(p.Score)})
	}
	poly = append(poly, fpdf.PointType{X: px(len(pts) - 1), Y: y + h})
	pdf.SetAlpha(0.10, "Normal")
	k.fill(line)
	pdf.Polygon(poly, "F")
	pdf.SetAlpha(1, "Normal")
	pdf.SetLineWidth(0.55)
	k.draw(line)
	for i := 1; i < len(pts); i++ {
		pdf.Line(px(i-1), py(pts[i-1].Score), px(i), py(pts[i].Score))
	}
	k.fill(line)
	pdf.Circle(px(len(pts)-1), py(pts[len(pts)-1].Score), 0.9, "F")
	pdf.SetLineWidth(0.2)
	k.font(fReg, 6.5, ink)
	k.at(x0-6, y+h+1, 20, 3.5, first.Format("2 Jan"), "L")
	k.at(x+w-20, y+h+1, 20, 3.5, last.Format("2 Jan"), "R")
}

// periodText names the reporting period and the one it is compared with.
func periodText(rep *PostureReport) string {
	h := rep.History
	if h == nil {
		return ""
	}
	f := func(t time.Time) string { return t.UTC().Format("2 Jan 2006") }
	return fmt.Sprintf("%s to %s, compared with %s to %s", f(h.Current.Start), f(h.Current.End), f(h.Previous.Start), f(h.Previous.End))
}

// hasPrevious reports whether the previous period saw any activity to
// compare with; a first period reads "first period" instead of "was 0".
func hasPrevious(rep *PostureReport) bool {
	return rep.History != nil && (rep.History.Previous.New > 0 || rep.History.Previous.Resolved > 0)
}

// wasText is the "(was N)" line under a figure.
func wasText(rep *PostureReport, before int) string {
	if !hasPrevious(rep) {
		return "first period: no comparison yet"
	}
	return "was " + num(before)
}

// medianText is a median days figure, or a dash.
func medianText(v float64, ok bool) string {
	if !ok {
		return "-"
	}
	if v < 10 {
		return fmt.Sprintf("%.1f days", v)
	}
	return fmt.Sprintf("%.0f days", v)
}

// watermark marks a page built from sample data.
func (k *kit) watermark() {
	if !k.rep.Sample {
		return
	}
	pdf := k.pdf
	pdf.TransformBegin()
	pdf.TransformRotate(35, k.W/2, k.H/2)
	pdf.SetAlpha(0.06, "Normal")
	k.font(fBold, 76, cInk)
	k.at(0, k.H/2-15, k.W, 30, "SAMPLE DATA", "C")
	pdf.SetAlpha(1, "Normal")
	pdf.TransformEnd()
}

// ---- tables ---------------------------------------------------------------

// tcol is one table column.
type tcol struct {
	head  string
	w     float64
	align string // L, C or R
}

// tcell is one table cell.
type tcell struct {
	text  string
	face  string
	size  float64
	color *rgb
	sev   string // draw a severity mark instead of text
	pill  bool   // with sev: a pill instead of a mark
	link  int
}

// table writes a header and rows; the header repeats after a page break.
type table struct {
	k       *kit
	cols    []tcol
	x       float64
	size    float64 // body font size
	lh      float64 // line height
	pad     float64 // vertical padding per row
	maxLine int     // lines per cell
	zebra   bool
	headBg  rgb
	headFg  rgb
	rule    rgb
}

func (k *kit) newTable(cols []tcol) *table {
	return &table{k: k, cols: cols, x: k.mx, size: 8, lh: 3.9, pad: 1.6, maxLine: 3, headBg: cPanel, headFg: cInk3, rule: cLine}
}

func (t *table) header() {
	k := t.k
	h := t.lh + 2*t.pad
	k.ensure(h + t.lh + 2*t.pad)
	y := k.pdf.GetY()
	k.fill(t.headBg)
	total := 0.0
	for _, c := range t.cols {
		total += c.w
	}
	k.pdf.Rect(t.x, y, total, h, "F")
	k.font(fSemi, t.size-0.8, t.headFg)
	x := t.x
	for _, c := range t.cols {
		k.at(x+1.6, y+t.pad, c.w-3.2, t.lh, strings.ToUpper(c.head), c.align)
		x += c.w
	}
	k.pdf.SetXY(t.x, y+h)
}

// row writes one row and returns its height.
func (t *table) row(cells []tcell, shade bool) float64 {
	k := t.k
	lines := make([][]string, len(cells))
	n := 1
	for i, c := range cells {
		if c.sev != "" || i >= len(t.cols) {
			lines[i] = []string{""}
			continue
		}
		face, size := c.face, c.size
		if face == "" {
			face = fReg
		}
		if size == 0 {
			size = t.size
		}
		k.font(face, size, cInk)
		lines[i] = k.wrap(c.text, t.cols[i].w-3.2, t.maxLine)
		if len(lines[i]) > n {
			n = len(lines[i])
		}
	}
	h := float64(n)*t.lh + 2*t.pad
	if k.pdf.GetY()+h > k.H-k.bottom {
		k.pdf.AddPage()
		t.header()
	}
	y := k.pdf.GetY()
	total := 0.0
	for _, c := range t.cols {
		total += c.w
	}
	if shade {
		k.fill(cPanel)
		k.pdf.Rect(t.x, y, total, h, "F")
	}
	x := t.x
	for i, c := range cells {
		if i >= len(t.cols) {
			break
		}
		col := t.cols[i]
		switch {
		case c.sev != "" && c.pill:
			k.sevPill(x+1.6, y+t.pad+0.1, c.sev, t.size-0.8)
		case c.sev != "":
			k.sevMark(x+1.6, y+t.pad, t.lh, c.sev, t.size)
		default:
			face, size, color := c.face, c.size, cInk
			if face == "" {
				face = fReg
			}
			if size == 0 {
				size = t.size
			}
			if c.color != nil {
				color = *c.color
			}
			k.font(face, size, color)
			for li, line := range lines[i] {
				k.at(x+1.6, y+t.pad+float64(li)*t.lh, col.w-3.2, t.lh, line, col.align)
			}
		}
		if c.link != 0 {
			k.pdf.Link(x, y, col.w, h, c.link)
		}
		x += col.w
	}
	k.draw(t.rule)
	k.pdf.SetLineWidth(0.15)
	k.pdf.Line(t.x, y+h, t.x+total, y+h)
	k.pdf.SetXY(t.x, y+h)
	return h
}

// ---- shared wording ------------------------------------------------------

// scopeLines are the report's scope as label / value pairs.
func scopeLines(rep *PostureReport) [][2]string {
	o := rep.Options
	sevs := "All severities"
	if len(o.Severities) > 0 && len(o.Severities) < len(Severities) {
		var names []string
		for _, s := range o.Severities {
			names = append(names, SeverityLabel(s))
		}
		sevs = strings.Join(names, ", ")
	}
	accounts := "All connected AWS accounts (" + num(rep.AccountsCovered) + ")"
	if len(o.Accounts) > 0 {
		accounts = rep.ScopeLabel()
		if i := strings.Index(accounts, " in "); i >= 0 {
			accounts = accounts[i+4:]
		}
	}
	return [][2]string{
		{"Identities", ClassLabel(o.Class)},
		{"Accounts", accounts},
		{"Severities", sevs},
	}
}

// controlLines are the document-control rows on every design's cover.
func controlLines(rep *PostureReport) [][2]string {
	asOf := "Latest posture scan"
	if rep.DataAsOf != nil {
		asOf = rep.DataAsOf.UTC().Format("2 Jan 2006, 15:04 MST")
	}
	return [][2]string{
		{"Report ID", rep.ID()},
		{"Prepared for", orDash(rep.PreparedFor)},
		{"Generated", rep.GeneratedAt.UTC().Format("2 Jan 2006, 15:04 MST")},
		{"Data as of", asOf},
		{"Generated by", orDash(rep.GeneratedBy)},
		{"Classification", Classification},
	}
}

// fmtScore is a score to one decimal, or a dash.
func fmtScore(v *float64) string {
	if v == nil {
		return "-"
	}
	return score1(*v)
}

// changeText is a signed change: "+4.2", "-1.0", "no change".
func changeText(v *float64) string {
	if v == nil {
		return "not tracked yet"
	}
	switch {
	case *v > 0.05:
		return fmt.Sprintf("+%.1f", *v)
	case *v < -0.05:
		return fmt.Sprintf("%.1f", *v)
	}
	return "no change"
}

// methodology is how the figures are made, in sentences.
var methodology = []string{
	"Each identity is checked against the posture rules that apply to its type. A failing check takes points off the identity's score according to its severity; the score is 100 minus the points lost, and it cannot go below 0.",
	"The average score is the mean of every scored identity's score in scope, as the Posture page shows it. The 30-day change compares it with the average 30 days earlier.",
	"A finding is one failing check on one identity. A check that fails on many identities is reported once, with every identity it fails on.",
	"Framework references come from each check's own mapping. They show where a failing check is relevant evidence for a control; they are not a full compliance assessment.",
	"Data comes from the configuration discovered in each connected AWS account and from the AWS activity log (CloudTrail). It reflects the last completed scan.",
	"Each check is mapped to the OWASP Non-Human Identities Top 10 (2025) by Deep Algorithms from the check's definition. Checks about general cloud configuration map to none.",
	"New and fixed findings, days to fix and fixes within target come from each finding's first detection and resolution dates. A finding's root cause is established with its owner; the report records its condition, effect and the recommended fix.",
}

// fpdfImage is how the embedded logos are placed.
func fpdfImage() fpdf.ImageOptions { return fpdf.ImageOptions{ImageType: "PNG"} }
