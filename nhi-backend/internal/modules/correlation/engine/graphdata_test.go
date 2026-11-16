package engine

import (
	"context"
	"strings"
	"testing"
	"time"
)

const (
	arnOpen  = "arn:aws:s3:::open-bucket"
	arnRpt   = "arn:aws:s3:::reports"
	arnKey   = "arn:aws:kms:us-east-1:111111111111:key/k1"
	arnQueue = "arn:aws:sqs:us-east-1:111111111111:jobs"
	arnFn    = "arn:aws:lambda:us-east-1:111111111111:function:worker"
	arnFnRol = "arn:aws:iam::111111111111:role/WorkerRole"
)

func newGraph() *GraphData {
	return &GraphData{Available: true,
		Policies: map[string][]ResourcePolicy{}, KMSGrants: map[string][]KMSGrant{},
		KeyManagers: map[string]string{}, LinksFrom: map[string][]GraphLink{},
		LastUsed: map[string]map[string]*time.Time{},
		Status:   []FetchStatus{{AccountID: "111111111111", Source: "s3", Region: "global", Status: "ok"}},
	}
}

func addPolicy(t *testing.T, d *GraphData, res, typ, doc string) {
	t.Helper()
	stmts, err := ParseResourcePolicy([]byte(doc))
	if err != nil {
		t.Fatal(err)
	}
	d.Policies[res] = append(d.Policies[res], ResourcePolicy{ResourceARN: res, AccountID: "111111111111", PolicyType: typ, Statements: stmts})
}

func link(d *GraphData, typ, from, to string) {
	d.LinksFrom[from] = append(d.LinksFrom[from], GraphLink{Type: typ, From: from, To: to})
}

func hasLimit(p *BlastRadiusPath, l string) bool { return p != nil && containsString(p.Limitations, l) }

func TestWithoutGraphDataResultsAreUnchanged(t *testing.T) {
	plain := compute(t, fixture())
	repo := fixture()
	repo.graph = &GraphData{} // schema missing
	res := compute(t, repo)
	if len(res.Paths) != len(plain.Paths) {
		t.Fatalf("paths %d, want %d", len(res.Paths), len(plain.Paths))
	}
	if len(res.GraphDataCoverage) != 1 || !strings.Contains(res.GraphDataCoverage[0], "not collected") {
		t.Fatalf("coverage %v", res.GraphDataCoverage)
	}
}

func TestResourcePolicyGrantsNamedPrincipalAndPublic(t *testing.T) {
	repo := fixture()
	d := newGraph()
	addPolicy(t, d, arnRpt, "resource_policy", `{"Statement":{"Effect":"Allow","Principal":{"AWS":"`+arnUser+`"},"Action":"s3:GetObject","Resource":"`+arnRpt+`/*"}}`)
	addPolicy(t, d, arnOpen, "resource_policy", `{"Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject"}]}`)
	addPolicy(t, d, arnBkt, "resource_policy", `{"Statement":[{"Effect":"Allow","Principal":{"AWS":"`+arnUser+`"},"Action":"s3:GetObject"}]}`)
	// Naming only the account delegates to IAM and grants nothing by itself.
	addPolicy(t, d, "arn:aws:s3:::acct-only", "resource_policy", `{"Statement":[{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::111111111111:root"},"Action":"s3:*"}]}`)
	repo.graph = d
	res := compute(t, repo)

	rpt := find(res, arnRpt, PathDirectAccess)
	if rpt == nil || rpt.Hops[0].Table != "nhi_resource_policies" || rpt.Hops[0].Basis != "resource_policy" {
		t.Fatalf("named principal: %+v", rpt)
	}
	if open := find(res, arnOpen, PathDirectAccess); !hasLimit(open, "public_resource_policy") {
		t.Fatalf("public bucket: %+v", open)
	}
	if b := find(res, arnBkt, PathDirectAccess); !hasLimit(b, "also_granted_by_resource_policy") || b.Hops[0].Table != "effective_permissions" {
		t.Fatalf("identity path keeps its source and gets the overlap flag: %+v", b)
	}
	if find(res, "arn:aws:s3:::acct-only", PathDirectAccess) != nil {
		t.Fatal("an account-root principal alone must not grant access")
	}

	// Switching FAM-14 off removes the resource-policy side.
	repo.families = map[string]bool{"FAM-14": false}
	if find(compute(t, repo), arnOpen, PathDirectAccess) != nil {
		t.Fatal("FAM-14 off must drop resource-policy grants")
	}
}

// Found on real data: AWS writes default policies as "*" limited by a condition.
// They are not public and grant nothing by themselves.
func TestStarScopedByConditionIsNotPublic(t *testing.T) {
	repo := fixture()
	d := newGraph()
	topic := "arn:aws:sns:ap-south-1:111111111111:default-topic"
	addPolicy(t, d, topic, "resource_policy", `{"Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},
		"Action":["SNS:Publish","SNS:Subscribe"],"Resource":"`+topic+`",
		"Condition":{"StringEquals":{"AWS:SourceOwner":"111111111111"}}}]}`)
	awsKey := "arn:aws:kms:ap-south-1:111111111111:key/aws-managed"
	d.KeyManagers[awsKey] = "AWS"
	addPolicy(t, d, awsKey, "key_policy", `{"Statement":[{"Effect":"Allow","Principal":{"AWS":"*"},
		"Action":["kms:Encrypt","kms:Decrypt"],"Resource":"*",
		"Condition":{"StringEquals":{"kms:CallerAccount":"111111111111","kms:ViaService":"s3.ap-south-1.amazonaws.com"}}}]}`)
	repo.graph = d
	res := compute(t, repo)
	for _, p := range res.Paths {
		if p.TargetARN == topic || p.TargetARN == awsKey {
			t.Fatalf("a condition-scoped * or an AWS-managed key must not become reach: %+v", p)
		}
	}

	paths, err := NewEngine(repo).ReverseAccess(context.Background(), &Scope{}, topic)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if p.SourceARN == "*" && (hasLimit(&p, "public_resource_policy") || !hasLimit(&p, "any_principal_limited_by_condition")) {
			t.Fatalf("inward view must say limited by condition, not public: %+v", p)
		}
	}

	// A "NotEquals" condition does not scope the principal: still public.
	if scopedByCondition([]TrustCondition{{Operator: "StringNotEquals", Key: "aws:SourceAccount", Values: []string{"1"}}}) {
		t.Fatal("a negative condition must not count as scoping")
	}
}

func TestResourcePolicyDenyRemovesOrFlagsPath(t *testing.T) {
	repo := fixture()
	d := newGraph()
	addPolicy(t, d, arnBkt, "resource_policy", `{"Statement":[{"Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["`+arnBkt+`","`+arnBkt+`/*"]}]}`)
	repo.graph = d
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); p != nil {
		t.Fatalf("an unconditional Deny to everyone must remove the path: %+v", p)
	}

	d2 := newGraph()
	addPolicy(t, d2, arnBkt, "resource_policy", `{"Statement":[{"Effect":"Deny","Principal":"*","Action":"s3:GetObject","Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}`)
	repo.graph = d2
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); !hasLimit(p, "may_be_denied_by_resource_policy") {
		t.Fatalf("a conditional Deny only flags: %+v", p)
	}
}

func TestKMSKeyDecidesWhetherEncryptedDataIsReadable(t *testing.T) {
	plain := find(compute(t, fixture()), arnBkt, PathDirectAccess)

	repo := fixture()
	d := newGraph()
	d.KeyManagers[arnKey] = "CUSTOMER"
	link(d, "encrypted_by", arnBkt, arnKey)
	addPolicy(t, d, arnKey, "key_policy", `{"Statement":[{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::111111111111:root"},"Action":"kms:*","Resource":"*"}]}`)
	repo.graph = d
	p := find(compute(t, repo), arnBkt, PathDirectAccess)
	if !hasLimit(p, "kms_key_blocks_read") || p.SecuritySignificance != downgradeSignificance(plain.SecuritySignificance) {
		t.Fatalf("no kms:Decrypt for alice: %+v (was %s)", p, plain.SecuritySignificance)
	}

	// The key policy delegates to IAM, and alice's identity policy allows decrypt.
	repo.perms[arnUser] = append(repo.perms[arnUser], perm("kms:Decrypt", "Allow", arnKey))
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); !hasLimit(p, "kms_decrypt_also_granted") {
		t.Fatalf("decrypt allowed: %+v", p)
	}

	// A KMS grant alone is enough.
	repo = fixture()
	d.KMSGrants[arnKey] = []KMSGrant{{KeyARN: arnKey, Grantee: arnUser, Operations: []string{"Decrypt"}}}
	repo.graph = d
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); !hasLimit(p, "kms_decrypt_also_granted") {
		t.Fatalf("kms grant: %+v", p)
	}

	// AWS-managed keys need nothing.
	repo = fixture()
	d3 := newGraph()
	link(d3, "encrypted_by", arnBkt, "arn:aws:kms:us-east-1:111111111111:alias/aws/s3")
	repo.graph = d3
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); hasLimit(p, "kms_key_blocks_read") || hasLimit(p, "kms_key_not_collected") {
		t.Fatalf("aws-managed key: %+v", p)
	}
}

func TestWritingToATriggerReachesTheFunctionsRole(t *testing.T) {
	repo := fixture()
	repo.perms[arnUser] = append(repo.perms[arnUser], perm("sqs:SendMessage", "Allow", arnQueue))
	d := newGraph()
	link(d, "invokes", arnQueue, arnFn)
	link(d, "executes_as", arnFn, arnFnRol)
	repo.graph = d
	res := compute(t, repo)

	p := find(res, arnFnRol, PathEscalation)
	if p == nil {
		t.Fatal("expected a trigger path to the function's role")
	}
	if len(p.Hops) != 3 || p.Hops[0].EdgeType != EdgeCanAccess || p.Hops[1].EdgeType != EdgeTriggers || p.Hops[2].EdgeType != EdgeHasRole {
		t.Fatalf("hops %+v", p.Hops)
	}
	if !hasLimit(p, "controls_input_only_not_role_credentials") || p.SecuritySignificance != "medium" {
		t.Fatalf("path %+v", p)
	}
	found := false
	for _, id := range res.ReachableIdentities {
		if id.ARN == arnFnRol {
			found = true
		}
	}
	if !found {
		t.Fatal("the function's role must be listed as reachable")
	}

	repo.families = map[string]bool{"FAM-08": false}
	if find(compute(t, repo), arnFnRol, PathEscalation) != nil {
		t.Fatal("FAM-08 off must drop trigger paths")
	}
}

func TestSCPDenyAppliesToMemberAccounts(t *testing.T) {
	scp := func(from, targetType, targetID string) SCPolicy {
		stmts, _ := ParsePolicyDocument([]byte(`{"Statement":[{"Effect":"Deny","Action":"s3:*","Resource":"*"}]}`))
		return SCPolicy{ID: "p-1", Name: "DenyS3", FromAccount: from, Statements: stmts,
			Targets: []SCPTarget{{ID: targetID, Type: targetType}}}
	}
	repo := fixture()
	d := newGraph()
	d.SCPs = []SCPolicy{scp("999999999999", "ACCOUNT", "111111111111")}
	repo.graph = d
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); p != nil {
		t.Fatalf("an SCP Deny on the account must remove the path: %+v", p)
	}

	d.SCPs = []SCPolicy{scp("999999999999", "ORGANIZATIONAL_UNIT", "ou-1")}
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); !hasLimit(p, "scp_on_ou_not_resolved") {
		t.Fatalf("an SCP on an OU only flags: %+v", p)
	}

	d.SCPs = []SCPolicy{scp("111111111111", "ROOT", "r-1")}
	if p := find(compute(t, repo), arnBkt, PathDirectAccess); p == nil {
		t.Fatal("SCPs do not apply to the management account")
	}
}

func TestAccessAdvisorFlagsAndCoverage(t *testing.T) {
	repo := fixture()
	d := newGraph()
	recent := time.Now().Add(-10 * 24 * time.Hour)
	d.LastUsed[arnUser] = map[string]*time.Time{"s3": &recent}
	d.Status = append(d.Status, FetchStatus{AccountID: "111111111111", Source: "kms", Region: "ap-south-1",
		Status: "not_permitted", Message: "needs kms:ListKeys"})
	repo.graph = d
	res := compute(t, repo)
	if p := find(res, arnBkt, PathDirectAccess); !hasLimit(p, "service_used_last_90_days") {
		t.Fatalf("usage flag: %+v", p)
	}
	if len(res.GraphDataCoverage) != 1 || !strings.Contains(res.GraphDataCoverage[0], "kms ap-south-1: not_permitted") {
		t.Fatalf("coverage %v", res.GraphDataCoverage)
	}
	if got := d.coverage("222222222222"); len(got) != 1 || !strings.Contains(got[0], "not collected for account") {
		t.Fatalf("other account: %v", got)
	}
	never := (&GraphData{Available: true, LastUsed: map[string]map[string]*time.Time{"r": {"s3": nil}}}).usageFlag("r", "s3")
	if never != "service_not_used_in_tracking_period" {
		t.Fatal(never)
	}
}

func TestReverseAccessListsResourcePolicyPrincipals(t *testing.T) {
	repo := fixture()
	d := newGraph()
	addPolicy(t, d, arnBkt, "resource_policy", `{"Statement":[
		{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::222222222222:root"},"Action":"s3:GetObject"},
		{"Effect":"Allow","Principal":{"Service":"cloudtrail.amazonaws.com"},"Action":"s3:PutObject"}]}`)
	repo.graph = d
	paths, err := NewEngine(repo).ReverseAccess(context.Background(), &Scope{}, arnBkt)
	if err != nil {
		t.Fatal(err)
	}
	var acct, svc bool
	for _, p := range paths {
		switch p.SourceARN {
		case "arn:aws:iam::222222222222:root":
			acct = hasLimit(&p, "any_identity_in_account_with_iam_permission")
		case "cloudtrail.amazonaws.com":
			svc = hasLimit(&p, "aws_service_principal")
		}
	}
	if !acct || !svc {
		t.Fatalf("resource-policy principals missing: %+v", paths)
	}
}

func TestParseResourcePolicy(t *testing.T) {
	stmts, err := ParseResourcePolicy([]byte(`"{\"Statement\":{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"111111111111\",\"*\"],\"Service\":\"lambda.amazonaws.com\"},\"NotAction\":\"s3:Delete*\"}}"`))
	if err != nil || len(stmts) != 1 {
		t.Fatalf("%v %v", stmts, err)
	}
	kinds := map[string]bool{}
	for _, p := range stmts[0].Principals {
		kinds[p.Kind] = true
	}
	if !kinds[PrincipalAccount] || !kinds[PrincipalPublic] || !kinds[PrincipalService] || len(stmts[0].NotActions) != 1 {
		t.Fatalf("%+v", stmts[0])
	}
}
