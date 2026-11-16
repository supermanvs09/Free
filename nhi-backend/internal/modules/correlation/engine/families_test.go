package engine

import (
	"errors"
	"testing"
	"time"
)

const arnLambda = "arn:aws:lambda:us-east-1:111111111111:function:builder"

// workloadRepo is navRepo plus a Lambda function that runs as DevRole.
func workloadRepo() *fakeRepo {
	repo := navRepo()
	repo.workloads = map[string]*Workload{arnLambda: {ARN: arnLambda, Name: "builder", Type: "lambda_function", AccountID: acctA}}
	repo.bound = map[string][]IdentityCredential{arnLambda: {
		{IdentityARN: arnLambda, CredentialARN: arnDev, BindingType: "function_role", BindingSource: "type_attributes.bound_role_arn", IsPrimary: true},
	}}
	return repo
}

func off(ids ...string) map[string]bool {
	m := map[string]bool{}
	for _, id := range ids {
		m[id] = false
	}
	return m
}

func TestFamilyRowsSwitchBehaviourOnAndOff(t *testing.T) {
	base := compute(t, navRepo())
	if find(base, arnAdmin, PathRoleChain) == nil || find(base, arnSecretNav, PathRoleChain) == nil {
		t.Fatal("with every family on, the 3-hop chain and the secret behind DevRole are found")
	}
	hasEscalationVia := func(res *BlastRadiusResult) bool {
		for _, p := range res.Paths {
			if p.PathType == PathEscalation && len(p.Hops) > 1 {
				return true
			}
		}
		return false
	}
	if !hasEscalationVia(base) {
		t.Fatal("OpsRole's PassRole is an escalation path through the chain")
	}

	t.Run("FAM-01 off follows one hop only", func(t *testing.T) {
		repo := navRepo()
		repo.families = off("FAM-01")
		res := compute(t, repo)
		if find(res, arnDev, PathRoleChain) == nil {
			t.Error("the first hop must still be found")
		}
		if find(res, arnOps, PathRoleChain) != nil || find(res, arnAdmin, PathRoleChain) != nil {
			t.Error("without FAM-01 nothing beyond one hop is followed")
		}
	})

	t.Run("FAM-02 off lists assumed roles without their access", func(t *testing.T) {
		repo := navRepo()
		repo.families = off("FAM-02")
		res := compute(t, repo)
		if find(res, arnAdmin, PathRoleChain) == nil {
			t.Error("the assumed roles are still listed")
		}
		if find(res, arnSecretNav, PathRoleChain) != nil || find(res, AllResourcesARN, PathRoleChain) != nil {
			t.Error("what an assumed role can access must not be added")
		}
	})

	t.Run("FAM-03 off drops escalation through a chain", func(t *testing.T) {
		repo := navRepo()
		repo.families = off("FAM-03")
		if hasEscalationVia(compute(t, repo)) {
			t.Error("no escalation path through the chain without FAM-03")
		}
	})

	t.Run("FAM-12 off hides trust conditions", func(t *testing.T) {
		repo := navRepo()
		repo.families = off("FAM-12")
		res := compute(t, repo)
		p := find(res, arnDev, PathRoleChain)
		if p == nil || len(p.Hops[0].Conditions) != 0 || containsString(p.Limitations, "trust_requires_external_id") {
			t.Errorf("conditions must not show: %+v", p)
		}
		if on := find(base, arnDev, PathRoleChain); len(on.Hops[0].Conditions) == 0 {
			t.Error("with FAM-12 on, the ExternalId condition shows")
		}
	})

	t.Run("FAM-13 off ignores CloudTrail on hops", func(t *testing.T) {
		seen := time.Now()
		mk := func() *fakeRepo {
			repo := navRepo()
			repo.assumeObs = []AssumeObservation{
				{Caller: arnUser, Target: arnDev, Count: 3, LastSeen: seen},
				{Caller: arnUser, Target: arnAdmin, Count: 1, LastSeen: seen}, // no policy explains this one
			}
			return repo
		}
		on := compute(t, mk())
		if p := find(on, arnDev, PathRoleChain); p == nil || p.Hops[0].Evidence != EvidenceObserved {
			t.Fatalf("on: the hop is observed: %+v", p)
		}
		repo := mk()
		repo.families = off("FAM-13")
		res := compute(t, repo)
		p := find(res, arnDev, PathRoleChain)
		if p == nil || p.Hops[0].Evidence == EvidenceObserved || p.Hops[0].ObservedCount != 0 {
			t.Errorf("off: the hop keeps its policy evidence: %+v", p)
		}
		for _, q := range res.Paths {
			if q.PathType == PathRoleChain && len(q.Hops) == 1 && q.TargetARN == arnAdmin {
				t.Error("off: a hop only CloudTrail shows must not be added")
			}
		}
	})

	t.Run("no family rows means everything is on", func(t *testing.T) {
		repo := navRepo()
		repo.families = nil
		if find(compute(t, repo), arnAdmin, PathRoleChain) == nil {
			t.Error("an older schema without family rows keeps every family on")
		}
	})
}

func TestWorkloadInheritsItsRolesReach(t *testing.T) {
	res, err := NewEngine(workloadRepo()).ComputeBlastRadius(testCtx(), &Scope{}, arnLambda)
	if err != nil {
		t.Fatal(err)
	}
	if res.SourceARN != arnLambda || res.SourceName != "builder" || res.SourceType != "lambda_function" {
		t.Errorf("source is the workload: %+v", res)
	}
	for _, p := range res.Paths {
		if p.SourceARN != arnLambda {
			t.Fatalf("every path starts at the workload: %+v", p)
		}
		if h := p.Hops[0]; h.FromARN != arnLambda || h.ToARN != arnDev || h.EdgeType != EdgeHasRole ||
			h.Table != "identity_credentials" || h.Basis != "binding:function_role" {
			t.Fatalf("the first hop of every path is the role binding: %+v", h)
		}
		if p.EvidenceRank > EvidenceRankConfigured {
			t.Errorf("a binding is configured evidence, so no path is stronger: %+v", p)
		}
		if len(p.Hops) > 1 && !containsString(p.Limitations, "reached_through_workload_role") {
			t.Errorf("paths beyond the binding say they go through the role: %v", p.Limitations)
		}
		if !containsString(p.Limitations, "does_not_prove_workload_used_this_role") {
			t.Errorf("a binding is configuration, not proof the workload used the role: %v", p.Limitations)
		}
	}

	ids := map[string]int{}
	for _, id := range res.ReachableIdentities {
		ids[id.ARN] = id.Hops
	}
	if ids[arnDev] != 1 || ids[arnOps] != 2 || ids[arnAdmin] != 3 {
		t.Errorf("the role is one step, then the chain beyond it: %v", ids)
	}
	secret := find(res, arnSecretNav, PathWorkloadAccess)
	if secret == nil || len(secret.Hops) != 2 {
		t.Fatalf("the secret DevRole reads is reached by the workload (PATH-004) in two hops: %+v", secret)
	}
	if res.PrivilegeLevel != 5 {
		t.Errorf("a workload is as powerful as its role (DevRole reads a secret by name = 5): %d", res.PrivilegeLevel)
	}
	for _, id := range res.ReachableIdentities {
		stronger := id.PrivilegeLevel > res.PrivilegeLevel
		var flagged bool
		for _, p := range res.Paths {
			if isIdentityPath(p) && p.TargetARN == id.ARN && containsString(p.Limitations, "target_has_higher_privilege") {
				flagged = true
			}
		}
		if id.ARN != arnDev && stronger != flagged {
			t.Errorf("%s (level %d) flagged=%v, want %v", id.ARN, id.PrivilegeLevel, flagged, stronger)
		}
	}
}

func TestWorkloadEdgeCases(t *testing.T) {
	e := NewEngine(workloadRepo())
	if _, err := e.ComputeBlastRadius(testCtx(), &Scope{}, "arn:aws:lambda:us-east-1:111111111111:function:nope"); !errors.Is(err, ErrCredentialNotFound) {
		t.Errorf("an unknown ARN is not found: %v", err)
	}

	unbound := workloadRepo()
	delete(unbound.bound, arnLambda)
	res, err := NewEngine(unbound).ComputeBlastRadius(testCtx(), &Scope{}, arnLambda)
	if err != nil || res.TotalPaths != 0 || res.RiskLevel != "NONE" {
		t.Errorf("a workload with no known role reaches nothing, without an error: %v %+v", err, res)
	}

	disabled := workloadRepo()
	disabled.families = off("FAM-04")
	if _, err := NewEngine(disabled).ComputeBlastRadius(testCtx(), &Scope{}, arnLambda); !errors.Is(err, ErrCredentialNotFound) {
		t.Errorf("FAM-04 off: workloads are not found: %v", err)
	}

	two := workloadRepo()
	two.bound[arnLambda] = append(two.bound[arnLambda], IdentityCredential{
		IdentityARN: arnLambda, CredentialARN: arnOps, BindingType: "execution_role", IsPrimary: false})
	res2, err := NewEngine(two).ComputeBlastRadius(testCtx(), &Scope{}, arnLambda)
	if err != nil {
		t.Fatal(err)
	}
	sawNonPrimary := false
	for _, p := range res2.Paths {
		if containsString(p.Limitations, "non_primary_binding") {
			sawNonPrimary = true
		}
	}
	if !sawNonPrimary || res2.PrivilegeLevel != 8 {
		t.Errorf("two roles: the stronger one (OpsRole, 8) sets the level and the secondary binding is flagged: %d %v", res2.PrivilegeLevel, sawNonPrimary)
	}
}

func TestNavigateWorkloadAndPathFromWorkload(t *testing.T) {
	e := NewEngine(workloadRepo())
	v, err := e.Navigate(testCtx(), &Scope{}, arnLambda, NavOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if v.Node.Kind != "workload" || v.Node.Name != "builder" || v.Outward == nil || len(v.Outward.RunsAs) != 1 {
		t.Fatalf("a workload shows the role it runs as: %+v", v)
	}
	r := v.Outward.RunsAs[0]
	if r.Peer.ARN != arnDev || r.Binding != "function_role" || r.Expand != expandLink(arnDev) || r.Peer.PrivilegeLevel == nil {
		t.Errorf("the role is a link to keep walking: %+v", r)
	}
	if len(v.Outward.Access.Groups) != 0 || len(v.Inward.AssumedBy) != 0 {
		t.Error("a workload has no permissions of its own and nobody assumes it")
	}

	paths, err := e.PathsBetween(testCtx(), &Scope{}, arnLambda, arnAdmin)
	if err != nil || len(paths) == 0 {
		t.Fatalf("a path from the workload to AdminRole: %v %d", err, len(paths))
	}
	found := false
	for _, p := range paths {
		if isIdentityPath(p) && len(p.Hops) == 3 { // binding, then DevRole > OpsRole, then OpsRole > AdminRole
			found = true
		}
	}
	if !found {
		t.Error("the explained path runs workload > DevRole > OpsRole > AdminRole")
	}
}

func TestIsIdentityPathCountsBindingHops(t *testing.T) {
	if !isIdentityPath(BlastRadiusPath{Hops: []PathHop{{EdgeType: EdgeHasRole}}}) ||
		!isIdentityPath(BlastRadiusPath{Hops: []PathHop{{EdgeType: EdgeCanAssume}}}) ||
		isIdentityPath(BlastRadiusPath{Hops: []PathHop{{EdgeType: EdgeCanAccess}}}) ||
		isIdentityPath(BlastRadiusPath{}) {
		t.Error("running as a role and assuming a role are identity steps; accessing a resource is not")
	}
}
