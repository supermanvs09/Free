package reports

import (
	"fmt"
	"io"
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
		{"Dashboard", "The score, trend, what changed in the period, severities, score bands, accounts, security areas and the OWASP NHI Top 10, with charts."},
		{"Remediation", "By severity: open and overdue findings against the remediation targets, their age, and new, fixed and days to fix against the previous period."},
		{"Findings", "Every failing check once: severity, priority, how many identities, owners, overdue, why it matters and how to fix it."},
		{"Identities", "Every scored identity, lowest score first, with its failing checks by severity."},
		{"Compliance", "OWASP NHI Top 10 risks and framework controls the failing checks bear on."},
		{"Accepted risks", "Findings accepted or suppressed, with the reason and who decided."},
		{"Data dictionary", "What every column means."},
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
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(false), ZoomScale: fptr(90)})
	_ = f.SetColWidth(sh, "A", "A", 2.5)
	_ = f.SetColWidth(sh, "B", "M", 13.5)
	_ = f.SetColWidth(sh, "B", "B", 26)
	_ = f.SetColWidth(sh, "O", "P", 12)
	set := func(cell string, v interface{}, style string) {
		_ = f.SetCellValue(sh, cell, v)
		if style != "" {
			_ = f.SetCellStyle(sh, cell, cell, x.st[style])
		}
	}
	set("B1", "Posture dashboard", "title")
	_ = f.SetRowHeight(sh, 1, 24)
	set("B2", rep.ScopeLabel()+" · data as of "+controlLines(rep)[3][1], "sub")

	// KPI tiles, two columns each.
	type tile struct {
		label string
		v     interface{}
		sub   string
		isInt bool
	}
	avg := 0.0
	if rep.AverageScore != nil {
		avg = round1(*rep.AverageScore)
	}
	overdue := 0
	for _, n := range rep.Overdue() {
		overdue += n
	}
	tiles := []tile{
		{"AVERAGE SCORE", avg, changeText(rep.Change30d) + " in 30 days", false},
		{"WITH FAILING CHECKS", rep.FailingCount, pct(rep.FailingCount, rep.ScoredCount) + " of " + num(rep.ScoredCount) + " scored", true},
		{"OPEN CRITICAL + HIGH", rep.BySeverity["critical"] + rep.BySeverity["high"], "of " + num(rep.CheckCount) + " open findings", true},
		{"OVERDUE", overdue, "past their remediation target", true},
	}
	if h := rep.History; h != nil {
		tiles = append(tiles,
			tile{"NEW IN PERIOD", h.Current.New, wasText(rep, h.Previous.New), true},
			tile{"FIXED IN PERIOD", h.Current.Resolved, wasText(rep, h.Previous.Resolved), true})
	}
	for i, t := range tiles {
		c1 := colLetter(2 + i*2)
		c2 := colLetter(3 + i*2)
		for r := 4; r <= 6; r++ {
			_ = f.MergeCell(sh, fmt.Sprintf("%s%d", c1, r), fmt.Sprintf("%s%d", c2, r))
		}
		x.kpi(sh, c1+"4", t.label, t.v, t.sub, t.isInt)
	}
	_ = f.SetRowHeight(sh, 4, 18)
	_ = f.SetRowHeight(sh, 5, 34)
	_ = f.SetRowHeight(sh, 6, 18)

	// Severity table and chart.
	set("B9", "Findings by severity", "h")
	set("B10", "Severity", "k")
	set("C10", "Findings", "k")
	set("D10", "Share", "k")
	r := 11
	for _, s := range Severities {
		set(fmt.Sprintf("B%d", r), SeverityLabel(s), "")
		_ = f.SetCellStyle(sh, fmt.Sprintf("B%d", r), fmt.Sprintf("B%d", r), x.sev[s])
		set(fmt.Sprintf("C%d", r), rep.BySeverity[s], "int")
		share := 0.0
		if rep.CheckCount > 0 {
			share = float64(rep.BySeverity[s]) / float64(rep.CheckCount)
		}
		set(fmt.Sprintf("D%d", r), share, "pct")
		r++
	}
	var sevSeries []excelize.ChartSeries
	for i, s := range Severities {
		sevSeries = append(sevSeries, excelize.ChartSeries{Name: fmt.Sprintf("Dashboard!$B$%d", 11+i), Categories: "Dashboard!$C$10", Values: fmt.Sprintf("Dashboard!$C$%d", 11+i), Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{xSevFill[s]}}})
	}
	_ = f.AddChart(sh, "F9", &excelize.Chart{Type: excelize.Col, Series: sevSeries, Title: []excelize.RichTextRun{{Text: "Findings by severity"}},
		Legend: excelize.ChartLegend{Position: "bottom"}, Dimension: excelize.ChartDimension{Width: 480, Height: 260}, PlotArea: excelize.ChartPlotArea{ShowVal: true}})

	set("B17", "Identities by score band", "h")
	set("B18", "Band", "k")
	set("C18", "Identities", "k")
	set("D18", "Score range", "k")
	r = 19
	bandColors := []string{}
	for _, b := range rep.Bands {
		set(fmt.Sprintf("B%d", r), bandLabel(b.Band), "bold")
		set(fmt.Sprintf("C%d", r), b.Count, "int")
		set(fmt.Sprintf("D%d", r), BandRange[b.Band], "text")
		bandColors = append(bandColors, map[string]string{"critical": xSevFill["critical"], "poor": xSevFill["high"], "fair": xSevFill["medium"], "healthy": xSevFill["low"]}[b.Band])
		r++
	}
	var bandSeries []excelize.ChartSeries
	for i := range rep.Bands {
		bandSeries = append(bandSeries, excelize.ChartSeries{Name: fmt.Sprintf("Dashboard!$B$%d", 19+i), Categories: "Dashboard!$C$18", Values: fmt.Sprintf("Dashboard!$C$%d", 19+i), Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{bandColors[i]}}})
	}
	_ = f.AddChart(sh, "J9", &excelize.Chart{Type: excelize.Col, Series: bandSeries, Title: []excelize.RichTextRun{{Text: "Identities by score band"}},
		Legend: excelize.ChartLegend{Position: "bottom"}, Dimension: excelize.ChartDimension{Width: 440, Height: 260}, PlotArea: excelize.ChartPlotArea{ShowVal: true}})

	// Trend, with its data beside the chart.
	set("B25", "Average score, last 30 days", "h")
	set("O25", "Day", "k")
	set("P25", "Score", "k")
	for i, p := range rep.Trend {
		set(fmt.Sprintf("O%d", 26+i), excelDay(p.Day), "date")
		set(fmt.Sprintf("P%d", 26+i), p.Score, "dec1")
	}
	if len(rep.Trend) > 1 {
		end := 25 + len(rep.Trend)
		_ = f.AddChart(sh, "B26", &excelize.Chart{Type: excelize.Line,
			Series:    []excelize.ChartSeries{{Name: "Dashboard!$P$25", Categories: fmt.Sprintf("Dashboard!$O$26:$O$%d", end), Values: fmt.Sprintf("Dashboard!$P$26:$P$%d", end), Line: excelize.ChartLine{Width: 2.25, Smooth: false}}},
			Title:     []excelize.RichTextRun{{Text: "Average security score"}},
			Legend:    excelize.ChartLegend{Position: "none"},
			YAxis:     excelize.ChartAxis{Minimum: fptr(0), Maximum: fptr(100)},
			Dimension: excelize.ChartDimension{Width: 1060, Height: 260}})
	}

	// Accounts.
	r = 42
	set(fmt.Sprintf("B%d", r), "Accounts", "h")
	r++
	heads := []string{"Account", "Account ID", "Avg score", "Scored", "Failing", "Critical", "High", "Medium", "Low"}
	for i, h := range heads {
		set(fmt.Sprintf("%s%d", colLetter(2+i), r), h, "head")
	}
	first := r + 1
	for _, a := range rep.Accounts {
		r++
		vals := []interface{}{accountName(a), a.ID, a.Average, a.Scored, a.Failing, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"]}
		kinds := []int{kBold, kMono, kDec1, kInt, kInt, kInt, kInt, kInt, kInt}
		for i, v := range vals {
			c := x.value(kinds[i], v)
			cell := fmt.Sprintf("%s%d", colLetter(2+i), r)
			_ = f.SetCellValue(sh, cell, c.Value)
			_ = f.SetCellStyle(sh, cell, cell, c.StyleID)
		}
	}
	if r >= first {
		_ = f.SetConditionalFormat(sh, fmt.Sprintf("D%d:D%d", first, r), []excelize.ConditionalFormatOptions{
			{Type: "3_color_scale", MinType: "num", MinValue: "0", MinColor: "#F4B6B0", MidType: "num", MidValue: "60", MidColor: "#FBE7A1", MaxType: "num", MaxValue: "100", MaxColor: "#B7E1CD"}})
		_ = f.SetConditionalFormat(sh, fmt.Sprintf("F%d:F%d", first, r), []excelize.ConditionalFormatOptions{{Type: "data_bar", BarColor: "#" + xSevFill["high"], MinType: "num", MinValue: "0", MaxType: "max", BarSolid: true}})
		_ = f.SetConditionalFormat(sh, fmt.Sprintf("G%d:G%d", first, r), []excelize.ConditionalFormatOptions{{Type: "data_bar", BarColor: "#" + xSevFill["critical"], MinType: "num", MinValue: "0", MaxType: "max", BarSolid: true}})
	}

	// Security areas.
	r += 3
	set(fmt.Sprintf("B%d", r), "Security areas", "h")
	r++
	for i, h := range []string{"Security area", "Checks", "Identities", "Findings", "Critical", "High", "Medium", "Low"} {
		set(fmt.Sprintf("%s%d", colLetter(2+i), r), h, "head")
	}
	first = r + 1
	for _, a := range rep.Areas() {
		r++
		vals := []interface{}{a.Area, a.Checks, a.Identities, a.Findings, a.BySev["critical"], a.BySev["high"], a.BySev["medium"], a.BySev["low"]}
		for i, v := range vals {
			k := kInt
			if i == 0 {
				k = kBold
			}
			c := x.value(k, v)
			cell := fmt.Sprintf("%s%d", colLetter(2+i), r)
			_ = f.SetCellValue(sh, cell, c.Value)
			_ = f.SetCellStyle(sh, cell, cell, c.StyleID)
		}
	}
	if r >= first {
		_ = f.SetConditionalFormat(sh, fmt.Sprintf("E%d:E%d", first, r), []excelize.ConditionalFormatOptions{{Type: "data_bar", BarColor: "#" + xBrand, MinType: "num", MinValue: "0", MaxType: "max", BarSolid: true}})
	}

	// Age of open findings: a stacked chart of the Remediation sheet.
	r += 3
	set(fmt.Sprintf("B%d", r), "Age of open findings, by severity", "h")
	var ageSeries []excelize.ChartSeries
	for i, sv := range Severities {
		ageSeries = append(ageSeries, excelize.ChartSeries{Name: fmt.Sprintf("Remediation!$A$%d", i+2), Categories: "Remediation!$E$1:$I$1",
			Values: fmt.Sprintf("Remediation!$E$%d:$I$%d", i+2, i+2), Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{xSevFill[sv]}}})
	}
	_ = f.AddChart(sh, fmt.Sprintf("B%d", r+1), &excelize.Chart{Type: excelize.ColStacked, Series: ageSeries,
		Title: []excelize.RichTextRun{{Text: "Open findings by age"}}, Legend: excelize.ChartLegend{Position: "bottom"},
		Dimension: excelize.ChartDimension{Width: 720, Height: 280}})
	r += 17

	// OWASP NHI Top 10.
	set(fmt.Sprintf("B%d", r), "OWASP Non-Human Identities Top 10", "h")
	r++
	for i, h := range []string{"Risk", "Identities", "Findings", "Highest severity"} {
		set(fmt.Sprintf("%s%d", colLetter(2+i), r), h, "head")
	}
	for _, n := range rep.NHITop10() {
		r++
		set(fmt.Sprintf("B%d", r), n.ID+" "+n.Title, "bold")
		set(fmt.Sprintf("C%d", r), n.Identities, "int")
		set(fmt.Sprintf("D%d", r), n.Findings, "int")
		if n.Worst != "" {
			set(fmt.Sprintf("E%d", r), SeverityLabel(n.Worst), "")
			_ = f.SetCellStyle(sh, fmt.Sprintf("E%d", r), fmt.Sprintf("E%d", r), x.sev[n.Worst])
		} else {
			set(fmt.Sprintf("E%d", r), "None failing", "sub")
		}
	}
	_ = f.SetConditionalFormat(sh, fmt.Sprintf("C%d:C%d", r-9, r), []excelize.ConditionalFormatOptions{{Type: "data_bar", BarColor: "#" + xBrand, MinType: "num", MinValue: "0", MaxType: "max", BarSolid: true}})
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

// ---- B: audit register and remediation tracker -------------------------------------

// Remediation statuses the register's Status column offers.
var registerStatuses = []string{"Open", "In progress", "Risk accepted", "Fixed - to verify", "Closed"}

// WriteRegisterXLSX is workbook design B: a findings register an auditor can
// sample and the security team can work through, one row per finding with
// columns to assign, track and evidence its remediation.
func WriteRegisterXLSX(w io.Writer, rep *PostureReport) error {
	x, err := newWB(rep)
	if err != nil {
		return err
	}
	defer x.f.Close()
	sheets := []sheetInfo{
		{"Register", "One row per finding (a failing check on one identity) as an audit finding: criteria, condition, effect, recommendation, due date and owner, and yellow columns to track remediation."},
		{"Remediation", "By severity: open and overdue against the targets, age, and new, fixed and days to fix against the previous period."},
		{"Checks", "Every failing check once, with its reference, severity, priority, owners and overdue count."},
		{"Controls", "Each OWASP NHI risk and framework control and the findings that bear on it."},
		{"Accepted risks", "Findings accepted or suppressed, with the reason and who decided."},
		{"Identities", "Every scored identity in scope: the population to sample from."},
		{"Method", "Scope, scoring model, severities, score bands, remediation targets, priorities and statuses."},
		{"Data dictionary", "What every column means."},
	}
	n := 0
	for _, g := range rep.Groups {
		n += len(g.Items)
	}
	progress := func(row int) int {
		f, sh := x.f, "Cover"
		set := func(cell string, v interface{}, style string) {
			_ = f.SetCellValue(sh, cell, v)
			_ = f.SetCellStyle(sh, cell, cell, x.st[style])
		}
		set(fmt.Sprintf("B%d", row), "Remediation progress", "h")
		set(fmt.Sprintf("C%d", row), "Counts update as the Register's Status column is filled in.", "h")
		row++
		statusCol, dueCol, ownerCol := regCol("Status"), regCol("Due date"), regCol("Owner")
		rng := fmt.Sprintf("Register!$%s$2:$%s$%d", statusCol, statusCol, n+1)
		dueRng := fmt.Sprintf("Register!$%s$2:$%s$%d", dueCol, dueCol, n+1)
		ownerRng := fmt.Sprintf("Register!$%s$2:$%s$%d", ownerCol, ownerCol, n+1)
		for _, s := range registerStatuses {
			set(fmt.Sprintf("B%d", row), s, "k")
			formula := fmt.Sprintf(`COUNTIF(%s,"%s")`, rng, s)
			_ = f.SetCellFormula(sh, fmt.Sprintf("C%d", row), formula)
			_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", row), fmt.Sprintf("C%d", row), x.st["int"])
			row++
		}
		set(fmt.Sprintf("B%d", row), "Overdue today", "k")
		_ = f.SetCellFormula(sh, fmt.Sprintf("C%d", row), fmt.Sprintf(`COUNTIFS(%s,"<"&TODAY(),%s,"<>Closed",%s,"<>Risk accepted")`, dueRng, rng, rng))
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", row), fmt.Sprintf("C%d", row), x.st["int"])
		row++
		set(fmt.Sprintf("B%d", row), "Without an owner", "k")
		_ = f.SetCellFormula(sh, fmt.Sprintf("C%d", row), fmt.Sprintf(`COUNTBLANK(%s)`, ownerRng))
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", row), fmt.Sprintf("C%d", row), x.st["int"])
		row++
		set(fmt.Sprintf("B%d", row), "Closed or accepted", "k")
		_ = f.SetCellFormula(sh, fmt.Sprintf("C%d", row), fmt.Sprintf(`IF(%d=0,0,(COUNTIF(%s,"Closed")+COUNTIF(%s,"Risk accepted"))/%d)`, n, rng, rng, max(n, 1)))
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", row), fmt.Sprintf("C%d", row), x.st["pct"])
		return row + 1
	}
	if err := x.cover("Identity Security Posture Assessment · Findings register", sheets, progress); err != nil {
		return err
	}
	if err := x.register(n); err != nil {
		return err
	}
	if err := x.remediationSheet("Remediation", "Remediation"); err != nil {
		return err
	}
	if err := x.checksSheet(); err != nil {
		return err
	}
	if err := x.controlsSheet(); err != nil {
		return err
	}
	if err := x.exceptionsSheet("Accepted risks", "AcceptedRisks"); err != nil {
		return err
	}
	if _, err := x.identitiesSheet("Identities", "Population"); err != nil {
		return err
	}
	if err := x.methodSheet(); err != nil {
		return err
	}
	if err := x.dictionary(); err != nil {
		return err
	}
	_ = x.f.SetCalcProps(&excelize.CalcPropsOptions{FullCalcOnLoad: boolPtr(true)})
	x.finish("Identity Security Posture Assessment")
	return x.f.Write(w)
}

// registerCols follow the elements of an audit finding (IIA Global Internal
// Audit Standards 14.3: criteria, condition, cause, effect, recommendation),
// then the remediation target, then the yellow columns the organisation
// fills in.
var registerCols = []xcol{
	{"Finding ID", 13, kMono, "Unique reference of the finding: its check's reference and a number."},
	{"Ref", 8, kMono, "The check's reference in this report (F-001 is the most severe)."},
	{"Check ID", 11, kMono, "The posture check's ID."},
	{"Check", 34, kBold, "The posture check that fails."},
	{"Severity", 10, kSev, "How serious the failure is."},
	{"Priority", 13, kText, "P1 fix now, P2 this sprint, P3 planned, P4 hygiene."},
	{"Security area", 16, kText, "The area the check belongs to."},
	{"Identity", 30, kBold, "The identity the check fails on."},
	{"Type", 16, kText, "What kind of identity it is."},
	{"Class", 10, kText, "Human or non-human."},
	{"Account", 24, kText, "The AWS account's name."},
	{"Account ID", 14, kMono, "The 12-digit AWS account ID."},
	{"Score", 8, kDec1, "The identity's security score."},
	{"First detected", 12, kDate, "When the check started failing on this identity."},
	{"Days open", 9, kInt, "Days since then, at report time."},
	{"Target (days)", 10, kInt, "Remediation target for the severity, in days from first detection."},
	{"Due date", 12, kDate, "First detected plus the target. Red when past and the finding is not closed or accepted."},
	{"Days overdue", 10, kInt, "Days past the due date at report time; blank when not overdue."},
	{"Criteria", 48, kWrap, "What the check expects, and the controls and OWASP NHI risks it is evidence for."},
	{"Condition", 52, kWrap, "What the scan found on this identity."},
	{"Effect", 44, kWrap, "The risk if it stays."},
	{"Recommendation", 52, kWrap, "How to fix it on this identity."},
	{"OWASP NHI", 14, kText, "OWASP Non-Human Identities Top 10 (2025) risks it is evidence of."},
	{"Controls", 24, kWrap, "Framework controls it maps to."},
	{"ARN", 50, kMono, "The identity's Amazon Resource Name."},
	{"Owner", 20, kText, "Who will fix it: from the console's assignment; change it here if needed."},
	{"Status", 16, kText, "To keep up to date: Open, In progress, Risk accepted, Fixed - to verify or Closed."},
	{"Agreed date", 12, kDate, "To fill in: the date the owner commits to, when it differs from the due date."},
	{"Ticket", 14, kText, "To fill in: the change or ticket reference."},
	{"Cause", 36, kWrap, "To fill in: why the condition arose (manual change, template default, missing guardrail ...)."},
	{"Comments", 40, kWrap, "To fill in: notes, exception reason, verification evidence."},
}

// regCol is a register column's letter by name.
func regCol(name string) string {
	for i, c := range registerCols {
		if c.name == name {
			return colLetter(i + 1)
		}
	}
	panic("register column " + name)
}

func (x *wb) register(n int) error {
	rep, f := x.rep, x.f
	got, err := x.dataSheet("Register", "Register", "TableStyleLight9", registerCols, func(emit func([]interface{}) error) error {
		for gi, g := range rep.Groups {
			items := append([]GroupItem(nil), g.Items...)
			sortItemsByScore(rep, items)
			for j, it := range items {
				id := rep.Identities[it.Identity]
				var since, due, days, late interface{}
				owner := ""
				for _, c := range id.Checks {
					if c.RuleID != g.RuleID {
						continue
					}
					owner = strings.TrimSpace(c.Owner)
					if c.FailingSince != nil {
						since = c.FailingSince
						days = rep.DaysFailing(c.FailingSince)
						due = rep.DueDate(c)
						if ok, by := rep.OverdueCheck(c); ok {
							late = by
						}
					}
				}
				fix := it.Fix
				if fix == "" {
					fix = g.Fix
				}
				why := g.Risk
				if why == "" {
					why = g.About
				}
				p := rep.Priority(g)
				if err := emit([]interface{}{fmt.Sprintf("%s-%04d", FindingRef(gi), j+1), FindingRef(gi), g.RuleID, g.Title, g.Severity, p + " " + PriorityText(p), AreaLabel(g.Area),
					id.Name, typeLabel(id.Type), classOf(id.Human), orDash(id.Account), id.AccountID, id.Score, since, days, rep.SLA.Due(g.Severity), due, late,
					Criteria(g), it.Found, why, fix, strings.Join(NHIRisks(g.RuleID), ", "), strings.Join(g.Controls, ", "), id.ARN,
					owner, "Open", nil, "", "", ""}); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil || got == 0 {
		return err
	}
	last := got + 1
	status, agreed, due := regCol("Status"), regCol("Agreed date"), regCol("Due date")
	_ = f.SetCellStyle("Register", fmt.Sprintf("%s2", regCol("Owner")), fmt.Sprintf("%s%d", status, last), x.st["input"])
	_ = f.SetCellStyle("Register", fmt.Sprintf("%s2", agreed), fmt.Sprintf("%s%d", agreed, last), x.st["inputDate"])
	_ = f.SetCellStyle("Register", fmt.Sprintf("%s2", regCol("Ticket")), fmt.Sprintf("%s%d", regCol("Comments"), last), x.st["input"])
	dv := excelize.NewDataValidation(true)
	dv.Sqref = fmt.Sprintf("%s2:%s%d", status, status, last)
	_ = dv.SetDropList(registerStatuses)
	dv.SetError(excelize.DataValidationErrorStyleStop, "Status", "Choose a status from the list.")
	_ = f.AddDataValidation("Register", dv)
	dd := excelize.NewDataValidation(true)
	dd.Sqref = fmt.Sprintf("%s2:%s%d", agreed, agreed, last)
	_ = dd.SetRange(45658, 73050, excelize.DataValidationTypeDate, excelize.DataValidationOperatorBetween) // 2025-01-01 .. 2099-12-31
	dd.SetError(excelize.DataValidationErrorStyleStop, "Agreed date", "Enter a date.")
	_ = f.AddDataValidation("Register", dd)
	// Overdue, live: a due (or agreed) date in the past on a finding that is
	// not closed or accepted turns red when the workbook is opened later.
	overdue, _ := f.NewConditionalStyle(&excelize.Style{Font: &excelize.Font{Color: "B42318", Bold: true}, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FDECEA"}}})
	for _, c := range []string{due, agreed} {
		_ = f.SetConditionalFormat("Register", fmt.Sprintf("%s2:%s%d", c, c, last), []excelize.ConditionalFormatOptions{
			{Type: "formula", Criteria: fmt.Sprintf(`AND(%s2<>"",%s2<TODAY(),$%s2<>"Closed",$%s2<>"Risk accepted")`, c, c, status, status), Format: &overdue}})
	}
	unassigned, _ := f.NewConditionalStyle(&excelize.Style{Font: &excelize.Font{Color: "B54A07", Italic: true}})
	_ = f.SetConditionalFormat("Register", fmt.Sprintf("%s2:%s%d", regCol("Owner"), regCol("Owner"), last), []excelize.ConditionalFormatOptions{
		{Type: "formula", Criteria: fmt.Sprintf(`%s2=""`, regCol("Owner")), Format: &unassigned}})
	closed, _ := f.NewConditionalStyle(&excelize.Style{Font: &excelize.Font{Color: "71717A"}})
	_ = f.SetConditionalFormat("Register", fmt.Sprintf("A2:%s%d", regCol("Comments"), last), []excelize.ConditionalFormatOptions{
		{Type: "formula", Criteria: fmt.Sprintf(`$%s2="Closed"`, status), Format: &closed}})
	_ = f.SetPanes("Register", &excelize.Panes{Freeze: true, XSplit: 1, YSplit: 1, TopLeftCell: "B2", ActivePane: "bottomRight"})
	return nil
}

func (x *wb) checksSheet() error {
	_, err := x.findingsSheet("Checks", "Checks")
	return err
}

func (x *wb) controlsSheet() error {
	rep := x.rep
	_, err := x.dataSheet("Controls", "Controls", "", []xcol{
		{"Framework", 30, kBold, "The security framework, or the OWASP NHI Top 10."},
		{"Control", 30, kMono, "The control within the framework, or the OWASP risk."},
		{"Ref", 8, kMono, "The failing check's reference."},
		{"Check", 40, kText, "The failing check."},
		{"Severity", 10, kSev, "The check's severity."},
		{"Identities", 11, kInt, "Identities failing the check."},
	}, func(emit func([]interface{}) error) error {
		for _, r := range rep.NHITop10() {
			for _, gi := range r.Checks {
				g := rep.Groups[gi]
				if err := emit([]interface{}{"OWASP NHI Top 10 (2025)", r.ID + " " + r.Title, FindingRef(gi), g.Title, g.Severity, len(g.Items)}); err != nil {
					return err
				}
			}
		}
		for _, fw := range rep.Frameworks() {
			for _, r := range fw.Rows {
				for _, gi := range r.Checks {
					g := rep.Groups[gi]
					if err := emit([]interface{}{fw.Name, r.Control, FindingRef(gi), g.Title, g.Severity, len(g.Items)}); err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
	return err
}

func (x *wb) methodSheet() error {
	f, rep := x.f, x.rep
	sh := "Method"
	if _, err := f.NewSheet(sh); err != nil {
		return err
	}
	_ = f.SetSheetView(sh, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(false)})
	_ = f.SetColWidth(sh, "A", "A", 2.5)
	_ = f.SetColWidth(sh, "B", "B", 24)
	_ = f.SetColWidth(sh, "C", "C", 100)
	r := 1
	put := func(k, v, ks, vs string) {
		_ = f.SetCellValue(sh, fmt.Sprintf("B%d", r), k)
		_ = f.SetCellStyle(sh, fmt.Sprintf("B%d", r), fmt.Sprintf("B%d", r), x.st[ks])
		_ = f.SetCellValue(sh, fmt.Sprintf("C%d", r), v)
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", r), fmt.Sprintf("C%d", r), x.st[vs])
		r++
	}
	put("Scope and method", "", "title", "v")
	r++
	put("Scope", "", "h", "h")
	for _, kv := range scopeLines(rep) {
		put(kv[0], kv[1], "k", "v")
	}
	r++
	put("How the figures are made", "", "h", "h")
	for i, m := range methodology {
		put(fmt.Sprintf("%d", i+1), m, "k", "v")
	}
	r++
	put("Severity", "", "h", "h")
	for _, s := range Severities {
		_ = f.SetCellValue(sh, fmt.Sprintf("B%d", r), SeverityLabel(s))
		_ = f.SetCellStyle(sh, fmt.Sprintf("B%d", r), fmt.Sprintf("B%d", r), x.sev[s])
		_ = f.SetCellValue(sh, fmt.Sprintf("C%d", r), SeverityMeaning[s])
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", r), fmt.Sprintf("C%d", r), x.st["v"])
		r++
	}
	r++
	put("Score bands", "", "h", "h")
	for _, b := range []string{"healthy", "fair", "poor", "critical"} {
		put(bandLabel(b), BandRange[b], "bold", "v")
	}
	r++
	put("Remediation targets", "", "h", "h")
	for _, sv := range Severities {
		_ = f.SetCellValue(sh, fmt.Sprintf("B%d", r), SeverityLabel(sv))
		_ = f.SetCellStyle(sh, fmt.Sprintf("B%d", r), fmt.Sprintf("B%d", r), x.sev[sv])
		_ = f.SetCellValue(sh, fmt.Sprintf("C%d", r), fmt.Sprintf("%d days from first detection", rep.SLA.Due(sv)))
		_ = f.SetCellStyle(sh, fmt.Sprintf("C%d", r), fmt.Sprintf("C%d", r), x.st["v"])
		r++
	}
	put("Source", strings.TrimSuffix(rep.SLA.Source, ".")+". A finding is overdue when it is still open after its target; the Register's due dates turn red when that day passes.", "k", "v")
	r++
	put("Priorities", "", "h", "h")
	put("P1 Fix now", "Critical checks, and high checks failing on 10% or more of scored identities.", "bold", "v")
	put("P2 This sprint", "Other high checks, and medium checks failing on 10% or more.", "bold", "v")
	put("P3 Planned", "Other medium checks.", "bold", "v")
	put("P4 Hygiene", "Low checks.", "bold", "v")
	r++
	put("Statuses", "", "h", "h")
	put("Open", "Not started.", "bold", "v")
	put("In progress", "Someone is fixing it.", "bold", "v")
	put("Risk accepted", "Kept on purpose, with the reason in Comments and the approver named. Not counted as overdue.", "bold", "v")
	put("Fixed - to verify", "Changed; the next scan confirms it.", "bold", "v")
	put("Closed", "The scan no longer finds it.", "bold", "v")
	x.printSetup(sh, false)
	return nil
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
		{"Summary", "Figures calculated from the Facts table: they follow any change you make there."},
		{"Pivot", "A pivot table of findings by account and severity, ready to rearrange."},
		{"Facts", "Table tblFacts: one row per finding, with every key and measure."},
		{"Identities", "Table tblIdentities: every scored identity (key: Identity key)."},
		{"Checks", "Table tblChecks: every failing check (key: Check ID)."},
		{"Accounts", "Table tblAccounts: every account (key: Account ID)."},
		{"Control map", "Table tblControlMap: check to framework control or OWASP NHI risk, one row per pair."},
		{"Remediation", "Table tblRemediation: by severity, open, overdue and age now, and new, fixed and days to fix in this period and the previous one."},
		{"Accepted risks", "Table tblExceptions: findings accepted or suppressed, with the reason and who decided."},
		{"Trend", "Table tblTrend: the average score per day."},
		{"Data dictionary", "What every column means."},
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
			PivotTableStyleName: "PivotStyleMedium2",
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
	return x.dataSheet("Facts", "tblFacts", "TableStyleLight9", factCols, func(emit func([]interface{}) error) error {
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
	set("B1", "Summary (calculated)", "title")
	set("B2", "Every figure below is a formula over the Facts sheet.", "sub")
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
	x.printSetup(sh, false)
	return nil
}
