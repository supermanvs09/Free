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

// HumanIdentityOverview is the response for the Overview tab.
type HumanIdentityOverview struct {
	TotalIdentities    int                   `json:"total_identities"`
	BySource           HumanOverviewBySource `json:"by_source"`
	ByHumanType        map[string]int        `json:"by_human_type"`
	ByStatus           HumanOverviewByStatus `json:"by_status"`
	MFA                HumanOverviewMFA      `json:"mfa"`
	InactiveOver90Days int                   `json:"inactive_over_90_days"`
	NeverUsed          int                   `json:"never_used"`
	ConsoleWithoutMFA  int                   `json:"console_access_without_mfa"`
	PrivilegedCount    int                   `json:"privileged_count"`
	RootAccounts       int                   `json:"root_accounts"`
	UnlinkedCount      int                   `json:"unlinked_count"`
}

// HumanIdentityListItem is one row of the Human Identities table.
type HumanIdentityListItem struct {
	ID              string     `json:"id"`
	Source          string     `json:"source"`
	SourceID        string     `json:"source_id"`
	HumanType       string     `json:"human_type"`
	AccountID       string     `json:"account_id"`
	ARN             string     `json:"arn"`
	UserName        string     `json:"user_name"`
	DisplayName     string     `json:"display_name"`
	Email           string     `json:"email"`
	Status          string     `json:"status"`
	MFAActive       *bool      `json:"mfa_active"`
	ConsoleAccess   *bool      `json:"console_access"`
	LastActivityAt  *time.Time `json:"last_activity_at"`
	CreatedAtSource *time.Time `json:"created_at_source"`
	AccessCount     int        `json:"access_count"`
	GroupCount      int        `json:"group_count"`
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
	ID                string     `json:"id"`
	AccountID         string     `json:"account_id"`
	AccessType        string     `json:"access_type"`
	PermissionSetName *string    `json:"permission_set_name"`
	PermissionSetARN  *string    `json:"permission_set_arn"`
	RoleARN           *string    `json:"role_arn"`
	PolicyARN         *string    `json:"policy_arn"`
	GrantedVia        string     `json:"granted_via"`
	GroupID           *string    `json:"group_id"`
	SessionDuration   *string    `json:"session_duration"`
	LastUsedAt        *time.Time `json:"last_used_at"`
}

// HumanGroupItem is one row of human_identity_groups.
type HumanGroupItem struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
}

// HumanRiskSignal is a triggered risk for one identity.
type HumanRiskSignal struct {
	Label    string `json:"label"`
	Severity string `json:"severity"`
}

// HumanIdentityDetail is the response for one identity.
type HumanIdentityDetail struct {
	ID               string            `json:"id"`
	Source           string            `json:"source"`
	SourceID         string            `json:"source_id"`
	HumanType        string            `json:"human_type"`
	AccountID        string            `json:"account_id"`
	ARN              string            `json:"arn"`
	UserName         string            `json:"user_name"`
	DisplayName      string            `json:"display_name"`
	GivenName        string            `json:"given_name"`
	FamilyName       string            `json:"family_name"`
	Title            string            `json:"title"`
	Email            string            `json:"email"`
	ExternalID       string            `json:"external_id"`
	ExternalIDIssuer string            `json:"external_id_issuer"`
	IDPName          string            `json:"idp_name"`
	Status           string            `json:"status"`
	MFAActive        *bool             `json:"mfa_active"`
	ConsoleAccess    *bool             `json:"console_access"`
	LastActivityAt   *time.Time        `json:"last_activity_at"`
	CreatedAtSource  *time.Time        `json:"created_at_source"`
	PersonID         *string           `json:"person_id"`
	Details          json.RawMessage   `json:"details"`
	FirstSeenAt      time.Time         `json:"first_seen_at"`
	LastSeenAt       time.Time         `json:"last_seen_at"`
	Access           []HumanAccessItem `json:"access"`
	Groups           []HumanGroupItem  `json:"groups"`
	RiskSignals      []HumanRiskSignal `json:"risk_signals"`
}
