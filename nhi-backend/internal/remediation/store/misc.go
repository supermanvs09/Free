package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"nhi-backend-api/internal/remediation/domain"
)

// ---- audit log ----

func (s *Store) Audit(ctx context.Context, planID, execID, batchID, event, actor string, details any) {
	_, _ = s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (tenant_id, plan_id, execution_id, batch_id, event, actor, details)
		VALUES ($1::uuid, NULLIF($2,'')::uuid, NULLIF($3,'')::uuid, NULLIF($4,'')::uuid, $5, $6, $7::jsonb)`, s.tbl("remediation_audit_log")),
		s.TenantID, planID, execID, batchID, event, actor, marshal(details, "{}"))
}

func (s *Store) ListAudit(ctx context.Context, planID string, limit int) ([]domain.AuditEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	q := fmt.Sprintf(`SELECT id, tenant_id::text, plan_id::text, execution_id::text, batch_id::text, event, actor, details::text, at
		FROM %s WHERE tenant_id = $1::uuid`, s.tbl("remediation_audit_log"))
	args := []any{s.TenantID}
	if planID != "" {
		q += " AND plan_id = $2::uuid"
		args = append(args, planID)
	}
	q += fmt.Sprintf(" ORDER BY id DESC LIMIT %d", limit)
	return s.queryAudit(ctx, q, args...)
}

// AuditAfter returns plan events after a cursor, oldest first (Jira comments).
func (s *Store) AuditAfter(ctx context.Context, after int64, limit int) ([]domain.AuditEvent, error) {
	return s.queryAudit(ctx, fmt.Sprintf(`SELECT id, tenant_id::text, plan_id::text, execution_id::text, batch_id::text, event, actor, details::text, at
		FROM %s WHERE tenant_id = $1::uuid AND id > $2 AND plan_id IS NOT NULL ORDER BY id LIMIT %d`, s.tbl("remediation_audit_log"), limit),
		s.TenantID, after)
}

func (s *Store) queryAudit(ctx context.Context, q string, args ...any) ([]domain.AuditEvent, error) {
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		var d string
		if err := rows.Scan(&e.ID, &e.TenantID, &e.PlanID, &e.ExecutionID, &e.BatchID, &e.Event, &e.Actor, &d, &e.At); err != nil {
			return nil, err
		}
		e.Details = rawFrom(d)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---- accounts ----

const acctCols = `tenant_id::text, account_id, remediation_enabled, COALESCE(remediation_role_arn,''), COALESCE(remediation_external_id,''),
	allowed_action_types, enabled_regions, approval_policy::text, grace_days::text, access_status, COALESCE(access_detail,''),
	access_checked_at, COALESCE(enabled_by,''), enabled_at, updated_at`

func scanAccount(row pgx.Row) (*domain.Account, error) {
	var a domain.Account
	var ap, gd string
	err := row.Scan(&a.TenantID, &a.AccountID, &a.Enabled, &a.RoleARN, &a.ExternalID, &a.AllowedActionTypes, &a.EnabledRegions,
		&ap, &gd, &a.AccessStatus, &a.AccessDetail, &a.AccessCheckedAt, &a.EnabledBy, &a.EnabledAt, &a.UpdatedAt)
	if err != nil {
		return nil, notFound(err)
	}
	a.ApprovalPolicy, a.GraceDays = rawFrom(ap), rawFrom(gd)
	a.HasExternalID = a.ExternalID != ""
	return &a, nil
}

func (s *Store) GetAccount(ctx context.Context, accountID string) (*domain.Account, error) {
	return scanAccount(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND account_id = $2`,
		acctCols, s.tbl("remediation_accounts")), s.TenantID, accountID))
}

func (s *Store) ListAccounts(ctx context.Context) ([]domain.Account, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid ORDER BY account_id`, acctCols, s.tbl("remediation_accounts")), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Account
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func (s *Store) UpsertAccount(ctx context.Context, a *domain.Account, actor string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (tenant_id, account_id, remediation_enabled, remediation_role_arn, remediation_external_id,
			allowed_action_types, enabled_regions, approval_policy, grace_days, enabled_by, enabled_at)
		VALUES ($1::uuid, $2, $3, NULLIF($4,''), NULLIF($5,''), $6, $7, $8::jsonb, $9::jsonb, $10, CASE WHEN $3 THEN now() END)
		ON CONFLICT (tenant_id, account_id) DO UPDATE SET
			remediation_enabled = EXCLUDED.remediation_enabled,
			remediation_role_arn = EXCLUDED.remediation_role_arn,
			remediation_external_id = COALESCE(EXCLUDED.remediation_external_id, %[1]s.remediation_external_id),
			allowed_action_types = EXCLUDED.allowed_action_types, enabled_regions = EXCLUDED.enabled_regions,
			approval_policy = EXCLUDED.approval_policy, grace_days = EXCLUDED.grace_days,
			enabled_by = CASE WHEN EXCLUDED.remediation_enabled AND NOT %[1]s.remediation_enabled THEN EXCLUDED.enabled_by ELSE %[1]s.enabled_by END,
			enabled_at = CASE WHEN EXCLUDED.remediation_enabled AND NOT %[1]s.remediation_enabled THEN now() ELSE %[1]s.enabled_at END,
			updated_at = now()`, s.tbl("remediation_accounts")),
		s.TenantID, a.AccountID, a.Enabled, a.RoleARN, a.ExternalID, nz(a.AllowedActionTypes), nz(a.EnabledRegions),
		jsonOrEmpty(a.ApprovalPolicy, `{"low":1,"medium":1,"high":1}`), jsonOrEmpty(a.GraceDays, "{}"), actor)
	return err
}

func (s *Store) SetAccessStatus(ctx context.Context, accountID, status, detail string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET access_status = $3, access_detail = NULLIF($4,''), access_checked_at = now()
		WHERE tenant_id = $1::uuid AND account_id = $2`, s.tbl("remediation_accounts")), s.TenantID, accountID, status, detail)
	return err
}

// ---- catalog ----

const actionCols = `action_type, remediation_group, platform, title, description, risk_level, reversible, one_click_supported,
	default_grace_days, required_permissions, steps_template::text, enabled`

func scanAction(row pgx.Row) (*domain.Action, error) {
	var a domain.Action
	var risk, steps string
	err := row.Scan(&a.ActionType, &a.Group, &a.Platform, &a.Title, &a.Description, &risk, &a.Reversible, &a.OneClickSupported,
		&a.DefaultGraceDays, &a.RequiredPermissions, &steps, &a.Enabled)
	if err != nil {
		return nil, notFound(err)
	}
	a.RiskLevel, a.StepsTemplate = domain.Risk(risk), rawFrom(steps)
	return &a, nil
}

func (s *Store) GetAction(ctx context.Context, actionType string) (*domain.Action, error) {
	return scanAction(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE action_type = $1`, actionCols, s.tbl("remediation_actions")), actionType))
}

func (s *Store) ListActions(ctx context.Context) ([]domain.Action, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s ORDER BY remediation_group, action_type`, actionCols, s.tbl("remediation_actions")))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Action
	for rows.Next() {
		a, err := scanAction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// SeedAction inserts a default catalog row; an existing (possibly edited) row is kept.
func (s *Store) SeedAction(ctx context.Context, a domain.Action) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (action_type, remediation_group, platform, title, description, risk_level,
		reversible, one_click_supported, default_grace_days, required_permissions, steps_template, enabled)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT (action_type) DO NOTHING`, s.tbl("remediation_actions")),
		a.ActionType, a.Group, a.Platform, a.Title, a.Description, string(a.RiskLevel), a.Reversible, a.OneClickSupported,
		a.DefaultGraceDays, nz(a.RequiredPermissions), jsonOrEmpty(a.StepsTemplate, "[]"), a.Enabled)
	return err
}

func (s *Store) SeedRuleAction(ctx context.Context, r domain.RuleAction) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (rule_id, action_type, is_default, params_template)
		VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (rule_id, action_type) DO NOTHING`, s.tbl("remediation_rule_actions")),
		r.RuleID, r.ActionType, r.IsDefault, jsonOrEmpty(r.ParamsTemplate, "{}"))
	return err
}

func (s *Store) RuleActions(ctx context.Context, ruleID string) ([]domain.RuleAction, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT ra.rule_id, ra.action_type, ra.is_default, ra.params_template::text
		FROM %s ra JOIN %s a USING (action_type) WHERE ra.rule_id = $1 AND a.enabled ORDER BY ra.is_default DESC, ra.action_type`,
		s.tbl("remediation_rule_actions"), s.tbl("remediation_actions")), ruleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.RuleAction
	for rows.Next() {
		var r domain.RuleAction
		var p string
		if err := rows.Scan(&r.RuleID, &r.ActionType, &r.IsDefault, &p); err != nil {
			return nil, err
		}
		r.ParamsTemplate = rawFrom(p)
		out = append(out, r)
	}
	return out, rows.Err()
}

// ---- integrations / tickets / notifications ----

const integCols = `integration_id::text, tenant_id::text, type, enabled, config::text, COALESCE(secret_ref,''), cursor_at,
	COALESCE(cursor_id,''), audit_cursor, last_sync_at, COALESCE(last_error,'')`

func scanInteg(row pgx.Row) (*domain.Integration, error) {
	var i domain.Integration
	var cfg string
	err := row.Scan(&i.ID, &i.TenantID, &i.Type, &i.Enabled, &cfg, &i.SecretRef, &i.CursorAt, &i.CursorID, &i.AuditCursor, &i.LastSyncAt, &i.LastError)
	if err != nil {
		return nil, notFound(err)
	}
	i.Config = rawFrom(cfg)
	return &i, nil
}

// GetIntegration returns the tenant's settings for a type. A tenant without its own row
// uses the .env defaults (a from_env row is created to hold its cursors).
func (s *Store) GetIntegration(ctx context.Context, typ string) (*domain.Integration, error) {
	i, err := s.getIntegrationRow(ctx, typ)
	if isNotFound(err) {
		if e := s.ensureEnvRow(ctx, typ); e != nil {
			return nil, err
		}
		i, err = s.getIntegrationRow(ctx, typ)
	}
	if err != nil {
		return nil, err
	}
	overlayEnv(i)
	return i, nil
}

func (s *Store) getIntegrationRow(ctx context.Context, typ string) (*domain.Integration, error) {
	return scanInteg(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND type = $2`,
		integCols, s.tbl("remediation_integrations")), s.TenantID, typ))
}

// ListIntegrations returns the tenant's integrations, .env defaults included.
func (s *Store) ListIntegrations(ctx context.Context) ([]domain.Integration, error) {
	for _, t := range EnvIntegrationTypes() {
		if err := s.ensureEnvRow(ctx, t); err != nil {
			return nil, err
		}
	}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid ORDER BY type`, integCols, s.tbl("remediation_integrations")), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Integration
	for rows.Next() {
		i, err := scanInteg(rows)
		if err != nil {
			return nil, err
		}
		overlayEnv(i)
		out = append(out, *i)
	}
	return out, rows.Err()
}

func (s *Store) UpsertIntegration(ctx context.Context, i *domain.Integration) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (integration_id, tenant_id, type, enabled, config, secret_ref)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, NULLIF($6,''))
		ON CONFLICT (tenant_id, type) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, secret_ref = EXCLUDED.secret_ref`,
		s.tbl("remediation_integrations")), i.ID, s.TenantID, i.Type, i.Enabled, jsonOrEmpty(i.Config, "{}"), i.SecretRef)
	return err
}

func (s *Store) SaveJiraCursor(ctx context.Context, id string, at *time.Time, histID string, auditCursor int64, syncErr string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET cursor_at = $2, cursor_id = NULLIF($3,''), audit_cursor = $4,
		last_sync_at = now(), last_error = NULLIF($5,'') WHERE integration_id = $1::uuid`, s.tbl("remediation_integrations")),
		id, at, histID, auditCursor, syncErr)
	return err
}

func (s *Store) SetIntegrationError(ctx context.Context, id, msg string) {
	_, _ = s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET last_error = NULLIF($2,''), last_sync_at = now() WHERE integration_id = $1::uuid`,
		s.tbl("remediation_integrations")), id, msg)
}

func (s *Store) GetTicket(ctx context.Context, findingID string) (*domain.TicketLink, error) {
	var t domain.TicketLink
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT finding_id::text, tenant_id::text, integration_id::text, external_key,
		COALESCE(external_id,''), COALESCE(url,''), ticket_state FROM %s WHERE finding_id = $1::uuid`, s.tbl("remediation_ticket_links")), findingID).
		Scan(&t.FindingID, &t.TenantID, &t.IntegID, &t.ExternalKey, &t.ExternalID, &t.URL, &t.State)
	if err != nil {
		return nil, notFound(err)
	}
	return &t, nil
}

func (s *Store) InsertTicket(ctx context.Context, t domain.TicketLink, event string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (finding_id, tenant_id, integration_id, external_key, external_id, url, last_event, last_synced_at)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, NULLIF($5,''), NULLIF($6,''), $7, now()) ON CONFLICT (finding_id) DO NOTHING`,
		s.tbl("remediation_ticket_links")), t.FindingID, s.TenantID, t.IntegID, t.ExternalKey, t.ExternalID, t.URL, event)
	return err
}

func (s *Store) SetTicketState(ctx context.Context, findingID, state, event, errMsg string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET ticket_state = $2, last_event = $3, last_synced_at = now(), last_error = NULLIF($4,'')
		WHERE finding_id = $1::uuid`, s.tbl("remediation_ticket_links")), findingID, state, event, errMsg)
	return err
}

// TicketsToCheck returns tickets we believe are open while their finding is open: the ticket
// may have been closed by hand in Jira. Oldest check first, at most hourly per ticket.
func (s *Store) TicketsToCheck(ctx context.Context, limit int) ([]domain.TicketLink, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT t.finding_id::text, t.tenant_id::text, t.integration_id::text, t.external_key,
		COALESCE(t.external_id,''), COALESCE(t.url,''), t.ticket_state
		FROM %s t JOIN %s f ON f.finding_id = t.finding_id
		WHERE t.tenant_id = $1::uuid AND t.ticket_state = 'OPEN' AND f.status = 'OPEN'
		  AND (t.last_checked_at IS NULL OR t.last_checked_at < now() - interval '1 hour')
		ORDER BY t.last_checked_at NULLS FIRST LIMIT $2`, s.tbl("remediation_ticket_links"), s.tbl("ispm_nhi_findings")), s.TenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TicketLink
	for rows.Next() {
		var t domain.TicketLink
		if err := rows.Scan(&t.FindingID, &t.TenantID, &t.IntegID, &t.ExternalKey, &t.ExternalID, &t.URL, &t.State); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// OpenTicketsForPlan returns the tickets of the findings a plan fixes.
func (s *Store) TicketsForFindings(ctx context.Context, ids []string) ([]domain.TicketLink, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT finding_id::text, tenant_id::text, integration_id::text, external_key,
		COALESCE(external_id,''), COALESCE(url,''), ticket_state FROM %s WHERE tenant_id = $1::uuid AND finding_id = ANY($2::text[]::uuid[])`,
		s.tbl("remediation_ticket_links")), s.TenantID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TicketLink
	for rows.Next() {
		var t domain.TicketLink
		if err := rows.Scan(&t.FindingID, &t.TenantID, &t.IntegID, &t.ExternalKey, &t.ExternalID, &t.URL, &t.State); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) MarkTicketChecked(ctx context.Context, findingID string) {
	_, _ = s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET last_checked_at = now() WHERE finding_id = $1::uuid`, s.tbl("remediation_ticket_links")), findingID)
}

func (s *Store) EnqueueNotification(ctx context.Context, n domain.Notification) error {
	if len(n.Recipients) == 0 {
		return nil
	}
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (tenant_id, type, plan_id, recipients, subject, body_html, body_text)
		VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)`, s.tbl("remediation_notifications")),
		s.TenantID, n.Type, n.PlanID, n.Recipients, n.Subject, n.BodyHTML, n.BodyText)
	return err
}

// ClaimNotification returns one due outbox row and pushes its next attempt out
// so concurrent workers do not send it twice.
func (s *Store) ClaimNotification(ctx context.Context) (*domain.Notification, error) {
	var n domain.Notification
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`
		WITH c AS (SELECT id FROM %[1]s WHERE tenant_id = $1::uuid AND status = 'PENDING' AND next_attempt_at <= now()
			ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
		UPDATE %[1]s n SET attempts = n.attempts + 1, next_attempt_at = now() + interval '5 minutes'
		FROM c WHERE n.id = c.id
		RETURNING n.id, n.tenant_id::text, n.type, n.plan_id::text, n.recipients, n.subject, n.body_html, n.body_text, n.attempts`,
		s.tbl("remediation_notifications")), s.TenantID).
		Scan(&n.ID, &n.TenantID, &n.Type, &n.PlanID, &n.Recipients, &n.Subject, &n.BodyHTML, &n.BodyText, &n.Attempts)
	if err != nil {
		return nil, notFound(err)
	}
	return &n, nil
}

func (s *Store) NotificationSent(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = 'SENT', sent_at = now(), last_error = NULL WHERE id = $1`, s.tbl("remediation_notifications")), id)
	return err
}

// NotificationFailed records the error; after maxAttempts the row is FAILED, else retried with back-off.
func (s *Store) NotificationFailed(ctx context.Context, id int64, attempts, maxAttempts int, msg string) error {
	if attempts >= maxAttempts {
		_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = 'FAILED', last_error = $2 WHERE id = $1`, s.tbl("remediation_notifications")), id, msg)
		return err
	}
	backoff := time.Duration(1<<uint(attempts)) * time.Minute
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET last_error = $2, next_attempt_at = now() + $3::interval WHERE id = $1`,
		s.tbl("remediation_notifications")), id, msg, fmt.Sprintf("%d seconds", int(backoff.Seconds())))
	return err
}

func (s *Store) LastDigestAt(ctx context.Context) (*time.Time, error) {
	var t *time.Time
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT max(created_at) FROM %s WHERE tenant_id = $1::uuid AND type = 'DIGEST'`,
		s.tbl("remediation_notifications")), s.TenantID).Scan(&t)
	return t, err
}

// ---- engine (read only): findings, scores, history ----

func (s *Store) GetFindings(ctx context.Context, ids []string) ([]domain.Finding, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT finding_id::text, tenant_id::text, COALESCE(account_id,''), rule_id, COALESCE(rule_name,''),
		severity, COALESCE(identity_id,''), COALESCE(identity_name,''), COALESCE(identity_type,''), COALESCE(credential_arn,''),
		COALESCE(title,''), COALESCE(description,''), evidence::text, COALESCE(remediation,''), status, first_seen
		FROM %s WHERE tenant_id = $1::uuid AND finding_id = ANY($2::text[]::uuid[])`, s.tbl("ispm_nhi_findings")), s.TenantID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Finding
	for rows.Next() {
		var f domain.Finding
		var ev string
		if err := rows.Scan(&f.ID, &f.TenantID, &f.AccountID, &f.RuleID, &f.RuleName, &f.Severity, &f.IdentityID, &f.IdentityName,
			&f.IdentityType, &f.CredentialARN, &f.Title, &f.Description, &ev, &f.Remediation, &f.Status, &f.FirstSeen); err != nil {
			return nil, err
		}
		f.Evidence = rawFrom(ev)
		out = append(out, f)
	}
	return out, rows.Err()
}

// FindingStatuses returns finding_id -> status.
func (s *Store) FindingStatuses(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT finding_id::text, status FROM %s WHERE tenant_id = $1::uuid AND finding_id = ANY($2::text[]::uuid[])`,
		s.tbl("ispm_nhi_findings")), s.TenantID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var id, st string
		if err := rows.Scan(&id, &st); err != nil {
			return nil, err
		}
		m[id] = st
	}
	return m, rows.Err()
}

type CheckLoss struct {
	IdentityID string
	RuleID     string
	PointsLost int
}

// FailedChecks returns the failing checks tied to the findings.
func (s *Store) FailedChecks(ctx context.Context, findingIDs []string) ([]CheckLoss, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT identity_id, rule_id, points_lost FROM %s
		WHERE tenant_id = $1::uuid AND status = 'FAIL' AND finding_id = ANY($2::text[]::uuid[])`, s.tbl("ispm_identity_checks")), s.TenantID, findingIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CheckLoss
	for rows.Next() {
		var c CheckLoss
		if err := rows.Scan(&c.IdentityID, &c.RuleID, &c.PointsLost); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// PostureScores returns identity_id -> score and the number of scored identities.
func (s *Store) PostureScores(ctx context.Context, identityIDs []string) (map[string]float64, int, error) {
	m := map[string]float64{}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT identity_id, score::float8 FROM %s WHERE tenant_id = $1::uuid AND identity_id = ANY($2)`,
		s.tbl("ispm_identity_posture")), s.TenantID, identityIDs)
	if err != nil {
		return nil, 0, err
	}
	for rows.Next() {
		var id string
		var sc float64
		if err := rows.Scan(&id, &sc); err != nil {
			rows.Close()
			return nil, 0, err
		}
		m[id] = sc
	}
	rows.Close()
	var n int
	err = s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s WHERE tenant_id = $1::uuid`, s.tbl("ispm_identity_posture")), s.TenantID).Scan(&n)
	return m, n, err
}

type Workload struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	ARN  string `json:"arn"`
}

// Workloads returns the scanner identities that use a role / credential ARN
// (read only; matches the ARN anywhere in type_attributes, like the engine's ARN linking).
func (s *Store) Workloads(ctx context.Context, arn string) ([]Workload, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT id::text, COALESCE(name::text,''), COALESCE(identity_type::text,''), COALESCE(arn::text,'')
		FROM %s WHERE deleted_at IS NULL AND (arn::text = $1 OR parent_arn::text = $1 OR type_attributes::text LIKE '%%' || $1 || '%%') LIMIT 50`,
		s.srcTbl("identities")), arn)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Workload
	for rows.Next() {
		var w Workload
		if err := rows.Scan(&w.ID, &w.Name, &w.Type, &w.ARN); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

type HistoryEvent struct {
	ID        string
	FindingID string
	Action    string
	NewValue  string
	Reason    string
	CreatedAt time.Time
	Severity  string
	RuleID    string
	Title     string
	Identity  string
	AccountID string
	Status    string
}

// HistoryAfter reads engine finding-history rows after the cursor (oldest first).
func (s *Store) HistoryAfter(ctx context.Context, at *time.Time, id string, limit int) ([]HistoryEvent, error) {
	q := fmt.Sprintf(`SELECT h.id::text, h.finding_id::text, h.action, COALESCE(h.new_value,''), COALESCE(h.reason,''), h.created_at,
		f.severity, f.rule_id, COALESCE(f.title,''), COALESCE(f.identity_name,''), COALESCE(f.account_id,''), f.status
		FROM %s h JOIN %s f ON f.finding_id = h.finding_id WHERE f.tenant_id = $1::uuid`, s.tbl("ispm_finding_history"), s.tbl("ispm_nhi_findings"))
	args := []any{s.TenantID}
	if at != nil {
		q += " AND (h.created_at, h.id::text) > ($2, $3)"
		args = append(args, *at, id)
	}
	q += fmt.Sprintf(" ORDER BY h.created_at, h.id::text LIMIT %d", limit)
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HistoryEvent
	for rows.Next() {
		var h HistoryEvent
		if err := rows.Scan(&h.ID, &h.FindingID, &h.Action, &h.NewValue, &h.Reason, &h.CreatedAt, &h.Severity, &h.RuleID, &h.Title, &h.Identity, &h.AccountID, &h.Status); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// NewCriticalFindings lists Critical findings first seen since `since` (daily digest).
func (s *Store) NewCriticalFindings(ctx context.Context, since time.Time) ([]domain.Finding, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT finding_id::text, rule_id, COALESCE(title,''), COALESCE(identity_name,''), COALESCE(account_id,'')
		FROM %s WHERE tenant_id = $1::uuid AND severity = 'Critical' AND status = 'OPEN' AND first_seen >= $2 ORDER BY first_seen LIMIT 100`,
		s.tbl("ispm_nhi_findings")), s.TenantID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Finding
	for rows.Next() {
		var f domain.Finding
		if err := rows.Scan(&f.ID, &f.RuleID, &f.Title, &f.IdentityName, &f.AccountID); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
