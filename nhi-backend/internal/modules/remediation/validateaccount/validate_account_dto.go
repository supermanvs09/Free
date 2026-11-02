package validateaccount

// POST /remediation/accounts/{account_id}/validate (admin)
//
// Assumes the account's remediation role and checks the planning reads; the
// result is stored as access_status (OK | CANNOT_ASSUME | MISSING_PERMISSIONS).
// The body is optional and has no fields; the answer is { "data": domain.Account }.

// ValidateAccountRequest is the (empty) body.
type ValidateAccountRequest struct{}
