package identitycontainment

import (
	"encoding/json"
	"strings"
	"testing"
)

// An observed API operation (service.amazonaws.com:Operation) becomes a deny
// on the IAM action, even without ClickHouse evidence.
func TestOperationPolicyFromObservedValue(t *testing.T) {
	a := AlertRow{ID: 1, Dimension: "api_operation", ObservedValue: json.RawMessage(`{"api_operation":"iam.amazonaws.com:CreateAccessKey"}`)}
	_, doc, err := generateOperationPolicy(a, EventEvidence{}, "t", "w", EnforcementDirect)
	if err != nil {
		t.Fatalf("policy: %v", err)
	}
	b, _ := json.Marshal(doc)
	if !strings.Contains(string(b), `"iam:CreateAccessKey"`) || !strings.Contains(string(b), `"Effect":"Deny"`) {
		t.Fatalf("policy = %s", b)
	}
}

// An alert with nothing to act on is not an error for the page.
func TestOperationPolicyWithoutEvidence(t *testing.T) {
	a := AlertRow{ID: 2, Dimension: "api_operation", ObservedValue: json.RawMessage(`{}`)}
	if _, _, err := generateOperationPolicy(a, EventEvidence{}, "t", "w", EnforcementDirect); err == nil {
		t.Fatalf("an empty observed value has nothing to deny: %v", err)
	}
}
