package awsintegration

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/database"
)

// emailSuppressWindow: a second click for the same account within this long
// is still recorded, but does not e-mail the admins again.
const emailSuppressWindow = "60 seconds"

// ConnectionRequest is one click of "Verify connection".
type ConnectionRequest struct {
	TenantID    string
	Schema      string
	Domain      string
	AccountID   string // the customer's AWS account
	RoleARN     string
	Regions     []string
	RequestedBy string
	RequestID   string
}

// RecordConnectionRequest stores the click (nhi_global.connection_requests,
// migrations/global/009) before any check runs. recentlyEmailed says the admins
// were already e-mailed about this account a moment ago.
func (r *AWSIntegrationRepository) RecordConnectionRequest(ctx context.Context, req ConnectionRequest) (id int64, recentlyEmailed bool, err error) {
	db, err := r.pool()
	if err != nil {
		return 0, false, err
	}
	t := database.Table(r.globalSchema, "connection_requests")
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+t+`
		WHERE tenant_id = $1::uuid AND client_aws_account_id = $2 AND email_status = 'sent'
		  AND emailed_at > now() - interval '`+emailSuppressWindow+`')`, req.TenantID, req.AccountID).Scan(&recentlyEmailed); err != nil {
		return 0, false, fmt.Errorf("check earlier connection request: %w", err)
	}
	err = db.QueryRowContext(ctx, `INSERT INTO `+t+`
		(tenant_id, db_name, tenant_domain, client_aws_account_id, role_arn, regions, requested_by, request_id)
		VALUES ($1::uuid, $2, $3, $4, $5, $6::text[], $7, $8) RETURNING id`,
		req.TenantID, req.Schema, req.Domain, req.AccountID, req.RoleARN, pq.Array(req.Regions), req.RequestedBy, req.RequestID).Scan(&id)
	if err != nil {
		return 0, false, fmt.Errorf("record connection request: %w", err)
	}
	return id, recentlyEmailed, nil
}

// SetRequestEmail records how the e-mail about the click went.
func (r *AWSIntegrationRepository) SetRequestEmail(ctx context.Context, id int64, status, errText string) error {
	db, err := r.pool()
	if err != nil {
		return err
	}
	if len(errText) > 500 {
		errText = errText[:500]
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(r.globalSchema, "connection_requests")+`
		SET email_status = $2, email_error = $3, emailed_at = CASE WHEN $2 = 'sent' THEN now() ELSE emailed_at END
		WHERE id = $1`, id, status, errText)
	if err != nil {
		return fmt.Errorf("record connection request e-mail: %w", err)
	}
	return nil
}

// FinishConnectionRequest records how the checks ended.
func (r *AWSIntegrationRepository) FinishConnectionRequest(ctx context.Context, id int64, outcome, detail string, checks []AWSCheck) error {
	db, err := r.pool()
	if err != nil {
		return err
	}
	raw, err := json.Marshal(nonNil(checks))
	if err != nil {
		return err
	}
	if len(detail) > 4000 { // AWS's message and the check of our side fit
		detail = detail[:4000]
	}
	_, err = db.ExecContext(ctx, `UPDATE `+database.Table(r.globalSchema, "connection_requests")+`
		SET outcome = $2, outcome_detail = $3, checks = $4::jsonb, finished_at = now()
		WHERE id = $1`, id, outcome, detail, raw)
	if err != nil {
		return fmt.Errorf("finish connection request: %w", err)
	}
	return nil
}

// CollectorPlatforms is every distinct (collector account, event bus) the
// tenants are set up with: what customers are told to trust.
func (r *AWSIntegrationRepository) CollectorPlatforms(ctx context.Context) ([][2]string, error) {
	db, err := r.pool()
	if err != nil {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT collector_aws_account_id, collector_event_bridge_arn
		FROM `+database.Table(r.globalSchema, "tenants")+`
		WHERE COALESCE(collector_aws_account_id, '') <> '' AND COALESCE(collector_event_bridge_arn, '') <> ''`)
	if err != nil {
		return nil, fmt.Errorf("list collector accounts: %w", err)
	}
	defer rows.Close()
	var out [][2]string
	for rows.Next() {
		var p [2]string
		if err := rows.Scan(&p[0], &p[1]); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// FinishPendingRequest records how the checks ended for the latest click of an
// account that waited for approval: they run after the admin approves, long
// after the click's own request returned.
func (r *AWSIntegrationRepository) FinishPendingRequest(ctx context.Context, tenantID, accountID, outcome, detail string, checks []AWSCheck) error {
	db, err := r.pool()
	if err != nil {
		return err
	}
	raw, err := json.Marshal(nonNil(checks))
	if err != nil {
		return err
	}
	if len(detail) > 4000 {
		detail = detail[:4000]
	}
	t := database.Table(r.globalSchema, "connection_requests")
	_, err = db.ExecContext(ctx, `UPDATE `+t+`
		SET outcome = $3, outcome_detail = $4, checks = $5::jsonb, finished_at = now()
		WHERE id = (SELECT id FROM `+t+`
			WHERE tenant_id = $1::uuid AND client_aws_account_id = $2 AND outcome = 'pending_approval'
			ORDER BY id DESC LIMIT 1)`, tenantID, accountID, outcome, detail, raw)
	if err != nil {
		return fmt.Errorf("finish pending connection request: %w", err)
	}
	return nil
}
