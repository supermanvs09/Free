package markdone

// POST /remediation/plans/{id}/mark-done (analyst / admin)
//
// The Guided path: the analyst applied the change by hand. The plan becomes
// MANUALLY_DONE and RESOLVED once the next scan resolves its findings.

// MarkDoneRequest is the optional body.
type MarkDoneRequest struct {
	Note string `json:"note"`
}

// maxNoteLen bounds the note.
const maxNoteLen = 2000
