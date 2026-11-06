package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// A connection request: a company's AWS account that passed every connection
// check in the console and now waits for a super admin. The API server writes
// these rows (nhi_global.connection_approvals); this service decides them.
//
// The order of a connection is: the role can be assumed, it can read the
// account, an admin approves, then events arrive from the account. A request
// is therefore made BEFORE the events check.
//
// Approving marks the request approved and, in the same transaction, records it
// on the company's accounts row (approval_status 'approved'). It does not
// connect the account: the API server sees the approval, lets the account onto
// its event bus and watches for the first event, and the account connects (and
// its first sync is queued) when that event arrives. Rejecting leaves the
// account disconnected with the reason, which the console shows to the company.

// Approval is one request as the Approvals page shows it.
type Approval struct {
	ID           int64           `json:"id"`
	TenantID     string          `json:"tenant_id"`
	Workspace    string          `json:"workspace"`
	Domain       string          `json:"domain"`
	AccountID    string          `json:"account_id"`
	RoleARN      string          `json:"role_arn"`
	Regions      []string        `json:"regions"`
	Checks       json.RawMessage `json:"checks"`
	Events       json.RawMessage `json:"events"`
	RequestedBy  string          `json:"requested_by"`
	RequestedAt  time.Time       `json:"requested_at"`
	Status       string          `json:"status"`
	DecidedBy    string          `json:"decided_by,omitempty"`
	DecidedAt    *time.Time      `json:"decided_at,omitempty"`
	DecisionNote string          `json:"decision_note,omitempty"`
	EmailStatus  string          `json:"email_status"`
	EmailError   string          `json:"email_error,omitempty"`
	EmailedAt    *time.Time      `json:"emailed_at,omitempty"`
}

// ApprovalList is the page's data: the requests asked for, and how many are
// pending (the badge and the notification are built from that).
type ApprovalList struct {
	Approvals []Approval `json:"approvals"`
	Pending   int        `json:"pending"`
	LatestID  int64      `json:"latest_pending_id"`
	Ready     bool       `json:"ready"` // false until the API server's migration 007 has run
}

// Decision outcomes.
const (
	ApprovalPending   = "pending"
	ApprovalApproved  = "approved"
	ApprovalRejected  = "rejected"
	ApprovalWithdrawn = "withdrawn"
)

const approvalColumns = `a.id, a.tenant_id::text, a.db_name, COALESCE(NULLIF(t.domain_name, ''), a.tenant_domain), a.account_id, a.role_arn,
	a.regions, a.checks, a.events, a.requested_by, a.requested_at, a.status, COALESCE(a.decided_by, ''), a.decided_at,
	a.decision_note, a.email_status, a.email_error, a.emailed_at`

type rowScanner interface{ Scan(...any) error }

// schemaRE is a workspace (schema) name as onboarding creates them.
var schemaRE = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

func scanApproval(row rowScanner) (*Approval, error) {
	var a Approval
	var regions string
	var checks, events []byte
	var decided, emailed sql.NullTime
	if err := row.Scan(&a.ID, &a.TenantID, &a.Workspace, &a.Domain, &a.AccountID, &a.RoleARN,
		(*pgTextArray)(&regions), &checks, &events, &a.RequestedBy, &a.RequestedAt, &a.Status, &a.DecidedBy, &decided,
		&a.DecisionNote, &a.EmailStatus, &a.EmailError, &emailed); err != nil {
		return nil, err
	}
	a.Regions = splitPGArray(regions)
	a.Checks = json.RawMessage(orJSON(checks, "[]"))
	a.Events = json.RawMessage(orJSON(events, "{}"))
	if decided.Valid {
		a.DecidedAt = &decided.Time
	}
	if emailed.Valid {
		a.EmailedAt = &emailed.Time
	}
	return &a, nil
}

func orJSON(b []byte, fallback string) []byte {
	if len(b) == 0 || !json.Valid(b) {
		return []byte(fallback)
	}
	return b
}

// pgTextArray reads a text[] as its literal ({a,b}); splitPGArray parses it.
// Region names never contain commas, quotes or braces.
type pgTextArray string

func (p *pgTextArray) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*p = ""
	case string:
		*p = pgTextArray(v)
	case []byte:
		*p = pgTextArray(v)
	default:
		return fmt.Errorf("text[]: unexpected %T", src)
	}
	return nil
}

func splitPGArray(s string) []string {
	s = strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(s), "{"), "}")
	out := []string{}
	for _, part := range strings.Split(s, ",") {
		if part = strings.Trim(strings.TrimSpace(part), `"`); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func isUndefinedTable(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "42P01") || strings.Contains(err.Error(), "does not exist"))
}

// ListApprovals returns the requests with the given status ("" = every
// status; "decided" = approved, rejected and withdrawn), newest first.
func (s *Service) ListApprovals(ctx context.Context, status string) (*ApprovalList, error) {
	out := &ApprovalList{Approvals: []Approval{}, Ready: true}
	where := ""
	args := []any{}
	switch status {
	case "", "all":
	case "decided":
		where = "WHERE a.status <> 'pending'"
	case ApprovalPending, ApprovalApproved, ApprovalRejected, ApprovalWithdrawn:
		where = "WHERE a.status = $1"
		args = append(args, status)
	default:
		return nil, &ValidationError{Fields: map[string]string{"status": "Use pending, decided, approved, rejected, withdrawn or all."}}
	}
	// Pending requests first (oldest first: they have waited longest), then
	// decisions, latest first.
	rows, err := s.db.QueryContext(ctx, `SELECT `+approvalColumns+`
		FROM `+s.table("connection_approvals")+` a
		LEFT JOIN `+s.table("tenants")+` t ON t.tenant_id = a.tenant_id
		`+where+`
		ORDER BY (a.status = 'pending') DESC,
		         CASE WHEN a.status = 'pending' THEN a.requested_at END ASC,
		         COALESCE(a.decided_at, a.requested_at) DESC
		LIMIT 500`, args...)
	if isUndefinedTable(err) {
		out.Ready = false
		return out, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list approvals: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		a, err := scanApproval(rows)
		if err != nil {
			return nil, fmt.Errorf("read approval: %w", err)
		}
		out.Approvals = append(out.Approvals, *a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	err = s.db.QueryRowContext(ctx, `SELECT count(*), COALESCE(max(id), 0) FROM `+s.table("connection_approvals")+` WHERE status = 'pending'`).
		Scan(&out.Pending, &out.LatestID)
	if err != nil {
		return nil, fmt.Errorf("count approvals: %w", err)
	}
	return out, nil
}

// PendingApprovals is the cheap poll behind the badge and the notification.
func (s *Service) PendingApprovals(ctx context.Context) (count int, latest int64, ready bool, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT count(*), COALESCE(max(id), 0) FROM `+s.table("connection_approvals")+` WHERE status = 'pending'`).
		Scan(&count, &latest)
	if isUndefinedTable(err) {
		return 0, 0, false, nil
	}
	return count, latest, err == nil, err
}

// DecidedError means someone else decided (or the company withdrew) first.
type DecidedError struct{ Status, By string }

func (e DecidedError) Error() string {
	switch e.Status {
	case ApprovalWithdrawn:
		return "The company removed this account, so the request was withdrawn."
	case "":
		return "This request was already decided."
	}
	by := ""
	if e.By != "" {
		by = " by " + e.By
	}
	return "This request was already " + e.Status + by + "."
}

// Decide approves or rejects a pending request. A rejection needs a reason:
// the company sees it on its Integrations page.
func (s *Service) Decide(ctx context.Context, id int64, approve bool, note, who string) (*Approval, error) {
	note = strings.TrimSpace(note)
	if len([]rune(note)) > 1000 {
		return nil, &ValidationError{Fields: map[string]string{"note": "Keep the note under 1000 characters."}}
	}
	if !approve && note == "" {
		return nil, &ValidationError{Fields: map[string]string{"note": "Say why, so the company knows what to fix."}}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var status, schema, accountID, tenantID, decidedBy string
	err = tx.QueryRowContext(ctx, `SELECT status, db_name, account_id, tenant_id::text, COALESCE(decided_by, '')
		FROM `+s.table("connection_approvals")+` WHERE id = $1 FOR UPDATE`, id).
		Scan(&status, &schema, &accountID, &tenantID, &decidedBy)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, NotFoundError{}
	}
	if err != nil {
		return nil, fmt.Errorf("lock approval: %w", err)
	}
	if status != ApprovalPending {
		return nil, DecidedError{Status: status, By: decidedBy}
	}
	if !schemaRE.MatchString(schema) {
		return nil, fmt.Errorf("approval %d names workspace %q", id, schema)
	}
	// The same lock the API server takes around an account's row, so a
	// re-check or a removal cannot interleave with the decision.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('nhi_aws_account:' || $1))`, accountID); err != nil {
		return nil, fmt.Errorf("lock account: %w", err)
	}
	accounts := quote(schema) + ".accounts"
	for _, col := range []string{
		"checks jsonb NOT NULL DEFAULT '[]'::jsonb", "connected_at timestamptz",
		"sync_status text NOT NULL DEFAULT 'idle'", "sync_requested_at timestamptz",
		"sync_requested_by text NOT NULL DEFAULT ''", "last_sync_error text NOT NULL DEFAULT ''",
		"approval_status text", "approval_requested_at timestamptz", "approval_requested_by text",
		"approved_at timestamptz", "approved_by text", "approval_note text",
	} {
		if _, err := tx.ExecContext(ctx, `ALTER TABLE `+accounts+` ADD COLUMN IF NOT EXISTS `+col); err != nil {
			return nil, fmt.Errorf("prepare accounts table: %w", err)
		}
	}
	var res sql.Result
	if approve {
		// Approved, not connected: the events check runs next, on the API
		// server, and connects the account when the first event arrives. An
		// account that is somehow connected already stays so.
		res, err = tx.ExecContext(ctx, `UPDATE `+accounts+` SET
				approval_status = 'approved', approved_at = now(), approved_by = $2, approval_note = $3,
				account_status = CASE WHEN is_connected THEN 'active' ELSE 'pending' END,
				updated_at = now()
			WHERE account_id = $1`, accountID, "super admin "+who, note)
	} else {
		res, err = tx.ExecContext(ctx, `UPDATE `+accounts+` SET
				approval_status = 'rejected', approved_at = now(), approved_by = $2, approval_note = $3,
				account_status = 'rejected', is_connected = false, updated_at = now()
			WHERE account_id = $1`, accountID, "super admin "+who, note)
	}
	if err != nil {
		return nil, fmt.Errorf("update account: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// The company removed the account after asking: nothing to turn on.
		if _, err := tx.ExecContext(ctx, `UPDATE `+s.table("connection_approvals")+`
			SET status = 'withdrawn', decided_at = now(), decided_by = 'account removed' WHERE id = $1`, id); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return nil, DecidedError{Status: ApprovalWithdrawn}
	}
	outcome := ApprovalRejected
	if approve {
		outcome = ApprovalApproved
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+s.table("connection_approvals")+`
		SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, id, outcome, who, note); err != nil {
		return nil, fmt.Errorf("record decision: %w", err)
	}
	a, err := scanApproval(tx.QueryRowContext(ctx, `SELECT `+approvalColumns+`
		FROM `+s.table("connection_approvals")+` a LEFT JOIN `+s.table("tenants")+` t ON t.tenant_id = a.tenant_id
		WHERE a.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("read approval: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return a, nil
}
