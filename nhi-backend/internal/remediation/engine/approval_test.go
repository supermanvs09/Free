package engine

import (
	"testing"

	"nhi-backend-api/internal/remediation/domain"
)

// A risky fix always needs approval; a safe fix only for a Critical finding.
func TestApprovalRequired(t *testing.T) {
	safe := []string{"deactivate_key", "enable_key_rotation", "set_session_duration"}
	risky := []string{"rewrite_trust", "scope_policy", "replace_managed_policy", "remove_statement", "update_key_policy",
		"revoke_grant", "update_secret_policy", "rotate_secret", "rotate_access_key", "delete_key"}

	for _, a := range safe {
		for sev, want := range map[string]bool{"Low": false, "Medium": false, "High": false, "Critical": true, "critical": true, " CRITICAL ": true} {
			if got := ApprovalRequired(sev, a); got != want {
				t.Errorf("safe fix %s, severity %q: approval = %v, want %v", a, sev, got, want)
			}
		}
	}
	for _, a := range risky {
		for _, sev := range []string{"Low", "Medium", "High", "Critical"} {
			if !ApprovalRequired(sev, a) {
				t.Errorf("risky fix %s, severity %s: must need approval", a, sev)
			}
		}
	}
	if !ApprovalRequired("Low", "") || !ApprovalRequired("Low", "something_new") {
		t.Error("an unknown fix must need approval")
	}
}

func TestFindingTargetARN(t *testing.T) {
	cases := map[string]domain.Finding{
		"arn:aws:iam::1:role/web": {Evidence: []byte(`{"target_arn":"arn:aws:iam::1:role/web"}`)},
		"arn:aws:iam::1:role/r":   {Evidence: []byte(`{"role_arn":" arn:aws:iam::1:role/r "}`)},
		"arn:aws:iam::1:role/id":  {Evidence: []byte(`{}`), IdentityName: "arn:aws:iam::1:role/id"},
		"":                        {Evidence: []byte(`{"target_arn":"web-1"}`), IdentityName: "web-1"},
	}
	for want, f := range cases {
		if got := findingTargetARN(f); got != want {
			t.Errorf("findingTargetARN = %q, want %q", got, want)
		}
	}
}

func TestTargetVars(t *testing.T) {
	v := targetVars(map[string]string{}, "arn:aws:iam::1:role/path/vendor-role")
	if v["role_name"] != "vendor-role" || v["role_arn"] != "arn:aws:iam::1:role/path/vendor-role" {
		t.Fatal(v)
	}
	if v := targetVars(map[string]string{"role_name": "kept"}, "arn:aws:iam::1:role/x"); v["role_name"] != "kept" {
		t.Fatal("overwrote the provider's value")
	}
}
