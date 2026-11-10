package config

import "testing"

// E-mail is Amazon SES only: EMAIL_FROM turns it on, credentials come from the AWS default chain.
func TestRemediationEmailSES(t *testing.T) {
	t.Setenv("REMEDIATION_ENABLED", "true")
	t.Setenv("EMAIL_FROM", "alerts@example.com")
	t.Setenv("SES_REGION", "us-east-1")
	t.Setenv("EMAIL_APPROVERS", "a@example.com, b@example.com")
	c, err := Remediation()
	if err != nil {
		t.Fatalf("ses with a sender: %v", err)
	}
	e := c.Integrations.Email
	if e.From != "alerts@example.com" || e.SESRegion != "us-east-1" || len(e.Approvers) != 2 || e.Approvers[1] != "b@example.com" {
		t.Fatalf("email settings: %+v", e)
	}
}

func TestRemediationDisabledIgnoresOtherKeys(t *testing.T) {
	t.Setenv("REMEDIATION_ENABLED", "false")
	t.Setenv("JIRA_ENABLED", "true") // no JIRA_BASE_URL / JIRA_PROJECT_KEY: invalid when enabled
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
