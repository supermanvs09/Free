package identitylist

import "time"

// Response is the data block returned by the fleet endpoint.
type Response struct {
	// ActivityKnown is true when last_seen could be read from the events
	// store: a null last_seen then means the identity never made a call.
	// False: last_seen is unknown for every item (the console must not read
	// it as "no activity").
	ActivityKnown bool   `json:"activity_known"`
	Items         []Item `json:"items"`
}

// Item is one row of the pipeline's baselines table — one baselined
// monitoring identity — together with the discovery identities it belongs to.
//
// source_type / identity_name are the baseline's own key exactly as the
// pipeline stores it. The descriptive fields (display_name, role_arn,
// inventory_id, ...) come from the primary mapped discovery identity, the
// first entry of discovery_identities, and its credential; they are null
// when the baseline could not be mapped (mapping.status = "unmapped").
//
// The other genome identity endpoints (/drift, /genome, /activity, ...)
// address identities by their discovery key: use links, or a
// discovery_identities entry's genome_key, to open one.
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

	// Mapping says which discovery identities this baseline belongs to.
	Mapping Mapping `json:"mapping"`
	// DiscoveryIdentities are the mapped discovery identities, primary first
	// (at most MaxDiscoveryPerItem; mapping.discovery_count is the total).
	DiscoveryIdentities []DiscoveryIdentity `json:"discovery_identities"`
	// Credential is the primary discovery identity's credential.
	Credential *Credential `json:"credential"`
	Links      Links       `json:"links"`
}

// BaselineSummary is the item's baselines row.
type BaselineSummary struct {
	Status        *string    `json:"status"`
	BuiltDays     *int       `json:"built_days"`
	RequiredDays  *int       `json:"required_days"`
	DaysRemaining *int       `json:"days_remaining"`
	FirstSeenDate *string    `json:"first_seen_date"` // YYYY-MM-DD
	ActiveSince   *time.Time `json:"active_since"`
	UpdatedAt     *time.Time `json:"updated_at"`
}

type RiskSnapshot struct {
	Score    *int    `json:"score"`
	Severity *string `json:"severity"`
	Status   *string `json:"status"`
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
	MatchedBy      *string `json:"matched_by"`
	DiscoveryCount int     `json:"discovery_count"`
}

// MaxDiscoveryPerItem caps discovery_identities (a shared EC2 or ECS
// workload profile can belong to many instances or tasks).
const MaxDiscoveryPerItem = 25

// DiscoveryIdentity is one discovery identity a baseline belongs to: the
// identities row, the credential (IAM role) the baseline is for, and the
// key the other genome endpoints address it by.
type DiscoveryIdentity struct {
	// identities row.
	InventoryID     string     `json:"inventory_id"` // identities.id
	ARN             string     `json:"arn"`
	Name            *string    `json:"name"`
	IdentityType    string     `json:"identity_type"`
	NHIIdentityType *string    `json:"nhi_identity_type"`
	AccountID       string     `json:"account_id"`
	Region          *string    `json:"region"`
	Status          *string    `json:"status"`
	LastSeenAt      *time.Time `json:"last_seen_at"`

	// Credential the baseline is for; null when none is known.
	Credential *Credential `json:"credential"`

	// GenomeKey is the (source_type, identity_name) of this identity on the
	// other genome endpoints; null when the backend fleet has no principal
	// for this identity and role.
	GenomeKey *GenomeKey `json:"genome_key"`
}

// Credential is the IAM credential a baseline is for: its credentials row
// (null fields when the scanner has none) and how it is bound.
type Credential struct {
	CredentialID   *string    `json:"credential_id"` // credentials.id
	ARN            string     `json:"arn"`
	Name           *string    `json:"name"`
	CredentialType *string    `json:"credential_type"`
	Status         *string    `json:"status"`
	PrivilegeLevel *string    `json:"privilege_level"`
	LastUsedAt     *time.Time `json:"last_used_at"`
	// From identity_credentials, or from type_attributes when the scanner
	// wrote no binding row (binding_source "type_attributes").
	BindingType   *string `json:"binding_type"`
	BindingSource *string `json:"binding_source"`
	IsPrimary     *bool   `json:"is_primary"`
}

// GenomeKey addresses an identity on the genome identity endpoints.
type GenomeKey struct {
	SourceType   string `json:"source_type"`
	IdentityName string `json:"identity_name"`
}

// Links are the item's genome pages. Baseline is always set (it uses the
// baselines row's own key); the others need the primary identity's
// genome_key and are null without one.
type Links struct {
	Baseline string  `json:"baseline"`
	Activity *string `json:"activity"`
	Genome   *string `json:"genome"`
	Timeline *string `json:"timeline"`
}
