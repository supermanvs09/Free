package engine

import "testing"

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
