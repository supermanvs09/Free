package config

import "testing"

func TestRemediationDisabledIgnoresOtherKeys(t *testing.T) {
	t.Setenv("REMEDIATION_ENABLED", "false")
	t.Setenv("EMAIL_PROVIDER", "smtp") // no SMTP_HOST / EMAIL_FROM: invalid when enabled
	t.Setenv("EXECUTION_LEASE", "soon")
	c, err := Remediation()
	if err != nil || c.Enabled {
		t.Fatalf("REMEDIATION_ENABLED=false: got enabled=%v err=%v, want disabled and no error", c.Enabled, err)
	}

	t.Setenv("REMEDIATION_ENABLED", "true")
	if _, err := Remediation(); err == nil {
		t.Fatal("REMEDIATION_ENABLED=true with invalid settings: got nil, want error")
	}

	t.Setenv("REMEDIATION_ENABLED", "maybe")
	if _, err := Remediation(); err == nil {
		t.Fatal("REMEDIATION_ENABLED=maybe: got nil, want error")
	}
}
