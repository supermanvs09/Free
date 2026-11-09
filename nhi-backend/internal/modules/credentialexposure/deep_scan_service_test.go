package credentialexposure

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestPickPlatform(t *testing.T) {
	both := []string{"codecommit", "github"}
	slashy := []string{"github", "bitbucket"}
	cases := []struct {
		asked, repo string
		known       []string
		want        string
		err         error
	}{
		{"github", "owner/repo", both, "github", nil},
		{"github", "owner/repo", []string{"codecommit"}, "", ErrDeepScanClientNotFound},
		{"", "anything", []string{"codecommit"}, "codecommit", nil},
		{"", "owner/repo", nil, "", ErrDeepScanClientNotFound},
		{"", "owner/repo", both, "github", nil},
		{"", "plain-name", both, "codecommit", nil},
		{"", "LIV/repo", []string{"bitbucket"}, "bitbucket", nil},
		{"", "LIV/repo", slashy, "", ErrPlatformRequired},
		{"bitbucket", "LIV/repo", slashy, "bitbucket", nil},
		{"", "LIV/repo", []string{"codecommit", "bitbucket"}, "bitbucket", nil},
	}
	for _, tc := range cases {
		got, err := pickPlatform(tc.asked, tc.repo, tc.known)
		if got != tc.want || !errors.Is(err, tc.err) {
			t.Errorf("pickPlatform(%q, %q, %v) = %q, %v; want %q, %v", tc.asked, tc.repo, tc.known, got, err, tc.want, tc.err)
		}
	}
}

func TestParseBranches(t *testing.T) {
	cases := []struct {
		raw   string
		mode  string
		names []string
		bad   bool
	}{
		{``, "", nil, false},
		{`null`, "", nil, false},
		{`"default"`, "default", nil, false},
		{`"ALL"`, "all", nil, false},
		{`["dev","refs/heads/main","dev"]`, "list", []string{"dev", "main"}, false},
		{`"some"`, "", nil, true},
		{`[]`, "", nil, true},
		{`[""]`, "", nil, true},
		{`["a:b"]`, "", nil, true},
		{`42`, "", nil, true},
	}
	for _, tc := range cases {
		mode, names, err := parseBranches(json.RawMessage(tc.raw))
		if (err != nil) != tc.bad || mode != tc.mode || !reflect.DeepEqual(names, tc.names) {
			t.Errorf("parseBranches(%s) = %q, %v, %v", tc.raw, mode, names, err)
		}
	}
	many := make([]string, 51)
	for i := range many {
		many[i] = strings.Repeat("b", i+1)
	}
	raw, _ := json.Marshal(many)
	if _, _, err := parseBranches(raw); err == nil {
		t.Error("51 branches should be refused")
	}
}

func TestSplitRepoKey(t *testing.T) {
	for key, want := range map[string][2]string{
		"repo":                  {"repo", ""},
		"repo:feature/x":        {"repo", "feature/x"},
		"LIV/live_testing:main": {"LIV/live_testing", "main"},
	} {
		r, b := splitRepoKey(key)
		if r != want[0] || b != want[1] {
			t.Errorf("splitRepoKey(%q) = %q, %q", key, r, b)
		}
	}
}

func TestRepositoryDefaultBranchAndOptions(t *testing.T) {
	updated := "2026-11-05T08:00:00+00:00"
	a := &repoAcc{
		repo:       Repository{ClientID: "c", Repository: "r", Platform: "github"},
		ledger:     map[string]BranchInfo{"": {LastScannedAt: &updated}, "feature/x": {Name: "feature/x"}},
		findingsBy: map[string]int{"main": 7, "feature/x": 9},
		deepBy:     map[string]int{"main": 2},
		deepScans:  map[string]*DeepScanResult{},
	}
	repo := a.build()
	if repo.DefaultBranch == nil || *repo.DefaultBranch != "main" {
		t.Fatalf("default = %v; want main (feature/x is another ledger branch)", repo.DefaultBranch)
	}
	if len(repo.Branches) != 2 || !repo.Branches[0].Default || repo.Branches[0].Name != "main" || repo.Branches[0].LastScannedAt == nil {
		t.Fatalf("branches = %+v", repo.Branches)
	}
	if repo.DeepFindings != 2 {
		t.Errorf("deep findings = %d", repo.DeepFindings)
	}
	out := branchesOf(repo)
	if !out.Complete || out.Options[0].Label != "Default branch (main)" || out.Options[1].Value != "all" || len(out.Options) != 4 {
		t.Fatalf("options = %+v", out.Options)
	}

	// Nothing to infer from: the default branch keeps its ledger row, unnamed.
	b := &repoAcc{repo: Repository{Repository: "r2"}, ledger: map[string]BranchInfo{"": {}}, findingsBy: map[string]int{},
		deepBy: map[string]int{}, deepScans: map[string]*DeepScanResult{}}
	repo2 := b.build()
	out2 := branchesOf(repo2)
	if repo2.DefaultBranch != nil || out2.Complete || out2.Warning == nil || len(out2.Options) != 1 || len(out2.Branches) != 0 {
		t.Fatalf("unknown default: %+v / %+v", repo2, out2)
	}
}

func TestPlatformSelectFillsMissingColumns(t *testing.T) {
	cat := &schemaCatalog{tables: map[string]map[string]bool{}}
	cols := map[string]bool{}
	for _, c := range findingCols {
		if c.name != "bitbucket_uri" && c.name != "platform" && c.name != "noise_flags" {
			cols[c.name] = true
		}
	}
	cat.tables["secscan_findings_github"] = cols
	q, ok := platformSelect(cat, `"s"`, platformTable{platform: "github", table: "secscan_findings_github"})
	if !ok {
		t.Fatal("table should be readable")
	}
	for _, want := range []string{"NULL::text AS bitbucket_uri", "'github'::text AS platform", "NULL::text AS noise_flags"} {
		if !strings.Contains(q, want) {
			t.Errorf("select lacks %q", want)
		}
	}
	if strings.Contains(q, "allowlist") {
		t.Error("no allowlist table: nothing to exclude by")
	}
	delete(cols, "redacted")
	if _, ok := platformSelect(cat, `"s"`, platformTable{platform: "github", table: "secscan_findings_github"}); ok {
		t.Error("a table without a required column must be skipped")
	}
	if got := unionOf(&schemaCatalog{tables: map[string]map[string]bool{}}, `"s"`, kindDeepFindings); !strings.Contains(got, "WHERE false") {
		t.Errorf("no tables: %s", got)
	}
}

// After the scanner's merge the old per-platform names are views of
// secscan_findings: reading them as well would count every finding twice.
func TestMergedFindingsTableIsReadOnce(t *testing.T) {
	cols := map[string]bool{}
	for _, c := range findingCols {
		cols[c.name] = true
	}
	cat := &schemaCatalog{tables: map[string]map[string]bool{
		"secscan_findings":            cols,
		"secscan_findings_codecommit": cols, // views
		"secscan_findings_github":     cols,
		"secscan_findings_bitbucket":  cols,
	}}
	q := unionOf(cat, `"s"`, kindFindings)
	if strings.Contains(q, "secscan_findings_") || strings.Count(q, `"s".secscan_findings f`) != 1 {
		t.Fatalf("merged table must be read once and the views never:\n%s", q)
	}
	if !strings.Contains(q, "COALESCE(NULLIF(f.platform,''),'codecommit') AS platform") {
		t.Errorf("a row without platform is CodeCommit:\n%s", q)
	}
	pts := cat.platformTables(kindFindings)
	if len(pts) != 3 || pts[1].table != "secscan_findings" || !strings.Contains(pts[1].where, "= 'github'") {
		t.Fatalf("per-platform view of the merged table = %+v", pts)
	}
	// Before the merge: the per-platform tables, unfiltered.
	old := &schemaCatalog{tables: map[string]map[string]bool{"secscan_findings_github": cols}}
	if pts := old.platformTables(kindFindings); len(pts) != 1 || pts[0].table != "secscan_findings_github" || pts[0].where != "" {
		t.Fatalf("pre-merge tables = %+v", pts)
	}
}
