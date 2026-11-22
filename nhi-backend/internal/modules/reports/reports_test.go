package reports

import (
	"bytes"
	"encoding/csv"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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
	return &PostureReport{
		GeneratedAt: time.Now().UTC(), Options: PostureOptions{Class: ClassAll, IncludeInfo: true, IncludeFix: true, IncludeSev: true},
		ScoredCount: 2, AverageScore: &score, FailingCount: 1, CheckCount: 2, AccountsCovered: 1,
		BySeverity: map[string]int{"critical": 1, "high": 1},
		TopChecks:  []TopCheck{{Title: "Workload role has administrator access", Severity: "critical", Identities: 1}},
		Identities: []ReportIdentity{{Name: "=web-1", ARN: "arn:aws:iam::111111111111:role/web-1", Type: "ec2_instance", AccountID: "111111111111", Account: "acme-prod", Score: &score, Band: "poor",
			Checks: []ReportCheck{
				{RuleID: "ADM-01", Title: "Workload role has administrator access", Severity: "critical", Area: "least_privilege", Found: "AdministratorAccess attached → web-role", About: "Admin policy check", Fix: "Detach it", FailingSince: &since},
				{RuleID: "X", Title: "Role trusts another account", Severity: "high", Found: "", About: "", Fix: ""},
			}}},
	}
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
