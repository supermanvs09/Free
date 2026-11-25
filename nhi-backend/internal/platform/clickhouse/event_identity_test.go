package clickhouse

import (
	"strings"
	"testing"
)

func TestIdentityEquals(t *testing.T) {
	// ECS baselines are keyed by log_events.workload_key; every other family
	// by log_events.identity_name. There is no cross-column fallback.
	for _, st := range []string{"ECS", "ecs", " ECS "} {
		if got := IdentityEquals(st); got != `workload_key = {identity_name:String}` {
			t.Fatalf("ECS must compare workload_key only, got %q", got)
		}
	}
	for _, st := range []string{"LAMBDA", " ec2 ", "IAM", "GLUE"} {
		if got := IdentityEquals(st); got != `identity_name = {identity_name:String}` {
			t.Fatalf("%s must compare identity_name only, got %q", st, got)
		}
	}
	if !strings.Contains(EventIdentity, "source_type = 'ECS'") {
		t.Fatal("EventIdentity must branch on ECS")
	}
}
