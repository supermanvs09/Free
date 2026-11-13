package correlation

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestGlobMatch(t *testing.T) {
	cases := []struct {
		pat, s string
		want   bool
	}{
		{"s3:*", "s3:GetObject", true},
		{"S3:getobject", "s3:GetObject", true},
		{"s3:Get*", "s3:PutObject", false},
		{"*", "iam:PassRole", true},
		{"iam:?ole", "iam:Role", true},
		{"arn:aws:s3:::*", "arn:aws:s3:::bucket/key", true},
		{"arn:aws:s3:::a*", "arn:aws:s3:::b", false},
		{"", "x", false},
		{"*x*y*", "axbyc", true},
	}
	for _, c := range cases {
		if got := globMatch(c.pat, c.s); got != c.want {
			t.Errorf("globMatch(%q,%q)=%v want %v", c.pat, c.s, got, c.want)
		}
	}
}

func TestApplyDenies(t *testing.T) {
	got := ApplyDenies([]ResourcePermission{
		perm("s3:*", "Allow", "arn:aws:s3:::*"),
		perm("ec2:Describe*", "Allow", "*"),
		perm("s3:DeleteObject", "Deny", "*"),
	})
	for _, p := range got {
		if isDeny(p) {
			t.Error("deny statements must not be returned")
		}
	}
	// A Deny of one action does not remove a broader s3:* allow (the engine cannot subtract
	// one action from a wildcard), so both allows remain.
	if len(got) != 2 {
		t.Errorf("want 2 remaining allows, got %d", len(got))
	}
}

func TestGroupByResourceCollapsesWildcards(t *testing.T) {
	g := GroupByResource([]ResourcePermission{
		perm("a:x", "Allow", "*"), perm("a:y", "Allow", "arn:aws:*"), perm("a:z", "Allow", ""),
	})
	if len(g) != 1 || g[0].ResourceARN != "*:a" || len(g[0].Actions) != 2 {
		t.Fatalf("both wildcard forms of service a collapse into one '*:a' grant: %+v", g)
	}
}

func TestWildcardGrantsAreGroupedPerService(t *testing.T) {
	g := GroupByResource([]ResourcePermission{
		perm("s3:GetObject", "Allow", "*"), perm("s3:PutObject", "Allow", "*"),
		perm("ec2:Describe*", "Allow", "*"), perm("*", "Allow", "*"),
		perm("s*:Get*", "Allow", "*"),
		perm("s3:GetObject", "Allow", "arn:aws:s3:::logs-*"),
	})
	byRes := map[string]ResourceGrant{}
	for _, x := range g {
		byRes[x.ResourceARN] = x
	}
	if s3 := byRes["*:s3"]; len(s3.Actions) != 2 {
		t.Errorf("all-S3 grant should list both S3 actions: %+v", s3)
	}
	if _, ok := byRes["*:ec2"]; !ok {
		t.Error("all-EC2 grant missing")
	}
	if all := byRes[AllResourcesARN]; len(all.Actions) != 2 { // "*" and "s*:Get*" have no single service
		t.Errorf("action * and an unknown-service pattern go to the all-resources node: %+v", all)
	}
	if p := byRes["arn:aws:s3:::logs-*"]; !containsString(p.Flags, "resource_pattern") {
		t.Errorf("a resource pattern must be flagged: %+v", p)
	}
}

func TestConditionalDenyFlagsInsteadOfRemoving(t *testing.T) {
	got := ApplyDenies([]ResourcePermission{
		perm("s3:GetObject", "Allow", "arn:aws:s3:::a"),
		perm("s3:GetObject", "Allow", "arn:aws:s3:::b"),
		{Action: "s3:GetObject", Effect: "Deny", ResourceARN: "arn:aws:s3:::a", Conditional: true},
		{Action: "s3:GetObject", Effect: "Deny", ResourceARN: "arn:aws:s3:::b"},
	})
	if len(got) != 1 || got[0].ResourceARN != "arn:aws:s3:::a" {
		t.Fatalf("only the unconditionally denied resource disappears: %+v", got)
	}
	if !containsString(got[0].Flags, "may_be_denied_by_conditional_deny") {
		t.Errorf("a conditional Deny must flag the Allow it might shadow: %+v", got[0])
	}
}

func TestGrantFlagsForConditionsAndNotAction(t *testing.T) {
	g := GroupByResource([]ResourcePermission{
		{Action: "s3:GetObject", Effect: "Allow", ResourceARN: "arn:aws:s3:::a", Conditional: true},
		{Action: "s3:PutObject", Effect: "Allow", ResourceARN: "arn:aws:s3:::a"},
		{Action: "*", Effect: "Allow", ResourceARN: "*", ExceptActions: []string{"iam:*", "organizations:*"}},
	})
	byRes := map[string]ResourceGrant{}
	for _, x := range g {
		byRes[x.ResourceARN] = x
	}
	if !containsString(byRes["arn:aws:s3:::a"].Flags, "grant_has_conditions") {
		t.Errorf("an action granted only conditionally must flag the grant: %+v", byRes["arn:aws:s3:::a"])
	}
	all := byRes[AllResourcesARN]
	if len(all.Except) != 2 || !containsString(all.Flags, "not_action_statement") {
		t.Errorf("NotAction must be kept as an except list: %+v", all)
	}
	if len(all.EscalationActions()) != 0 {
		t.Errorf("a NotAction that excludes iam:* grants no IAM escalation, got %v", all.EscalationActions())
	}
	if all.Significance() != "high" {
		t.Errorf("everything-except-IAM is still high: %s", all.Significance())
	}
	plain := ResourceGrant{ResourceARN: AllResourcesARN, Actions: []string{"*"}}
	if len(plain.EscalationActions()) == 0 {
		t.Error("plain * includes the escalation primitives")
	}
}

func TestEscalationActions(t *testing.T) {
	if len(escalationActions([]string{"iam:PassRole"})) != 1 || len(escalationActions([]string{"iam:*"})) != 1 ||
		len(escalationActions([]string{"*"})) != 1 {
		t.Error("PassRole, iam:* and * are all escalation grants")
	}
	if len(escalationActions([]string{"s3:GetObject", "ec2:Describe*"})) != 0 {
		t.Error("read actions are not escalation")
	}
}

func TestGrantSignificance(t *testing.T) {
	cases := []struct {
		actions []string
		res     string
		want    string
	}{
		{[]string{"*"}, AllResourcesARN, "high"},
		{[]string{"s3:*"}, "arn:aws:s3:::b", "high"},
		{[]string{"s3:Get*"}, "arn:aws:s3:::b", "conditional"},
		{[]string{"iam:PassRole"}, "arn:aws:iam::1:role/x", "high"},
		{[]string{"ec2:DescribeInstances"}, "arn:aws:ec2:us-east-1:1:instance/i", "conditional"},
	}
	for _, c := range cases {
		if got := grantSignificance(c.actions, c.res); got != c.want {
			t.Errorf("%v on %s = %s want %s", c.actions, c.res, got, c.want)
		}
	}
}

func TestScoreAndRiskLevels(t *testing.T) {
	empty := &BlastRadiusResult{SourceName: "x"}
	DeriveSummary(empty, true)
	if empty.BlastRadiusScore != 0 || empty.RiskLevel != "NONE" {
		t.Errorf("empty = %v %s", empty.BlastRadiusScore, empty.RiskLevel)
	}

	admin := &BlastRadiusResult{SourceName: "x", Paths: []BlastRadiusPath{{
		TargetARN: AllResourcesARN, PathType: PathDirectAccess, Phase: 1, SecuritySignificance: "high",
		EvidenceRank: EvidenceRankEffective, Hops: []PathHop{{EdgeType: EdgeCanAccess}},
	}}}
	DeriveSummary(admin, true)
	if admin.RiskLevel != "CRITICAL" {
		t.Errorf("effective wildcard admin should be CRITICAL, got %s (%.1f)", admin.RiskLevel, admin.BlastRadiusScore)
	}

	deep := &BlastRadiusResult{SourceName: "x", Paths: []BlastRadiusPath{{
		TargetARN: "arn:aws:s3:::b", PathType: PathRoleChain, Phase: 2, SecuritySignificance: "conditional",
		EvidenceRank: EvidenceRankConfigured, Hops: make([]PathHop, 4),
	}}}
	DeriveSummary(deep, true)
	if !(deep.BlastRadiusScore > 0 && deep.BlastRadiusScore < admin.BlastRadiusScore) {
		t.Errorf("weak 4-hop read must score below admin: %.1f vs %.1f", deep.BlastRadiusScore, admin.BlastRadiusScore)
	}
	if math.IsNaN(deep.BlastRadiusScore) {
		t.Error("NaN score")
	}
}

func TestConvergingAndIdentities(t *testing.T) {
	r := &BlastRadiusResult{SourceName: "alice", Paths: []BlastRadiusPath{
		{TargetARN: arnBkt, PathType: PathDirectAccess, Phase: 1, Hops: []PathHop{{EdgeType: EdgeCanAccess, ToARN: arnBkt}}},
		{TargetARN: arnBkt, PathType: PathObservedActivity, Phase: 1, Hops: []PathHop{{EdgeType: EdgeAccessed, ToARN: arnBkt}}},
		{TargetARN: arnDev, PathType: PathRoleChain, Phase: 2, Hops: []PathHop{{EdgeType: EdgeCanAssume, ToARN: arnDev}}},
	}}
	DeriveSummary(r, true)
	if !r.ConvergingPaths || r.ConvergingPathsFound != 1 {
		t.Errorf("bucket is reached by two path types: %+v", r.ConvergingPathsFound)
	}
	if len(r.ReachableIdentities) != 1 || r.ReachableIdentities[0].ARN != arnDev {
		t.Errorf("identities = %+v", r.ReachableIdentities)
	}
	if len(r.ReachableResources) != 1 {
		t.Errorf("identity paths must not be listed as resources: %+v", r.ReachableResources)
	}
	DeriveSummary(r, false)
	if r.ConvergingPaths {
		t.Error("converging detection should be off when RULE-010 is inactive")
	}
}

func TestValidARN(t *testing.T) {
	good := []string{arnUser, arnBkt, arnSec, "arn:aws-cn:iam::1:role/x"}
	bad := []string{"", "role/x", "arn:aws:iam::1:role/x y", "arn:aws:iam::1:role/x\n", "'; drop table x;--"}
	for _, s := range good {
		if !validARN(s) {
			t.Errorf("%q should be valid", s)
		}
	}
	for _, s := range bad {
		if validARN(s) {
			t.Errorf("%q should be invalid", s)
		}
	}
}

// testRouter mounts the handler with a fixed scope, as the API router does.
func testRouter(repo Repo) *mux.Router {
	r := mux.NewRouter()
	h := &Handler{engine: NewEngine(repo), scope: func(*http.Request) (*Scope, int, error) { return &Scope{}, 0, nil }}
	h.Register(r.PathPrefix("/api/v1").Subrouter())
	return r
}

// No API key: a request without a signed-in user is refused, and ARNs with
// '/' still route.
func TestRoutesNeedASignedInUser(t *testing.T) {
	r := mux.NewRouter()
	NewHandler(NewEngine(fixture()), nil, nil).Register(r.PathPrefix("/api/v1").Subrouter())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/correlations/blast-radius/"+arnDev, nil))
	if w.Code != http.StatusUnauthorized {
		t.Errorf("no user → %d", w.Code)
	}
	do := func(path string) int {
		w := httptest.NewRecorder()
		testRouter(fixture()).ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		return w.Code
	}
	if c := do("/api/v1/correlations/blast-radius/not-an-arn"); c != http.StatusBadRequest {
		t.Errorf("bad ARN → %d", c)
	}
	if c := do("/api/v1/correlations/blast-radius/" + arnDev); c != http.StatusOK {
		t.Errorf("ARNs with '/' must route, got %d", c)
	}
}
