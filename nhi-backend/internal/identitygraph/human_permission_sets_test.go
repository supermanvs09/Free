package identitygraph

import "testing"

func TestHpParseAllowedActions(t *testing.T) {
	doc := `{"Statement":[{"Effect":"Allow","Action":["ec2:Describe*","s3:GetObject"],"Resource":["a","b"]},
		{"Effect":"Deny","Action":"*","Resource":"*"},{"Effect":"allow","Action":"*"}]}`
	got := hpParseAllowedActions(doc)
	if len(got) != 5 {
		t.Fatalf("want 5 actions (2x2 + *), got %d: %+v", len(got), got)
	}
	if got[4].service != "*" || got[4].action != "*" || got[4].resource != "" {
		t.Fatalf("bare * parsed wrong: %+v", got[4])
	}
	if one := hpParseAllowedActions(`{"Statement":{"Effect":"Allow","Action":"iam:PassRole","Resource":"r"}}`); len(one) != 1 || one[0].action != "PassRole" {
		t.Fatalf("single statement parsed wrong: %+v", one)
	}
	if hpParseAllowedActions("not json") != nil || hpParseAllowedActions("") != nil {
		t.Fatal("bad documents must give nothing")
	}
}

func TestApplyPermissionSetUsageFilter(t *testing.T) {
	yes, no := true, false
	sets := []HumanPermissionSet{
		{Name: "a", UsageAvailable: true, Actions: []HumanPermissionAction{{Action: "x", Used90d: &yes}, {Action: "y", Used90d: &no}}},
		{Name: "sso", UsageAvailable: false, Actions: []HumanPermissionAction{{Action: "z"}}},
	}
	if len(ApplyPermissionSetUsageFilter(sets, "all")) != 2 || len(ApplyPermissionSetUsageFilter(sets, "")) != 2 {
		t.Fatal("all must keep every set")
	}
	used := ApplyPermissionSetUsageFilter(sets, "used")
	if len(used) != 1 || len(used[0].Actions) != 1 || used[0].Actions[0].Action != "x" {
		t.Fatalf("used wrong: %+v", used)
	}
	unused := ApplyPermissionSetUsageFilter(sets, "unused")
	if len(unused) != 1 || unused[0].Actions[0].Action != "y" {
		t.Fatalf("unused wrong: %+v", unused)
	}
	if len(sets[0].Actions) != 2 {
		t.Fatal("filter must not change the input")
	}
}
