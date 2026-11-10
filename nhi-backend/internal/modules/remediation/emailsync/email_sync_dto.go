package emailsync

import "time"

// GET /remediation/email-sync (every role): where the rule engine's e-mail sync has got to.
//
// The engine keeps its position in ispm_finding_history in ispm_email_sync (cursor_at, cursor_id).
// This endpoint only READS that table and the finding history: it shows the cursor, the finding event
// it points at, and the events that come after it (not yet handled by the sync). Use it while
// testing: after each finding is opened or resolved, look at last_event and pending.
// The answer is { "data": EmailSyncStatus }.

// EmailSyncStatus is the position of the sync.
type EmailSyncStatus struct {
	TenantID  string     `json:"tenant_id"`
	CursorAt  *time.Time `json:"cursor_at"` // null: the engine has not written a row yet
	CursorID  string     `json:"cursor_id"`
	UpdatedAt *time.Time `json:"updated_at"`
	// LastEvent is the finding event cursor_id points at (the last one the sync handled); null when
	// there is no cursor or the id is not a finding-history id.
	LastEvent *SyncEvent `json:"last_event"`
	// PendingCount is how many finding events come after the cursor; Pending lists the oldest ones.
	PendingCount int         `json:"pending_count"`
	Pending      []SyncEvent `json:"pending"`
}

// SyncEvent is one row of ispm_finding_history with its finding.
type SyncEvent struct {
	EventID       string    `json:"event_id"`
	FindingID     string    `json:"finding_id"`
	Action        string    `json:"action"` // OPENED, RESOLVED, REOPENED, ACCEPTED, SUPPRESSED, ...
	NewValue      string    `json:"new_value,omitempty"`
	Reason        string    `json:"reason,omitempty"`
	RuleID        string    `json:"rule_id"`
	Severity      string    `json:"severity"`
	Title         string    `json:"title"`
	Identity      string    `json:"identity"`
	AccountID     string    `json:"account_id"`
	FindingStatus string    `json:"finding_status"`
	At            time.Time `json:"at"`
}

const (
	defaultLimit = 20
	maxLimit     = 200
)
