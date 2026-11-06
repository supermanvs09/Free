package listintegrations

// GET /remediation/integrations (admin)
//
// The Jira / SES settings of the tenant (remediation_integrations).
// Secrets are never stored: secret_ref points to env:, file: or aws-sm:.
// The answer is { "data": [domain.Integration] }.
