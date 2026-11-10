package listaccounts

// GET /remediation/accounts (every role)
//
// The remediation settings of every onboarded AWS account of the tenant
// (the remediation_* columns of accounts). The ExternalId is never returned here.
// The answer is { "data": [domain.Account] }.
