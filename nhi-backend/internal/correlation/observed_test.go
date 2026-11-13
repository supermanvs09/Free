package correlation

import (
	"testing"
	"time"
)

// chainRepo returns a repository where alice > Dev > Ops is resolved from trust
// policies (no trust_edges rows), so observed evidence can be layered on top.
func chainRepo() *fakeRepo {
	repo := fixture()
	repo.trust = nil
	repo.roleTrust = []RoleTrustRow{
		{ARN: arnUser, Name: "alice", AccountID: acctA, TrustPolicy: trustDoc()},
		{ARN: arnDev, Name: "DevRole", AccountID: acctA, TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnUser), ""))},
		{ARN: arnOps, Name: "OpsRole", AccountID: acctA, TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnDev), ""))},
	}
	return repo
}

func TestObservedAssumeUpgradesHopEvidence(t *testing.T) {
	seen := time.Now().Add(-48 * time.Hour)
	repo := chainRepo()
	repo.assumeObs = []AssumeObservation{
		{Caller: arnUser, Target: arnDev, Count: 7, LastSeen: seen},
		{Caller: arnDev, Target: arnOps, Count: 2, LastSeen: seen},
	}
	res := compute(t, repo)

	dev := find(res, arnDev, PathRoleChain)
	if dev == nil || dev.EvidenceRank != EvidenceRankObserved || dev.Hops[0].Evidence != EvidenceObserved {
		t.Fatalf("an observed hop must carry observed evidence: %+v", dev)
	}
	if dev.Hops[0].ObservedCount != 7 || dev.Hops[0].LastObservedAt == nil || !dev.Hops[0].LastObservedAt.Equal(seen) {
		t.Errorf("count and last-seen must be on the hop: %+v", dev.Hops[0])
	}
	if dev.Hops[0].Basis != BasisNamesRole {
		t.Errorf("the policy basis is kept alongside the observation: %s", dev.Hops[0].Basis)
	}
	if containsString(dev.Limitations, "does_not_prove_assumption_happened") ||
		!containsString(dev.Limitations, "observed_does_not_mean_authorized") {
		t.Errorf("a fully observed chain proves the assumption happened: %v", dev.Limitations)
	}
	ops := find(res, arnOps, PathRoleChain)
	if ops == nil || ops.EvidenceRank != EvidenceRankObserved || containsString(ops.Limitations, "does_not_prove_assumption_happened") {
		t.Errorf("both hops observed: the 2-hop path is observed too: %+v", ops)
	}
}

func TestChainIsOnlyAsStrongAsItsWeakestHop(t *testing.T) {
	repo := chainRepo()
	repo.assumeObs = []AssumeObservation{{Caller: arnUser, Target: arnDev, Count: 1, LastSeen: time.Now()}} // second hop unobserved
	res := compute(t, repo)
	ops := find(res, arnOps, PathRoleChain)
	if ops == nil || ops.EvidenceRank != EvidenceRankConfigured {
		t.Fatalf("one unobserved hop caps the chain at configured: %+v", ops)
	}
	if !containsString(ops.Limitations, "does_not_prove_assumption_happened") {
		t.Errorf("a partly observed chain still does not prove it ran end to end: %v", ops.Limitations)
	}
	if dev := find(res, arnDev, PathRoleChain); dev == nil || dev.EvidenceRank != EvidenceRankObserved {
		t.Errorf("the first hop alone is observed: %+v", dev)
	}
}

func TestObservedOnlyHopIsAddedAndFlagged(t *testing.T) {
	repo := chainRepo()
	// No policy explains alice > Ops, but CloudTrail saw it.
	repo.assumeObs = []AssumeObservation{{Caller: arnUser, Target: arnOps, Count: 3, LastSeen: time.Now()}}
	res := compute(t, repo)

	var direct *BlastRadiusPath
	for i := range res.Paths {
		p := &res.Paths[i]
		if p.TargetARN == arnOps && p.PathType == PathRoleChain && len(p.Hops) == 1 {
			direct = p
		}
	}
	if direct == nil {
		t.Fatal("the observed hop must appear even though no policy explains it")
	}
	if direct.Hops[0].Basis != BasisObserved || direct.Hops[0].Table != "cloudtrail_events" ||
		!containsString(direct.Limitations, "observed_without_matching_policy") {
		t.Errorf("observed-only hop must say so: %+v", direct)
	}
}

func TestObservationsFromServicesAndSelfAreIgnored(t *testing.T) {
	g := emptyAssumeGraph()
	g.ApplyObservations([]AssumeObservation{
		{Caller: "ecs-tasks.amazonaws.com", Target: arnDev, Count: 1},
		{Caller: arnDev, Target: arnDev, Count: 1},
		{Caller: "", Target: arnDev, Count: 1},
	})
	if len(g.From) != 0 || len(g.To) != 0 {
		t.Errorf("only ARN-to-ARN observations create hops: %+v", g.From)
	}
}

func TestChStringArrayFormatsAndEscapes(t *testing.T) {
	cases := []struct {
		in   []string
		want string
	}{
		{nil, "[]"},
		{[]string{}, "[]"},
		{[]string{"111111111111"}, "['111111111111']"},
		{[]string{"a", "b"}, "['a','b']"},
		{[]string{`x'y`}, `['x\'y']`},
		{[]string{`x\y`}, `['x\\y']`},
	}
	for _, c := range cases {
		if got := chStringArray(c.in); got != c.want {
			t.Errorf("chStringArray(%v) = %s, want %s", c.in, got, c.want)
		}
	}
}

func TestInboundShowsWhichPrincipalsWereSeenAssumingTheRole(t *testing.T) {
	seen := time.Now().Add(-6 * time.Hour)
	g := BuildAssumeGraph([]RoleTrustRow{
		row(acctA, "Target", trustDoc(
			`{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}`,
			`{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}`,
			allowAssume(awsPrincipal(acctB), ""),
		)),
	}, nil)
	g.ApplyObservations([]AssumeObservation{
		{Caller: "lambda.amazonaws.com", Target: roleARN(acctA, "Target"), Count: 40, LastSeen: seen},
		{Caller: acctB, Target: roleARN(acctA, "Target"), Count: 2, LastSeen: seen.Add(-time.Hour)},
	})
	res, _ := g.Inbound(roleARN(acctA, "Target"), 1)
	byValue := map[string]InboundPrincipal{}
	for _, p := range res.Principals {
		byValue[p.Value] = p
	}
	if l := byValue["lambda.amazonaws.com"]; l.ObservedCount != 40 || l.LastObservedAt == nil || !l.LastObservedAt.Equal(seen) {
		t.Errorf("Lambda was seen 40 times: %+v", l)
	}
	if e := byValue["ecs-tasks.amazonaws.com"]; e.ObservedCount != 0 || e.LastObservedAt != nil {
		t.Errorf("ECS was never seen, so it must not claim activity: %+v", e)
	}
	if a := byValue[acctB]; a.ObservedCount != 2 {
		t.Errorf("an account caller counts against the account principal: %+v", a)
	}
}

func TestTrustEdgePatternTargetsAreNotRoles(t *testing.T) {
	repo := fixture()
	repo.trust = map[string][]TrustEdge{arnUser: {
		{SourceARN: arnUser, TargetARN: "arn:aws:iam::*:role/Wild*", EdgeType: "assume_role"},
		{SourceARN: arnUser, TargetARN: arnDev, EdgeType: "assume_role"},
	}}
	res := compute(t, repo)
	for _, p := range res.Paths {
		if p.PathType == PathRoleChain && containsAnyStar(p.TargetARN) {
			t.Fatalf("a resource pattern is not a role: %+v", p)
		}
	}
	if find(res, arnDev, PathRoleChain) == nil {
		t.Error("the real role must still be reachable")
	}
}

func containsAnyStar(s string) bool {
	for _, c := range s {
		if c == '*' || c == '?' {
			return true
		}
	}
	return false
}

func TestManyWeakFindingsDoNotInflateTheScore(t *testing.T) {
	weak := &BlastRadiusResult{SourceName: "x"}
	for i := 0; i < 300; i++ { // 300 read-only "describe on every resource of service N" findings
		weak.Paths = append(weak.Paths, BlastRadiusPath{
			TargetARN: WildcardTarget("svc" + itoa3(i)), PathType: PathDirectAccess, Phase: 1,
			SecuritySignificance: "conditional", EvidenceRank: EvidenceRankEffective,
			Hops: []PathHop{{EdgeType: EdgeCanAccess}},
		})
	}
	DeriveSummary(weak, true)
	if weak.RiskLevel == "CRITICAL" || weak.RiskLevel == "HIGH" {
		t.Errorf("300 weak read findings must not look critical: score %.1f %s", weak.BlastRadiusScore, weak.RiskLevel)
	}

	strong := &BlastRadiusResult{SourceName: "x"}
	for i := 0; i < 6; i++ { // six independent high-significance findings
		strong.Paths = append(strong.Paths, BlastRadiusPath{
			TargetARN: "arn:aws:secretsmanager:us-east-1:1:secret:s" + itoa3(i), PathType: PathDirectAccess, Phase: 1,
			SecuritySignificance: "high", EvidenceRank: EvidenceRankEffective,
			Hops: []PathHop{{EdgeType: EdgeCanAccess}},
		})
	}
	DeriveSummary(strong, true)
	if strong.BlastRadiusScore <= weak.BlastRadiusScore {
		t.Errorf("strong findings must outrank weak ones: %.1f vs %.1f", strong.BlastRadiusScore, weak.BlastRadiusScore)
	}
}

func TestReachByServiceGroupsAndRanks(t *testing.T) {
	r := &BlastRadiusResult{SourceName: "x", Paths: []BlastRadiusPath{
		{TargetARN: "arn:aws:s3:::a", PathType: PathDirectAccess, Phase: 1, SecuritySignificance: "conditional", EvidenceRank: 3, Hops: []PathHop{{EdgeType: EdgeCanAccess}}},
		{TargetARN: "arn:aws:s3:::b", PathType: PathDirectAccess, Phase: 1, SecuritySignificance: "high", EvidenceRank: 3, Hops: []PathHop{{EdgeType: EdgeCanAccess}}},
		{TargetARN: "*:kms", PathType: PathKMSAccess, Phase: 1, SecuritySignificance: "high", EvidenceRank: 3, Hops: []PathHop{{EdgeType: EdgeCanAccess}}},
		{TargetARN: "*:ec2", PathType: PathDirectAccess, Phase: 1, SecuritySignificance: "conditional", EvidenceRank: 3, Hops: []PathHop{{EdgeType: EdgeCanAccess}}},
	}}
	DeriveSummary(r, true)
	by := map[string]ServiceReach{}
	for _, s := range r.ReachByService {
		by[s.Service] = s
	}
	if s3 := by["s3"]; s3.Resources != 2 || s3.Significance != "high" || s3.Wildcard {
		t.Errorf("s3 groups two buckets at their highest significance: %+v", s3)
	}
	if kms := by["kms"]; kms.Resources != 1 || !kms.Wildcard {
		t.Errorf("a *:kms grant is a wildcard on kms: %+v", kms)
	}
	if len(r.ReachByService) != 3 || r.ReachByService[len(r.ReachByService)-1].Service != "ec2" {
		t.Errorf("services are ranked by significance, weakest last: %+v", r.ReachByService)
	}
	for _, rr := range r.ReachableResources {
		if rr.Service == "" || rr.Significance == "" {
			t.Errorf("every resource carries its service and significance: %+v", rr)
		}
	}
}

func TestFailedCallsAreNotEvidence(t *testing.T) {
	repo := fixture()
	repo.observed = []ObservedEvent{
		{EventName: "GetObject", ResourceARN: arnBkt, ErrorCode: "AccessDenied", EventTime: time.Now()},
	}
	res := compute(t, repo)
	if p := find(res, arnBkt, PathDirectAccess); p == nil || p.EvidenceRank == EvidenceRankObserved {
		t.Errorf("a denied call must not upgrade the evidence: %+v", p)
	}
	if find(res, arnBkt, PathObservedActivity) != nil {
		t.Error("a denied call is not observed activity")
	}
	if res.DataAsOf.LastObservedEventAt != nil {
		t.Error("a denied call must not count as the last observed event")
	}

	repo2 := fixture()
	repo2.observed = []ObservedEvent{{EventName: "GetObject", ResourceARN: arnBkt, EventTime: time.Now()}}
	if p := find(compute(t, repo2), arnBkt, PathDirectAccess); p == nil || p.EvidenceRank != EvidenceRankObserved {
		t.Errorf("a successful call does upgrade it: %+v", p)
	}
}
