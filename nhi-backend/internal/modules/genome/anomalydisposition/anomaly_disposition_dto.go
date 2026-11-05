// Package anomalydisposition serves
// POST /api/v1/genome/anomalies/{alert_id}/disposition: an analyst closes a
// departure from baseline (resolved / dismissed) or opens it again. It sets
// alerts.status - the field every "open departures" count and the Open / All
// switch read - so a closed departure leaves the open lists at once.
package anomalydisposition

import "time"

// Request is the body.
type Request struct {
	Disposition string  `json:"disposition"` // resolved | dismissed | open
	Reason      *string `json:"reason"`
}

// Response is the data block.
type Response struct {
	AlertID   int64     `json:"alert_id"`
	State     string    `json:"state"`
	ChangedBy string    `json:"changed_by"`
	ChangedAt time.Time `json:"changed_at"`
}

// Dispositions a caller may set.
const (
	Resolved  = "resolved"
	Dismissed = "dismissed"
	Reopened  = "open"
)
