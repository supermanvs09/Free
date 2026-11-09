package identitytimeline

import (
	"time"
)

// Response shapes of
// GET /api/v1/identities/{source_type}/{identity_name}/timeline
// (backend_api_contract.md §5.6 / §10.3 "timeline[]") in the §1.5 envelope.
//
// The timeline is derived from the current tables (there is no immutable
// event-history table — contract §5.6 SCHEMA GAP): alerts,
// baseline_versions and baselines.

// Timeline item types (API constants chosen by source table, §10.3).
const (
	TimelineTypeAnomalyDimension = "anomaly_dimension"

	TimelineTypeBaselineVersionPublished = "baseline_version_published"

	TimelineTypeLearningStarted = "learning_started"

	TimelineTypeBaselineEstablished = "baseline_established"
)

type IdentityTimelineResponse struct {
	Items []IdentityTimelineItem `json:"items"`
}

type IdentityTimelineItem struct {
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	OccurredAt  time.Time `json:"occurred_at"`
	Description *string   `json:"description,omitempty"`
	Status      *string   `json:"status,omitempty"`

	Dimension     *string `json:"dimension,omitempty"`
	Count         *int64  `json:"count,omitempty"`
	OpenCount     *int64  `json:"open_count,omitempty"`
	LatestAlertID *int64  `json:"latest_alert_id,omitempty"`

	Version *int64 `json:"version,omitempty"`
}
