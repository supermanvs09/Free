package cancelplan

// POST /remediation/plans/{id}/cancel (analyst / admin)
//
// Stops a plan that has not been applied, also during the grace period
// (the queued execution is cancelled).

// CancelPlanRequest is the optional body; the reason becomes the status reason.
type CancelPlanRequest struct {
	Reason string `json:"reason"`
}

// maxReasonLen bounds the reason.
const maxReasonLen = 2000
