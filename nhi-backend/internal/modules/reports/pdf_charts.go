package reports

import (
	"fmt"
	"math"

	"github.com/go-pdf/fpdf"
)

// The report's charts follow shadcn/ui's chart components (Recharts with
// the Blue theme), so the PDF looks like the console:
//
//	card        rounded, a 1px border, title and description, a footer
//	            that states the trend ("Trending up by 4.6 points ↗")
//	areaChart   a natural curve over a blue gradient (0.8 to 0.1),
//	            horizontal grid only, no axis lines
//	radial      a thin ring on a muted track with rounded ends and the
//	            value large in the middle
//	donut       a ring with white separators and the total in the middle
//	hBars       horizontal bars with rounded ends and the value at the end
//	vBars       vertical bars, rounded tops, values on top, grouped when
//	            there are two series
//	stackedBars horizontal stacked bars, rounded at the ends, with a legend

// fitSize is the largest size up to max at which s fits w in face.
func (k *kit) fitSize(face string, max, w float64, s string) float64 {
	k.pdf.SetFont(face, "", max)
	if tw := k.width(s); tw > w {
		return math.Floor(max*w/tw*10) / 10
	}
	return max
}

// tint mixes c with white: t = 0 is c, t = 1 is white. It stands in for
// opacity, which a PDF gradient cannot carry.
func tint(c rgb, t float64) rgb {
	return rgb{int(float64(c[0]) + (255-float64(c[0]))*t), int(float64(c[1]) + (255-float64(c[1]))*t), int(float64(c[2]) + (255-float64(c[2]))*t)}
}

// ---- page furniture ---------------------------------------------------------

// sectionHead opens a section: a blue eyebrow and a semibold title.
func (k *kit) sectionHead(eyebrow, title string) {
	y := k.pdf.GetY()
	k.font(fMed, 8, cBrand)
	k.at(k.mx, y, k.body, 4, eyebrow, "L")
	k.font(fSemi, k.fitSize(fSemi, 20, k.body, title), cInk)
	k.at(k.mx, y+5, k.body, 9, title, "L")
	k.pdf.SetY(y + 18)
}

// subHead is a heading with an optional muted description.
func (k *kit) subHead(title, note string) {
	k.ensure(30)
	k.font(fSemi, 11.5, cInk)
	k.at(k.mx, k.pdf.GetY(), k.body, 6, title, "L")
	k.pdf.SetY(k.pdf.GetY() + 6.5)
	if note != "" {
		k.font(fReg, 8.2, cInk3)
		k.para(k.mx, k.body, 4.1, note)
	}
	k.pdf.SetY(k.pdf.GetY() + 2)
}

// statement is a shadcn Alert: a bordered box with an info mark, a title
// and the text.
func (k *kit) statement(x, w float64, s string) { k.note(x, w, "In brief  ·  "+k.rep.Edition(), s) }

// note is a shadcn Alert with a title.
func (k *kit) note(x, w float64, title, s string) {
	k.font(fReg, 9.2, cInk2)
	lines := k.wrap(s, w-16, 0)
	h := 11 + float64(len(lines))*4.8
	k.ensure(h + 2)
	y := k.pdf.GetY()
	k.card(x, y, w, h)
	k.draw(cInk)
	k.pdf.SetLineWidth(0.3)
	k.pdf.Circle(x+6, y+5.8, 1.8, "D")
	k.fill(cInk)
	k.pdf.Rect(x+5.82, y+5.5, 0.36, 1.5, "F")
	k.pdf.Circle(x+6, y+4.75, 0.22, "F")
	k.font(fSemi, 9.2, cInk)
	k.at(x+10, y+3.6, w-14, 4.6, title, "L")
	k.font(fReg, 9.2, cInk2)
	for i, l := range lines {
		k.at(x+10, y+8.6+float64(i)*4.8, w-16, 4.8, l, "L")
	}
	k.pdf.SetY(y + h + 5)
}

// card draws a shadcn card: white, rounded, a hairline border.
func (k *kit) card(x, y, w, h float64) {
	k.fill(cWhite)
	k.draw(cLine)
	k.pdf.SetLineWidth(0.25)
	k.pdf.RoundedRect(x, y, w, h, 2.6, "1234", "FD")
}

// cardHead writes a card's title and description and returns the y under
// them.
func (k *kit) cardHead(x, y, w float64, title, desc string) float64 {
	k.font(fSemi, 9.6, cInk)
	k.at(x+5, y+4.5, w-10, 5, title, "L")
	if desc == "" {
		return y + 11
	}
	k.font(fReg, 7.6, cInk3)
	k.at(x+5, y+9.6, w-10, 4, desc, "L")
	return y + 15
}

// cardFoot writes a card footer above its bottom edge: a trend line in
// medium weight with an arrow, and a muted second line.
func (k *kit) cardFoot(x, bottom, w float64, trend string, up *bool, note string) {
	y := bottom - 4.5
	if note != "" {
		k.font(fReg, 7.4, cInk3)
		k.at(x+5, y-4, w-10, 4, note, "L")
		y -= 5
	}
	if trend != "" {
		if up != nil {
			if *up {
				trend += "  ↗"
			} else {
				trend += "  ↘"
			}
		}
		k.font(fMed, 8.2, cInk)
		k.at(x+5, y-4.4, w-10, 4.4, trend, "L")
	}
}

// legend writes shadcn legend items (rounded square and label) in a row
// from x, wrapping at w, and returns the y under it.
func (k *kit) legend(x, y, w float64, parts []segment) float64 {
	lx := x
	for _, p := range parts {
		k.font(fReg, 7.4, cInk3)
		iw := 3.4 + k.width(p.label) + 4.5
		if lx+iw > x+w && lx > x {
			lx, y = x, y+4.6
		}
		k.fill(p.c)
		k.pdf.RoundedRect(lx, y+1, 2.3, 2.3, 0.5, "1234", "F")
		k.at(lx+3.4, y, iw, 4.2, p.label, "L")
		lx += iw
	}
	return y + 5
}

// ---- charts -------------------------------------------------------------

// radial draws a score out of 100 as shadcn's radial chart: a muted ring,
// the value as an arc with rounded ends from the top clockwise, and the
// value and caption in the middle.
func (k *kit) radial(cx, cy, r float64, score *float64, caption string) {
	pdf := k.pdf
	thick := r * 0.15
	pdf.SetLineWidth(thick)
	k.draw(cMuted)
	pdf.Circle(cx, cy, r, "D")
	if score != nil && *score > 0 {
		frac := math.Min(1, *score/100)
		k.draw(cBrand)
		pdf.SetLineCapStyle("round")
		pdf.Arc(cx, cy, r, r, 0, 90-360*frac, 90, "D")
		pdf.SetLineCapStyle("butt")
	}
	pdf.SetLineWidth(0.2)
	k.font(fBold, r*1.2, cInk)
	k.at(cx-r, cy-r*0.42, 2*r, r*0.5, fmtScore(score), "C")
	k.font(fReg, 7.2, cInk3)
	k.at(cx-r, cy+r*0.2, 2*r, 4, caption, "C")
}

// smooth returns a natural-looking curve through pts (Catmull-Rom, clamped
// at the ends, steps points per segment).
func smooth(pts []fpdf.PointType, steps int) []fpdf.PointType {
	if len(pts) < 3 {
		return pts
	}
	var out []fpdf.PointType
	at := func(i int) fpdf.PointType { return pts[max(0, min(len(pts)-1, i))] }
	for i := 0; i < len(pts)-1; i++ {
		p0, p1, p2, p3 := at(i-1), at(i), at(i+1), at(i+2)
		for s := 0; s < steps; s++ {
			t := float64(s) / float64(steps)
			t2, t3 := t*t, t*t*t
			x := 0.5 * (2*p1.X + (-p0.X+p2.X)*t + (2*p0.X-5*p1.X+4*p2.X-p3.X)*t2 + (-p0.X+3*p1.X-3*p2.X+p3.X)*t3)
			y := 0.5 * (2*p1.Y + (-p0.Y+p2.Y)*t + (2*p0.Y-5*p1.Y+4*p2.Y-p3.Y)*t2 + (-p0.Y+3*p1.Y-3*p2.Y+p3.Y)*t3)
			out = append(out, fpdf.PointType{X: x, Y: y})
		}
	}
	return append(out, pts[len(pts)-1])
}

// areaChart draws the score over time as shadcn's gradient area chart.
func (k *kit) areaChart(x, y, w, h float64, pts []TrendPoint) {
	pdf := k.pdf
	if len(pts) < 2 {
		k.draw(cLine)
		pdf.SetLineWidth(0.2)
		pdf.Line(x, y+h, x+w, y+h)
		k.font(fReg, 8, cInk3)
		msg := "The trend starts after a few days of scans."
		if len(pts) == 1 {
			msg += fmt.Sprintf(" %s: %s.", pts[0].Day.Format("2 Jan"), score1(pts[0].Score))
		}
		k.at(x, y+h/2-2, w, 4, msg, "C")
		return
	}
	lo, hi := 100.0, 0.0
	for _, p := range pts {
		lo, hi = math.Min(lo, p.Score), math.Max(hi, p.Score)
	}
	lo, hi = math.Max(0, math.Floor((lo-3)/5)*5), math.Min(100, math.Ceil((hi+3)/5)*5)
	if hi-lo < 10 {
		lo = math.Max(0, hi-10)
	}
	gx, gw := x+8, w-8
	py := func(v float64) float64 { return y + h - h*(v-lo)/(hi-lo) }
	first, last := pts[0].Day, pts[len(pts)-1].Day
	days := math.Max(last.Sub(first).Hours()/24, 1)
	px := func(i int) float64 { return gx + gw*(pts[i].Day.Sub(first).Hours()/24)/days }
	// Horizontal grid only, muted labels, no axis lines.
	k.font(fReg, 6.6, cInk3)
	k.draw(cLine)
	pdf.SetLineWidth(0.15)
	for i := 0; i <= 3; i++ {
		v := lo + (hi-lo)*float64(i)/3
		pdf.Line(gx, py(v), gx+gw, py(v))
		k.at(x, py(v)-1.6, 6.5, 3.2, fmt.Sprintf("%.0f", v), "R")
	}
	raw := make([]fpdf.PointType, len(pts))
	for i, p := range pts {
		raw[i] = fpdf.PointType{X: px(i), Y: py(p.Score)}
	}
	curve := smooth(raw, 10)
	area := append([]fpdf.PointType{{X: curve[0].X, Y: y + h}}, curve...)
	area = append(area, fpdf.PointType{X: curve[len(curve)-1].X, Y: y + h})
	pdf.ClipPolygon(area, false)
	top, bottom := tint(cBrand, 0.25), tint(cBrand, 0.92)
	pdf.LinearGradient(gx, y, gw, h, top[0], top[1], top[2], bottom[0], bottom[1], bottom[2], 0, 0, 0, 1)
	pdf.ClipEnd()
	k.draw(cBrand)
	pdf.SetLineWidth(0.5)
	pdf.SetLineJoinStyle("round")
	for i := 1; i < len(curve); i++ {
		pdf.Line(curve[i-1].X, curve[i-1].Y, curve[i].X, curve[i].Y)
	}
	pdf.SetLineWidth(0.2)
	k.font(fReg, 6.6, cInk3)
	mid := len(pts) / 2
	k.at(gx, y+h+2, 20, 3.4, first.Format("2 Jan"), "L")
	k.at(px(mid)-10, y+h+2, 20, 3.4, pts[mid].Day.Format("2 Jan"), "C")
	k.at(gx+gw-20, y+h+2, 20, 3.4, last.Format("2 Jan"), "R")
}

// donut draws parts as shadcn's donut: sectors from the top clockwise with
// white separators, and value and caption in the middle.
func (k *kit) donut(cx, cy, ro, ri float64, parts []segment, value, caption string) {
	pdf := k.pdf
	total := 0
	for _, p := range parts {
		total += p.n
	}
	if total == 0 {
		pdf.SetLineWidth(ro - ri)
		k.draw(cMuted)
		pdf.Circle(cx, cy, (ro+ri)/2, "D")
		pdf.SetLineWidth(0.2)
	} else {
		a := -math.Pi / 2
		for _, p := range parts {
			if p.n == 0 {
				continue
			}
			sweep := 2 * math.Pi * float64(p.n) / float64(total)
			steps := max(2, int(sweep*40))
			var poly []fpdf.PointType
			for i := 0; i <= steps; i++ {
				t := a + sweep*float64(i)/float64(steps)
				poly = append(poly, fpdf.PointType{X: cx + ro*math.Cos(t), Y: cy + ro*math.Sin(t)})
			}
			for i := steps; i >= 0; i-- {
				t := a + sweep*float64(i)/float64(steps)
				poly = append(poly, fpdf.PointType{X: cx + ri*math.Cos(t), Y: cy + ri*math.Sin(t)})
			}
			k.fill(p.c)
			pdf.Polygon(poly, "F")
			a += sweep
		}
		// White separators between sectors (strokeWidth 5 in shadcn).
		k.draw(cWhite)
		pdf.SetLineWidth(0.9)
		a = -math.Pi / 2
		for _, p := range parts {
			if p.n == 0 {
				continue
			}
			pdf.Line(cx+(ri-0.5)*math.Cos(a), cy+(ri-0.5)*math.Sin(a), cx+(ro+0.5)*math.Cos(a), cy+(ro+0.5)*math.Sin(a))
			a += 2 * math.Pi * float64(p.n) / float64(total)
		}
		pdf.SetLineWidth(0.2)
	}
	k.font(fBold, ri*0.9, cInk)
	k.at(cx-ri, cy-ri*0.52, 2*ri, ri*0.6, value, "C")
	k.font(fReg, 7, cInk3)
	k.at(cx-ri, cy+ri*0.16, 2*ri, 3.6, caption, "C")
}

// hbar is one row of a horizontal bar chart.
type hbar struct {
	label string
	value float64
	text  string // written at the end of the bar
	c     rgb
}

// hBars draws rows as horizontal bars with rounded ends and the value at
// the end of each; labels take labelW on the left. It returns the y under
// the last row.
func (k *kit) hBars(x, y, w, labelW, rowH float64, rows []hbar) float64 {
	maxV := 0.0
	for _, r := range rows {
		maxV = math.Max(maxV, r.value)
	}
	barH := rowH * 0.56
	span := w - labelW - 16
	for _, r := range rows {
		k.font(fReg, 8, cInk2)
		k.at(x, y, labelW-3, rowH, r.label, "L")
		bw := 0.0
		if maxV > 0 && r.value > 0 {
			bw = math.Max(span*r.value/maxV, barH*0.7)
		}
		by := y + (rowH-barH)/2
		if bw > 0 {
			k.fill(r.c)
			k.pdf.RoundedRect(x+labelW, by, bw, barH, math.Min(1.1, bw/2), "1234", "F")
		}
		k.font(fMed, 7.8, cInk)
		k.at(x+labelW+bw+1.6, y, 16, rowH, r.text, "L")
		y += rowH
	}
	return y
}

// vBars draws a vertical bar chart: one or two series per category (two
// are grouped side by side), rounded tops, the value on top of each bar,
// horizontal grid only and the category under each group. marks, if set,
// draws a dashed reference line per category (a target).
func (k *kit) vBars(x, y, w, h float64, cats []string, series [][]float64, colors []rgb, marks []float64) {
	pdf := k.pdf
	maxV := 0.0
	for _, s := range series {
		for _, v := range s {
			maxV = math.Max(maxV, v)
		}
	}
	for _, m := range marks {
		maxV = math.Max(maxV, m)
	}
	if maxV <= 0 {
		maxV = 1
	}
	maxV *= 1.14
	k.draw(cLine)
	pdf.SetLineWidth(0.15)
	for i := 0; i <= 3; i++ {
		gy := y + h - h*float64(i)/3
		pdf.Line(x, gy, x+w, gy)
	}
	slot := w / float64(len(cats))
	n := float64(len(series))
	bw := math.Min(slot*0.6/n, 14)
	gap := 1.2
	groupW := bw*n + gap*(n-1)
	for ci, cat := range cats {
		gx := x + slot*float64(ci) + (slot-groupW)/2
		if marks != nil {
			my := y + h - h*marks[ci]/maxV
			k.draw(cInk3)
			pdf.SetLineWidth(0.3)
			pdf.SetDashPattern([]float64{0.9, 0.7}, 0)
			pdf.Line(gx-2.5, my, gx+groupW+2.5, my)
			pdf.SetDashPattern([]float64{}, 0)
		}
		for si, s := range series {
			v := s[ci]
			bx := gx + float64(si)*(bw+gap)
			bh := h * v / maxV
			if bh > 0 {
				k.fill(colors[si])
				pdf.RoundedRect(bx, y+h-bh, bw, bh, math.Min(1.6, math.Min(bw/2, bh)), "12", "F")
			}
			if v <= 0 {
				continue // an empty slot speaks for itself
			}
			label := fmt.Sprintf("%.0f", v)
			if v < 10 && v != math.Trunc(v) {
				label = fmt.Sprintf("%.1f", v)
			}
			k.font(fMed, 6.4, cInk)
			k.at(bx-1, y+h-bh-3.6, bw+2, 3.4, label, "C")
		}
		k.font(fReg, 7.4, cInk3)
		k.at(x+slot*float64(ci), y+h+1.6, slot, 3.6, cat, "C")
	}
	pdf.SetLineWidth(0.2)
}

// stackedBars draws one horizontal stacked bar per row (rounded at its
// outer ends, white gaps between parts) with the row's total after it.
func (k *kit) stackedBars(x, y, w, labelW, rowH float64, labels []string, rows [][]int, colors []rgb) float64 {
	maxT := 1
	for _, r := range rows {
		t := 0
		for _, v := range r {
			t += v
		}
		maxT = max(maxT, t)
	}
	span := w - labelW - 14
	barH := rowH * 0.56
	for ri, r := range rows {
		k.font(fReg, 8, cInk2)
		k.at(x, y, labelW-3, rowH, labels[ri], "L")
		by := y + (rowH-barH)/2
		cx := x + labelW
		first, last, total := -1, -1, 0
		for i, v := range r {
			if v > 0 {
				if first < 0 {
					first = i
				}
				last = i
			}
			total += v
		}
		for i, v := range r {
			if v == 0 {
				continue
			}
			sw := span * float64(v) / float64(maxT)
			corners := ""
			if i == first {
				corners += "14"
			}
			if i == last {
				corners += "23"
			}
			k.fill(colors[i%len(colors)])
			if corners == "" {
				k.pdf.Rect(cx, by, sw, barH, "F")
			} else {
				k.pdf.RoundedRect(cx, by, sw, barH, math.Min(1.1, sw/2), corners, "F")
			}
			if i != last {
				k.fill(cWhite)
				k.pdf.Rect(cx+sw-0.2, by, 0.4, barH, "F")
			}
			cx += sw
		}
		k.font(fMed, 7.8, cInk)
		k.at(cx+1.6, y, 14, rowH, num(total), "L")
		y += rowH
	}
	return y
}
