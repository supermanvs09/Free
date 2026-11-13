package correlation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	acctA = "111111111111"
	acctB = "222222222222"
)

func roleARN(acct, name string) string { return "arn:aws:iam::" + acct + ":role/" + name }

// trustDoc builds a trust policy document from raw statement JSON.
func trustDoc(stmts ...string) []byte {
	return []byte(`{"Version":"2012-10-17","Statement":[` + strings.Join(stmts, ",") + `]}`)
}

func allowAssume(principal string, extra string) string {
	s := `{"Effect":"Allow","Principal":` + principal + `,"Action":"sts:AssumeRole"`
	if extra != "" {
		s += "," + extra
	}
	return s + "}"
}

func awsPrincipal(vals ...string) string {
	q := make([]string, len(vals))
	for i, v := range vals {
		q[i] = `"` + v + `"`
	}
	return `{"AWS":[` + strings.Join(q, ",") + `]}`
}

func row(acct, name string, doc []byte) RoleTrustRow {
	return RoleTrustRow{ARN: roleARN(acct, name), Name: name, AccountID: acct, TrustPolicy: doc}
}

func permAssume(resource string) ResourcePermission {
	return ResourcePermission{Action: "sts:AssumeRole", Effect: "Allow", ResourceARN: resource}
}

func hasEdge(g *AssumeGraph, from, to string) *AssumeEdge {
	for i := range g.From[from] {
		if g.From[from][i].To == to {
			return &g.From[from][i]
		}
	}
	return nil
}

func TestParseTrustPolicyShapes(t *testing.T) {
	// A single-object Statement (the collector's own parser drops these).
	single := []byte(`{"Statement":{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}}`)
	st, err := ParseTrustPolicy(single)
	if err != nil || len(st) != 1 || !st[0].AssumeCapable || st[0].Principals[0].Kind != PrincipalService {
		t.Fatalf("single-object statement: %+v err=%v", st, err)
	}

	// Document stored as a JSON string.
	quoted, _ := json.Marshal(string(single))
	if st, err := ParseTrustPolicy(quoted); err != nil || len(st) != 1 {
		t.Fatalf("string-encoded document: %+v err=%v", st, err)
	}

	// "*" principal, federated, NotPrincipal, non-assume action.
	st, _ = ParseTrustPolicy(trustDoc(
		`{"Effect":"Allow","Principal":"*","Action":"sts:AssumeRole"}`,
		`{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::`+acctA+`:oidc-provider/token.actions.githubusercontent.com"},"Action":"sts:AssumeRoleWithWebIdentity"}`,
		`{"Effect":"Allow","NotPrincipal":{"AWS":"x"},"Action":"sts:AssumeRole"}`,
		`{"Effect":"Allow","Principal":{"AWS":"`+acctA+`"},"Action":"sts:TagSession"}`,
	))
	if len(st) != 4 {
		t.Fatalf("want 4 statements, got %d", len(st))
	}
	if st[0].Principals[0].Kind != PrincipalPublic {
		t.Errorf("* must be public, got %+v", st[0].Principals)
	}
	if st[1].Principals[0].Kind != PrincipalFederated || !st[1].AssumeCapable {
		t.Errorf("federated: %+v", st[1])
	}
	if !st[2].NotPrincipal {
		t.Error("NotPrincipal must be flagged")
	}
	if st[3].AssumeCapable {
		t.Error("sts:TagSession alone is not an assume grant")
	}
	if _, err := ParseTrustPolicy([]byte(`not json`)); err == nil {
		t.Error("garbage must be an error")
	}
}

func TestClassifyPrincipal(t *testing.T) {
	cases := []struct {
		key, val, kind, acct string
	}{
		{"AWS", "*", PrincipalPublic, ""},
		{"AWS", acctA, PrincipalAccount, acctA},
		{"AWS", "arn:aws:iam::" + acctB + ":root", PrincipalAccount, acctB},
		{"AWS", roleARN(acctA, "R"), PrincipalRole, acctA},
		{"AWS", "arn:aws:iam::" + acctA + ":user/bob", PrincipalUser, acctA},
		{"AWS", "arn:aws:sts::" + acctA + ":assumed-role/R/s", PrincipalSession, acctA},
		{"AWS", "AROAEXAMPLE12345", PrincipalUniqueID, ""},
		{"Service", "ecs-tasks.amazonaws.com", PrincipalService, ""},
		{"Federated", "cognito-identity.amazonaws.com", PrincipalFederated, ""},
	}
	for _, c := range cases {
		got := classifyPrincipal(c.key, c.val)
		if got.Kind != c.kind || got.Account != c.acct {
			t.Errorf("classify(%s,%s) = %+v, want kind %s account %s", c.key, c.val, got, c.kind, c.acct)
		}
	}
}

func TestConditionSummariesAndTokens(t *testing.T) {
	st, _ := ParseTrustPolicy(trustDoc(allowAssume(awsPrincipal(acctA),
		`"Condition":{"StringEquals":{"sts:ExternalId":"abc","aws:SourceAccount":"`+acctA+`"},"Bool":{"aws:MultiFactorAuthPresent":"true"}}`)))
	sum := strings.Join(ConditionSummaries(st[0].Conditions), "|")
	for _, want := range []string{"requires sts:ExternalId", "requires MFA", "aws:SourceAccount"} {
		if !strings.Contains(sum, want) {
			t.Errorf("summary %q lacks %q", sum, want)
		}
	}
	tokens := strings.Join(ConditionTokens(st[0].Conditions), ",")
	for _, want := range []string{"trust_requires_external_id", "trust_requires_mfa", "trust_source_restricted", "trust_conditions_not_evaluated"} {
		if !strings.Contains(tokens, want) {
			t.Errorf("tokens %q lack %q", tokens, want)
		}
	}
	if ConditionTokens(nil) != nil {
		t.Error("no conditions, no tokens")
	}
}

func TestExplicitSameAccountRoleNeedsNoIdentityPermission(t *testing.T) {
	g := BuildAssumeGraph([]RoleTrustRow{
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Target", trustDoc(allowAssume(awsPrincipal(roleARN(acctA, "Caller")), ""))),
	}, nil)
	e := hasEdge(g, roleARN(acctA, "Caller"), roleARN(acctA, "Target"))
	if e == nil || e.Basis != BasisNamesRole || e.Evidence != EvidenceConfigured {
		t.Fatalf("explicit principal must give a configured hop: %+v", e)
	}
	if hasEdge(g, roleARN(acctA, "Target"), roleARN(acctA, "Caller")) != nil {
		t.Error("trust is one-way")
	}
}

func TestAccountTrustNeedsIdentityPermission(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Other", trustDoc()),
		row(acctA, "Target", trustDoc(allowAssume(awsPrincipal("arn:aws:iam::"+acctA+":root"), ""))),
	}
	// No identity permission: nobody can assume it, even though the account is trusted.
	if g := BuildAssumeGraph(rows, nil); len(g.To[roleARN(acctA, "Target")]) != 0 {
		t.Fatal("account trust without an identity permission must not create hops")
	}
	cases := []struct {
		name  string
		perms []ResourcePermission
		want  bool
	}{
		{"exact resource", []ResourcePermission{permAssume(roleARN(acctA, "Target"))}, true},
		{"wildcard resource", []ResourcePermission{permAssume("*")}, true},
		{"resource pattern", []ResourcePermission{permAssume("arn:aws:iam::*:role/Tar*")}, true},
		{"sts:* action", []ResourcePermission{{Action: "sts:*", Effect: "Allow", ResourceARN: "*"}}, true},
		{"other resource", []ResourcePermission{permAssume(roleARN(acctA, "Else"))}, false},
		{"unrelated action", []ResourcePermission{{Action: "s3:*", Effect: "Allow", ResourceARN: "*"}}, false},
		{"explicit deny wins", []ResourcePermission{permAssume("*"),
			{Action: "sts:AssumeRole", Effect: "Deny", ResourceARN: roleARN(acctA, "Target")}}, false},
	}
	for _, c := range cases {
		g := BuildAssumeGraph(rows, map[string][]ResourcePermission{roleARN(acctA, "Caller"): c.perms})
		e := hasEdge(g, roleARN(acctA, "Caller"), roleARN(acctA, "Target"))
		if (e != nil) != c.want {
			t.Errorf("%s: edge=%v want %v", c.name, e != nil, c.want)
		}
		if e != nil && (e.Basis != BasisAccountTrust || e.Evidence != EvidenceEffective) {
			t.Errorf("%s: basis/evidence %+v", c.name, e)
		}
		if hasEdge(g, roleARN(acctA, "Other"), roleARN(acctA, "Target")) != nil {
			t.Errorf("%s: a role without the permission must not get a hop", c.name)
		}
	}
}

func TestConditionalDenyDoesNotBlockButConditionalAllowIsFlagged(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Target", trustDoc(allowAssume(awsPrincipal("arn:aws:iam::"+acctA+":root"), ""))),
	}
	perms := map[string][]ResourcePermission{roleARN(acctA, "Caller"): {
		{Action: "sts:AssumeRole", Effect: "Allow", ResourceARN: "*", Conditional: true},
		{Action: "sts:AssumeRole", Effect: "Deny", ResourceARN: "*", Conditional: true},
	}}
	e := hasEdge(BuildAssumeGraph(rows, perms), roleARN(acctA, "Caller"), roleARN(acctA, "Target"))
	if e == nil || !containsString(e.Flags, "identity_permission_has_conditions") {
		t.Fatalf("conditional allow must still produce a flagged hop: %+v", e)
	}
}

func TestCrossAccountExplicitRoleStillNeedsPermission(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctB, "Partner", trustDoc()),
		row(acctA, "Target", trustDoc(allowAssume(awsPrincipal(roleARN(acctB, "Partner")), ""))),
	}
	if hasEdge(BuildAssumeGraph(rows, nil), roleARN(acctB, "Partner"), roleARN(acctA, "Target")) != nil {
		t.Error("cross-account hop needs the caller's own permission as well")
	}
	g := BuildAssumeGraph(rows, map[string][]ResourcePermission{roleARN(acctB, "Partner"): {permAssume("*")}})
	if e := hasEdge(g, roleARN(acctB, "Partner"), roleARN(acctA, "Target")); e == nil || e.Evidence != EvidenceEffective {
		t.Errorf("with the permission the hop exists: %+v", e)
	}
}

func TestPublicTrustAndTrustDeny(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Blocked", trustDoc()),
		row(acctA, "Target", trustDoc(
			allowAssume(`"*"`, ""),
			`{"Effect":"Deny","Principal":{"AWS":"`+roleARN(acctA, "Blocked")+`"},"Action":"sts:AssumeRole"}`,
		)),
	}
	perms := map[string][]ResourcePermission{
		roleARN(acctA, "Caller"):  {permAssume("*")},
		roleARN(acctA, "Blocked"): {permAssume("*")},
	}
	g := BuildAssumeGraph(rows, perms)
	if e := hasEdge(g, roleARN(acctA, "Caller"), roleARN(acctA, "Target")); e == nil || e.Basis != BasisPublicTrust {
		t.Errorf("public trust plus permission must give a hop: %+v", e)
	}
	if hasEdge(g, roleARN(acctA, "Blocked"), roleARN(acctA, "Target")) != nil {
		t.Error("an unconditional trust Deny must remove the hop")
	}
}

func TestTrustConditionsRideOnTheEdge(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Target", trustDoc(allowAssume(awsPrincipal(roleARN(acctA, "Caller")),
			`"Condition":{"StringEquals":{"sts:ExternalId":"secret"}}`))),
	}
	e := hasEdge(BuildAssumeGraph(rows, nil), roleARN(acctA, "Caller"), roleARN(acctA, "Target"))
	if e == nil || len(e.Conditions) == 0 || !containsString(e.Flags, "trust_requires_external_id") {
		t.Fatalf("conditions and flags must be on the edge: %+v", e)
	}
}

func TestNoSelfEdgesAndNoEdgeForNonAssumeActions(t *testing.T) {
	rows := []RoleTrustRow{
		row(acctA, "Self", trustDoc(allowAssume(awsPrincipal(roleARN(acctA, "Self")), ""))),
		row(acctA, "Caller", trustDoc()),
		row(acctA, "Target", trustDoc(`{"Effect":"Allow","Principal":{"AWS":"`+roleARN(acctA, "Caller")+`"},"Action":"sts:TagSession"}`)),
	}
	g := BuildAssumeGraph(rows, nil)
	if len(g.From[roleARN(acctA, "Self")]) != 0 {
		t.Error("a role must not assume itself")
	}
	if hasEdge(g, roleARN(acctA, "Caller"), roleARN(acctA, "Target")) != nil {
		t.Error("sts:TagSession alone grants no hop")
	}
}

func TestInboundListsPrincipalsAndChains(t *testing.T) {
	// Outer -> Mid -> Target through explicit trust; Target also trusts a service and a federated provider.
	rows := []RoleTrustRow{
		row(acctA, "Outer", trustDoc()),
		row(acctA, "Mid", trustDoc(allowAssume(awsPrincipal(roleARN(acctA, "Outer")), ""))),
		row(acctA, "Target", trustDoc(
			allowAssume(awsPrincipal(roleARN(acctA, "Mid")), ""),
			`{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}`,
			`{"Effect":"Allow","Principal":"*","Action":"sts:AssumeRole","Condition":{"StringEquals":{"sts:ExternalId":"x"}}}`,
		)),
	}
	g := BuildAssumeGraph(rows, nil)
	res, ok := g.Inbound(roleARN(acctA, "Target"), 2)
	if !ok {
		t.Fatal("role must be found")
	}
	if !res.Public {
		t.Error("the * principal must set public_trust")
	}
	kinds := map[string]bool{}
	for _, p := range res.Principals {
		kinds[p.Kind] = true
	}
	for _, k := range []string{PrincipalRole, PrincipalService, PrincipalPublic} {
		if !kinds[k] {
			t.Errorf("principal kind %s missing: %+v", k, res.Principals)
		}
	}
	if len(res.Callers) != 2 || res.Callers[0].ARN != roleARN(acctA, "Mid") || res.Callers[0].Hops != 1 ||
		res.Callers[1].ARN != roleARN(acctA, "Outer") || res.Callers[1].Hops != 2 {
		t.Fatalf("callers = %+v", res.Callers)
	}
	if got := res.Callers[1].Path; len(got) != 3 || got[0] != roleARN(acctA, "Outer") || got[2] != roleARN(acctA, "Target") {
		t.Errorf("path = %v", got)
	}
	if one, _ := g.Inbound(roleARN(acctA, "Target"), 1); len(one.Callers) != 1 {
		t.Errorf("depth 1 must stop at direct callers, got %d", len(one.Callers))
	}
	if _, ok := g.Inbound(roleARN(acctA, "Nope"), 1); ok {
		t.Error("unknown role must not be found")
	}
}

func TestPhase2UsesResolvedHopsWithBasisAndConditions(t *testing.T) {
	repo := fixture()
	repo.trust = nil // no trust_edges rows at all: hops must come from the trust policies
	repo.roleTrust = []RoleTrustRow{
		{ARN: arnUser, Name: "alice", AccountID: "111111111111", TrustPolicy: trustDoc()},
		{ARN: arnDev, Name: "DevRole", AccountID: "111111111111",
			TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnUser), `"Condition":{"StringEquals":{"sts:ExternalId":"x"}}`))},
		{ARN: arnOps, Name: "OpsRole", AccountID: "111111111111",
			TrustPolicy: trustDoc(allowAssume(awsPrincipal("arn:aws:iam::111111111111:root"), ""))},
		{ARN: arnAdmin, Name: "AdminRole", AccountID: "111111111111",
			TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnOps), ""))},
	}
	repo.assumePerms = map[string][]ResourcePermission{arnDev: {permAssume(arnOps)}}

	res := compute(t, repo)
	p := find(res, arnAdmin, PathRoleChain)
	if p == nil || len(p.Hops) != 3 {
		t.Fatalf("alice > Dev > Ops > Admin must be resolved from trust policies: %+v", p)
	}
	if p.Hops[0].Basis != BasisNamesRole || p.Hops[1].Basis != BasisAccountTrust || p.Hops[2].Basis != BasisNamesRole {
		t.Errorf("bases = %s, %s, %s", p.Hops[0].Basis, p.Hops[1].Basis, p.Hops[2].Basis)
	}
	if len(p.Hops[0].Conditions) == 0 || !containsString(p.Limitations, "trust_requires_external_id") {
		t.Errorf("the ExternalId condition must show on the hop and as a limitation: %+v", p.Hops[0].Conditions)
	}
	if p.EvidenceRank != EvidenceRankConfigured {
		t.Errorf("the weakest hop (configured) sets the path rank, got %d", p.EvidenceRank)
	}
}

func TestResolvedHopsDoNotDuplicateTrustEdgesRows(t *testing.T) {
	repo := fixture() // trust_edges has alice > Dev already
	repo.roleTrust = []RoleTrustRow{
		{ARN: arnUser, Name: "alice", AccountID: "111111111111", TrustPolicy: trustDoc()},
		{ARN: arnDev, Name: "DevRole", AccountID: "111111111111",
			TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnUser), ""))},
	}
	res := compute(t, repo)
	n := 0
	for _, p := range res.Paths {
		if p.TargetARN == arnDev && p.PathType == PathRoleChain && len(p.Hops) == 1 {
			n++
			if p.Hops[0].Basis != BasisNamesRole {
				t.Errorf("the resolved basis must win over the trust_edges row: %s", p.Hops[0].Basis)
			}
		}
	}
	if n != 1 {
		t.Errorf("want exactly one path to DevRole, got %d", n)
	}
}

func TestCrossAccountChainIsFlaggedAndPathARNsListed(t *testing.T) {
	foreign := roleARN(acctB, "Foreign")
	repo := fixture()
	repo.trust = nil
	repo.roleTrust = []RoleTrustRow{
		{ARN: arnUser, Name: "alice", AccountID: acctA, TrustPolicy: trustDoc()},
		{ARN: foreign, Name: "Foreign", AccountID: acctB,
			TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnUser), ""))},
	}
	repo.assumePerms = map[string][]ResourcePermission{arnUser: {permAssume("*")}}

	res := compute(t, repo)
	p := find(res, foreign, PathRoleChain)
	if p == nil || !containsString(p.Limitations, "crosses_account_boundary") {
		t.Fatalf("a hop into another account must be flagged: %+v", p)
	}
	var id *ReachableIdentity
	for i := range res.ReachableIdentities {
		if res.ReachableIdentities[i].ARN == foreign {
			id = &res.ReachableIdentities[i]
		}
	}
	if id == nil || len(id.PathARNs) != 2 || id.PathARNs[0] != arnUser || id.PathARNs[1] != foreign {
		t.Errorf("path_arns must list the real ARNs in order: %+v", id)
	}
	if find(res, arnDev, PathRoleChain) != nil && containsString(find(res, arnDev, PathRoleChain).Limitations, "crosses_account_boundary") {
		t.Error("a same-account hop must not be flagged")
	}
}

func TestWhoCanAssumeEndpoint(t *testing.T) {
	repo := &fakeRepo{
		roleTrust: []RoleTrustRow{
			row(acctA, "Caller", trustDoc()),
			row(acctA, "Target", trustDoc(allowAssume(awsPrincipal(roleARN(acctA, "Caller")), ""))),
		},
	}
	r := testRouter(repo)
	get := func(path string) (int, string) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w.Code, w.Body.String()
	}
	base := "/api/v1/correlations/who-can-assume/"
	if c, _ := get(base + "not-an-arn"); c != http.StatusBadRequest {
		t.Errorf("bad ARN → %d", c)
	}
	if c, _ := get(base + roleARN(acctA, "Target") + "?depth=9"); c != http.StatusBadRequest {
		t.Errorf("depth 9 → %d", c)
	}
	if c, _ := get(base + roleARN(acctA, "Missing")); c != http.StatusNotFound {
		t.Errorf("unknown role → %d", c)
	}
	code, body := get(base + roleARN(acctA, "Target"))
	if code != http.StatusOK {
		t.Fatalf("known role → %d %s", code, body)
	}
	var env struct{ Data InboundResult }
	out := env.Data
	err := json.Unmarshal([]byte(body), &env)
	out = env.Data
	if err != nil || len(out.Callers) != 1 || out.Callers[0].Name != "Caller" {
		t.Errorf("body = %s (err %v)", body, err)
	}
	_ = context.Background
}
