package getaccount

// GET /remediation/accounts/{account_id} (every role)
//
// The remediation settings of one AWS account. An account without settings
// answers with the defaults (remediation disabled, access_status UNKNOWN), so
// the settings page can always render. The answer is { "data": domain.Account }.
