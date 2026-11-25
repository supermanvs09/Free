package identitylist

import "time"

// Response is the data block returned by the fleet endpoint.
type Response struct {
	Items []Item `json:"items"`
}

// Item is one row of the pipeline's baselines table — one baselined
// monitoring identity — with the discovery identity it belongs to.
//
// identity_name is the baseline key exactly as the pipeline stores it
// (baselines.identity_name, which is log_events.workload_key). Every genome
// identity endpoint (/activity, /genome, /timeline, /baseline and the
// identity summary) accepts it, so links are always set. An ECS task role and
// execution role are separate items with separate keys.
type Item struct {
	ID                string  `json:"id"`
	SourceType        string  `json:"source_type"`
	IdentityName      string  `json:"identity_name"`
	EventIdentityName *string `json:"event_identity_name"`
	DisplayName       string  `json:"display_name"`
	NHIIdentityType   *string `json:"nhi_identity_type"`
	AccountID         string  `json:"account_id"`
	Region            *string `json:"region"`

	// The IAM role the baseline is for and how the workload uses it
	// (task | execution | ... for ECS).
	RoleARN     *string `json:"role_arn"`
	RoleKind    *string `json:"role_kind"`
	ServiceName *string `json:"service_name"`

	Baseline BaselineSummary `json:"baseline"`
	Risk     RiskSnapshot    `json:"risk"`

	LastSeen         *time.Time `json:"last_seen"`
	OpenAnomalyCount *int       `json:"open_anomaly_count"`

	// ECS-only inventory values. They are omitted when ECS task mapping fails
	// and for every non-ECS identity.
	InventoryID  *string `json:"inventory_id,omitempty"`
	ResourceARN  *string `json:"resource_arn,omitempty"`
	PrincipalARN *string `json:"principal_arn,omitempty"`
	BindingType  *string `json:"binding_type,omitempty"`

	// Parent is the discovery identity (inventory resource) the baseline
	// belongs to; null when the baseline could not be mapped.
	Parent  *Parent `json:"parent,omitempty"`
	Mapping Mapping `json:"mapping"`
	Links   Links   `json:"links"`
}

// BaselineSummary is the item's baselines row.
type BaselineSummary struct {
	Status        *string    `json:"status"`
	BuiltDays     *int       `json:"built_days"`
	RequiredDays  *int       `json:"required_days"`
	DaysRemaining *int       `json:"days_remaining"`
	ActiveSince   *time.Time `json:"active_since"`
}

type RiskSnapshot struct {
	Score    *int    `json:"score"`
	Severity *string `json:"severity"`
}

// Parent is the primary mapped discovery identity (identities row).
type Parent struct {
	InventoryID  string  `json:"inventory_id"` // identities.id, for "open in inventory"
	ARN          string  `json:"arn"`
	Name         *string `json:"name"`
	IdentityType string  `json:"identity_type"`
	Status       *string `json:"status"`
}

// Mapping states of Mapping.Status.
const (
	MappingMapped   = "mapped"
	MappingUnmapped = "unmapped"
)

// Mapping describes how the baseline was linked to discovery.
type Mapping struct {
	Status string `json:"status"` // mapped | unmapped
	// MatchedBy: identity_key | workload_key | resource_arn |
	// pipeline_workload_key | ecs_task_role; null when unmapped.
	MatchedBy *string `json:"matched_by"`
	// DiscoveryCount is the number of discovery identities sharing the
	// baseline (a shared EC2 or ECS workload profile can belong to many).
	DiscoveryCount int `json:"discovery_count"`
}

// Links are the item's genome pages, all addressed by the baseline key.
type Links struct {
	Summary  string `json:"summary"`
	Baseline string `json:"baseline"`
	Activity string `json:"activity"`
	Genome   string `json:"genome"`
	Timeline string `json:"timeline"`
}
