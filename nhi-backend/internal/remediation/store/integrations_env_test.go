package store

import (
	"encoding/json"
	"testing"

	"nhi-backend-api/internal/platform/config"
)

// EMAIL_FROM set: the .env default is an SES integration only (SES is the only mail service).
func TestEnvIntegrationsSES(t *testing.T) {
	t.Cleanup(func() { SetEnvIntegrations(config.RemediationIntegrationsConfig{}) })
	SetEnvIntegrations(config.RemediationIntegrationsConfig{Email: config.RemediationEmailEnv{
		From: "alerts@example.com", Approvers: []string{"approver@example.com"},
		Notify: []string{"team@example.com"}, SESRegion: "ap-south-1",
	}})
	if got := EnvIntegrationTypes(); len(got) != 1 || got[0] != "SES" {
		t.Fatalf("integration types %v, want [SES]", got)
	}
	e, ok := envFor("SES")
	if !ok {
		t.Fatal("no SES default")
	}
	var cfg struct {
		From      string   `json:"from"`
		Region    string   `json:"region"`
		Approvers []string `json:"approvers"`
		Notify    []string `json:"notify"`
		FromEnv   bool     `json:"from_env"`
	}
	if err := json.Unmarshal(e.Config, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.From != "alerts@example.com" || cfg.Region != "ap-south-1" || !cfg.FromEnv ||
		len(cfg.Approvers) != 1 || len(cfg.Notify) != 1 || e.SecretRef != "" {
		t.Fatalf("SES default: %+v secret=%q", cfg, e.SecretRef)
	}
	if _, ok := envFor("SMTP"); ok {
		t.Fatal("SMTP must not be configured")
	}
}
