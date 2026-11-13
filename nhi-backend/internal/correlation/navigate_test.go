package correlation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
)

const arnSecretNav = "arn:aws:secretsmanager:us-east-1:111111111111:secret:prod-db"

func testCtx() context.Context { return context.Background() }

// navRepo is the demo estate with real trust policies:
// alice > DevRole (ExternalId) > OpsRole (PassRole on Admin) > AdminRole (*).
func navRepo() *fakeRepo {
	repo := fixture()
	repo.trust = nil
	repo.roleTrust = []RoleTrustRow{
		{ARN: arnUser, Name: "alice", AccountID: acctA, TrustPolicy: trustDoc()},
		{ARN: arnDev, Name: "DevRole", AccountID: acctA, TrustPolicy: trustDoc(
			allowAssume(awsPrincipal(arnUser), `"Condition":{"StringEquals":{"sts:ExternalId":"dev"}}`),
			`{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}`)},
		{ARN: arnOps, Name: "OpsRole", AccountID: acctA, TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnDev), ""))},
		{ARN: arnAdmin, Name: "AdminRole", AccountID: acctA, TrustPolicy: trustDoc(allowAssume(awsPrincipal(arnOps), ""))},
	}
	repo.perms[arnUser] = []ResourcePermission{
		perm("s3:GetObject", "Allow", "arn:aws:s3:::reports"),
		perm("s3:GetObject", "Allow", "arn:aws:s3:::credit-cards"),
		perm("s3:*", "Deny", "arn:aws:s3:::credit-cards"),
	}
	repo.perms[arnDev] = []ResourcePermission{perm("secretsmanager:GetSecretValue", "Allow", arnSecretNav)}
	repo.perms[arnOps] = []ResourcePermission{perm("iam:PassRole", "Allow", arnAdmin)}
	repo.creds[arnDev].Name = "DevRole"
	repo.idCreds = map[string][]IdentityCredential{arnDev: {
		{IdentityARN: "arn:aws:lambda:us-east-1:111111111111:function:builder", CredentialARN: arnDev,
			BindingType: "function_role", BindingSource: "type_attributes.bound_role_arn", IsPrimary: true},
	}}
	return repo
}

func navigate(t *testing.T, repo *fakeRepo, arn string, opts NavOptions) *NavView {
	t.Helper()
	v, err := NewEngine(repo).Navigate(testCtx(), &Scope{}, arn, opts)
	if err != nil {
		t.Fatalf("navigate %s: %v", arn, err)
	}
	return v
}

func TestNavigateOutwardIsOneStepWithProof(t *testing.T) {
	v := navigate(t, navRepo(), arnUser, NavOptions{Direction: "out"})

	if v.Inward != nil {
		t.Error("direction=out must not include the inward view")
	}
	if len(v.Outward.Assumes) != 1 {
		t.Fatalf("alice assumes exactly DevRole in one step (not the whole chain): %+v", v.Outward.Assumes)
	}
	e := v.Outward.Assumes[0]
	if e.Type != "CAN_ASSUME" || e.Peer.ARN != arnDev || e.Peer.Kind != "role" || e.Peer.Name != "DevRole" {
		t.Errorf("assume edge: %+v", e)
	}
	if e.Basis != BasisNamesRole || len(e.Conditions) == 0 || !containsString(e.Limitations, "trust_requires_external_id") {
		t.Errorf("the hop must carry its basis and conditions: %+v", e)
	}
	if e.Expand != graphBase+arnDev {
		t.Errorf("every peer carries a link to continue from: %q", e.Expand)
	}
	if e.Peer.PrivilegeLevel == nil || *e.Peer.PrivilegeLevel != 5 {
		t.Errorf("DevRole reads a secret by name: privilege %v", e.Peer.PrivilegeLevel)
	}
	if v.Node.PrivilegeLevel == nil || *v.Node.PrivilegeLevel != 2 {
		t.Errorf("the focus node has its own level: %v", v.Node.PrivilegeLevel)
	}

	if len(v.Outward.Access.Groups) != 1 || v.Outward.Access.Groups[0].Service != "s3" || v.Outward.Access.Groups[0].Resources != 1 {
		t.Errorf("only the allowed bucket is reachable (credit-cards is denied): %+v", v.Outward.Access.Groups)
	}
	if v.Outward.Access.Groups[0].Expand != graphBase+arnUser+"?service=s3" {
		t.Errorf("a group links to its own listing: %q", v.Outward.Access.Groups[0].Expand)
	}
	if len(v.Outward.Access.Items) != 0 {
		t.Error("items are only listed when a service is requested")
	}
}

func TestNavigateEscalationAndFollowingTheLinks(t *testing.T) {
	repo := navRepo()
	ops := navigate(t, repo, arnOps, NavOptions{Direction: "out"})
	if len(ops.Outward.Escalation) != 1 || ops.Outward.Escalation[0].Peer.ARN != arnAdmin ||
		ops.Outward.Escalation[0].Actions[0] != "iam:PassRole" {
		t.Errorf("PassRole is an escalation edge to the role it can pass: %+v", ops.Outward.Escalation)
	}
	if len(ops.Outward.Assumes) != 1 || ops.Outward.Assumes[0].Peer.ARN != arnAdmin {
		t.Errorf("OpsRole assumes AdminRole: %+v", ops.Outward.Assumes)
	}
	// Following the expand link from alice's peer reaches the next step.
	alice := navigate(t, repo, arnUser, NavOptions{Direction: "out"})
	next := navigate(t, repo, strings.TrimPrefix(alice.Outward.Assumes[0].Expand, graphBase), NavOptions{Direction: "out"})
	if next.Node.Name != "DevRole" || len(next.Outward.Assumes) != 1 || next.Outward.Assumes[0].Peer.ARN != arnOps {
		t.Errorf("walking alice > DevRole > OpsRole one step at a time: %+v", next.Outward.Assumes)
	}
}

func TestNavigateInwardShowsCallersPrincipalsAndWorkloads(t *testing.T) {
	v := navigate(t, navRepo(), arnDev, NavOptions{Direction: "in"})
	if v.Outward != nil {
		t.Error("direction=in must not include the outward view")
	}
	if len(v.Inward.AssumedBy) != 1 || v.Inward.AssumedBy[0].Peer.ARN != arnUser {
		t.Errorf("alice can assume DevRole: %+v", v.Inward.AssumedBy)
	}
	kinds := map[string]bool{}
	for _, p := range v.Inward.TrustPrincipals {
		kinds[p.Kind] = true
	}
	if !kinds[PrincipalUser] || !kinds[PrincipalService] {
		t.Errorf("trust names alice and Lambda: %+v", v.Inward.TrustPrincipals)
	}
	if len(v.Inward.RunsAs) != 1 || v.Inward.RunsAs[0].Binding != "function_role" || v.Inward.RunsAs[0].Peer.Kind != "workload" {
		t.Errorf("the Lambda function that runs as DevRole: %+v", v.Inward.RunsAs)
	}
}

func TestNavigateBothDirectionsIsTheDefault(t *testing.T) {
	v := navigate(t, navRepo(), arnDev, NavOptions{})
	if v.Outward == nil || v.Inward == nil {
		t.Error("the default is both directions")
	}
	if _, err := NewEngine(navRepo()).Navigate(testCtx(), &Scope{}, arnDev, NavOptions{Direction: "sideways"}); err == nil {
		t.Error("an unknown direction is an error")
	}
	if _, err := NewEngine(navRepo()).Navigate(testCtx(), &Scope{}, "arn:aws:iam::111111111111:role/Nope", NavOptions{}); !errors.Is(err, ErrCredentialNotFound) {
		t.Errorf("an unknown identity is not found: %v", err)
	}
}

func TestNavigateGroupsLargeFanOutAndPagesOneService(t *testing.T) {
	repo := navRepo()
	var perms []ResourcePermission
	for i := 0; i < 30; i++ { // 30 services, each "describe on all resources"
		perms = append(perms, perm(fmt.Sprintf("svc%02d:Describe*", i), "Allow", "*"))
	}
	for i := 0; i < 5; i++ { // five buckets
		perms = append(perms, perm("s3:GetObject", "Allow", fmt.Sprintf("arn:aws:s3:::bucket-%d", i)))
	}
	perms = append(perms, perm("s3:PutObject", "Allow", "arn:aws:s3:::bucket-3"))
	repo.perms[arnUser] = perms

	v := navigate(t, repo, arnUser, NavOptions{Direction: "out"})
	if len(v.Outward.Access.Groups) != 31 || v.Outward.Access.Total != 31 {
		t.Fatalf("30 service wildcards + s3 = 31 groups, got %d", len(v.Outward.Access.Groups))
	}
	if v.Outward.Access.Groups[0].Service != "s3" || v.Outward.Access.Groups[0].Significance != "high" {
		t.Errorf("the group holding a write ranks first: %+v", v.Outward.Access.Groups[0])
	}

	page1 := navigate(t, repo, arnUser, NavOptions{Direction: "out", Service: "s3", Limit: 2})
	if page1.Outward.Access.Total != 5 || len(page1.Outward.Access.Items) != 2 || page1.Outward.Access.Service != "s3" {
		t.Fatalf("5 buckets, first page of 2: %+v", page1.Outward.Access)
	}
	if page1.Outward.Access.Items[0].Peer.ARN != "arn:aws:s3:::bucket-3" || page1.Outward.Access.Items[0].Significance != "high" {
		t.Errorf("the bucket with a write sorts first: %+v", page1.Outward.Access.Items[0])
	}
	page3 := navigate(t, repo, arnUser, NavOptions{Direction: "out", Service: "s3", Limit: 2, Offset: 4})
	if len(page3.Outward.Access.Items) != 1 {
		t.Errorf("the last page holds the remainder: %d", len(page3.Outward.Access.Items))
	}
	past := navigate(t, repo, arnUser, NavOptions{Direction: "out", Service: "s3", Limit: 2, Offset: 99})
	if len(past.Outward.Access.Items) != 0 || past.Outward.Access.Total != 5 {
		t.Errorf("an offset past the end is an empty page, not an error: %+v", past.Outward.Access)
	}
	wild := navigate(t, repo, arnUser, NavOptions{Direction: "out", Service: "svc07"})
	if len(wild.Outward.Access.Items) != 1 || !containsString(wild.Outward.Access.Items[0].Limitations, "wildcard_resource_grant") {
		t.Errorf("a wildcard service lists one flagged item: %+v", wild.Outward.Access.Items)
	}
}

func TestPathsBetween(t *testing.T) {
	e := NewEngine(navRepo())
	paths, err := e.PathsBetween(testCtx(), &Scope{}, arnUser, arnAdmin)
	if err != nil || len(paths) == 0 {
		t.Fatalf("alice reaches AdminRole: %v %d", err, len(paths))
	}
	chain := 0
	for _, p := range paths {
		if p.TargetARN != arnAdmin {
			t.Errorf("only paths to the target: %+v", p)
		}
		if p.PathType == PathRoleChain && len(p.Hops) == 3 && isIdentityPath(p) {
			chain++
		}
	}
	if chain != 1 {
		t.Errorf("exactly one 3-hop assume chain to AdminRole, got %d", chain)
	}
	if got := paths[0]; got.EvidenceRank < paths[len(paths)-1].EvidenceRank {
		t.Errorf("paths are ordered strongest evidence first: %d before %d", got.EvidenceRank, paths[len(paths)-1].EvidenceRank)
	}
	none, err := e.PathsBetween(testCtx(), &Scope{}, arnUser, "arn:aws:s3:::nothing")
	if err != nil || none == nil || len(none) != 0 {
		t.Errorf("no path is an empty list, not an error: %v %v", none, err)
	}
	if _, err := e.PathsBetween(testCtx(), &Scope{}, "arn:aws:iam::111111111111:role/Nope", arnAdmin); !errors.Is(err, ErrCredentialNotFound) {
		t.Errorf("unknown source: %v", err)
	}
}

func TestGraphAndPathEndpoints(t *testing.T) {
	r := mux.NewRouter()
	h := &Handler{engine: NewEngine(navRepo()), scope: func(*http.Request) (*Scope, int, error) { return &Scope{}, 0, nil }}
	h.Register(r.PathPrefix("/api/v1").Subrouter())
	get := func(path string) (int, string) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w.Code, w.Body.String()
	}
	g := "/api/v1/correlations/graph/"
	for _, c := range []struct {
		url  string
		want int
	}{
		{g + "not-an-arn", http.StatusBadRequest},
		{g + arnUser + "?direction=sideways", http.StatusBadRequest},
		{g + arnUser + "?limit=0", http.StatusBadRequest},
		{g + arnUser + "?limit=500", http.StatusBadRequest},
		{g + arnUser + "?offset=-1", http.StatusBadRequest},
		{g + "arn:aws:iam::111111111111:role/Nope", http.StatusNotFound},
		{g + arnUser, http.StatusOK},
		{g + arnUser + "?direction=out&service=s3&limit=10", http.StatusOK},
		{"/api/v1/correlations/path?from=" + arnUser, http.StatusBadRequest},
		{"/api/v1/correlations/path?from=" + arnUser + "&to=junk", http.StatusBadRequest},
		{"/api/v1/correlations/path?from=arn:aws:iam::111111111111:role/Nope&to=" + arnAdmin, http.StatusNotFound},
		{"/api/v1/correlations/path?from=" + arnUser + "&to=" + arnAdmin, http.StatusOK},
	} {
		if code, body := get(c.url); code != c.want {
			t.Errorf("%s → %d, want %d (%s)", c.url, code, c.want, body)
		}
	}
	code, body := get(g + arnUser + "?direction=out")
	var env struct{ Data NavView }
	v := &env.Data
	if code != http.StatusOK || json.Unmarshal([]byte(body), &env) != nil || v.Outward == nil || len(v.Outward.Assumes) != 1 {
		t.Errorf("graph body: %d %s", code, body)
	}
	_, pbody := get("/api/v1/correlations/path?from=" + arnUser + "&to=" + arnAdmin)
	var pr struct {
		Data struct {
			Total int `json:"total"`
		} `json:"data"`
	}
	if json.Unmarshal([]byte(pbody), &pr) != nil || pr.Data.Total == 0 {
		t.Errorf("path body: %s", pbody)
	}
}
