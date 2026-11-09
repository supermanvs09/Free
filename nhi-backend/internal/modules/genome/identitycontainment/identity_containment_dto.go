package identitycontainment

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Response contains all remediation recommendations produced for an identity.
type Response struct {
	OpenAlertCount       int            `json:"open_alert_count"`
	GeneratedPolicyCount int            `json:"generated_policy_count"`
	SkippedAlertCount    int            `json:"skipped_alert_count"`
	SkippedAlerts        []SkippedAlert `json:"skipped_alerts,omitempty"`
	Items                []Item         `json:"items"`
}

// SkippedAlert identifies an alert that could not produce a safe remediation.
type SkippedAlert struct {
	AlertID   int64  `json:"alert_id"`
	Dimension string `json:"dimension"`
	Reason    string `json:"reason"`
}

// Item is one anomaly remediation recommendation.
type Item struct {
	AlertID        int64       `json:"alert_id"`
	Dimension      string      `json:"dimension"`
	Title          string      `json:"title"`
	Reason         string      `json:"reason"`
	Confidence     float64     `json:"confidence"`
	EvidenceSource string      `json:"evidence_source"`
	BaselineWindow *TimeWindow `json:"baseline_window,omitempty"`
	Enforcement    Enforcement `json:"enforcement"`
	Remediation    Remediation `json:"remediation"`
}

// Enforcement describes the effectiveness and operational scope of a
// remediation.
type Enforcement struct {
	Type                     string     `json:"type"`
	BlocksTriggeringBehavior bool       `json:"blocks_triggering_behavior"`
	RequiresApproval         bool       `json:"requires_approval"`
	ExpiresAt                *time.Time `json:"expires_at,omitempty"`
	Limitation               string     `json:"limitation,omitempty"`
}

// TimeWindow represents a half-open UTC interval.
type TimeWindow struct {
	From            time.Time `json:"from"`
	To              time.Time `json:"to"`
	BaselineVersion *int      `json:"baseline_version,omitempty"`
}

// Remediation describes how to apply and roll back a control.
type Remediation struct {
	Type           string          `json:"type"`
	Target         Target          `json:"target"`
	Apply          Apply           `json:"apply"`
	Rollback       Rollback        `json:"rollback"`
	PolicyDocument *PolicyDocument `json:"policy_document"`
}

// Target identifies the AWS object where remediation must be applied.
type Target struct {
	Type      string `json:"type"`
	ARN       string `json:"arn"`
	Name      string `json:"name,omitempty"`
	Region    string `json:"region,omitempty"`
	AccountID string `json:"account_id,omitempty"`
}

// Apply describes the operation used to install or activate remediation.
type Apply struct {
	Action      string `json:"action"`
	AttachAs    string `json:"attach_as,omitempty"`
	PolicyName  string `json:"policy_name,omitempty"`
	PolicyARN   string `json:"policy_arn,omitempty"`
	StatementID string `json:"statement_id,omitempty"`
	Value       *int   `json:"value,omitempty"`
}

// Rollback describes the exact operation used to remove remediation.
type Rollback struct {
	Action        string `json:"action"`
	PolicyName    string `json:"policy_name,omitempty"`
	PolicyARN     string `json:"policy_arn,omitempty"`
	StatementID   string `json:"statement_id,omitempty"`
	PreviousValue *int   `json:"previous_value,omitempty"`
}

// BaselineRow is the active PostgreSQL baseline.
type BaselineRow struct {
	SourceType   string
	IdentityName string
	AccountID    string
	Status       string
	ProfileJSON  json.RawMessage
	UpdatedAt    time.Time
}

// AlertRow is an open PostgreSQL alert.
type AlertRow struct {
	ID               int64
	EventID          string
	SourceType       string
	IdentityName     string
	AccountID        string
	Dimension        string
	Score            float64
	Reason           string
	BaselineValue    json.RawMessage
	ObservedValue    json.RawMessage
	IdentityMetadata json.RawMessage
	WindowStart      sql.NullTime
	WindowEnd        sql.NullTime
	Status           string
	CreatedAt        time.Time
}

// EventEvidence combines PostgreSQL alert metadata with matching ClickHouse
// request evidence.
type EventEvidence struct {
	EventID           string
	IAMAction         string
	EventSource       string
	EventName         string
	AWSRegion         string
	SourceIP          string
	UserAgent         string
	PrincipalARN      string
	RoleARN           string
	SourceARN         string
	SourceAccount     string
	RequestParameters json.RawMessage
	ResourceARNs      []string
	EventTime         time.Time
}

type PolicyCategory string

const (
	CategoryExactMatch     PolicyCategory = "exact_match"
	CategoryScopedDeny     PolicyCategory = "scoped_deny"
	CategoryProxyGuardrail PolicyCategory = "proxy_guardrail"
)

const (
	EnforcementDirect              = "direct"
	EnforcementTemporary           = "temporary"
	EnforcementCorrelated          = "correlated"
	EnforcementTemporaryCorrelated = "temporary_correlated"
	EnforcementProxy               = "proxy"
)

type PolicyDescription struct {
	Category    PolicyCategory
	Title       string
	Enforcement Enforcement
	WhatItDoes  string
	WhatItCosts string
}

// PolicyDocument is an AWS policy document.
type PolicyDocument struct {
	Version   string            `json:"Version"`
	Statement []PolicyStatement `json:"Statement"`
}

type PolicyStatement struct {
	Sid          string         `json:"Sid"`
	Effect       string         `json:"Effect"`
	Principal    any            `json:"Principal,omitempty"`
	NotPrincipal any            `json:"NotPrincipal,omitempty"`
	Action       any            `json:"Action,omitempty"`
	NotAction    any            `json:"NotAction,omitempty"`
	Resource     any            `json:"Resource,omitempty"`
	NotResource  any            `json:"NotResource,omitempty"`
	Condition    map[string]any `json:"Condition,omitempty"`
}
