// Package identitybaseline serves
// GET /api/v1/genome/identities/{source_type}/{identity_name}/baseline: the
// baseline provenance panel.
package identitybaseline

import (
	"encoding/json"
	"time"
)

// Response is the data block. Every baselines-backed field is null while
// the identity (and its workload key) has no baselines row.
type Response struct {
	Status        *string    `json:"status"`
	RequiredDays  *int       `json:"required_days"`
	BuiltDays     *int       `json:"built_days"`
	DaysRemaining *int       `json:"days_remaining"`
	FirstSeenDate *string    `json:"first_seen_date"`
	ActiveSince   *time.Time `json:"active_since"`
	UpdatedAt     *time.Time `json:"updated_at"`
	DataPoints    *int64     `json:"data_points"`

	ModelConfidencePercent   *float64 `json:"model_confidence_percent"`
	ModelConfidenceAvailable bool     `json:"model_confidence_available"`

	// Original profile_json from PostgreSQL.
	Profile json.RawMessage `json:"profile"`

	// Retained for backward compatibility.
	Dimensions []DimensionSummary `json:"dimensions"`

	// Original version profiles from PostgreSQL.
	Versions []Version `json:"versions"`
}

// DimensionSummary is retained for backward compatibility.
type DimensionSummary struct {
	Dimension  string `json:"dimension"`
	Ready      *bool  `json:"ready"`
	ValueCount *int   `json:"value_count"`
}

// Version is one baseline_versions row.
type Version struct {
	Version     int64           `json:"version"`
	PublishedAt time.Time       `json:"published_at"`
	Profile     json.RawMessage `json:"profile"`
}
