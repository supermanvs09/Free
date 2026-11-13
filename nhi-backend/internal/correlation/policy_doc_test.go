package correlation

import (
	"encoding/json"
	"strings"
	"testing"
)

func policyDoc(stmts ...string) string {
	return `{"Version":"2012-10-17","Statement":[` + strings.Join(stmts, ",") + `]}`
}

// storedPolicies builds the collector's attached_policies / inline_policies JSON,
// where each document is itself a JSON string.
func storedPolicies(name, doc string) []byte {
	b, _ := json.Marshal([]map[string]string{{"name": name, "document": doc}})
	return b
}

func TestParsePolicyDocumentKeepsWhatEffectivePermissionsDrops(t *testing.T) {
	doc := policyDoc(
		`{"Sid":"ReadLogs","Effect":"Allow","Action":["s3:GetObject","s3:ListBucket"],"Resource":"arn:aws:s3:::logs/*","Condition":{"IpAddress":{"aws:SourceIp":"10.0.0.0/8"}}}`,
		`{"Effect":"Deny","Action":"s3:DeleteObject","Resource":"*"}`,
	)
	stmts, err := ParsePolicyDocument([]byte(doc))
	if err != nil || len(stmts) != 2 {
		t.Fatalf("parse: %+v %v", stmts, err)
	}
	el := ElementsFromStatements(stmts, "LogReader", "managed")
	if len(el) != 3 {
		t.Fatalf("2 actions + 1 deny = 3 elements, got %d: %+v", len(el), el)
	}
	if el[0].Sid != "ReadLogs" || !el[0].Conditional || el[0].PolicySource != "LogReader" || el[0].PolicyType != "managed" {
		t.Errorf("Sid, condition and source must survive: %+v", el[0])
	}
	if el[2].Effect != "Deny" || el[2].Conditional {
		t.Errorf("an unconditional Deny stays unconditional: %+v", el[2])
	}
}

func TestSingleObjectStatementAndStringEncodedDocument(t *testing.T) {
	one := `{"Statement":{"Effect":"Allow","Action":"s3:*","Resource":"*"}}`
	if st, err := ParsePolicyDocument([]byte(one)); err != nil || len(st) != 1 {
		t.Fatalf("single-object Statement: %+v %v", st, err)
	}
	enc, _ := json.Marshal(one)
	if st, err := ParsePolicyDocument(enc); err != nil || len(st) != 1 {
		t.Fatalf("document stored as a string: %+v %v", st, err)
	}
	if _, err := ParsePolicyDocument([]byte("garbage")); err == nil {
		t.Error("garbage must be an error")
	}
}

func TestNotActionAndNotResource(t *testing.T) {
	stmts, _ := ParsePolicyDocument([]byte(policyDoc(
		`{"Effect":"Allow","NotAction":["iam:*","organizations:*"],"Resource":"*"}`,
		`{"Effect":"Allow","Action":"s3:GetObject","NotResource":"arn:aws:s3:::secret/*"}`,
		`{"Effect":"Deny","Action":"s3:*","NotResource":"arn:aws:s3:::ok/*"}`,
	)))
	el := ElementsFromStatements(stmts, "P", "managed")
	if el[0].Action != "*" || len(el[0].ExceptActions) != 2 {
		t.Errorf("Allow NotAction becomes * with an except list: %+v", el[0])
	}
	if el[1].ResourceARN != "*" || !containsString(el[1].Flags, "not_resource_statement") {
		t.Errorf("NotResource is flagged and widened to *: %+v", el[1])
	}
	if !el[2].Conditional {
		t.Errorf("a Deny with NotResource must never be applied: %+v", el[2])
	}
}

func TestDenyWithNotActionRespectsTheExceptList(t *testing.T) {
	got := ApplyDenies([]ResourcePermission{
		perm("s3:GetObject", "Allow", "*"),
		perm("ec2:RunInstances", "Allow", "*"),
		{Action: "*", Effect: "Deny", ResourceARN: "*", ExceptActions: []string{"s3:*"}},
	})
	if len(got) != 1 || got[0].Action != "s3:GetObject" {
		t.Fatalf("deny everything except s3 keeps only the s3 allow: %+v", got)
	}
}

func TestResolvePermissionsPrefersDocumentsAndFallsBack(t *testing.T) {
	stored := []byte(`[{"action":"s3:GetObject","effect":"Allow","resource_arn":"*"}]`)
	attached := storedPolicies("Docs", policyDoc(
		`{"Sid":"X","Effect":"Allow","Action":"kms:Decrypt","Resource":"*","Condition":{"StringEquals":{"aws:RequestedRegion":"ap-south-1"}}}`))

	got := ResolvePermissions(stored, attached, nil)
	if len(got) != 1 || got[0].Action != "kms:Decrypt" || !got[0].Conditional || got[0].Sid != "X" {
		t.Fatalf("documents win over the flattened elements: %+v", got)
	}
	if got := ResolvePermissions(stored, nil, nil); len(got) != 1 || got[0].Action != "s3:GetObject" {
		t.Errorf("no documents: fall back to stored elements, got %+v", got)
	}
	bad := storedPolicies("Broken", "not a policy")
	if got := ResolvePermissions(stored, bad, nil); len(got) != 1 || got[0].Action != "s3:GetObject" {
		t.Errorf("an unparsable document must fall back, not return a partial set: %+v", got)
	}
	wrapped := []byte(`{"permissions":[{"action":"sqs:*","effect":"Allow","resource_arn":"*"}]}`)
	if got := ResolvePermissions(wrapped, nil, nil); len(got) != 1 || got[0].Action != "sqs:*" {
		t.Errorf("the wrapped stored shape must parse: %+v", got)
	}
	inline := storedPolicies("Inline", policyDoc(`{"Effect":"Allow","Action":"sns:Publish","Resource":"*"}`))
	got = ResolvePermissions(stored, attached, inline)
	if len(got) != 2 || got[1].PolicyType != "inline" || got[0].PolicyType != "managed" {
		t.Errorf("attached and inline documents both count, typed correctly: %+v", got)
	}
}

func TestServiceOfAction(t *testing.T) {
	cases := map[string]string{"s3:GetObject": "s3", "EC2:Describe*": "ec2", "*": "*", "s*:Get*": "*", "": "*"}
	for in, want := range cases {
		if got := serviceOfAction(in); got != want {
			t.Errorf("serviceOfAction(%q) = %q, want %q", in, got, want)
		}
	}
	if WildcardTarget("s3") != "*:s3" || WildcardTarget("*") != AllResourcesARN || WildcardTarget("") != AllResourcesARN {
		t.Error("WildcardTarget")
	}
	if serviceOfTarget("*:kms") != "kms" || serviceOfTarget("arn:aws:s3:::b") != "s3" || serviceOfTarget("*") != "" {
		t.Error("serviceOfTarget")
	}
	if !isAllResourcesTarget("*") || !isAllResourcesTarget("*:s3") || isAllResourcesTarget("arn:aws:s3:::b") {
		t.Error("isAllResourcesTarget")
	}
}

func TestPowerUserStyleRoleThroughTheEngine(t *testing.T) {
	// NotAction: iam:* on * (PowerUserAccess): broad, but no IAM escalation.
	repo := fixture()
	repo.perms[arnUser] = []ResourcePermission{
		{Action: "*", Effect: "Allow", ResourceARN: "*", ExceptActions: []string{"iam:*"}},
		{Action: "s3:GetObject", Effect: "Allow", ResourceARN: "arn:aws:s3:::reports", Conditional: true},
	}
	repo.trust = nil
	res := compute(t, repo)
	if find(res, arnUser, PathEscalation) != nil {
		t.Error("everything except IAM must not produce an escalation path")
	}
	all := find(res, AllResourcesARN, PathDirectAccess)
	if all == nil || all.SecuritySignificance != "high" || !containsString(all.Limitations, "not_action_statement") {
		t.Fatalf("broad grant must be high and flagged as NotAction: %+v", all)
	}
	s3 := find(res, "arn:aws:s3:::reports", PathDirectAccess)
	if s3 == nil || !containsString(s3.Limitations, "grant_has_conditions") {
		t.Errorf("a conditional grant is kept but flagged: %+v", s3)
	}
}

func TestWildcardPerServiceThroughTheEngine(t *testing.T) {
	repo := fixture()
	repo.perms[arnUser] = []ResourcePermission{
		perm("s3:*", "Allow", "*"), perm("kms:Decrypt", "Allow", "*"), perm("ec2:DescribeInstances", "Allow", "*"),
	}
	repo.trust = nil
	res := compute(t, repo)
	s3 := find(res, "*:s3", PathDirectAccess)
	if s3 == nil || s3.TargetType != "all_s3_resources" || s3.SecuritySignificance != "high" {
		t.Fatalf("all-S3 node: %+v", s3)
	}
	if kms := find(res, "*:kms", PathKMSAccess); kms == nil {
		t.Error("a wildcard KMS grant must be PATH-006")
	}
	if ec2 := find(res, "*:ec2", PathDirectAccess); ec2 == nil || ec2.SecuritySignificance == "high" {
		t.Errorf("describe-only EC2 must not be high: %+v", ec2)
	}
	if nameFromARN("*:s3") != "all s3 resources" {
		t.Errorf("name = %q", nameFromARN("*:s3"))
	}
	if resourceSensitivity("*:kms") != 1.0 || resourceSensitivity("*:s3") != 0.6 || resourceSensitivity("*:ec2") != 0.4 {
		t.Error("sensitivity of service wildcard targets")
	}
}
