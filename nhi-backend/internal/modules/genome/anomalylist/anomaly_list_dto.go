package anomalylist

import (
	"time"

	"nhi-backend-api/internal/modules/genome/common"
)

// Response is the data block returned by GET /api/v1/genome/anomalies.
type Response struct {
	Items []Item `json:"items"`

	Page       int `json:"page"`
	Limit      int `json:"limit"`
	PageCount  int `json:"page_count"`
	TotalCount int `json:"total_count"`

	SeverityCounts SeverityCounts `json:"severity_counts"`
}

// SeverityCounts is the severity distribution across the complete filtered
// result, not only the current page.
type SeverityCounts struct {
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Pending  int `json:"pending"`
	Unknown  int `json:"unknown"`
}

// Item is one anomaly list row. Existing item fields are unchanged.
type Item struct {
	ID      int64  `json:"id"`
	EventID string `json:"event_id"`

	Identity common.AnomalyIdentityRef `json:"identity"`

	WhatChanged string `json:"what_changed"`
	Dimension   string `json:"dimension"`

	Severity *string `json:"severity"`

	State      string    `json:"state"`
	DetectedAt time.Time `json:"detected_at"`
	Region     *string   `json:"region"`
}
