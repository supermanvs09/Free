package approveplan

// POST /remediation/plans/{id}/approve (approver / admin)
//
// The approval is bound to the plan hash. The requester cannot approve their
// own plan; once the required number of distinct approvers is reached the
// plan becomes APPROVED.

// ApprovePlanRequest is the optional body.
type ApprovePlanRequest struct {
	Comment string `json:"comment"`
}

// maxCommentLen bounds the comment.
const maxCommentLen = 2000
