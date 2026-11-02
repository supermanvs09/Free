package executioncredential

// GET /remediation/executions/{id}/credential (the user who started the
// execution, or an admin)
//
// The new access key of a rotate_access_key execution, shown once. It is kept
// only in memory for 10 minutes and never written to the database; a second
// read answers 410 Gone. The answer is { "data": { "access_key_id", ... } }.

// Credential is the one-time key material.
type Credential map[string]string
