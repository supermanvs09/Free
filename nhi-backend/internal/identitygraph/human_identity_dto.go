package identitygraph

import (
	"encoding/json"
	"time"
)

// HumanIdentityListFilter is the validated input for the human identities list.
type HumanIdentityListFilter struct {
	Page      int
	PageSize  int
	Source    string   // "", "all", "iam" or "sso" (API values)
	HumanType string   // exact match on human_type, e.g. "ROOT_USER"; "" = no filter
	Statuses  []string // matched case-insensitively
	MFA       *bool
	Risk      string // "" or a key from HumanRiskRules, e.g. "old_access_key"
	Search    string
	SortBy    string
	SortOrder string
}

type HumanOverviewBySource struct {
	IAM  int `json:"iam"`
	SSO  int `json:"sso"`
	Both int `json:"both"`
}

type HumanOverviewByStatus struct {
	Active    int `json:"active"`
	Inactive  int `json:"inactive"`
	Suspended int `json:"suspended"`
	Disabled  int `json:"disabled"`
}

type HumanOverviewMFA struct {
	Enabled  int `json:"enabled"`
	Disabled int `json:"disabled"`
	Unknown  int `json:"unknown"`
}

// HumanOverviewAccessKeys counts identities by access key state (active keys only).
type HumanOverviewAccessKeys struct {
	UsersWithActiveKey int `json:"users_with_active_key"`
	OlderThan90Days    int `json:"older_than_90_days"`
	NeverUsed          int `json:"never_used"`
	TwoActiveKeys      int `json:"two_active_keys"`
}

// HumanOverviewPasswords counts identities by console password state.
type HumanOverviewPasswords struct {
	OlderThan90Days int `json:"older_than_90_days"`
	NeverChanged    int `json:"never_changed"`
}

// HumanOverviewMFADevices counts active MFA devices by type.
type HumanOverviewMFADevices struct {
	Virtual  int `json:"virtual"`
	Hardware int `json:"hardware"`
	Passkey  int `json:"passkey"`
	Other    int `json:"other"`
}

// HumanOverviewSignIns counts identities by console sign-in state.
type HumanOverviewSignIns struct {
	LoginWithoutMFA90Days int `json:"login_without_mfa_90_days"`
	FailedLogin7Days      int `json:"failed_login_7_days"`
}

// HumanOverviewAccessSource counts access rows by how access was granted.
type HumanOverviewAccessSource struct {
	Direct int `json:"direct"`
	Group  int `json:"group"`
}

// HumanIdentityOverview is the response for the Overview tab.
type HumanIdentityOverview struct {
	TotalIdentities      int                       `json:"total_identities"`
	BySource             HumanOverviewBySource     `json:"by_source"`
	ByHumanType          map[string]int            `json:"by_human_type"`
	ByStatus             HumanOverviewByStatus     `json:"by_status"`
	MFA                  HumanOverviewMFA          `json:"mfa"`
	InactiveOver90Days   int                       `json:"inactive_over_90_days"`
	NeverUsed            int                       `json:"never_used"`
	ConsoleWithoutMFA    int                       `json:"console_access_without_mfa"`
	PrivilegedCount      int                       `json:"privileged_count"`
	AdminByPolicy        int                       `json:"admin_by_policy"`
	RootAccounts         int                       `json:"root_accounts"`
	UnlinkedCount        int                       `json:"unlinked_count"`
	AccessKeys           HumanOverviewAccessKeys   `json:"access_keys"`
	Passwords            HumanOverviewPasswords    `json:"passwords"`
	MFADevices           HumanOverviewMFADevices   `json:"mfa_devices"`
	AdminsVirtualMFAOnly int                       `json:"admins_virtual_mfa_only"`
	SignIns              HumanOverviewSignIns      `json:"sign_ins"`
	EscalationCount      int                       `json:"escalation_count"`
	AccessBySource       HumanOverviewAccessSource `json:"access_by_source"`
}

// HumanIdentityListItem is one row of the Human Identities table.
type HumanIdentityListItem struct {
	ID                 string     `json:"id"`
	Source             string     `json:"source"`
	SourceID           string     `json:"source_id"`
	HumanType          string     `json:"human_type"`
	AccountID          string     `json:"account_id"`
	ARN                string     `json:"arn"`
	UserName           string     `json:"user_name"`
	DisplayName        string     `json:"display_name"`
	Email              string     `json:"email"`
	Status             string     `json:"status"`
	MFAActive          *bool      `json:"mfa_active"`
	ConsoleAccess      *bool      `json:"console_access"`
	LastActivityAt     *time.Time `json:"last_activity_at"`
	CreatedAtSource    *time.Time `json:"created_at_source"`
	AccessCount        int        `json:"access_count"`
	GroupCount         int        `json:"group_count"`
	LastConsoleLoginAt *time.Time `json:"last_console_login_at"`
	MFAType            *string    `json:"mfa_type"`
	ActiveKeyCount     int        `json:"active_key_count"`
}

type HumanIdentityPagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	TotalCount int `json:"total_count"`
	TotalPages int `json:"total_pages"`
}

type HumanIdentityListResponse struct {
	Data       []HumanIdentityListItem `json:"data"`
	Pagination HumanIdentityPagination `json:"pagination"`
}

// HumanAccessItem is one row of human_identity_access.
type HumanAccessItem struct {
	ID                string          `json:"id"`
	AccountID         string          `json:"account_id"`
	AccessType        string          `json:"access_type"`
	PermissionSetName *string         `json:"permission_set_name"`
	PermissionSetARN  *string         `json:"permission_set_arn"`
	RoleARN           *string         `json:"role_arn"`
	PolicyARN         *string         `json:"policy_arn"`
	GrantedVia        string          `json:"granted_via"`
	GroupID           *string         `json:"group_id"`
	SessionDuration   *string         `json:"session_duration"`
	LastUsedAt        *time.Time      `json:"last_used_at"`
	PolicyDocument    json.RawMessage `json:"policy_document"`
	IsAdmin           bool            `json:"is_admin"`
	HasEscalation     bool            `json:"has_escalation"`
}

// HumanGroupItem is one row of human_identity_groups.
type HumanGroupItem struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
}

// HumanCredentialItem is one row of human_identity_credentials. Metadata only;
// no secret material is read or returned.
type HumanCredentialItem struct {
	ID              string     `json:"id"`
	CredentialType  string     `json:"credential_type"`
	CredentialRef   string     `json:"credential_ref"`
	Status          string     `json:"status"`
	MFAType         *string    `json:"mfa_type"`
	CreatedAt       *time.Time `json:"created_at"`
	LastRotatedAt   *time.Time `json:"last_rotated_at"`
	LastUsedAt      *time.Time `json:"last_used_at"`
	LastUsedService *string    `json:"last_used_service"`
}

// HumanConsoleLogin is one console sign-in event, read from identity details.
type HumanConsoleLogin struct {
	At       *time.Time `json:"at"`
	Region   string     `json:"region"`
	SourceIP string     `json:"source_ip"`
	MFAUsed  *bool      `json:"mfa_used"`
}

// HumanSignIn holds the last successful and last failed console sign-in.
// It is null for identities without sign-in data (for example SSO users).
type HumanSignIn struct {
	LastSuccess *HumanConsoleLogin `json:"last_success"`
	LastFailure *HumanConsoleLogin `json:"last_failure"`
}

// HumanRiskSignal is a triggered risk for one identity.
type HumanRiskSignal struct {
	Label    string `json:"label"`
	Severity string `json:"severity"`
}

// HumanIdentityDetail is the response for one identity.
type HumanIdentityDetail struct {
	ID               string                `json:"id"`
	Source           string                `json:"source"`
	SourceID         string                `json:"source_id"`
	HumanType        string                `json:"human_type"`
	AccountID        string                `json:"account_id"`
	ARN              string                `json:"arn"`
	UserName         string                `json:"user_name"`
	DisplayName      string                `json:"display_name"`
	GivenName        string                `json:"given_name"`
	FamilyName       string                `json:"family_name"`
	Title            string                `json:"title"`
	Email            string                `json:"email"`
	ExternalID       string                `json:"external_id"`
	ExternalIDIssuer string                `json:"external_id_issuer"`
	IDPName          string                `json:"idp_name"`
	Status           string                `json:"status"`
	MFAActive        *bool                 `json:"mfa_active"`
	ConsoleAccess    *bool                 `json:"console_access"`
	LastActivityAt   *time.Time            `json:"last_activity_at"`
	CreatedAtSource  *time.Time            `json:"created_at_source"`
	PersonID         *string               `json:"person_id"`
	Details          json.RawMessage       `json:"details"`
	FirstSeenAt      time.Time             `json:"first_seen_at"`
	LastSeenAt       time.Time             `json:"last_seen_at"`
	Access           []HumanAccessItem     `json:"access"`
	Groups           []HumanGroupItem      `json:"groups"`
	Credentials      []HumanCredentialItem `json:"credentials"`
	SignIn           *HumanSignIn          `json:"sign_in"`
	RiskSignals      []HumanRiskSignal     `json:"risk_signals"`
}

// HumanPermissionSetItem is one SSO permission set with its assignments.
// Created date is not included: no permission-set table exists yet.
type HumanPermissionSetItem struct {
	PermissionSetARN  string   `json:"permission_set_arn"`
	PermissionSetName string   `json:"permission_set_name"`
	SessionDuration   *string  `json:"session_duration"`
	AssignedUserCount int      `json:"assigned_user_count"`
	AccountCount      int      `json:"account_count"`
	AccountIDs        []string `json:"account_ids"`
	Policies          []string `json:"policies"`
	AssignedUsers     []string `json:"assigned_users"`
}
