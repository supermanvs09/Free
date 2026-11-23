package reports

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

func TestOptions(t *testing.T) {
	cases := []struct {
		q      string
		ok     bool
		class  string
		sev    []string
		info   bool
		fix    bool
		sevCol bool
	}{
		{"", true, ClassAll, nil, true, true, true},
		{"class=human&severity=low,critical", true, ClassHuman, []string{"critical", "low"}, true, true, true},
		{"class=nhi&include=fix", true, ClassNHI, nil, false, true, false},
		{"include=", true, ClassAll, nil, false, false, false},
		{"class=robots", false, "", nil, false, false, false},
		{"severity=urgent", false, "", nil, false, false, false},
		{"include=everything", false, "", nil, false, false, false},
		{"account=" + strings.Repeat("9", 129), false, "", nil, false, false, false},
		{"account=" + manyAccounts(101), false, "", nil, false, false, false},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/reports/posture/export?"+c.q, nil)
		o, ok := options(w, r)
		if ok != c.ok {
			t.Fatalf("%q: ok=%v want %v", c.q, ok, c.ok)
		}
		if !ok {
			if w.Code != 400 {
				t.Fatalf("%q: status %d", c.q, w.Code)
			}
			continue
		}
		if o.Class != c.class || strings.Join(o.Severities, ",") != strings.Join(c.sev, ",") || o.IncludeInfo != c.info || o.IncludeFix != c.fix || o.IncludeSev != c.sevCol {
			t.Fatalf("%q: got %+v", c.q, o)
		}
	}
}

func sample() *PostureReport {
	score := 41.0
	since := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	rep := &PostureReport{
		GeneratedAt: time.Now().UTC(), Options: PostureOptions{Class: ClassAll, IncludeInfo: true, IncludeFix: true, IncludeSev: true},
		ScoredCount: 2, AverageScore: &score, FailingCount: 1, CheckCount: 2, AccountsCovered: 1,
		BySeverity: map[string]int{"critical": 1, "high": 1},
		Bands:      []BandCount{{"poor", 1}, {"healthy", 1}},
		Identities: []ReportIdentity{{ID: "1", Name: "=web-1", ARN: "arn:aws:iam::111111111111:role/web-1", Type: "ec2_instance", AccountID: "111111111111", Account: "acme-prod", Score: &score, Band: "poor",
			Checks: []ReportCheck{
				{RuleID: "ADM-01", Check: "Administrator access on a workload role", Title: "Workload role has administrator access", Severity: "critical", Area: "least_privilege", Found: "AdministratorAccess attached → web-role", About: "Admin policy check", Fix: "Detach it", FailingSince: &since},
				{RuleID: "X", Check: "Role trusts another account", Title: "Role trusts another account", Severity: "high", Found: "", About: "", Fix: ""},
			}}},
	}
	summarise(rep)
	return rep
}

func TestCSV(t *testing.T) {
	var buf bytes.Buffer
	if err := WritePostureCSV(&buf, sample()); err != nil {
		t.Fatal(err)
	}
	recs, err := csv.NewReader(&buf).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 3 || recs[0][0] != "Identity" || recs[1][0] != "'=web-1" || recs[1][6] != "Critical" {
		t.Fatalf("unexpected csv: %v", recs)
	}
	o := sample()
	o.Options.IncludeSev, o.Options.IncludeInfo, o.Options.IncludeFix = false, false, false
	buf.Reset()
	_ = WritePostureCSV(&buf, o)
	recs, _ = csv.NewReader(&buf).ReadAll()
	for _, h := range recs[0] {
		if h == "Severity" || h == "How to fix" || h == "What the check looks at" {
			t.Fatalf("column %q should be left out", h)
		}
	}
}

func TestPDF(t *testing.T) {
	var buf bytes.Buffer
	if err := WritePosturePDF(&buf, sample()); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(buf.Bytes(), []byte("%PDF")) || buf.Len() < 2000 {
		t.Fatalf("not a pdf (%d bytes)", buf.Len())
	}
	empty := sample()
	empty.Identities, empty.CheckCount, empty.FailingCount = nil, 0, 0
	buf.Reset()
	if err := WritePosturePDF(&buf, empty); err != nil {
		t.Fatal(err)
	}
}

func TestSortGroupsSeverityFirst(t *testing.T) {
	g := func(title, sev string, n int) CheckGroup {
		return CheckGroup{Title: title, Severity: sev, Items: make([]GroupItem, n)}
	}
	groups := []CheckGroup{g("Session too long", "medium", 5), g("Admin access", "critical", 1), g("Cross-account trust", "high", 1), g("Old key", "high", 3)}
	sortGroups(groups)
	want := []string{"Admin access", "Old key", "Cross-account trust", "Session too long"}
	for i, w := range want {
		if groups[i].Title != w {
			t.Fatalf("position %d: got %q, want %q", i, groups[i].Title, w)
		}
	}
}

// Findings name the identity in their title ("User bob can pass any role"),
// so checks group by rule, not by title: one row per check, not per identity.
func TestGroupsByRule(t *testing.T) {
	s1, s2 := 30.0, 70.0
	rep := &PostureReport{BySeverity: map[string]int{}, Identities: []ReportIdentity{
		{ID: "a", Name: "alice", AccountID: "1", Score: &s1, Checks: []ReportCheck{{RuleID: "PASS-01", Check: "Can pass any role", Title: "User alice can pass any role", Severity: "high", Fix: "Scope PassRole"}}},
		{ID: "b", Name: "bob", AccountID: "2", Score: &s2, Checks: []ReportCheck{
			{RuleID: "PASS-01", Check: "Can pass any role", Title: "User bob can pass any role", Severity: "high", Fix: "Scope PassRole for bob"},
			{RuleID: "ADM-01", Check: "Admin", Title: "Admin", Severity: "critical"},
		}},
	}}
	summarise(rep)
	if len(rep.Groups) != 2 || rep.Groups[0].RuleID != "ADM-01" || len(rep.Groups[1].Items) != 2 || !rep.Groups[1].ManyFix {
		t.Fatalf("groups: %+v", rep.Groups)
	}
	if rep.Accounts[0].ID != "2" { // the account holding the critical check first
		t.Fatalf("accounts: %+v", rep.Accounts)
	}
	if p := rep.PriorityIdentities(); p[0].Name != "bob" { // critical beats a lower score
		t.Fatalf("priority: %v", p[0].Name)
	}
}

func TestXLSX(t *testing.T) {
	rep := sample()
	rep.Population = append(append([]ReportIdentity{}, rep.Identities...), ReportIdentity{ID: "2", Name: "clean-role", Type: "iam_role"})
	var buf bytes.Buffer
	if err := WritePostureXLSX(&buf, rep); err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(f.GetSheetList(), "|"); got != "Summary|Identities|Failing checks" {
		t.Fatalf("sheets %q", got)
	}
	if f.GetActiveSheetIndex() != 0 {
		t.Fatal("the workbook must open on Summary")
	}
	ids, _ := f.GetRows("Identities")
	if len(ids) != 3 || ids[1][0] != "=web-1" || ids[2][0] != "clean-role" { // text, not a formula; passing identities after
		t.Fatalf("identities: %v", ids)
	}
	if formula, _ := f.GetCellFormula("Identities", "A2"); formula != "" {
		t.Fatalf("a name became a formula: %q", formula)
	}
	checks, _ := f.GetRows("Failing checks")
	if len(checks) != 3 || checks[0][6] != "Check" || checks[1][6] != "Administrator access on a workload role" {
		t.Fatalf("checks: %v", checks[0])
	}
}

// A tenant with thousands of identities: the PDF must stay a document
// someone reads, and every identity must still reach the workbook.
func TestLargeReport(t *testing.T) {
	const n = 6500
	rep := &PostureReport{GeneratedAt: time.Now().UTC(), Options: PostureOptions{Class: ClassAll, IncludeInfo: true, IncludeFix: true, IncludeSev: true},
		BySeverity: map[string]int{}, ScoredCount: n, AccountsCovered: 40}
	rules := []struct{ id, sev string }{{"ADM-01", "critical"}, {"PASS-01", "high"}, {"XACCT-02", "high"}, {"KEY-01", "medium"}, {"SESS-01", "medium"}, {"TAG-01", "low"}}
	for i := 0; i < n; i++ {
		score := float64(20 + i%80)
		id := ReportIdentity{ID: fmt.Sprint(i), Name: fmt.Sprintf("workload-%05d", i), Type: "iam_role", AccountID: fmt.Sprintf("1000000000%02d", i%40), Score: &score}
		for j, r := range rules {
			if (i+j)%(j+2) == 0 {
				since := time.Now().Add(-time.Duration(i%60) * 24 * time.Hour)
				id.Checks = append(id.Checks, ReportCheck{RuleID: r.id, Check: "Check " + r.id, Title: fmt.Sprintf("%s fails %s", id.Name, r.id), Severity: r.sev, FailingSince: &since,
					Found: strings.Repeat("Long evidence text that wraps over more than one line in the table. ", 3), About: "About " + r.id, Fix: "Fix " + r.id})
				rep.BySeverity[r.sev]++
				rep.CheckCount++
			}
		}
		if len(id.Checks) > 0 {
			rep.Identities = append(rep.Identities, id)
		}
	}
	rep.FailingCount = len(rep.Identities)
	summarise(rep)

	// Page numbers printed on page 1 come from a first layout pass: the
	// second pass must put every section and check on the same page.
	first := render(rep, nil)
	final := render(rep, &first.pages)
	if fmt.Sprint(first.pages) != fmt.Sprint(final.pages) {
		t.Fatalf("pages moved between passes: %v vs %v", first.pages, final.pages)
	}

	start := time.Now()
	var buf bytes.Buffer
	if err := WritePosturePDF(&buf, rep); err != nil {
		t.Fatal(err)
	}
	pages := len(regexp.MustCompile(`/Type /Page\b`).FindAll(buf.Bytes(), -1))
	t.Logf("pdf: %d identities failing, %d checks -> %d pages, %d KB, %s", rep.FailingCount, rep.CheckCount, pages, buf.Len()/1024, time.Since(start))
	if pages > 30 {
		t.Fatalf("PDF has %d pages; it should summarise, not list every identity", pages)
	}

	start = time.Now()
	buf.Reset()
	if err := WritePostureXLSX(&buf, rep); err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(&buf)
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := f.GetRows("Failing checks")
	t.Logf("xlsx: %d failing-check rows, %d KB, %s", len(rows)-1, buf.Len()/1024, time.Since(start))
	if len(rows)-1 != rep.CheckCount {
		t.Fatalf("workbook has %d rows, want %d", len(rows)-1, rep.CheckCount)
	}
}

func TestAccountFilter(t *testing.T) {
	w := httptest.NewRecorder()
	o, ok := options(w, httptest.NewRequest("GET", "/reports/posture/export?account=111111111111,%20222222222222,111111111111", nil))
	if !ok || strings.Join(o.Accounts, ",") != "111111111111,222222222222" {
		t.Fatalf("accounts: %v %v", ok, o.Accounts)
	}
	// IDs reach SQL as quoted literals: a quote in one cannot end the string.
	if got := accountWhere([]string{"1' OR '1'='1"}); got != " AND p.account_id IN ('1'' OR ''1''=''1')" {
		t.Fatalf("accountWhere: %s", got)
	}
	if accountWhere(nil) != "" {
		t.Fatal("no accounts must mean no clause")
	}
	rep := &PostureReport{Options: PostureOptions{Class: ClassHuman, Accounts: []string{"1", "2"}}, Accounts: []AccountRow{{ID: "1", Name: "team-a"}, {ID: "2"}}}
	if got := rep.ScopeLabel(); got != "Human identities in team-a and 2" {
		t.Fatalf("scope label: %q", got)
	}
}

func manyAccounts(n int) string {
	ids := make([]string, n)
	for i := range ids {
		ids[i] = fmt.Sprintf("%012d", i)
	}
	return strings.Join(ids, ",")
}
