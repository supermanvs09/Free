package executebatch

// POST /remediation/batches/{id}/execute (analyst / admin)
//
// Queues the approved plans of the batch. In an ALL_OR_NOTHING batch every
// plan must be approved and all start at the same time. The 202 answer is
// { "data": { "queued": [...], "skipped": [...] } }.

// ExecuteBatchRequest is the (empty) body.
type ExecuteBatchRequest struct{}
