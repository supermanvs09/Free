package createbatch

import (
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

// POST /remediation/batches (analyst / admin)
//
// One plan per item. INDEPENDENT (default): a failing plan does not affect
// the others. ALL_OR_NOTHING: every plan must be approved before any starts,
// and a failure rolls back the plans already applied.

// CreateBatchRequest is the body.
type CreateBatchRequest struct {
	Mode  string      `json:"mode"`
	Items []BatchItem `json:"items"`
}

// BatchItem is one plan of the batch (the body of POST /plans).
type BatchItem struct {
	FindingIDs []string       `json:"finding_ids"`
	ActionType string         `json:"action_type"`
	Params     map[string]any `json:"params"`
	Mode       string         `json:"mode"`
}

// CreateBatchResponse is the 201 body: the batch with its plans, and the
// items that could not be planned.
type CreateBatchResponse struct {
	Data   *domain.Batch      `json:"data"`
	Errors []engine.ItemError `json:"errors,omitempty"`
}

const (
	maxItems    = 100
	maxFindings = 100
)
