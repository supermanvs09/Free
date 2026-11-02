package submitplan

// POST /remediation/plans/{id}/submit (analyst / admin)
//
// Asks the approvers to approve a READY One-click plan; the plan becomes
// PENDING_APPROVAL and the approval request e-mail is queued. The body is
// optional and has no fields.

// SubmitPlanRequest is the (empty) body.
type SubmitPlanRequest struct{}
