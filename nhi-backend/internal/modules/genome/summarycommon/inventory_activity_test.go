package summarycommon

import (
	"testing"

	"nhi-backend-api/internal/identitygraph"
)

// The inventory's Activity tab must look an identity up in log_events under
// exactly the key its Genome page uses (the same normaliser, the same
// EventName), or the two screens would count different calls.
func TestInventoryKeyIsTheGenomeKey(t *testing.T) {
	a := &InventoryActivity{}
	cases := []struct {
		name    string
		in      identitygraph.MonitoredIdentity
		wantSrc string
		wantKey string
	}{
		{"lambda version folds to the function",
			identitygraph.MonitoredIdentity{ARN: "arn:aws:lambda:ap-south-1:111111111111:function:billing:7", IdentityType: "lambda_function", AccountID: "111111111111", Region: "ap-south-1"},
			"LAMBDA", "arn:aws:lambda:ap-south-1:111111111111:function:billing"},
		{"ecs task is keyed by its task role",
			identitygraph.MonitoredIdentity{ARN: "arn:aws:ecs:ap-south-1:111111111111:task-definition/web:3", IdentityType: "ecs_task", AccountID: "111111111111", Region: "ap-south-1",
				TypeAttributes: []byte(`{"task_role_arn":"arn:aws:iam::111111111111:role/web-task"}`)},
			"ECS", "arn:aws:iam::111111111111:role/web-task"},
	}
	for _, tc := range cases {
		key, ok := a.KeyFor(tc.in)
		if !ok {
			t.Fatalf("%s: not monitored", tc.name)
		}
		m, _ := NormalizeDiscoveryRow(DiscoveryIdentityRow{ARN: tc.in.ARN, IdentityType: tc.in.IdentityType, AccountID: tc.in.AccountID, Region: tc.in.Region, TypeAttributes: tc.in.TypeAttributes})
		if key.SourceType != m.Key.SourceType || key.EventName != m.EventName() {
			t.Fatalf("%s: tab key %v differs from the Genome key %s/%s", tc.name, key, m.Key.SourceType, m.EventName())
		}
		if key.SourceType != tc.wantSrc || key.EventName != tc.wantKey {
			t.Fatalf("%s: got %v, want %s/%s", tc.name, key, tc.wantSrc, tc.wantKey)
		}
	}
	if _, ok := a.KeyFor(identitygraph.MonitoredIdentity{ARN: "arn:aws:iam::111111111111:user/alice", IdentityType: "iam_user"}); ok {
		t.Fatal("an IAM user is not a monitored workload")
	}
}
