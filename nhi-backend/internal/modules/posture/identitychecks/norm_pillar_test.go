package identitychecks

import "testing"

func TestNormPillar(t *testing.T) {
	for in, want := range map[string]string{
		"least_privilege": "least_privilege", "Least Privilege": "least_privilege", "LEAST-PRIVILEGE": "least_privilege",
		" credential__hygiene ": "credential_hygiene", "": "",
	} {
		if got := normPillar(in); got != want {
			t.Errorf("normPillar(%q) = %q, want %q", in, got, want)
		}
	}
}
