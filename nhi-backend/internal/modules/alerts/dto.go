package alerts

import (
	"encoding/json"
	"time"
)

// ScoreDrop is one identity whose posture score fell at the latest sync.
type ScoreDrop struct {
	IdentityID     string    `json:"identity_id"`
	IdentityName   string    `json:"identity_name"`
	IdentityType   string    `json:"identity_type"`
	IdentityARN    string    `json:"identity_arn"`
	AccountID      string    `json:"account_id"`
	ScoreBefore    int       `json:"score_before"`
	ScoreNow       int       `json:"score_now"`
	Delta          int       `json:"delta"`
	BandBefore     string    `json:"band_before"`
	BandNow        string    `json:"band_now"`
	Grade          string    `json:"grade"`
	BeforeAt       time.Time `json:"before_at"`
	DetectedAt     time.Time `json:"detected_at"`
	TopReason      string    `json:"top_reason"`
	TopSeverity    string    `json:"top_severity"`
	TopPoints      int       `json:"top_points"`
	NewFailing     int       `json:"new_failing_checks"`
	FailedCritical int       `json:"failed_critical"`
	FailedHigh     int       `json:"failed_high"`
}

// Exposure is a credential found in code (credential exposure main list).
type Exposure struct {
	FindingID          string `json:"finding_id"`
	Detector           string `json:"detector"`
	Severity           string `json:"severity"`
	RiskTier           string `json:"risk_tier"`
	VerificationStatus string `json:"verification_status"`
	Platform           string `json:"platform"`
	Repository         string `json:"repository"`
	FilePath           string `json:"file_path"`
	LineNumber         int    `json:"line_number"`
	Author             string `json:"author"`
	Redacted           string `json:"redacted"`
	DetectedAt         string `json:"detected_at"`
	New                bool   `json:"new"`
}

// Summary is the header of the page and the navigation badge.
type Summary struct {
	ScoreDrops   int        `json:"score_drops"`
	Exposures    int        `json:"exposures"`
	NewExposures int        `json:"new_exposures"`
	Badge        int        `json:"badge"`
	LastSync     *time.Time `json:"last_sync"`
	PreviousSync *time.Time `json:"previous_sync"`
	// ExposureAvailable is false when credential exposure cannot be read
	// (not enabled or not provisioned for this workspace).
	ExposureAvailable bool `json:"exposure_available"`
}

type ListResponse struct {
	Summary    Summary     `json:"summary"`
	ScoreDrops []ScoreDrop `json:"score_drops"`
	Exposures  []Exposure  `json:"exposures"`
}

type ScorePoint struct {
	At    time.Time `json:"at"`
	Score int       `json:"score"`
}

type CheckChange struct {
	RuleID       string     `json:"rule_id"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Severity     string     `json:"severity"`
	Points       int        `json:"points"`
	Detail       string     `json:"detail"`
	FailingSince *time.Time `json:"failing_since"`
	Pillar       string     `json:"pillar"`
	Category     string     `json:"category"`
	FindingID    string     `json:"finding_id,omitempty"`
}

type FindingChange struct {
	FindingID       string          `json:"finding_id"`
	RuleID          string          `json:"rule_id"`
	Title           string          `json:"title"`
	Severity        string          `json:"severity"`
	RiskExplanation string          `json:"risk_explanation"`
	Remediation     string          `json:"remediation"`
	Evidence        json.RawMessage `json:"evidence,omitempty"`
	FirstSeen       time.Time       `json:"first_seen"`
	CredentialARN   string          `json:"credential_arn"`
}

type InventoryChange struct {
	ChangeType string          `json:"change_type"`
	EntityType string          `json:"entity_type"`
	EntityARN  string          `json:"entity_arn"`
	Summary    string          `json:"summary"`
	Details    json.RawMessage `json:"details,omitempty"`
	DetectedAt time.Time       `json:"detected_at"`
}

// IdentityAlert explains one identity's score drop.
type IdentityAlert struct {
	IdentityID      string            `json:"identity_id"`
	DiscoveryID     string            `json:"discovery_id,omitempty"`
	IdentityName    string            `json:"identity_name"`
	IdentityType    string            `json:"identity_type"`
	IdentityARN     string            `json:"identity_arn"`
	AccountID       string            `json:"account_id"`
	AccountName     string            `json:"account_name"`
	Region          string            `json:"region"`
	CredentialARN   string            `json:"credential_arn"`
	ScoreNow        int               `json:"score_now"`
	ScoreBefore     *int              `json:"score_before"`
	BandNow         string            `json:"band_now"`
	BandBefore      string            `json:"band_before"`
	Grade           string            `json:"grade"`
	BeforeAt        *time.Time        `json:"before_at"`
	DetectedAt      time.Time         `json:"detected_at"`
	ChecksFailed    int               `json:"checks_failed"`
	ChecksEvaluated int               `json:"checks_evaluated"`
	PointsLost      int               `json:"points_lost"`
	WhyThisScore    string            `json:"why_this_score"`
	WeakestPillar   string            `json:"weakest_pillar"`
	PillarScores    json.RawMessage   `json:"pillar_scores,omitempty"`
	Timeline        []ScorePoint      `json:"timeline"`
	NewFailing      []CheckChange     `json:"new_failing_checks"`
	StillFailing    []CheckChange     `json:"still_failing_checks"`
	NewFindings     []FindingChange   `json:"new_findings"`
	Changes         []InventoryChange `json:"inventory_changes"`
}
