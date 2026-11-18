package clickhouse

import (
	"strings"
	"testing"
)

func TestIdentityEquals(t *testing.T) {
	flat := func(s string) string { return strings.Join(strings.Fields(s), " ") }
	if got := flat(IdentityEquals("LAMBDA")); got != `( workload_key = {identity_name:String} OR identity_name = {identity_name:String} )` {
		t.Fatalf("non-ECS matches workload_key or identity_name, got %q", got)
	}
	if got := flat(IdentityEquals(" ec2 ")); !strings.Contains(got, "instance_arn = {identity_name:String}") {
		t.Fatalf("EC2 must match the instance ARN, got %q", got)
	}
	for _, st := range []string{"ECS", "ecs", " ECS "} {
		got := IdentityEquals(st)
		if !strings.Contains(got, "roleArn") || !strings.Contains(got, "OR identity_name = {identity_name:String}") {
			t.Fatalf("ECS must read roleArn, got %q", got)
		}
	}
	if !strings.Contains(EventIdentity, "source_type = 'ECS'") {
		t.Fatal("EventIdentity must branch on ECS")
	}
}
