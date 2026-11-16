package identitygraph

import (
	"testing"

	"nhi-backend-api/internal/identitygraph/eventstore"
)

// An action the behaviour pipeline saw, with no dated call read, is used.
func TestUsageForUndatedUseIsUsed(t *testing.T) {
	used := []eventstore.UsedPermission{{Service: "ssm", Action: "UpdateInstanceInformation", UsageCount: 4432}}
	got, last, _ := usageFor("ssm", "UpdateInstanceInformation", used)
	if !got {
		t.Fatal("ssm:UpdateInstanceInformation was called 4,432 times: it is used")
	}
	if last != nil {
		t.Fatalf("no dated call was read, last must be unknown, got %v", last)
	}
	if got, _, _ := usageFor("ssm", "GetDocument", used); got {
		t.Fatal("an action nobody called must stay never used")
	}
}

// Actions seen only by the pipeline count toward the granted total, next to
// the CloudTrail ones, once each.
func TestUsedGrantedCountIncludesPipelineKey(t *testing.T) {
	sets := map[string][]eventstore.UsedAction{
		"arn:aws:iam::1:role/r": {{Service: "ssm", Action: "GetDocument"}},
		"monitored":             usedActionsOf([]eventstore.UsedPermission{{Service: "ssm", Action: "UpdateInstanceInformation"}, {Service: "ssm", Action: "GetDocument"}}),
	}
	granted := []GrantedAction{{Service: "ssm", Action: "GetDocument"}, {Service: "ssm", Action: "UpdateInstanceInformation"}, {Service: "ssm", Action: "ListAssociations"}}
	if n := UsedGrantedCount(sets, []string{"arn:aws:iam::1:role/r", "monitored"}, granted); n != 2 {
		t.Fatalf("used = %d, want 2 (GetDocument once, UpdateInstanceInformation)", n)
	}
}
