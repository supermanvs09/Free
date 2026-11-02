package confirmexternal

// POST /remediation/plans/{id}/confirm-external (analyst / admin)
//
// Records that the vendor configured the generated ExternalId, which releases
// a WAITING_EXTERNAL trust-policy plan (it becomes READY, or DRAFT when a
// pre-check blocks it). The body is optional and has no fields.

// ConfirmExternalRequest is the (empty) body.
type ConfirmExternalRequest struct{}
