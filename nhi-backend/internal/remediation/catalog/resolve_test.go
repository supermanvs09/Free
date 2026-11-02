package catalog

import (
	"encoding/json"
	"reflect"
	"testing"

	"nhi-backend-api/internal/remediation/domain"
)

func ruleTemplate(t *testing.T, rule, action string) json.RawMessage {
	t.Helper()
	for _, r := range RuleActions() {
		if r.RuleID == rule && r.ActionType == action {
			return r.ParamsTemplate
		}
	}
	t.Fatalf("no mapping %s -> %s", rule, action)
	return nil
}

func TestResolveKeyListBecomesCandidates(t *testing.T) {
	f := domain.Finding{RuleID: "M09", IdentityName: "ci-user",
		Evidence: json.RawMessage(`{"keys":["AKIAAAAAAAAAAAAAAAA1@sa-east-1","AKIAAAAAAAAAAAAAAAA2@us-east-1"]}`)}
	p := Resolve(ruleTemplate(t, "M09", DeactivateKey), f, nil)
	if got := p["user_name"]; got != "ci-user" {
		t.Fatalf("user_name from the identity: got %v", got)
	}
	want := []any{"AKIAAAAAAAAAAAAAAAA1", "AKIAAAAAAAAAAAAAAAA2"}
	if !reflect.DeepEqual(p["access_key_candidates"], want) {
		t.Fatalf("candidates without @region: got %v", p["access_key_candidates"])
	}
	if p["access_key_id"] != "AKIAAAAAAAAAAAAAAAA1, AKIAAAAAAAAAAAAAAAA2" {
		t.Fatalf("readable access_key_id: got %v", p["access_key_id"])
	}
}

func TestResolveSingleKeyStaysSingle(t *testing.T) {
	f := domain.Finding{RuleID: "IAM-02", Evidence: json.RawMessage(`{"user_name":"alice","access_key_id":"AKIAAAAAAAAAAAAAAAA9"}`)}
	p := Resolve(ruleTemplate(t, "IAM-02", DeactivateKey), f, nil)
	if p["user_name"] != "alice" || p["access_key_id"] != "AKIAAAAAAAAAAAAAAAA9" || p["access_key_candidates"] != nil {
		t.Fatalf("unexpected params %v", p)
	}
}

func TestResolveFirstListElement(t *testing.T) {
	f := domain.Finding{RuleID: "KMS-02", CredentialARN: "arn:aws:kms:us-east-1:111122223333:key/k1",
		Evidence: json.RawMessage(`{"key":"arn:aws:kms:us-east-1:111122223333:key/k1","external_accounts":["999988887777","555566667777"]}`)}
	p := Resolve(ruleTemplate(t, "KMS-02", RevokeGrant), f, nil)
	if p["grantee_principal"] != "999988887777" {
		t.Fatalf("grantee_principal from external_accounts[0]: got %v", p["grantee_principal"])
	}
}

func TestRemovedMappings(t *testing.T) {
	for _, r := range RuleActions() {
		switch r.RuleID {
		case "ECS-04", "ACM-02", "IAM-29", "M02", "M03", "S-C01":
			t.Fatalf("rule %s must not be mapped (action %s)", r.RuleID, r.ActionType)
		}
	}
}
