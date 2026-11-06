// Package domain holds the platform-agnostic types of the remediation engine.
package domain

import (
	"encoding/json"
	"time"
)

type Risk string

const (
	RiskLow    Risk = "LOW"
	RiskMedium Risk = "MEDIUM"
	RiskHigh   Risk = "HIGH"
)

type Mode string

const (
	ModeGuided   Mode = "GUIDED"
	ModeOneClick Mode = "ONE_CLICK"
)

type PlanStatus string

const (
	PlanDraft           PlanStatus = "DRAFT" // built, but blocked by a pre-check
	PlanReady           PlanStatus = "READY"
	PlanWaitingExternal PlanStatus = "WAITING_EXTERNAL"
	PlanPendingApproval PlanStatus = "PENDING_APPROVAL"
	PlanApproved        PlanStatus = "APPROVED"
	PlanScheduled       PlanStatus = "SCHEDULED"
	PlanExecuting       PlanStatus = "EXECUTING"
	PlanExecuted        PlanStatus = "EXECUTED"
	PlanVerified        PlanStatus = "VERIFIED"
	PlanResolved        PlanStatus = "RESOLVED"
	PlanRejected        PlanStatus = "REJECTED"
	PlanFailed          PlanStatus = "FAILED"
	PlanRolledBack      PlanStatus = "ROLLED_BACK"
	PlanManuallyDone    PlanStatus = "MANUALLY_DONE"
	PlanExpired         PlanStatus = "EXPIRED"
	PlanSuperseded      PlanStatus = "SUPERSEDED"
	PlanCancelled       PlanStatus = "CANCELLED"
)

// Final reports states that no transition leaves (except re-planning).
func (s PlanStatus) Final() bool {
	switch s {
	case PlanResolved, PlanRejected, PlanFailed, PlanRolledBack, PlanExpired, PlanSuperseded, PlanCancelled:
		return true
	}
	return false
}

type ExecKind string

const (
	KindExecute  ExecKind = "EXECUTE"
	KindRollback ExecKind = "ROLLBACK"
	KindFinalize ExecKind = "FINALIZE" // second phase of rotate_access_key
)

type ExecStatus string

const (
	ExecQueued         ExecStatus = "QUEUED"
	ExecRunning        ExecStatus = "RUNNING"
	ExecSucceeded      ExecStatus = "SUCCEEDED"
	ExecFailed         ExecStatus = "FAILED"
	ExecRolledBack     ExecStatus = "ROLLED_BACK"
	ExecRollbackFailed ExecStatus = "ROLLBACK_FAILED"
	ExecCancelled      ExecStatus = "CANCELLED"
)

type BatchMode string

const (
	BatchIndependent  BatchMode = "INDEPENDENT"
	BatchAllOrNothing BatchMode = "ALL_OR_NOTHING"
)

type BatchStatus string

const (
	BatchRunning        BatchStatus = "RUNNING"
	BatchCompleted      BatchStatus = "COMPLETED"
	BatchPartial        BatchStatus = "PARTIAL"
	BatchFailed         BatchStatus = "FAILED"
	BatchRolledBack     BatchStatus = "ROLLED_BACK"
	BatchRollbackFailed BatchStatus = "ROLLBACK_FAILED"
	BatchCancelled      BatchStatus = "CANCELLED"
)

type PrecheckResult string

const (
	CheckPass  PrecheckResult = "PASS"
	CheckWarn  PrecheckResult = "WARN"
	CheckBlock PrecheckResult = "BLOCK"
)

type Precheck struct {
	Name   string         `json:"name"`
	Result PrecheckResult `json:"result"`
	Detail string         `json:"detail"`
}

// DiffEntry is one line of the before/after diff shown to the user.
type DiffEntry struct {
	Path   string `json:"path"`
	Change string `json:"change"` // added | removed | changed
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
}

// GuidedStep is a manual instruction rendered with the real values.
type GuidedStep struct {
	Title   string `json:"title"`
	Console string `json:"console,omitempty"`
	CLI     string `json:"cli,omitempty"`
	IaC     string `json:"iac,omitempty"`
}

// StepLog is one executed provider call.
type StepLog struct {
	Step      string    `json:"step"`
	API       string    `json:"api"`
	RequestID string    `json:"request_id,omitempty"`
	Status    string    `json:"status"` // OK | FAILED | UNDONE | SKIPPED
	At        time.Time `json:"at"`
	Error     string    `json:"error,omitempty"`
}

type Plan struct {
	ID                string          `json:"plan_id"`
	TenantID          string          `json:"tenant_id"`
	BatchID           *string         `json:"batch_id,omitempty"`
	FindingIDs        []string        `json:"finding_ids"`
	RuleIDs           []string        `json:"rule_ids"`
	IdentityIDs       []string        `json:"identity_ids"`
	ActionType        string          `json:"action_type"`
	Platform          string          `json:"platform"`
	AccountID         string          `json:"account_id"`
	Region            string          `json:"region"`
	TargetARN         string          `json:"target_arn"`
	TargetType        string          `json:"target_type"`
	Params            json.RawMessage `json:"params"`
	BeforeState       json.RawMessage `json:"before_state"`
	AfterState        json.RawMessage `json:"after_state"`
	Diff              json.RawMessage `json:"diff"`
	LiveStateHash     string          `json:"live_state_hash"`
	Steps             json.RawMessage `json:"steps"`
	Prechecks         json.RawMessage `json:"prechecks"`
	UsageBasis        json.RawMessage `json:"usage_basis"`
	RiskLevel         Risk            `json:"risk_level"`
	RequiredApprovals int             `json:"required_approvals"`
	ScoreCurrent      *float64        `json:"score_current"`
	ScoreGain         *float64        `json:"score_gain"`
	ScoreProjected    *float64        `json:"score_projected"`
	FleetGain         *float64        `json:"fleet_gain"`
	Mode              Mode            `json:"mode"`
	Status            PlanStatus      `json:"status"`
	StatusReason      string          `json:"status_reason,omitempty"`
	PlanHash          string          `json:"plan_hash"`
	SupersededBy      *string         `json:"superseded_by,omitempty"`
	ValidUntil        *time.Time      `json:"valid_until,omitempty"`
	CreatedBy         string          `json:"created_by"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type Execution struct {
	ID             string          `json:"execution_id"`
	PlanID         string          `json:"plan_id"`
	TenantID       string          `json:"tenant_id"`
	Kind           ExecKind        `json:"kind"`
	RollbackOf     *string         `json:"rollback_of,omitempty"`
	Attempt        int             `json:"attempt"`
	TriggeredBy    string          `json:"triggered_by"`
	Status         ExecStatus      `json:"status"`
	ScheduledFor   time.Time       `json:"scheduled_for"`
	StartedAt      *time.Time      `json:"started_at,omitempty"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
	AssumedRoleARN string          `json:"assumed_role_arn,omitempty"`
	SessionName    string          `json:"session_name,omitempty"`
	Steps          json.RawMessage `json:"steps"`
	RollbackState  json.RawMessage `json:"rollback_state,omitempty"`
	Result         json.RawMessage `json:"result"`
	VerifyResult   json.RawMessage `json:"verify_result"`
	ErrorCode      string          `json:"error_code,omitempty"`
	ErrorMessage   string          `json:"error_message,omitempty"`
	RescanJobID    string          `json:"rescan_job_id,omitempty"`
	GraceNotified  bool            `json:"-"`
	CreatedAt      time.Time       `json:"created_at"`
}

type Batch struct {
	ID          string      `json:"batch_id"`
	TenantID    string      `json:"tenant_id"`
	Mode        BatchMode   `json:"mode"`
	RequestedBy string      `json:"requested_by"`
	PlanCount   int         `json:"plan_count"`
	Status      BatchStatus `json:"status"`
	CreatedAt   time.Time   `json:"created_at"`
	CompletedAt *time.Time  `json:"completed_at,omitempty"`
	Plans       []Plan      `json:"plans,omitempty"`
}

type Approval struct {
	ID           string    `json:"approval_id"`
	PlanID       string    `json:"plan_id"`
	Approver     string    `json:"approver"`
	ApproverRole string    `json:"approver_role"`
	Decision     string    `json:"decision"`
	Comment      string    `json:"comment,omitempty"`
	PlanHash     string    `json:"plan_hash"`
	DecidedAt    time.Time `json:"decided_at"`
}

type AuditEvent struct {
	ID          int64           `json:"id"`
	TenantID    string          `json:"tenant_id"`
	PlanID      *string         `json:"plan_id,omitempty"`
	ExecutionID *string         `json:"execution_id,omitempty"`
	BatchID     *string         `json:"batch_id,omitempty"`
	Event       string          `json:"event"`
	Actor       string          `json:"actor"`
	Details     json.RawMessage `json:"details"`
	At          time.Time       `json:"at"`
}

// Audit event names.
const (
	EvPlanCreated     = "PLAN_CREATED"
	EvPlanSuperseded  = "PLAN_SUPERSEDED"
	EvSubmitted       = "SUBMITTED"
	EvApproved        = "APPROVED"
	EvRejected        = "REJECTED"
	EvExecQueued      = "EXECUTION_QUEUED"
	EvExecStarted     = "EXECUTION_STARTED"
	EvAWSCall         = "AWS_CALL"
	EvVerified        = "VERIFIED"
	EvFailed          = "FAILED"
	EvRolledBack      = "ROLLED_BACK"
	EvMarkedDone      = "MARKED_DONE"
	EvCancelled       = "CANCELLED"
	EvExpired         = "EXPIRED"
	EvDrift           = "DRIFT_DETECTED"
	EvResolved        = "RESOLVED"
	EvExternalConfirm = "EXTERNAL_CONFIRMED"
	EvRescan          = "RESCAN_REQUESTED"
	EvTicketCreated   = "TICKET_CREATED"
	EvEmailSent       = "EMAIL_SENT"
	EvBatchCreated    = "BATCH_CREATED"
	EvBatchStatus     = "BATCH_STATUS"
	EvAccountUpdated  = "ACCOUNT_UPDATED"
)

// ---- catalog ----

type Action struct {
	ActionType          string          `json:"action_type"`
	Group               string          `json:"remediation_group"`
	Platform            string          `json:"platform"`
	Title               string          `json:"title"`
	Description         string          `json:"description"`
	RiskLevel           Risk            `json:"risk_level"`
	Reversible          bool            `json:"reversible"`
	OneClickSupported   bool            `json:"one_click_supported"`
	DefaultGraceDays    int             `json:"default_grace_days"`
	RequiredPermissions []string        `json:"required_permissions"`
	StepsTemplate       json.RawMessage `json:"steps_template"`
	Enabled             bool            `json:"enabled"`
}

type RuleAction struct {
	RuleID         string          `json:"rule_id"`
	ActionType     string          `json:"action_type"`
	IsDefault      bool            `json:"is_default"`
	ParamsTemplate json.RawMessage `json:"params_template"`
}

// ---- accounts ----

type Account struct {
	TenantID           string          `json:"tenant_id"`
	AccountID          string          `json:"account_id"`
	Enabled            bool            `json:"remediation_enabled"`
	RoleARN            string          `json:"remediation_role_arn"`
	ExternalID         string          `json:"-"` // never returned by the API
	HasExternalID      bool            `json:"has_external_id"`
	AllowedActionTypes []string        `json:"allowed_action_types"`
	EnabledRegions     []string        `json:"enabled_regions"`
	ApprovalPolicy     json.RawMessage `json:"approval_policy"`
	GraceDays          json.RawMessage `json:"grace_days"`
	AccessStatus       string          `json:"access_status"`
	AccessDetail       string          `json:"access_detail,omitempty"`
	AccessCheckedAt    *time.Time      `json:"access_checked_at,omitempty"`
	EnabledBy          string          `json:"enabled_by,omitempty"`
	EnabledAt          *time.Time      `json:"enabled_at,omitempty"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// ---- integrations ----

type Integration struct {
	ID          string          `json:"integration_id"`
	TenantID    string          `json:"tenant_id"`
	Type        string          `json:"type"` // JIRA | SES
	Enabled     bool            `json:"enabled"`
	Config      json.RawMessage `json:"config"`
	SecretRef   string          `json:"secret_ref"`
	CursorAt    *time.Time      `json:"cursor_at,omitempty"`
	CursorID    string          `json:"cursor_id,omitempty"`
	AuditCursor int64           `json:"audit_cursor"`
	LastSyncAt  *time.Time      `json:"last_sync_at,omitempty"`
	LastError   string          `json:"last_error,omitempty"`
}

type TicketLink struct {
	FindingID   string
	TenantID    string
	IntegID     string
	ExternalKey string
	ExternalID  string
	URL         string
	State       string
}

type Notification struct {
	ID         int64
	TenantID   string
	Type       string
	PlanID     *string
	Recipients []string
	Subject    string
	BodyHTML   string
	BodyText   string
	Attempts   int
}

// ---- findings (read only, engine owned) ----

type Finding struct {
	ID            string          `json:"finding_id"`
	TenantID      string          `json:"tenant_id"`
	AccountID     string          `json:"account_id"`
	RuleID        string          `json:"rule_id"`
	RuleName      string          `json:"rule_name"`
	Severity      string          `json:"severity"`
	IdentityID    string          `json:"identity_id"`
	IdentityName  string          `json:"identity_name"`
	IdentityType  string          `json:"identity_type"`
	CredentialARN string          `json:"credential_arn"`
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Evidence      json.RawMessage `json:"evidence"`
	Remediation   string          `json:"remediation"`
	Status        string          `json:"status"`
	FirstSeen     time.Time       `json:"first_seen"`
}

// ---- roles ----

type Role string

const (
	RoleViewer   Role = "viewer"
	RoleAnalyst  Role = "analyst"
	RoleApprover Role = "approver"
	RoleAdmin    Role = "admin"
)

type Permission string

const (
	PermRead     Permission = "read"
	PermPlan     Permission = "plan"     // create plans, submit, mark done, cancel
	PermApprove  Permission = "approve"  // approve / reject
	PermExecute  Permission = "execute"  // queue an approved plan, rollback
	PermSettings Permission = "settings" // accounts, integrations, cross-account batches
)

// Can implements the RBAC of design section 11.
func (r Role) Can(p Permission) bool {
	switch r {
	case RoleAdmin:
		return true
	case RoleApprover:
		return p == PermRead || p == PermApprove
	case RoleAnalyst:
		return p == PermRead || p == PermPlan || p == PermExecute
	case RoleViewer:
		return p == PermRead
	}
	return false
}

func ParseRole(s string) (Role, bool) {
	switch Role(s) {
	case RoleViewer, RoleAnalyst, RoleApprover, RoleAdmin:
		return Role(s), true
	}
	return "", false
}

// Actor is the authenticated user the dashboard API forwards.
type Actor struct {
	TenantID string
	UserID   string
	Role     Role
}

// ApprovalPolicy is accounts.approval_policy: approvers per risk level.
type ApprovalPolicy struct {
	Low    int `json:"low"`
	Medium int `json:"medium"`
	High   int `json:"high"`
}

func (p ApprovalPolicy) For(r Risk) int {
	n := p.High
	switch r {
	case RiskLow:
		n = p.Low
	case RiskMedium:
		n = p.Medium
	}
	if n < 1 {
		n = 1
	}
	return n
}
