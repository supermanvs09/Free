package rejectplan

// POST /remediation/plans/{id}/reject (approver / admin)
//
// One rejection ends the plan (REJECTED); the requester cannot reject their
// own plan.

// RejectPlanRequest is the optional body; the comment becomes the status reason.
type RejectPlanRequest struct {
	Comment string `json:"comment"`
}

// maxCommentLen bounds the comment.
const maxCommentLen = 2000
