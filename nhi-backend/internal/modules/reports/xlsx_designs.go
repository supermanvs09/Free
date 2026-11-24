package reports

import (
	"fmt"
	"io"
	"math"
	"sort"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ---- shared rows --------------------------------------------------------------

func classOf(human bool) string {
	if human {
		return "Human"
	}
	return "Non-human"
}

// population is every scored identity, worst first; the failing ones when
// the report did not load the population.
func (rep *PostureReport) population() []ReportIdentity {
	if len(rep.Population) > 0 {
		return rep.Population
	}
	return sortedByScore(rep.Identities)
}

// checksOf finds an identity's failing checks in the report (the population
// rows carry none when the identity passed).
func (rep *PostureReport) checksOf(id ReportIdentity) []ReportCheck {
	if len(id.Checks) > 0 {
		return id.Checks
	}
	for _, f := range rep.Identities {
		if f.ID == id.ID {
			return f.Checks
		}
	}
	return nil
}

func identityRow(rep *PostureReport, id ReportIdentity) []interface{} {
	checks := rep.checksOf(id)
	counts := map[string]int{}
	worst := ""
	for _, c := range checks {
		counts[c.Severity]++
		if worst == "" || sevRank(c.Severity) < sevRank(worst) {
			worst = c.Severity
		}
	}
	band := id.Band
	if band == "" && id.Score != nil {
		band = bandFor(*id.Score)
	}
	return []interface{}{id.Name, typeLabel(id.Type), classOf(id.Human), orDash(id.Account), id.AccountID, id.Score, bandLabel(band),
		len(checks), counts["critical"], counts["high"], counts["medium"], counts["low"], worst, id.ARN}
}

var identityCols = []xcol{
	{"Identity", 34, kBold, "The identity's name in AWS."},
	{"Type", 18, kText, "What kind of identity it is (IAM role, Lambda function, ...)."},
	{"Class", 12, kText, "Human or non-human."},
	{"Account", 26, kText, "The AWS account's name."},
	{"Account ID", 15, kMono, "The 12-digit AWS account ID."},
	{"Score", 9, kDec1, "Security score, 0 to 100: 100 minus the points its failing checks take off."},
	{"Band", 10, kText, "Score band: Healthy 80-100, Fair 60-79, Poor 40-59, Critical 0-39."},
	{"Failing checks", 10, kInt, "How many checks fail on the identity."},
	{"Critical", 9, kInt, "Failing checks rated Critical."},
	{"High", 8, kInt, "Failing checks rated High."},
	{"Medium", 9, kInt, "Failing checks rated Medium."},
	{"Low", 7, kInt, "Failing checks rated Low."},
	{"Worst severity", 12, kSev, "The most severe failing check."},
	{"ARN", 60, kMono, "The identity's Amazon Resource Name."},
}

func (x *wb) identitiesSheet(name, table string) (int, error) {
	rep := x.rep
	n, err := x.dataSheet(name, table, "", identityCols, func(emit func([]interface{}) error) error {
		for _, id := range rep.population() {
			if err := emit(identityRow(rep, id)); err != nil {
				return err
			}
		}
		return nil
	})
	if err == nil && n > 0 {
		// Score colour scale: red low, green high.
		_ = x.f.SetConditionalFormat(name, fmt.Sprintf("F2:F%d", n+1), []excelize.ConditionalFormatOptions{
			{Type: "3_color_scale", MinType: "num", MinValue: "0", MinColor: "#F4B6B0", MidType: "num", MidValue: "60", MidColor: "#FBE7A1", MaxType: "num", MaxValue: "100", MaxColor: "#B7E1CD"},
		})
	}
	return n, err
}

// ---- A: executive workbook -------------------------------------------------------

// WriteExecutiveXLSX is workbook design A: a dashboard first, for leaders and
// security managers, then the lists behind it.
func WriteExecutiveXLSX(w io.Writer, rep *PostureReport) error {
	x, err := newWB(rep)
	if err != nil {
		return err
	}
	defer x.f.Close()
	sheets := []sheetInfo{
		{"Dashboard", "Score, trend, severities, accounts and OWASP NHI Top 10"},
		{"Remediation", "Open, overdue and fixed by severity, against targets"},
		{"Findings", "Every failing check: priority, owners, how to fix"},
		{"Identities", "Every scored identity, lowest score first"},
		{"Compliance", "OWASP NHI Top 10 and framework controls affected"},
		{"Accepted risks", "Accepted or suppressed findings and who decided"},
		{"Data dictionary", "What every column means"},
	}
	if err := x.cover("Identity Security Posture Report · Executive workbook", sheets, nil); err != nil {
		return err
	}
	if err := x.dashboard(); err != nil {
		return err
	}
	if err := x.remediationSheet("Remediation", "Remediation"); err != nil {
		return err
	}
	if _, err := x.findingsSheet("Findings", "Findings"); err != nil {
		return err
	}
	if _, err := x.identitiesSheet("Identities", "Identities"); err != nil {
		return err
	}
	if err := x.complianceSheet("Compliance", "Compliance"); err != nil {
		return err
	}
	if err := x.exceptionsSheet("Accepted risks", "AcceptedRisks"); err != nil {
		return err
	}
	if err := x.dictionary(); err != nil {
		return err
	}
	x.finish("Identity Security Posture Report")
	return x.f.Write(w)
}

func (x *wb) dashboard() error {
	f, rep := x.f, x.rep
	sh := "Dashboard"
	if _, err := f.NewSheet(sh); err != nil {
		return err
	}
	x.canvas(sh)
	r := x.header(sh, "Posture dashboard", rep.ScopeLabel()+"  ·  data as of "+controlLines(rep)[3][1], false)

	// Figure cards.
	overdue := 0
	for _, n := range rep.Overdue() {
		overdue += n
	}
	score, sub, trend := interface{}("-"), "not scored yet", 0
	if rep.AverageScore != nil {
		score = round1(*rep.AverageScore)
		sub = bandLabel(bandFor(*rep.AverageScore)) + " band"
		if c := rep.Change30d; c != nil {
			sub = map[bool]string{true: "↗ ", false: "↘ "}[*c >= 0] + changeText(c) + " in 30 days"
			trend = map[bool]int{true: 1, false: -1}[*c >= 0]
		}
	}
	cards := []tile{
		{"Average score", score, "dec", sub, trend},
		{"Identities failing", rep.FailingCount, "int", pct(rep.FailingCount, rep.ScoredCount) + " of " + num(rep.ScoredCount), 0},
		{"Critical and high", rep.BySeverity["critical"] + rep.BySeverity["high"], "int", "of " + num(rep.CheckCount) + " open", 0},
		{"Past target", overdue, "int", pct(overdue, rep.CheckCount) + " of open", map[bool]int{true: -1, false: 0}[overdue > 0]},
	}
	if h := rep.History; h != nil {
		ng, fg := 0, 0
		if hasPrevious(rep) {
			ng = map[bool]int{true: 1, false: -1}[h.Current.New <= h.Previous.New]
			fg = map[bool]int{true: 1, false: -1}[h.Current.Resolved >= h.Previous.Resolved]
		}
		cards = append(cards, tile{"New in the period", h.Current.New, "int", wasText(rep, h.Previous.New), ng},
			tile{"Fixed in the period", h.Current.Resolved, "int", wasText(rep, h.Previous.Resolved), fg})
	} else {
		_, un := rep.Owners()
		cards = append(cards, tile{"Without an owner", un, "int", "open findings", 0}, tile{"Accounts", rep.AccountsCovered, "int", "connected", 0})
	}
	r = x.tiles(sh, r, 2, cards)

	// Doughnuts: severity and score band, counts in the legend.
	var sevLabels []string
	var sevVals []float64
	for _, s := range Severities {
		sevLabels = append(sevLabels, fmt.Sprintf("%s  %s  (%s)", SeverityLabel(s), num(rep.BySeverity[s]), pct(rep.BySeverity[s], rep.CheckCount)))
		sevVals = append(sevVals, float64(rep.BySeverity[s]))
	}
	sevCats, sevRanges := x.chartRows(1, "Severity", sevLabels, [][]float64{sevVals}, []string{"Findings"})
	var bandLabels []string
	var bandVals []float64
	for _, b := range rep.Bands {
		bandLabels = append(bandLabels, fmt.Sprintf("%s %s  %s  (%s)", bandLabel(b.Band), strings.ReplaceAll(BandRange[b.Band], " to ", "–"), num(b.Count), pct(b.Count, rep.ScoredCount)))
		bandVals = append(bandVals, float64(b.Count))
	}
	bandCats, bandRanges := x.chartRows(4, "Band", bandLabels, [][]float64{bandVals}, []string{"Identities"})
	x.section(sh, r, 0, 5, "Findings by severity", num(rep.CheckCount)+" open findings. Darker is more severe.")
	x.section(sh, r, 6, 11, "Identities by score band", num(rep.ScoredCount)+" scored identities. Darker is a lower score.")
	r += 2
	donut := func(cell, cats, vals, name string) {
		_ = f.AddChart(sh, cell, cleanChart(&excelize.Chart{Type: excelize.Doughnut, HoleSize: 62, VaryColors: boolPtr(true),
			Series:    []excelize.ChartSeries{{Name: name, Categories: cats, Values: vals}},
			Legend:    excelize.ChartLegend{Position: "right"},
			Dimension: excelize.ChartDimension{Width: 548, Height: 240}}))
	}
	donut(fmt.Sprintf("B%d", r), sevCats, sevRanges[0], "Findings")
	donut(fmt.Sprintf("H%d", r), bandCats, bandRanges[0], "Identities")
	r += 13

	// Trend.
	r = x.section(sh, r, 0, 11, "Average security score, day by day", "From the daily posture snapshots; the axis fits the data so small changes show.")
	if len(rep.Trend) > 1 {
		var days []string
		var vals []float64
		lo, hi := 100.0, 0.0
		for _, p := range rep.Trend {
			days = append(days, p.Day.Format("2 Jan"))
			vals = append(vals, round1(p.Score))
			lo, hi = math.Min(lo, p.Score), math.Max(hi, p.Score)
		}
		lo, hi = math.Max(0, math.Floor((lo-2)/5)*5), math.Min(100, math.Ceil((hi+2)/5)*5)
		if hi-lo < 10 {
			lo = math.Max(0, hi-10)
		}
		cats, rs := x.chartRows(7, "Day", days, [][]float64{vals}, []string{"Average score"})
		_ = f.AddChart(sh, fmt.Sprintf("B%d", r), cleanChart(&excelize.Chart{Type: excelize.Line,
			Series: []excelize.ChartSeries{{Name: "Average score", Categories: cats, Values: rs[0],
				Line: excelize.ChartLine{Width: 2.25, Smooth: true}, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{xBrand}}, Marker: excelize.ChartMarker{Symbol: "none"}}},
			Legend:    excelize.ChartLegend{Position: "none"},
			XAxis:     excelize.ChartAxis{TickLabelSkip: 7},
			YAxis:     excelize.ChartAxis{Minimum: fptr(lo), Maximum: fptr(hi), MajorUnit: 5, MajorGridLines: true},
			Dimension: excelize.ChartDimension{Width: 1110, Height: 230}}))
		r += 12
	} else {
		x.put(sh, r, 0, 11, "The trend starts after a few days of scans.", "secCap")
		r += 2
	}

	// Age of open findings and the OWASP NHI Top 10, side by side.
	x.section(sh, r, 0, 5, "Age of open findings", "Days since first detection, by severity.")
	x.section(sh, r, 6, 11, "OWASP Non-Human Identities Top 10", "Identities failing a check that is evidence of each risk.")
	r += 2
	var ageLabels []string
	ageVals := make([][]float64, len(Severities))
	for _, b := range rep.Aging() {
		ageLabels = append(ageLabels, b.Label)
		for i, s := range Severities {
			ageVals[i] = append(ageVals[i], float64(b.BySev[s]))
		}
	}
	var sevNames []string
	for _, s := range Severities {
		sevNames = append(sevNames, SeverityLabel(s))
	}
	ageCats, ageRanges := x.chartRows(10, "Age", ageLabels, ageVals, sevNames)
	var ageSeries []excelize.ChartSeries
	for i, s := range Severities {
		ageSeries = append(ageSeries, excelize.ChartSeries{Name: fmt.Sprintf("'%s'!$%s$1", chartData, colLetter(11+i)), Categories: ageCats, Values: ageRanges[i],
			Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{xSevFill[s]}}})
	}
	_ = f.AddChart(sh, fmt.Sprintf("B%d", r), cleanChart(&excelize.Chart{Type: excelize.ColStacked, Series: ageSeries, GapWidth: uintPtr(55),
		Legend: excelize.ChartLegend{Position: "bottom"}, YAxis: excelize.ChartAxis{MajorGridLines: true},
		Dimension: excelize.ChartDimension{Width: 548, Height: 290}}))
	var nhiLabels []string
	var nhiVals []float64
	for _, n := range rep.NHITop10() {
		nhiLabels = append(nhiLabels, n.ID+"  "+n.Title)
		nhiVals = append(nhiVals, float64(n.Identities))
	}
	nhiCats, nhiRanges := x.chartRows(16, "Risk", nhiLabels, [][]float64{nhiVals}, []string{"Identities"})
	_ = f.AddChart(sh, fmt.Sprintf("H%d", r), cleanChart(&excelize.Chart{Type: excelize.Bar, GapWidth: uintPtr(45),
		Series:    []excelize.ChartSeries{{Name: "Identities", Categories: nhiCats, Values: nhiRanges[0], Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{xBrand}}}},
		Legend:    excelize.ChartLegend{Position: "none"},
		PlotArea:  excelize.ChartPlotArea{ShowVal: true},
		XAxis:     excelize.ChartAxis{ReverseOrder: true},
		YAxis:     excelize.ChartAxis{None: true},
		Dimension: excelize.ChartDimension{Width: 548, Height: 290}}))
	r += 16

	// Tables: accounts and security areas.
	table := func(title, caption string, heads []string, rows [][]interface{}, kinds []int, bar int) {
		r = x.section(sh, r, 0, 11, title, caption)
		x.put(sh, r, 0, 2, heads[0], "head")
		for i, h := range heads[1:] {
			x.put(sh, r, i+3, i+3, h, "head")
		}
		_ = f.SetRowHeight(sh, r, 20)
		first := r + 1
		for _, row := range rows {
			r++
			c := x.value(kinds[0], row[0])
			x.put(sh, r, 0, 2, c.Value, "bold")
			for i, v := range row[1:] {
				c := x.value(kinds[i+1], v)
				a, _ := span(r, i+3, i+3)
				_ = f.SetCellValue(sh, a, c.Value)
				_ = f.SetCellStyle(sh, a, a, c.StyleID)
			}
		}
		if r >= first && bar > 0 {
			col := colLetter(canvasFirst + bar + 2)
			_ = f.SetConditionalFormat(sh, fmt.Sprintf("%s%d:%s%d", col, first, col, r), []excelize.ConditionalFormatOptions{{Type: "data_bar", BarColor: "#" + xSevFill["medium"], MinType: "num", MinValue: "0", MaxType: "max", BarSolid: true}})
		}
		r += 3
	}
	var accRows [][]interface{}
	for _, a := range rep.Accounts {
		accRows = append(accRows, []interface{}{accountName(a), a.ID, a.Average, a.Scored, a.Failing, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"]})
	}
	table("Accounts", "Every connected account in scope, with its findings by severity.", []string{"Account", "Account ID", "Avg score", "Scored", "Failing", "Critical", "High", "Medium", "Low"},
		accRows, []int{kBold, kMono, kDec1, kInt, kInt, kInt, kInt, kInt, kInt}, 4)
	var areaRows [][]interface{}
	for _, a := range rep.Areas() {
		areaRows = append(areaRows, []interface{}{a.Area, a.Checks, a.Identities, a.Findings, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"]})
	}
	table("Security areas", "Where the findings sit, with their severities.", []string{"Security area", "Checks", "Identities", "Findings", "Critical", "High", "Medium", "Low"},
		areaRows, []int{kBold, kInt, kInt, kInt, kInt, kInt, kInt, kInt}, 3)
	x.printSetup(sh, false)
	return nil
}

var findingCols = []xcol{
	{"Ref", 8, kMono, "The finding's reference in this report (F-001 is the most severe)."},
	{"Check ID", 12, kMono, "The posture check's ID."},
	{"Check", 40, kBold, "The posture check that fails."},
	{"Severity", 10, kSev, "How serious a failure of this check is."},
	{"Priority", 13, kText, "P1 fix now, P2 this sprint, P3 planned, P4 hygiene."},
	{"Security area", 18, kText, "The area the check belongs to."},
	{"Identities", 10, kInt, "Identities failing the check."},
	{"Accounts", 9, kInt, "Accounts those identities are in."},
	{"Failing since", 12, kDate, "When the longest-failing identity started failing it."},
	{"Days failing", 10, kInt, "Days since then."},
	{"Score gain", 10, kDec1, "How much the average score rises if it is fixed everywhere (each identity re-scored)."},
	{"Target (days)", 10, kInt, "Remediation target for its severity, in days from first detection."},
	{"Overdue", 9, kInt, "Findings of this check past their target."},
	{"Owners", 26, kWrap, "Who its findings are assigned to; Unassigned when none."},
	{"OWASP NHI", 16, kText, "OWASP Non-Human Identities Top 10 (2025) risks it is evidence of."},
	{"Controls", 28, kWrap, "Framework controls it maps to."},
	{"Why it matters", 50, kWrap, "The risk if it stays."},
	{"How to fix", 60, kWrap, "What to change."},
}

func (x *wb) findingsSheet(name, table string) (int, error) {
	rep := x.rep
	return x.dataSheet(name, table, "", findingCols, func(emit func([]interface{}) error) error {
		for i, g := range rep.Groups {
			p := rep.Priority(g)
			gain := round1(rep.Uplift(g))
			days := rep.DaysFailing(g.Since)
			var d interface{} = days
			if days < 0 {
				d = ""
			}
			why := g.Risk
			if why == "" {
				why = g.About
			}
			st := rep.State(g)
			owners := strings.Join(st.Owners, ", ")
			if st.Unassigned > 0 {
				if owners != "" {
					owners += "; "
				}
				owners += fmt.Sprintf("Unassigned (%d)", st.Unassigned)
			}
			if err := emit([]interface{}{FindingRef(i), g.RuleID, g.Title, g.Severity, p + " " + PriorityText(p), AreaLabel(g.Area), len(g.Items), len(g.Accounts),
				g.Since, d, gain, rep.SLA.Due(g.Severity), st.Overdue, owners, strings.Join(NHIRisks(g.RuleID), ", "), strings.Join(g.Controls, ", "), why, g.Fix}); err != nil {
				return err
			}
		}
		return nil
	})
}

func (x *wb) complianceSheet(name, table string) error {
	rep := x.rep
	_, err := x.dataSheet(name, table, "", []xcol{
		{"Framework", 30, kBold, "The security framework."},
		{"Control", 30, kMono, "The control within the framework, or the OWASP risk."},
		{"Highest severity", 14, kSev, "The most severe failing check mapped to it."},
		{"Failing checks", 12, kInt, "How many failing checks map to it."},
		{"Identities", 11, kInt, "Distinct identities failing those checks."},
		{"Findings", 70, kWrap, "The failing checks, by their reference in this report."},
	}, func(emit func([]interface{}) error) error {
		for _, r := range rep.NHITop10() {
			var refs []string
			for _, gi := range r.Checks {
				refs = append(refs, FindingRef(gi)+" "+rep.Groups[gi].Title)
			}
			var worst interface{} = r.Worst
			if r.Worst == "" {
				worst = nil
			}
			if err := emit([]interface{}{"OWASP NHI Top 10 (2025)", r.ID + " " + r.Title, worst, len(r.Checks), r.Identities, strings.Join(refs, "; ")}); err != nil {
				return err
			}
		}
		for _, fw := range rep.Frameworks() {
			for _, r := range fw.Rows {
				var refs []string
				for _, gi := range r.Checks {
					refs = append(refs, FindingRef(gi)+" "+rep.Groups[gi].Title)
				}
				if err := emit([]interface{}{fw.Name, r.Control, r.Worst, len(r.Checks), r.Identities, strings.Join(refs, "; ")}); err != nil {
					return err
				}
			}
		}
		return nil
	})
	return err
}

// remediationSheet is remediation by severity: open and overdue now, and
// the period against the one before.
func (x *wb) remediationSheet(name, table string) error {
	rep := x.rep
	open := map[string]int{}
	for _, id := range rep.Identities {
		for _, c := range id.Checks {
			open[c.Severity]++
		}
	}
	overdue := rep.Overdue()
	h := rep.History
	cols := []xcol{
		{"Severity", 11, kSev, "Finding severity."},
		{"Target (days)", 12, kInt, "Remediation target in days from first detection."},
		{"Open", 9, kInt, "Open findings now."},
		{"Overdue", 9, kInt, "Open findings past their target."},
		{"Open 0-15 days", 11, kInt, "Open findings by age."},
		{"Open 16-30 days", 11, kInt, "Open findings by age."},
		{"Open 31-90 days", 11, kInt, "Open findings by age."},
		{"Open 91-180 days", 11, kInt, "Open findings by age."},
		{"Open 180+ days", 11, kInt, "Open findings by age."},
		{"New (period)", 11, kInt, "Findings first detected in the reporting period."},
		{"New (previous)", 11, kInt, "Same, in the period before."},
		{"Fixed (period)", 11, kInt, "Findings resolved in the reporting period."},
		{"Fixed (previous)", 11, kInt, "Same, in the period before."},
		{"Median days to fix (period)", 14, kDec1, "Median days from first detection to resolution, findings fixed in the period."},
		{"Median days to fix (previous)", 14, kDec1, "Same, in the period before."},
		{"Fixed in time (period)", 13, kPct, "Share of the period's fixes made within target."},
		{"Fixed in time (previous)", 13, kPct, "Same, in the period before."},
	}
	aging := rep.Aging()
	_, err := x.dataSheet(name, table, "", cols, func(emit func([]interface{}) error) error {
		for _, s := range Severities {
			row := []interface{}{s, rep.SLA.Due(s), open[s], overdue[s]}
			for _, b := range aging {
				row = append(row, b.BySev[s])
			}
			if h == nil {
				row = append(row, nil, nil, nil, nil, nil, nil, nil, nil)
			} else {
				med := func(p PeriodStats) interface{} {
					if v, ok := p.MedianDays[s]; ok {
						return v
					}
					return nil
				}
				share := func(p PeriodStats) interface{} {
					if p.ResolvedBySev[s] == 0 {
						return nil
					}
					return float64(p.FixedInSLA[s]) / float64(p.ResolvedBySev[s])
				}
				row = append(row, h.Current.NewBySev[s], h.Previous.NewBySev[s], h.Current.ResolvedBySev[s], h.Previous.ResolvedBySev[s],
					med(h.Current), med(h.Previous), share(h.Current), share(h.Previous))
			}
			if err := emit(row); err != nil {
				return err
			}
		}
		return nil
	})
	return err
}

// exceptionsSheet is every accepted or suppressed finding.
func (x *wb) exceptionsSheet(name, table string) error {
	rep := x.rep
	_, err := x.dataSheet(name, table, "", []xcol{
		{"Check", 34, kBold, "The check the decision is about."},
		{"Severity", 10, kSev, "Its severity."},
		{"Identity", 30, kText, "The identity it fails on."},
		{"Account", 16, kMono, "The AWS account ID."},
		{"Reason", 60, kWrap, "Why it was accepted or suppressed."},
		{"Decided by", 24, kText, "Who accepted or suppressed it (console history)."},
		{"Decided", 12, kDate, "When."},
		{"Until", 12, kDate, "When a suppression ends; blank for an accepted risk with no end."},
		{"Owner", 20, kText, "Who the finding is assigned to."},
	}, func(emit func([]interface{}) error) error {
		for _, e := range rep.Exceptions {
			if err := emit([]interface{}{e.Check, e.Severity, e.Identity, e.Account, e.Reason, e.DecidedBy, e.Since, e.Until, e.Owner}); err != nil {
				return err
			}
		}
		return nil
	})
	return err
}

// ---- C: analyst data model ------------------------------------------------------------

// WriteAnalystXLSX is workbook design C: tidy tables for analysts and BI
// tools. One fact table of findings and dimension tables of identities,
// checks, accounts and controls, joined by their IDs; a summary that
// calculates from the facts, and a pivot table to start from.
func WriteAnalystXLSX(w io.Writer, rep *PostureReport) error {
	x, err := newWB(rep)
	if err != nil {
		return err
	}
	defer x.f.Close()
	sheets := []sheetInfo{
		{"Summary", "Figures calculated live from the Facts table"},
		{"Pivot", "Findings by account and severity, ready to pivot"},
		{"Facts", "tblFacts: one row per finding, every key and measure"},
		{"Identities", "tblIdentities: every scored identity"},
		{"Checks", "tblChecks: every failing check"},
		{"Accounts", "tblAccounts: every account in scope"},
		{"Control map", "tblControlMap: check to control or OWASP risk"},
		{"Remediation", "tblRemediation: open, overdue and fixed by severity"},
		{"Accepted risks", "tblExceptions: accepted or suppressed findings"},
		{"Trend", "tblTrend: average score per day"},
		{"Data dictionary", "What every column means"},
	}
	if err := x.cover("Identity Security Posture Report · Analyst data model", sheets, nil); err != nil {
		return err
	}
	f := x.f
	if _, err := f.NewSheet("Summary"); err != nil {
		return err
	}
	if _, err := f.NewSheet("Pivot"); err != nil {
		return err
	}
	facts, err := x.factsSheet()
	if err != nil {
		return err
	}
	if _, err := x.dataSheet("Identities", "tblIdentities", "", append([]xcol{{"Identity key", 12, kMono, "Key joining Facts to this table."}}, identityCols...), func(emit func([]interface{}) error) error {
		for _, id := range rep.population() {
			if err := emit(append([]interface{}{id.ID}, identityRow(rep, id)...)); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if _, err := x.findingsSheet("Checks", "tblChecks"); err != nil {
		return err
	}
	if _, err := x.dataSheet("Accounts", "tblAccounts", "", []xcol{
		{"Account ID", 15, kMono, "The 12-digit AWS account ID (key)."},
		{"Account", 28, kBold, "The account's name."},
		{"Avg score", 10, kDec1, "Average security score of its scored identities."},
		{"Scored", 9, kInt, "Identities scored."},
		{"Failing", 9, kInt, "Identities with a failing check."},
		{"Findings", 9, kInt, "Failing checks on its identities."},
		{"Critical", 9, kInt, "Critical findings."},
		{"High", 8, kInt, "High findings."},
		{"Medium", 9, kInt, "Medium findings."},
		{"Low", 7, kInt, "Low findings."},
	}, func(emit func([]interface{}) error) error {
		for _, a := range rep.Accounts {
			if err := emit([]interface{}{a.ID, accountName(a), a.Average, a.Scored, a.Failing, a.Checks, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"]}); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if _, err := x.dataSheet("Control map", "tblControlMap", "", []xcol{
		{"Check ID", 12, kMono, "The posture check (key to tblChecks)."},
		{"Framework", 30, kText, "The framework."},
		{"Control", 30, kMono, "The control within it, or the OWASP risk."},
		{"Tag", 18, kMono, "The control as the check tags it."},
	}, func(emit func([]interface{}) error) error {
		for _, g := range rep.Groups {
			for _, risk := range NHIRisks(g.RuleID) {
				title := ""
				for _, r := range OWASPNHI {
					if r.ID == risk {
						title = r.Title
					}
				}
				if err := emit([]interface{}{g.RuleID, "OWASP NHI Top 10 (2025)", strings.TrimSpace(risk + " " + title), risk}); err != nil {
					return err
				}
			}
		}
		for _, g := range rep.Groups {
			for _, tag := range g.Controls {
				fw, ctl := Framework(tag)
				if err := emit([]interface{}{g.RuleID, fw, ctl, tag}); err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if err := x.remediationSheet("Remediation", "tblRemediation"); err != nil {
		return err
	}
	if err := x.exceptionsSheet("Accepted risks", "tblExceptions"); err != nil {
		return err
	}
	if _, err := x.dataSheet("Trend", "tblTrend", "", []xcol{
		{"Day", 12, kDate, "The day (UTC)."},
		{"Average score", 14, kDec1, "The average security score that day."},
	}, func(emit func([]interface{}) error) error {
		for _, p := range rep.Trend {
			d := p.Day
			if err := emit([]interface{}{&d, p.Score}); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if err := x.analystSummary(facts); err != nil {
		return err
	}
	if facts > 0 {
		lastCol := colLetter(len(factCols))
		if err := f.AddPivotTable(&excelize.PivotTableOptions{
			DataRange: fmt.Sprintf("Facts!$A$1:$%s$%d", lastCol, facts+1), PivotTableRange: "Pivot!$B$4:$H$30", Name: "FindingsByAccount",
			Rows: []excelize.PivotTableField{{Data: "Account"}}, Columns: []excelize.PivotTableField{{Data: "Severity"}},
			Data:           []excelize.PivotTableField{{Data: "Finding ID", Subtotal: "Count", Name: "Findings"}},
			Filter:         []excelize.PivotTableField{{Data: "Class"}},
			RowGrandTotals: true, ColGrandTotals: true, ShowDrill: true, ShowRowHeaders: true, ShowColHeaders: true, ShowLastColumn: true,
			PivotTableStyleName: "PivotStyleLight1",
		}); err != nil {
			return err
		}
		_ = f.SetCellValue("Pivot", "B1", "Findings by account and severity")
		_ = f.SetCellStyle("Pivot", "B1", "B1", x.st["title"])
		_ = f.SetCellValue("Pivot", "B2", "A pivot table over tblFacts. Drag fields to rearrange; refresh it after editing Facts.")
		_ = f.SetCellStyle("Pivot", "B2", "B2", x.st["sub"])
		_ = f.SetColWidth("Pivot", "B", "B", 30)
	}
	if err := x.dictionary(); err != nil {
		return err
	}
	_ = f.SetCalcProps(&excelize.CalcPropsOptions{FullCalcOnLoad: boolPtr(true)})
	x.finish("Identity Security Posture Report")
	return f.Write(w)
}

var factCols = []xcol{
	{"Finding ID", 13, kMono, "Unique finding: check reference and a number."},
	{"Check ID", 11, kMono, "Key to tblChecks."},
	{"Identity key", 12, kMono, "Key to tblIdentities."},
	{"Account ID", 14, kMono, "Key to tblAccounts."},
	{"Check", 34, kText, "The failing check."},
	{"Severity", 10, kSev, "Critical, High, Medium or Low."},
	{"Severity rank", 9, kInt, "1 Critical to 4 Low, for sorting."},
	{"Priority", 9, kText, "P1 to P4."},
	{"Security area", 16, kText, "The check's area."},
	{"Identity", 28, kText, "The identity's name."},
	{"Type", 16, kText, "The identity's type."},
	{"Class", 10, kText, "Human or non-human."},
	{"Account", 24, kText, "The account's name."},
	{"Score", 8, kDec1, "The identity's security score."},
	{"Points", 8, kDec1, "Score points this finding takes off the identity."},
	{"Failing since", 12, kDate, "When it started failing."},
	{"Days failing", 9, kInt, "Days since then."},
	{"Target days", 9, kInt, "Remediation target for the severity, in days from first detection."},
	{"Due date", 12, kDate, "Failing since plus the target."},
	{"Days overdue", 9, kInt, "Days past the due date at report time; 0 when not overdue."},
	{"Overdue", 9, kText, "Yes when past the due date at report time."},
	{"Owner", 20, kText, "Who it is assigned to in the console; blank when unassigned."},
	{"OWASP NHI", 14, kText, "OWASP NHI Top 10 (2025) risks it is evidence of."},
	{"Evidence", 50, kWrap, "What the scan found."},
}

func (x *wb) factsSheet() (int, error) {
	rep := x.rep
	return x.dataSheet("Facts", "tblFacts", "TableStyleLight1", factCols, func(emit func([]interface{}) error) error {
		for gi, g := range rep.Groups {
			for j, it := range g.Items {
				id := rep.Identities[it.Identity]
				var since, due interface{}
				var days interface{} = ""
				pts, late, lateText, owner := 0.0, 0, "No", ""
				for _, c := range id.Checks {
					if c.RuleID == g.RuleID {
						pts, owner = c.Points, strings.TrimSpace(c.Owner)
						if c.FailingSince != nil {
							since = c.FailingSince
							days = rep.DaysFailing(c.FailingSince)
							due = rep.DueDate(c)
							if ok, by := rep.OverdueCheck(c); ok {
								late, lateText = by, "Yes"
							}
						}
					}
				}
				if err := emit([]interface{}{fmt.Sprintf("%s-%04d", FindingRef(gi), j+1), g.RuleID, id.ID, id.AccountID, g.Title, g.Severity, sevRank(g.Severity) + 1, rep.Priority(g), AreaLabel(g.Area),
					id.Name, typeLabel(id.Type), classOf(id.Human), orDash(id.Account), id.Score, pts, since, days,
					rep.SLA.Due(g.Severity), due, late, lateText, owner, strings.Join(NHIRisks(g.RuleID), ", "), it.Found}); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// analystSummary calculates its figures from the Facts sheet with formulas.
func (x *wb) analystSummary(facts int) error {
	f := x.f
	sh := "Summary"
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(false)})
	_ = f.SetColWidth(sh, "A", "A", 2.5)
	_ = f.SetColWidth(sh, "B", "B", 34)
	_ = f.SetColWidth(sh, "C", "F", 14)
	_ = f.SetColWidth(sh, "G", "G", 28)
	_ = f.SetColWidth(sh, "H", "H", 12)
	last := max(facts, 1) + 1
	col := func(name string) string {
		for i, c := range factCols {
			if c.name == name {
				l := colLetter(i + 1)
				return fmt.Sprintf("Facts!$%s$2:$%s$%d", l, l, last)
			}
		}
		return ""
	}
	set := func(cell string, v interface{}, style string) {
		_ = f.SetCellValue(sh, cell, v)
		_ = f.SetCellStyle(sh, cell, cell, x.st[style])
	}
	formula := func(cell, fx, style string) {
		_ = f.SetCellFormula(sh, cell, fx)
		_ = f.SetCellStyle(sh, cell, cell, x.st[style])
	}
	set("B4", "Findings", "k")
	formula("C4", fmt.Sprintf("COUNTA(%s)", col("Finding ID")), "int")
	set("B5", "Distinct identities with a finding", "k")
	formula("C5", fmt.Sprintf(`SUMPRODUCT((%s<>"")/COUNTIF(%s,%s&""))`, col("Identity key"), col("Identity key"), col("Identity key")), "int")
	set("B6", "Days failing, median", "k")
	formula("C6", fmt.Sprintf("MEDIAN(%s)", col("Days failing")), "int")
	set("G4", "Overdue at report time", "k")
	formula("H4", fmt.Sprintf(`COUNTIF(%s,"Yes")`, col("Overdue")), "int")
	set("G5", "Without an owner", "k")
	formula("H5", fmt.Sprintf(`COUNTBLANK(%s)`, col("Owner")), "int")
	set("G6", "Days overdue, total", "k")
	formula("H6", fmt.Sprintf(`SUM(%s)`, col("Days overdue")), "int")

	set("B8", "Findings by severity and class", "h")
	for i, h := range []string{"Non-human", "Human", "Total"} {
		set(fmt.Sprintf("%s9", colLetter(3+i)), h, "head")
	}
	set("B9", "Severity", "head")
	for i, s := range Severities {
		r := 10 + i
		set(fmt.Sprintf("B%d", r), SeverityLabel(s), "")
		_ = f.SetCellStyle(sh, fmt.Sprintf("B%d", r), fmt.Sprintf("B%d", r), x.sev[s])
		formula(fmt.Sprintf("C%d", r), fmt.Sprintf(`COUNTIFS(%s,B%d,%s,"Non-human")`, col("Severity"), r, col("Class")), "int")
		formula(fmt.Sprintf("D%d", r), fmt.Sprintf(`COUNTIFS(%s,B%d,%s,"Human")`, col("Severity"), r, col("Class")), "int")
		formula(fmt.Sprintf("E%d", r), fmt.Sprintf("C%d+D%d", r, r), "bold")
	}
	set("B15", "Findings by priority", "h")
	set("B16", "Priority", "head")
	set("C16", "Findings", "head")
	set("D16", "Points", "head")
	for i, p := range waves {
		r := 17 + i
		set(fmt.Sprintf("B%d", r), p+" "+PriorityText(p), "bold")
		formula(fmt.Sprintf("C%d", r), fmt.Sprintf(`COUNTIF(%s,"%s")`, col("Priority"), p), "int")
		formula(fmt.Sprintf("D%d", r), fmt.Sprintf(`SUMIF(%s,"%s",%s)`, col("Priority"), p, col("Points")), "dec1")
	}
	set("B22", "Findings by security area", "h")
	set("B23", "Security area", "head")
	set("C23", "Findings", "head")
	areas := x.rep.Areas()
	sort.Slice(areas, func(i, j int) bool { return areas[i].Area < areas[j].Area })
	for i, a := range areas {
		r := 24 + i
		set(fmt.Sprintf("B%d", r), a.Area, "text")
		formula(fmt.Sprintf("C%d", r), fmt.Sprintf(`COUNTIF(%s,B%d)`, col("Security area"), r), "int")
	}
	// The navy band on top: shift everything down, references follow.
	_ = f.InsertRows(sh, 1, 5)
	x.header(sh, "Summary", "Every figure is a live formula over the Facts table: edit Facts and it updates.", false)
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowRowColHeaders: boolPtr(false)})
	x.printSetup(sh, false)
	return nil
}
