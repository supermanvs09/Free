package listaccounts

// GET /remediation/accounts (every role)
//
// The remediation settings of every AWS account of the tenant that has some
// (remediation_accounts). The ExternalId is never returned here.
// The answer is { "data": [domain.Account] }.
