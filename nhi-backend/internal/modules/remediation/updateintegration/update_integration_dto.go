package updateintegration

import "encoding/json"

// PUT /remediation/integrations/{type} (admin), type = jira | ses
//
// Stores the tenant's own settings. {"config":{"from_env":true}} goes back to
// the platform defaults from the environment (JIRA_* / EMAIL_* / SES_REGION).

// UpdateIntegrationRequest is the body.
type UpdateIntegrationRequest struct {
	Enabled   bool            `json:"enabled"`
	Config    json.RawMessage `json:"config"`
	SecretRef string          `json:"secret_ref"` // env:NAME, file:/path or aws-sm:id — never the secret itself
}

// integrationTypes are the accepted {type} values (case-insensitive).
var integrationTypes = map[string]bool{"JIRA": true, "SES": true}
