package awsintegration

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/database"
)

// The approval columns on accounts come with migrations/tenant/009. A tenant
// schema created before them gets them here on first use, so a deployment
// that has not run the migration yet does not lose the Integrations page.
var approvalColumnsReady sync.Map // schema -> struct{}

func (r *AWSIntegrationRepository) ensureApprovalColumns(ctx context.Context, db *sql.DB, schema string) error {
	if _, ok := approvalColumnsReady.Load(schema); ok {
		return nil
	}
	t := database.Table(schema, accountsTable)
	for _, col := range []string{
		"approval_status text", "approval_requested_at timestamptz", "approval_requested_by text",
		"approved_at timestamptz", "approved_by text", "approval_note text",
	} {
		if _, err := db.ExecContext(ctx, `ALTER TABLE `+t+` ADD COLUMN IF NOT EXISTS `+col); err != nil {
			return fmt.Errorf("add accounts approval column: %w", missingSchema(err))
		}
	}
	approvalColumnsReady.Store(schema, struct{}{})
	return nil
}

// SaveCheckStart records a check that has passed its first two steps and now
// watches for events. A new account is saved as pending. An account that is
// already connected stays connected while its events are re-checked: a
// re-check must not take a working connection down for minutes.
func (r *AWSIntegrationRepository) SaveCheckStart(ctx context.Context, tenantID, schema string, rec AWSAccountRecord) (*AWSAccountRecord, error) {
	return r.saveCheckStart(ctx, tenantID, schema, rec, true)
}

// SaveApprovalAsk saves an account that only asks for approval: nothing has
// been checked, so nothing is proven and who else holds the account is not
// asked (it would tell any tenant which accounts other workspaces use). The
// ownership check runs once the role check has passed.
func (r *AWSIntegrationRepository) SaveApprovalAsk(ctx context.Context, tenantID, schema string, rec AWSAccountRecord) (*AWSAccountRecord, error) {
	return r.saveCheckStart(ctx, tenantID, schema, rec, false)
}

func (r *AWSIntegrationRepository) saveCheckStart(ctx context.Context, tenantID, schema string, rec AWSAccountRecord, checkOwner bool) (*AWSAccountRecord, error) {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return nil, err
	}
	if err := r.ensureApprovalColumns(ctx, db, schema); err != nil {
		return nil, err
	}
	checks, err := json.Marshal(nonNil(rec.Checks))
	if err != nil {
		return nil, fmt.Errorf("encode checks: %w", err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := lockAccount(ctx, tx, rec.AccountID); err != nil {
		return nil, err
	}
	if checkOwner {
		claimed, err := r.claimedByOther(ctx, tx, tenantID, rec.AccountID)
		if err != nil {
			return nil, err
		}
		if claimed {
			return nil, ErrAWSAccountClaimedByTenant
		}
	}
	table := database.Table(schema, accountsTable)
	saved, err := scanAccount(tx.QueryRowContext(ctx, `INSERT INTO `+table+` AS a
			(tenant_id, account_id, is_default, client_aws_account_id, client_role_arn, regions, external_id,
			 is_connected, account_status, checks, last_verified_at, last_verified_by, sync_status, updated_at)
		VALUES ($1::uuid, $2::text, true, $2::text, $3::text, $4::text[], $5::text, false, 'pending', $6::jsonb, $7, $8, 'idle', now())
		ON CONFLICT (account_id) DO UPDATE SET
			client_aws_account_id = EXCLUDED.client_aws_account_id,
			client_role_arn = EXCLUDED.client_role_arn,
			regions = EXCLUDED.regions,
			external_id = EXCLUDED.external_id,
			checks = EXCLUDED.checks,
			last_verified_at = EXCLUDED.last_verified_at,
			last_verified_by = EXCLUDED.last_verified_by,
			-- a rejected request may be tried again: it is pending once more
			account_status = CASE WHEN a.account_status = 'rejected' THEN 'pending' ELSE a.account_status END,
			updated_at = now()
		RETURNING `+accountColumns,
		tenantID, rec.AccountID, rec.RoleARN, pq.Array(scopeRegions(rec.Regions)), rec.ExternalID, checks, rec.LastVerifiedAt, rec.LastVerifiedBy))
	if err != nil {
		return nil, fmt.Errorf("save aws account: %w", missingSchema(err))
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit aws account: %w", err)
	}
	return saved, nil
}

// SaveChecks replaces the account's checks (the events check reports its
// progress through here) without touching anything else.
func (r *AWSIntegrationRepository) SaveChecks(ctx context.Context, schema, accountID string, checks []AWSCheck) error {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(nonNil(checks))
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(schema, accountsTable)+`
		SET checks = $2::jsonb, updated_at = now() WHERE account_id = $1`, accountID, raw)
	if err != nil {
		return fmt.Errorf("save checks: %w", missingSchema(err))
	}
	return nil
}

// ApprovalRequest is what a platform admin decides on.
type ApprovalRequest struct {
	TenantID    string
	Schema      string
	Domain      string
	Account     AWSAccountRecord
	Events      map[string]any
	RequestedBy string
}

// RequestApproval puts a first connection that passed every check in front of
// the platform admins: the account waits as pending_approval and one pending
// request row exists for it (a repeat keeps the same row, refreshed). Returns
// the request's id.
func (r *AWSIntegrationRepository) RequestApproval(ctx context.Context, req ApprovalRequest) (int64, *AWSAccountRecord, error) {
	db, err := r.accountsDB(ctx, req.Schema)
	if err != nil {
		return 0, nil, err
	}
	if err := r.ensureApprovalColumns(ctx, db, req.Schema); err != nil {
		return 0, nil, err
	}
	checks, err := json.Marshal(nonNil(req.Account.Checks))
	if err != nil {
		return 0, nil, err
	}
	events, err := json.Marshal(req.Events)
	if err != nil {
		return 0, nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := lockAccount(ctx, tx, req.Account.AccountID); err != nil {
		return 0, nil, err
	}
	saved, err := scanAccount(tx.QueryRowContext(ctx, `UPDATE `+database.Table(req.Schema, accountsTable)+`
		SET checks = $2::jsonb, account_status = 'pending_approval', is_connected = false,
		    approval_status = 'pending', approval_requested_at = now(), approval_requested_by = $3,
		    approved_at = NULL, approved_by = NULL, approval_note = NULL, updated_at = now()
		WHERE account_id = $1
		RETURNING `+accountColumns, req.Account.AccountID, checks, req.RequestedBy))
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil, ErrAWSAccountNotFound
	}
	if err != nil {
		return 0, nil, fmt.Errorf("mark account pending approval: %w", missingSchema(err))
	}
	approvals := database.Table(r.globalSchema, "connection_approvals")
	var id int64
	err = tx.QueryRowContext(ctx, `UPDATE `+approvals+`
		SET role_arn = $3, regions = $4::text[], checks = $5::jsonb, events = $6::jsonb, requested_by = $7, requested_at = now(),
		    tenant_domain = $8, db_name = $9
		WHERE tenant_id = $1::uuid AND account_id = $2 AND status = 'pending'
		RETURNING id`, req.TenantID, req.Account.AccountID, req.Account.RoleARN, pq.Array(req.Account.Regions), checks, events,
		req.RequestedBy, req.Domain, req.Schema).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `INSERT INTO `+approvals+`
			(tenant_id, db_name, tenant_domain, account_id, role_arn, regions, checks, events, requested_by)
			VALUES ($1::uuid, $9, $8, $2, $3, $4::text[], $5::jsonb, $6::jsonb, $7) RETURNING id`,
			req.TenantID, req.Account.AccountID, req.Account.RoleARN, pq.Array(req.Account.Regions), checks, events,
			req.RequestedBy, req.Domain, req.Schema).Scan(&id)
	}
	if err != nil {
		return 0, nil, fmt.Errorf("record approval request: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, nil, err
	}
	return id, saved, nil
}

// WorkspaceApproved reports whether the workspace already has an approved
// account: one an admin approved, or one connected before approvals existed.
// Only the workspace's first account is put in front of the admins.
func (r *AWSIntegrationRepository) WorkspaceApproved(ctx context.Context, schema string) (bool, error) {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return false, err
	}
	var ok bool
	err = db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+database.Table(schema, accountsTable)+`
		WHERE approval_status = 'approved' OR (COALESCE(approval_status, '') = '' AND connected_at IS NOT NULL))`).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("look up the workspace's approval: %w", missingSchema(err))
	}
	return ok, nil
}

// MarkApprovedByWorkspace records that an account needs no approval of its own
// because the workspace already has an approved account. An account that has a
// decision (pending, rejected) is left alone.
func (r *AWSIntegrationRepository) MarkApprovedByWorkspace(ctx context.Context, schema, accountID string) error {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(schema, accountsTable)+`
		SET approval_status = 'approved', approved_at = now(), approved_by = 'workspace already approved', approval_note = NULL, updated_at = now()
		WHERE account_id = $1 AND COALESCE(approval_status, '') = ''`, accountID)
	if err != nil {
		return fmt.Errorf("mark account approved: %w", missingSchema(err))
	}
	return nil
}

// HasPendingApproval reports whether a pending request for the account is in
// nhi_global.connection_approvals - what the onboarding tool's Approvals page
// lists. The account's own approval_status can say "pending" without one (the
// row was withdrawn or decided elsewhere, or never reached this table).
func (r *AWSIntegrationRepository) HasPendingApproval(ctx context.Context, tenantID, accountID string) (bool, error) {
	db, err := r.pool()
	if err != nil {
		return false, err
	}
	var ok bool
	err = db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+database.Table(r.globalSchema, "connection_approvals")+`
		WHERE tenant_id = $1::uuid AND account_id = $2 AND status = 'pending')`, tenantID, accountID).Scan(&ok)
	if err != nil && strings.Contains(err.Error(), "42P01") {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("look up pending approval: %w", err)
	}
	return ok, nil
}

// SetApprovalEmail records how the e-mail to the approvers went.
func (r *AWSIntegrationRepository) SetApprovalEmail(ctx context.Context, id int64, status, errText string) error {
	db, err := r.pool()
	if err != nil {
		return err
	}
	if len(errText) > 500 {
		errText = errText[:500]
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(r.globalSchema, "connection_approvals")+`
		SET email_status = $2, email_error = $3, emailed_at = CASE WHEN $2 = 'sent' THEN now() ELSE emailed_at END
		WHERE id = $1`, id, status, strings.TrimSpace(errText))
	return err
}

// WithdrawApprovals closes the pending requests of an account that was removed.
func (r *AWSIntegrationRepository) WithdrawApprovals(ctx context.Context, tenantID, accountID string) error {
	db, err := r.pool()
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(r.globalSchema, "connection_approvals")+`
		SET status = 'withdrawn', decided_at = now(), decided_by = 'account removed'
		WHERE tenant_id = $1::uuid AND account_id = $2 AND status = 'pending'`, tenantID, accountID)
	if err != nil && strings.Contains(err.Error(), "42P01") {
		return nil // the approvals table does not exist yet: nothing to withdraw
	}
	return err
}
