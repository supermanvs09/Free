package identitylist

import "time"

// Response is the data block returned by the fleet endpoint.
type Response struct {
	Items []Item `json:"items"`
	// ActivityKnown is true when last_seen could be read from the events
	// store: a null last_seen then means the identity never made a call.
	// False: last_seen is unknown for every item (the console must not read
	// it as "no activity").
	ActivityKnown bool `json:"activity_known"`
}

// Item represents one monitored principal.
//
// For ECS, one discovery inventory row can produce two items:
//
//   - task-role principal
//   - execution-role principal
//
// Both items share InventoryID and ResourceARN, allowing Open in inventory
// to navigate to the same parent ECS inventory resource.
type Item struct {
	ID              string `json:"id"`
	SourceType      string `json:"source_type"`
	NHIIdentityType string `json:"nhi_identity_type"`
	IdentityName    string `json:"identity_name"`
	DisplayName     string `json:"display_name"`
	WorkloadKey     string `json:"workload_key"`

	Status      *string `json:"status"`
	AccountID   string  `json:"account_id"`
	Region      *string `json:"region"`
	ServiceName *string `json:"service_name"`

	// Credential-specific principal information.
	PrincipalARN *string `json:"principal_arn"`
	RoleKind     *string `json:"role_kind"`
	RoleType     *string `json:"role_type"`
	RoleARN      *string `json:"role_arn"`

	// Parent inventory resource information.
	InventoryID *string `json:"inventory_id"`
	ResourceARN *string `json:"resource_arn"`
	ClusterARN  *string `json:"cluster_arn"`

	Baseline BaselineSummary `json:"baseline"`
	Risk     RiskSnapshot    `json:"risk"`

	LastSeen         *time.Time `json:"last_seen"`
	OpenAnomalyCount *int       `json:"open_anomaly_count"`

	// The selection rule for provenance confidence remains unconfirmed.
	ProvenanceConfidence *float64 `json:"provenance_confidence"`
}

type BaselineSummary struct {
	Status       *string `json:"status"`
	BuiltDays    *int    `json:"built_days"`
	RequiredDays *int    `json:"required_days"`
}

type RiskSnapshot struct {
	Score    *int    `json:"score"`
	Severity *string `json:"severity"`
	Status   *string `json:"status"`
}
