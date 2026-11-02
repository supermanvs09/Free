package submitbatch

// POST /remediation/batches/{id}/submit (analyst / admin)
//
// Submits every READY plan of the batch for approval. The body is optional
// and has no fields; the answer is { "data": domain.Batch }.

// SubmitBatchRequest is the (empty) body.
type SubmitBatchRequest struct{}
