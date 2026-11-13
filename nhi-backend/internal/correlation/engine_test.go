package correlation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

// fakeRepo is an in-memory Repo for engine tests.
type fakeRepo struct {
	creds     map[string]*Credential
	perms     map[string][]ResourcePermission
	trust     map[string][]TrustEdge
	ispm      map[string][]ISPMEdge
	lineage   map[string][]LineageEdge
	ecs       map[string][]ECSTask
	observed  []ObservedEvent
	defs      []CorrelationDefinition
	pts       []PathType
	comps     []CompositionRule
	chQueries int
	saves     int

	roleTrust   []RoleTrustRow
	assumePerms map[string][]ResourcePermission
	freshness   DataFreshness
	assumeObs   []AssumeObservation
	idCreds     map[string][]IdentityCredential
	cached      *BlastRadiusResult
}

func (f *fakeRepo) LoadAssumeObservations(context.Context, *Scope) ([]AssumeObservation, error) {
	return f.assumeObs, nil
}
func (f *fakeRepo) LoadDataFreshness(context.Context, *Scope, string) (DataFreshness, error) {
	return f.freshness, nil
}
func (f *fakeRepo) LoadRoleTrust(context.Context, *Scope) ([]RoleTrustRow, error) {
	return f.roleTrust, nil
}
func (f *fakeRepo) LoadAssumePermissions(context.Context, *Scope) (map[string][]ResourcePermission, error) {
	return f.assumePerms, nil
}

func (f *fakeRepo) LoadCredentialByARN(_ context.Context, _ *Scope, arn string) (*Credential, error) {
	if c, ok := f.creds[arn]; ok {
		return c, nil
	}
	return nil, ErrCredentialNotFound
}
func (f *fakeRepo) LoadEffectivePermissions(_ context.Context, _ *Scope, arn string) ([]ResourcePermission, error) {
	return f.perms[arn], nil
}
func (f *fakeRepo) LoadTrustEdges(_ context.Context, _ *Scope, arn string) ([]TrustEdge, error) {
	return f.trust[arn], nil
}
func (f *fakeRepo) LoadISPMEdges(_ context.Context, _ *Scope, arn string) ([]ISPMEdge, error) {
	return f.ispm[arn], nil
}
func (f *fakeRepo) LoadCrossAccountLineage(_ context.Context, _ *Scope, arn string) ([]LineageEdge, error) {
	return f.lineage[arn], nil
}
func (f *fakeRepo) LoadECSTasksForRole(_ context.Context, _ *Scope, arn string) ([]ECSTask, error) {
	return f.ecs[arn], nil
}
func (f *fakeRepo) LoadIdentityCredentials(_ context.Context, _ *Scope, arn string) ([]IdentityCredential, error) {
	return f.idCreds[arn], nil
}
func (f *fakeRepo) LoadObservedActivity(context.Context, *Scope, string, int) ([]ObservedEvent, error) {
	f.chQueries++
	return f.observed, nil
}
func (f *fakeRepo) SaveBlastRadius(context.Context, *Scope, *BlastRadiusResult) (string, error) {
	f.saves++
	return "id", nil
}
func (f *fakeRepo) SaveBlastRadiusPaths(context.Context, *Scope, string, []BlastRadiusPath) error {
	return nil
}
func (f *fakeRepo) LoadBlastRadius(context.Context, *Scope, string) (*BlastRadiusResult, error) {
	return f.cached, nil
}
func (f *fakeRepo) LoadCorrelationDefinitions(context.Context, *Scope, string) ([]CorrelationDefinition, error) {
	return f.defs, nil
}
func (f *fakeRepo) LoadCompositionRules(context.Context, *Scope) ([]CompositionRule, error) {
	return f.comps, nil
}
func (f *fakeRepo) LoadPathTypes(context.Context, *Scope) ([]PathType, error) { return f.pts, nil }
func (f *fakeRepo) LoadAllCredentials(context.Context, *Scope) ([]Credential, error) {
	return nil, nil
}
func (f *fakeRepo) LoadReverseAccess(_ context.Context, _ *Scope, res string) ([]ReverseAccessRow, error) {
	return []ReverseAccessRow{
		{SourceARN: "arn:aws:iam::1:role/A", SourceName: "A", TargetARN: res, Actions: []string{"s3:GetObject"}, EvidenceType: "configured"},
		{SourceARN: "arn:aws:iam::1:role/Admin", SourceName: "Admin", TargetARN: AllResourcesARN, Actions: []string{"*"}, EvidenceType: "configured"},
	}, nil
}

const (
	arnUser  = "arn:aws:iam::111111111111:user/alice"
	arnDev   = "arn:aws:iam::111111111111:role/DevRole"
	arnOps   = "arn:aws:iam::111111111111:role/OpsRole"
	arnAdmin = "arn:aws:iam::111111111111:role/AdminRole"
	arnBkt   = "arn:aws:s3:::credit-cards"
	arnSec   = "arn:aws:secretsmanager:us-east-1:111111111111:secret:db"
)

func cred(arn, name string) *Credential {
	return &Credential{ARN: arn, Name: name, CredentialType: "iam", AccountID: "111111111111"}
}

func perm(action, effect, res string) ResourcePermission {
	return ResourcePermission{Action: action, Effect: effect, ResourceARN: res}
}

func trustEdge(from, to string) TrustEdge { return TrustEdge{SourceARN: from, TargetARN: to} }

func fixture() *fakeRepo {
	return &fakeRepo{
		creds: map[string]*Credential{
			arnUser: cred(arnUser, "alice"), arnDev: cred(arnDev, "DevRole"),
			arnOps: cred(arnOps, "OpsRole"), arnAdmin: cred(arnAdmin, "AdminRole"),
		},
		perms: map[string][]ResourcePermission{
			arnUser:  {perm("s3:GetObject", "Allow", arnBkt)},
			arnAdmin: {perm("*", "Allow", "*")},
		},
		trust: map[string][]TrustEdge{
			arnUser: {trustEdge(arnUser, arnDev)},
			arnDev:  {trustEdge(arnDev, arnOps)},
			arnOps:  {trustEdge(arnOps, arnAdmin), trustEdge(arnOps, arnUser)}, // cycle back to the source
		},
	}
}

func compute(t *testing.T, repo *fakeRepo) *BlastRadiusResult {
	t.Helper()
	res, err := NewEngine(repo).ComputeBlastRadius(context.Background(), &Scope{}, arnUser)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func find(r *BlastRadiusResult, target, pathType string) *BlastRadiusPath {
	for i := range r.Paths {
		if r.Paths[i].TargetARN == target && r.Paths[i].PathType == pathType {
			return &r.Paths[i]
		}
	}
	return nil
}

func TestRoleChainKeepsEveryHop(t *testing.T) {
	res := compute(t, fixture())
	p := find(res, arnAdmin, PathRoleChain)
	if p == nil {
		t.Fatalf("no path to AdminRole; paths=%d", len(res.Paths))
	}
	if len(p.Hops) != 3 {
		t.Fatalf("aliceâ†’Devâ†’Opsâ†’Admin should have 3 hops, got %d", len(p.Hops))
	}
	for i, want := range []string{arnDev, arnOps, arnAdmin} {
		if p.Hops[i].ToARN != want || p.Hops[i].EdgeType != EdgeCanAssume {
			t.Errorf("hop %d = %+v, want CAN_ASSUME to %s", i, p.Hops[i], want)
		}
	}
	if p.Hops[0].FromARN != arnUser {
		t.Errorf("first hop must start at the source, got %s", p.Hops[0].FromARN)
	}
}

func TestCycleBackToSourceIsIgnored(t *testing.T) {
	res := compute(t, fixture())
	if p := find(res, arnUser, PathRoleChain); p != nil {
		t.Errorf("source must not appear as its own reachable identity: %+v", p)
	}
}

func TestWildcardAdminHasBlastRadius(t *testing.T) {
	res := compute(t, fixture())
	p := find(res, AllResourcesARN, PathRoleChain)
	if p == nil {
		t.Fatal("wildcard grant on AdminRole was dropped")
	}
	if p.SecuritySignificance != "high" || !containsString(p.Limitations, "wildcard_resource_grant") {
		t.Errorf("wildcard admin path = %+v", p)
	}
	if res.RiskLevel != "CRITICAL" && res.RiskLevel != "HIGH" {
		t.Errorf("admin reachable in 3 hops should be HIGH/CRITICAL, got %s (%.1f)", res.RiskLevel, res.BlastRadiusScore)
	}
}

func TestExplicitDenyRemovesPath(t *testing.T) {
	repo := fixture()
	repo.perms[arnUser] = []ResourcePermission{
		perm("s3:GetObject", "Allow", arnBkt),
		perm("s3:GetObject", "Allow", "arn:aws:s3:::logs"),
		perm("s3:Get*", "Deny", "arn:aws:s3:::credit-*"),
	}
	res := compute(t, repo)
	if find(res, arnBkt, PathDirectAccess) != nil {
		t.Error("explicit Deny on credit-* must shadow the allow on credit-cards")
	}
	if find(res, "arn:aws:s3:::logs", PathDirectAccess) == nil {
		t.Error("a bucket the Deny does not cover must stay reachable")
	}
}

func TestDirectAccessGroupsActions(t *testing.T) {
	repo := fixture()
	repo.perms[arnUser] = []ResourcePermission{
		perm("s3:GetObject", "Allow", arnBkt), perm("s3:PutObject", "Allow", arnBkt),
	}
	res := compute(t, repo)
	p := find(res, arnBkt, PathDirectAccess)
	if p == nil || !strings.Contains(p.PathDescription, "s3:GetObject") || !strings.Contains(p.PathDescription, "s3:PutObject") {
		t.Fatalf("one path should list both actions: %+v", p)
	}
	if p.SecuritySignificance != "high" {
		t.Errorf("PutObject should make it high, got %s", p.SecuritySignificance)
	}
}

func TestEscalationPath(t *testing.T) {
	repo := fixture()
	repo.perms[arnUser] = []ResourcePermission{perm("iam:PassRole", "Allow", arnAdmin)}
	res := compute(t, repo)
	if p := find(res, arnAdmin, PathEscalation); p == nil || p.SecuritySignificance != "high" {
		t.Fatalf("iam:PassRole must produce a high PATH-005: %+v", p)
	}
}

func TestPhase4AttributesEventsToTheRightTask(t *testing.T) {
	repo := fixture()
	task1 := "arn:aws:ecs:us-east-1:111111111111:task/c/aaa111"
	task2 := "arn:aws:ecs:us-east-1:111111111111:task/c/bbb222"
	repo.ecs = map[string][]ECSTask{arnUser: {{TaskARN: task1}, {TaskARN: task2}}}
	repo.observed = []ObservedEvent{
		{EventName: "GetSecretValue", EventSource: "secretsmanager.amazonaws.com", ResourceARN: arnSec,
			CallerARN: "arn:aws:sts::111111111111:assumed-role/DevRole/bbb222", EventTime: time.Now()},
		{EventName: "Decrypt", EventSource: "kms.amazonaws.com", ResourceARN: "arn:aws:kms:us-east-1:111111111111:key/k",
			CallerARN: "arn:aws:sts::111111111111:assumed-role/DevRole/unknown", EventTime: time.Now()},
	}
	res := compute(t, repo)

	sec := find(res, arnSec, PathSecretsAccess)
	if sec == nil || sec.Hops[0].ToARN != task2 {
		t.Fatalf("secret read belongs to task bbb222 only: %+v", sec)
	}
	kms := find(res, "arn:aws:kms:us-east-1:111111111111:key/k", PathKMSAccess)
	if kms == nil || !containsString(kms.Limitations, "task_attribution_unverified") {
		t.Fatalf("unmatched event must be flagged as unverified, not pinned on a task: %+v", kms)
	}
	if repo.chQueries != 1 {
		t.Errorf("ClickHouse should be queried once per computation, got %d", repo.chQueries)
	}
	if !res.SecretsAccess {
		t.Error("SecretsAccess should be true")
	}
}

func TestObservedActivityUpgradesEvidence(t *testing.T) {
	repo := fixture()
	repo.observed = []ObservedEvent{{EventName: "GetObject", ResourceARN: arnBkt, EventTime: time.Now()}}
	res := compute(t, repo)
	p := find(res, arnBkt, PathDirectAccess)
	if p == nil || p.EvidenceRank != EvidenceRankObserved || p.Confidence != "HIGH" {
		t.Fatalf("observed access should upgrade the direct path: %+v", p)
	}
	if find(res, arnBkt, PathObservedActivity) == nil {
		t.Error("PATH-008 missing")
	}
}

func TestDedupKeepsStrongestThenShortest(t *testing.T) {
	e := NewEngine(nil)
	got := e.dedupPaths([]BlastRadiusPath{
		{SourceARN: "s", TargetARN: "t", PathType: PathRoleChain, EvidenceRank: 2, Hops: make([]PathHop, 2)},
		{SourceARN: "s", TargetARN: "t", PathType: PathRoleChain, EvidenceRank: 3, Hops: make([]PathHop, 3)},
		{SourceARN: "s", TargetARN: "t", PathType: PathRoleChain, EvidenceRank: 3, Hops: make([]PathHop, 2)},
	})
	if len(got) != 1 || got[0].EvidenceRank != 3 || len(got[0].Hops) != 2 {
		t.Fatalf("got %+v", got)
	}
}

func TestRuleBookDisablesPathTypeAndMergesLimitations(t *testing.T) {
	repo := fixture()
	repo.defs = []CorrelationDefinition{{RuleID: "COR-001", Phase: 1, IsActive: true}, {RuleID: "COR-002", Phase: 2, IsActive: true}}
	repo.pts = []PathType{
		{PathID: PathDirectAccess, IsActive: false},
		{PathID: PathRoleChain, IsActive: true, MaxHops: 1, Limitations: []string{"from_rule_table"}},
	}
	res := compute(t, repo)
	for _, p := range res.Paths {
		if p.PathType == PathDirectAccess {
			t.Fatal("PATH-001 is disabled in the rule table and must not be emitted")
		}
	}
	if find(res, arnOps, PathRoleChain) != nil {
		t.Error("max_hops=1 in the rule table must stop the chain after DevRole")
	}
	p := find(res, arnDev, PathRoleChain)
	if p == nil || !containsString(p.Limitations, "from_rule_table") {
		t.Fatalf("limitations from correlation_path_types should be merged: %+v", p)
	}
}

func TestPhaseWithoutActiveRulesIsSkipped(t *testing.T) {
	repo := fixture()
	repo.defs = []CorrelationDefinition{{RuleID: "COR-001", Phase: 1, IsActive: true}}
	repo.pts = []PathType{{PathID: PathDirectAccess, IsActive: true}}
	res := compute(t, repo)
	if res.ChainPaths != 0 {
		t.Errorf("no active phase-2 rules, role chains must not run; got %d chain paths", res.ChainPaths)
	}
}

func TestMaxPathsCap(t *testing.T) {
	repo := fixture()
	for i := 0; i < 50; i++ {
		repo.perms[arnUser] = append(repo.perms[arnUser], perm("s3:GetObject", "Allow", "arn:aws:s3:::b"+itoa3(i)))
	}
	e := NewEngine(repo)
	e.cfg.MaxPaths = 10
	res, err := e.ComputeBlastRadius(context.Background(), &Scope{}, arnUser)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Paths) > 10 {
		t.Errorf("path cap ignored: %d", len(res.Paths))
	}
}

func itoa3(i int) string { return string(rune('a'+i/26)) + string(rune('a'+i%26)) }

func TestReverseAccessIncludesWildcardGrants(t *testing.T) {
	paths, err := NewEngine(fixture()).ReverseAccess(context.Background(), &Scope{}, arnBkt)
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 2 {
		t.Fatalf("want 2 paths, got %d", len(paths))
	}
	var wild bool
	for _, p := range paths {
		if !p.IsReverseAccess {
			t.Error("IsReverseAccess not set")
		}
		wild = wild || containsString(p.Limitations, "wildcard_resource_grant")
	}
	if !wild {
		t.Error("wildcard grant should be flagged")
	}
}

func TestPassRoleAndServiceEdgesAreNotRoleChainHops(t *testing.T) {
	repo := fixture()
	repo.trust = map[string][]TrustEdge{
		arnUser: {
			{SourceARN: arnUser, TargetARN: arnDev, EdgeType: "pass_role"},
			{SourceARN: arnUser, TargetARN: arnOps, EdgeType: "service_trust"},
			{SourceARN: arnUser, TargetARN: arnAdmin, EdgeType: "assume_role"},
		},
	}
	res := compute(t, repo)
	if find(res, arnDev, PathRoleChain) != nil || find(res, arnOps, PathRoleChain) != nil {
		t.Error("pass_role and service_trust edges must not become role-chain hops")
	}
	if find(res, arnAdmin, PathRoleChain) == nil {
		t.Error("assume_role edge must still be a hop")
	}
}

func TestIsMissingTableIgnoresMissingColumns(t *testing.T) {
	cases := []struct {
		msg  string
		want bool
	}{
		{`pq: relation "bimasugam.trust_edges" does not exist`, true},
		{`ERROR: undefined table (SQLSTATE 42P01)`, true},
		{`pq: column "cluster" does not exist`, false},
		{`ERROR: column "conditions" does not exist (SQLSTATE 42703)`, false},
		{`pq: connection refused`, false},
	}
	for _, c := range cases {
		if got := isMissingTable(errors.New(c.msg)); got != c.want {
			t.Errorf("isMissingTable(%q) = %v, want %v", c.msg, got, c.want)
		}
	}
}

func TestReadOnlyEngineWritesNothing(t *testing.T) {
	repo := fixture()
	e := NewEngine(repo)
	res, err := e.ComputeBlastRadiusOpts(context.Background(), &Scope{}, arnUser, true)
	if err != nil || res == nil || len(res.Paths) == 0 {
		t.Fatalf("a normal run must still compute: %v", err)
	}
	if repo.saves != 1 {
		t.Fatalf("a normal run saves once, got %d", repo.saves)
	}

	repo2 := fixture()
	e2 := NewEngine(repo2)
	e2.SetReadOnly(true)
	res2, err := e2.ComputeBlastRadiusOpts(context.Background(), &Scope{}, arnUser, true)
	if err != nil || len(res2.Paths) != len(res.Paths) {
		t.Fatalf("read-only must return the same result: %v (%d vs %d paths)", err, len(res2.Paths), len(res.Paths))
	}
	if repo2.saves != 0 {
		t.Errorf("read-only must not save, got %d saves", repo2.saves)
	}
}

func TestStoredResultsFromOlderLogicAreIgnored(t *testing.T) {
	stale := &BlastRadiusResult{SourceARN: arnUser, SourceName: "alice",
		ComputedAt: cacheNotBefore.Add(-time.Hour), // stored before the current logic existed
		Paths:      []BlastRadiusPath{{TargetARN: "arn:aws:s3:::old", PathType: PathDirectAccess, Phase: 1}}}
	repo := fixture()
	repo.cached = stale
	res, err := NewEngine(repo).ComputeBlastRadius(context.Background(), &Scope{}, arnUser)
	if err != nil {
		t.Fatal(err)
	}
	if res.FromCache || find(res, "arn:aws:s3:::old", PathDirectAccess) != nil {
		t.Fatalf("a result stored by older logic must be recomputed, not served: from_cache=%v", res.FromCache)
	}
	if repo.saves != 1 {
		t.Errorf("the recomputed result replaces the old one in the cache, saves=%d", repo.saves)
	}

	current := &BlastRadiusResult{SourceARN: arnUser, SourceName: "alice",
		ComputedAt: cacheNotBefore.Add(time.Hour),
		Paths:      []BlastRadiusPath{{TargetARN: "arn:aws:s3:::cached", PathType: PathDirectAccess, Phase: 1, Hops: []PathHop{{EdgeType: EdgeCanAccess}}}}}
	repo2 := fixture()
	repo2.cached = current
	res2, err := NewEngine(repo2).ComputeBlastRadius(context.Background(), &Scope{}, arnUser)
	if err != nil || !res2.FromCache || find(res2, "arn:aws:s3:::cached", PathDirectAccess) == nil {
		t.Fatalf("a result stored by the current logic is served and labelled: %v from_cache=%v", err, res2 != nil && res2.FromCache)
	}
	if repo2.saves != 0 {
		t.Error("serving from the cache must not recompute or save")
	}
	forced, _ := NewEngine(repo2).ComputeBlastRadiusOpts(context.Background(), &Scope{}, arnUser, true)
	if forced.FromCache {
		t.Error("refresh=true must recompute")
	}
}

func TestSummaryDropsPathsAndTrimsResources(t *testing.T) {
	r := &BlastRadiusResult{Paths: make([]BlastRadiusPath, 40)}
	for i := 0; i < 100; i++ {
		r.ReachableResources = append(r.ReachableResources, ReachableResource{ARN: fmt.Sprintf("arn:aws:s3:::b%d", i)})
	}
	s := summarizeResult(r)
	if !s.Summary || len(s.Paths) != 0 || len(s.ReachableResources) != summaryResources || s.ReachableResourcesTotal != 100 {
		t.Errorf("summary: %+v", s)
	}
	if len(r.Paths) != 40 || len(r.ReachableResources) != 100 || r.Summary {
		t.Error("summarising must not change the original result")
	}
}

func TestEmptyScopeIsCrossAccountSafe(t *testing.T) {
	if isCrossAccount("arn:aws:s3:::x", nil) || isCrossAccount("arn:aws:iam::222:role/x", nil) {
		t.Error("with no account scope nothing can be called cross-account")
	}
	if !isCrossAccount("arn:aws:iam::222:role/x", []string{"111"}) {
		t.Error("foreign account must be cross-account")
	}
}
