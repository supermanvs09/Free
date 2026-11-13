// Package correlation implements the NHI Blast Radius engine: a 4-phase BFS
// graph traversal that computes how far a non-human identity can reach in
// AWS, using pre-collected data from PostgreSQL and ClickHouse.
//
// The engine reads from 14 PG tables and 2 CH tables (all already populated
// by the collector), matches CloudTrail session_issuer_arn to credentials via
// the identity_credentials bridge, creates ACCESSED edges from observed
// events, and runs correlation rules defined in correlation_definitions.
//
// Results are stored in nhi_blast_radius (summary) and
// nhi_blast_radius_paths (per-path detail).
package correlation

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ── Scope ─────────────────────────────────────────────────────────────────────

type Scope struct {
	DB         *sql.DB
	Schema     string
	AccountIDs []string
	Regions    []string
}

func (s *Scope) Table(table string) string {
	return fmt.Sprintf(`%s.%s`, s.Schema, table)
}

// BuildScope creates a correlation Scope from a pgxpool, schema, and filters.
func BuildScope(db *sql.DB, schema string, accountIDs []string, regions []string) *Scope {
	// Non-nil so pq.Array sends '{}' (match all) rather than NULL (match nothing).
	if accountIDs == nil {
		accountIDs = []string{}
	}
	if regions == nil {
		regions = []string{}
	}
	return &Scope{DB: db, Schema: schema, AccountIDs: accountIDs, Regions: regions}
}

// ── Path types (PATH-001 to PATH-010) ────────────────────────────────────────

const (
	PathDirectAccess     = "PATH-001" // NHI directly accesses a resource
	PathRoleChain        = "PATH-002" // NHI accesses via role assumption chain
	PathCrossAccount     = "PATH-003" // NHI reaches another account
	PathWorkloadAccess   = "PATH-004" // NHI used by workload that accesses resource
	PathEscalation       = "PATH-005" // NHI can pass role to higher-privileged resource
	PathKMSAccess        = "PATH-006" // NHI can read encrypted data and decrypt
	PathSecretsAccess    = "PATH-007" // NHI's workload retrieved secrets
	PathObservedActivity = "PATH-008" // NHI actually performed API call (CloudTrail)
	PathHistorical       = "PATH-009" // NHI could access previously, policy changed
	PathMultiplePaths    = "PATH-010" // Same resource via multiple paths
)

// ── Evidence types and ranking ───────────────────────────────────────────────

const (
	EvidenceDerived    = "derived"    // rank 1 — computed/inferred
	EvidenceConfigured = "configured" // rank 2 — trust_policy, attached_policies
	EvidenceEffective  = "effective"  // rank 3 — resolved permissions
	EvidenceObserved   = "observed"   // rank 4 — CloudTrail/log_events
)

const (
	EvidenceRankDerived    = 1
	EvidenceRankConfigured = 2
	EvidenceRankEffective  = 3
	EvidenceRankObserved   = 4
)

// ── Edge types ───────────────────────────────────────────────────────────────

const (
	EdgeHasRole      = "HAS_ROLE"      // Workload has an NHI role
	EdgeAttachedTo   = "ATTACHED_TO"   // NHI has a policy attached
	EdgeHasBoundary  = "HAS_BOUNDARY"  // NHI has a permission boundary
	EdgeHasTrust     = "HAS_TRUST"     // NHI has a trust policy
	EdgeCanAssume    = "CAN_ASSUME"    // NHI can assume another NHI
	EdgeCanAccess    = "CAN_ACCESS"    // NHI can access a resource
	EdgeAccessed     = "ACCESSED"      // NHI actually accessed a resource
	EdgeCrossAccount = "CROSS_ACCOUNT" // NHI reaches another account
)

// ── Traversal config ─────────────────────────────────────────────────────────

type TraversalConfig struct {
	MaxHopsPhase1  int    // Direct: 1
	MaxHopsPhase2  int    // Chains: 5
	MaxHopsPhase3  int    // Cross-Account: 1
	MaxHopsPhase4  int    // Compute: 1
	CycleDetection bool   // true
	DedupStrategy  string // "keep_strongest"
	MaxPaths       int    // hard cap on emitted paths per credential
}

func DefaultTraversalConfig() TraversalConfig {
	return TraversalConfig{
		MaxHopsPhase1:  1,
		MaxHopsPhase2:  5,
		MaxHopsPhase3:  1,
		MaxHopsPhase4:  1,
		CycleDetection: true,
		DedupStrategy:  "keep_strongest",
		MaxPaths:       5000,
	}
}

// ── Blast Radius Path ─────────────────────────────────────────────────────────

// PathHop is one edge in a traversal path.
type PathHop struct {
	FromARN    string   `json:"from_arn"`
	ToARN      string   `json:"to_arn"`
	EdgeType   string   `json:"edge_type"`
	Evidence   string   `json:"evidence"`
	Table      string   `json:"table"`
	Conditions []string `json:"conditions,omitempty"`
	// Basis says how the hop was established (see Basis* constants), so a reader
	// can tell a trust-policy-resolved hop from a row in trust_edges.
	Basis string `json:"basis,omitempty"`
	// ObservedCount and LastObservedAt are set when CloudTrail shows the hop
	// actually happened.
	ObservedCount  uint64     `json:"observed_count,omitempty"`
	LastObservedAt *time.Time `json:"last_observed_at,omitempty"`
}

// BlastRadiusPath is a single path from source NHI to a target resource.
type BlastRadiusPath struct {
	SourceARN            string    `json:"source_arn"`
	TargetARN            string    `json:"target_arn"`
	TargetType           string    `json:"target_type"`
	TargetName           string    `json:"target_name"`
	PathType             string    `json:"path_type"`
	PathDescription      string    `json:"path_description"`
	Hops                 []PathHop `json:"hops"`
	EvidenceRank         int       `json:"evidence_rank"`
	Confidence           string    `json:"confidence"` // HIGH, MEDIUM, LOW
	SecuritySignificance string    `json:"security_significance"`
	Limitations          []string  `json:"limitations"`
	Phase                int       `json:"phase"`
	IsReverseAccess      bool      `json:"is_reverse_access"`
	CreatedAt            time.Time `json:"created_at"`
}

// BlastRadiusResult is the complete blast radius for one NHI.
type BlastRadiusResult struct {
	SourceARN            string            `json:"source_arn"`
	SourceName           string            `json:"source_name"`
	SourceType           string            `json:"source_type"`
	TotalPaths           int               `json:"total_paths"`
	TotalResources       int               `json:"total_resources"`
	DirectPaths          int               `json:"direct_paths"`
	ChainPaths           int               `json:"chain_paths"`
	CrossAccountPaths    int               `json:"cross_account_paths"`
	ComputePaths         int               `json:"compute_paths"`
	SecretsAccessFound   int               `json:"secrets_access_found"`
	ConvergingPathsFound int               `json:"converging_paths_found"`
	ComputedAt           time.Time         `json:"computed_at"`
	Paths                []BlastRadiusPath `json:"paths"`

	// Derived from Paths by DeriveSummary.
	BlastRadiusScore    float64             `json:"blast_radius_score"`
	RiskLevel           string              `json:"risk_level"`
	ReachableResources  []ReachableResource `json:"reachable_resources"`
	ReachableIdentities []ReachableIdentity `json:"reachable_identities"`
	ReachByService      []ServiceReach      `json:"reach_by_service"`
	SecretsAccess       bool                `json:"secrets_access"`
	ConvergingPaths     bool                `json:"converging_paths"`

	// Added after the derived fields, for fresh and cached results alike.
	PrivilegeLevel int           `json:"privilege_level"` // 0 to 10, the source's own level
	DataAsOf       DataFreshness `json:"data_as_of"`

	// FromCache is true when this answer was stored earlier instead of computed
	// now; computed_at then says when. Add ?refresh=true to recompute.
	FromCache bool `json:"from_cache"`

	// Summary is true for ?summary=true: paths are left out and the resource
	// list is cut to the strongest entries (see ReachableResourcesTotal).
	Summary                 bool `json:"summary,omitempty"`
	ReachableResourcesTotal int  `json:"reachable_resources_total,omitempty"`
}

// ── Correlation rule types ───────────────────────────────────────────────────

// CorrelationDefinition mirrors one row in correlation_definitions.
type CorrelationDefinition struct {
	ID                      string   `json:"id"`
	RuleID                  string   `json:"rule_id"`
	Category                string   `json:"category"`
	SourceEntityType        string   `json:"source_entity_type"`
	SourceEntityIdentifiers []string `json:"source_entity_identifiers"`
	SourceTable             string   `json:"source_table"`
	TargetEntityType        string   `json:"target_entity_type"`
	TargetEntityIdentifiers []string `json:"target_entity_identifiers"`
	TargetTable             string   `json:"target_table"`
	RelationshipType        string   `json:"relationship_type"`
	EdgeType                string   `json:"edge_type"`
	EvidenceSource          string   `json:"evidence_source"`
	EvidenceType            string   `json:"evidence_type"`
	Phase                   int      `json:"phase"`
	MaxHops                 int      `json:"max_hops"`
	Description             string   `json:"description"`
	IsActive                bool     `json:"is_active"`
	// Disposition is the job the correlation does in the NHI graph (runs_as, grant,
	// assume, qualifier, evidence, ...); see migration 013.
	Disposition string `json:"disposition"`
}

// CompositionRule mirrors one row in correlation_composition_rules.
type CompositionRule struct {
	ID                 string   `json:"id"`
	RuleID             string   `json:"rule_id"`
	RuleType           string   `json:"rule_type"`
	Prerequisites      []string `json:"prerequisites"`
	JoinKey            string   `json:"join_key"`
	ResultType         string   `json:"result_type"`
	ResultSemantics    string   `json:"result_semantics"`
	Bidirectional      bool     `json:"bidirectional"`
	DetectionKey       string   `json:"detection_key"`
	ResolutionStrategy string   `json:"resolution_strategy"`
	FlagAlways         bool     `json:"flag_always"`
	Conditions         []string `json:"conditions"`
	Description        string   `json:"description"`
	IsActive           bool     `json:"is_active"`
}

// PathType mirrors one row in correlation_path_types.
type PathType struct {
	ID                   string   `json:"id"`
	PathID               string   `json:"path_id"`
	PathName             string   `json:"path_name"`
	MinHops              int      `json:"min_hops"`
	MaxHops              int      `json:"max_hops"`
	ConfidenceFormula    string   `json:"confidence_formula"`
	Limitations          []string `json:"limitations"`
	SecuritySignificance string   `json:"security_significance"`
	Phase                int      `json:"phase"`
	Description          string   `json:"description"`
	IsActive             bool     `json:"is_active"`
}

// ── Repository interface ──────────────────────────────────────────────────────

// Repo provides data access for the correlation engine. It reads from both
// PostgreSQL (bimasugam schema) and ClickHouse (cloudtrail_events).
type Repo interface {
	// Load credential by ARN
	LoadCredentialByARN(ctx context.Context, scope *Scope, arn string) (*Credential, error)

	// Load effective permissions for a credential
	LoadEffectivePermissions(ctx context.Context, scope *Scope, credentialARN string) ([]ResourcePermission, error)

	// Load trust edges (can-assume relationships) for a source ARN
	LoadTrustEdges(ctx context.Context, scope *Scope, sourceARN string) ([]TrustEdge, error)

	// Load ISPM access edges for a source ARN
	LoadISPMEdges(ctx context.Context, scope *Scope, sourceARN string) ([]ISPMEdge, error)

	// Load cross-account lineage edges
	LoadCrossAccountLineage(ctx context.Context, scope *Scope, sourceARN string) ([]LineageEdge, error)

	// Load ECS task registry entries for a role ARN
	LoadECSTasksForRole(ctx context.Context, scope *Scope, roleARN string) ([]ECSTask, error)

	// Load identity_credentials bridge entries
	LoadIdentityCredentials(ctx context.Context, scope *Scope, credentialARN string) ([]IdentityCredential, error)

	// Query ClickHouse for observed activity (ACCESSED edges)
	LoadObservedActivity(ctx context.Context, scope *Scope, arn string, limit int) ([]ObservedEvent, error)

	// Save blast radius summary
	SaveBlastRadius(ctx context.Context, scope *Scope, result *BlastRadiusResult) (string, error)

	// Save blast radius paths
	SaveBlastRadiusPaths(ctx context.Context, scope *Scope, blastRadiusID string, paths []BlastRadiusPath) error

	// Load cached blast radius summary
	LoadBlastRadius(ctx context.Context, scope *Scope, sourceARN string) (*BlastRadiusResult, error)

	// Load correlation definitions
	LoadCorrelationDefinitions(ctx context.Context, scope *Scope, category string) ([]CorrelationDefinition, error)

	// Load composition rules
	LoadCompositionRules(ctx context.Context, scope *Scope) ([]CompositionRule, error)

	// Load path types
	LoadPathTypes(ctx context.Context, scope *Scope) ([]PathType, error)

	// Load all credentials (for reverse access computation)
	LoadAllCredentials(ctx context.Context, scope *Scope) ([]Credential, error)

	// Credentials with an access edge to a resource (or to everything, target '*')
	LoadReverseAccess(ctx context.Context, scope *Scope, resourceARN string) ([]ReverseAccessRow, error)

	// Every IAM role in scope with its stored trust policy
	LoadRoleTrust(ctx context.Context, scope *Scope) ([]RoleTrustRow, error)

	// Permission elements that can matter for sts:AssumeRole (exact or wildcard
	// actions), keyed by credential ARN
	LoadAssumePermissions(ctx context.Context, scope *Scope) (map[string][]ResourcePermission, error)

	// When the collector last saw this credential and recalculated its permissions
	LoadDataFreshness(ctx context.Context, scope *Scope, credentialARN string) (DataFreshness, error)

	// Successful AssumeRole calls seen in CloudTrail, one row per caller and role
	LoadAssumeObservations(ctx context.Context, scope *Scope) ([]AssumeObservation, error)
}

// ReverseAccessRow is one credential that can reach a resource.
type ReverseAccessRow struct {
	SourceARN    string
	SourceName   string
	TargetARN    string
	Actions      []string
	EvidenceType string
}

// ── Data types ────────────────────────────────────────────────────────────────

type Credential struct {
	ID                 string
	ARN                string
	Name               string
	CredentialType     string
	AccountID          string
	Region             string
	Status             string
	TrustPolicy        []byte
	AttachedPolicies   []byte
	InlinePolicies     []byte
	PermissionBoundary *string
	PrivilegeLevel     *int
	AssumableRoleARNs  []byte
	DiscoverySource    *string
	CreatedAt          *time.Time
	UpdatedAt          *time.Time
}

type ResourcePermission struct {
	Action       string `json:"action"`
	Effect       string `json:"effect"`
	Service      string `json:"service"`
	ResourceARN  string `json:"resource_arn"`
	PolicyType   string `json:"policy_type"`
	PolicySource string `json:"policy_source"`
	// Conditional is set when the statement carries a Condition block the engine
	// cannot evaluate. A conditional Allow still counts (flagged); a conditional
	// Deny is not applied.
	Conditional bool `json:"conditional,omitempty"`
	// Sid is the statement id, when the policy document was parsed.
	Sid string `json:"sid,omitempty"`
	// ExceptActions turns Action "*" into "everything except these" (NotAction).
	ExceptActions []string `json:"except_actions,omitempty"`
	// Flags are limitation tokens attached while evaluating, for example
	// may_be_denied_by_conditional_deny or not_resource_statement.
	Flags []string `json:"flags,omitempty"`
}

type TrustEdge struct {
	SourceARN  string
	TargetARN  string
	EdgeType   string
	Conditions []byte
	AccountID  string
	Metadata   []byte
}

type ISPMEdge struct {
	Source   string
	Target   string
	EdgeType string
}

type LineageEdge struct {
	SourceARN  string
	RelType    string
	TargetType string
	TargetID   string
	IsExternal bool
}

type ECSTask struct {
	TaskARN          string
	TaskRoleARN      string
	ExecutionRoleARN string
	Cluster          string
	Service          string
}

type IdentityCredential struct {
	IdentityARN   string
	CredentialARN string
	BindingType   string
	BindingSource string
	IsPrimary     bool
}

type ObservedEvent struct {
	EventTime        time.Time
	EventName        string
	EventSource      string
	AWSRegion        string
	ResourceARN      string
	ResourceType     string
	IsReadOnly       bool
	CallerARN        string
	SessionIssuerARN string
	AccessKeyID      string
	CallerType       string // userIdentity.type: AssumedRole, AWSService, IAMUser, ...
	ErrorCode        string // set when the call failed; a failed call proves no access
	EventID          string
}

// AssumeObservation summarises the successful AssumeRole calls seen in
// CloudTrail from one caller to one role. It is the proof that a role hop really
// happened.
type AssumeObservation struct {
	Caller    string // the role (session issuer) or user that made the call
	Target    string // the role that was assumed
	Count     uint64
	FirstSeen time.Time
	LastSeen  time.Time
}
