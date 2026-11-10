package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"nhi-backend-api/internal/remediation/domain"
)

const planCols = `plan_id::text, tenant_id::text, batch_id::text, finding_ids::text[], rule_ids, identity_ids,
	action_type, platform, account_id, COALESCE(region,''), target_arn, target_type,
	params::text, before_state::text, after_state::text, diff::text, live_state_hash, steps::text,
	prechecks::text, usage_basis::text, risk_level, required_approvals,
	score_current::float8, score_gain::float8, score_projected::float8, fleet_gain::float8,
	mode, status, COALESCE(status_reason,''), plan_hash, superseded_by::text, valid_until,
	created_by, created_at, updated_at,
	policy_id::text, COALESCE(target_key,''), follow_up_of::text, COALESCE(scan_id,'')`

func scanPlan(row pgx.Row) (*domain.Plan, error) {
	var p domain.Plan
	var params, before, after, diff, steps, prechecks, usage, risk, mode, status string
	err := row.Scan(&p.ID, &p.TenantID, &p.BatchID, &p.FindingIDs, &p.RuleIDs, &p.IdentityIDs,
		&p.ActionType, &p.Platform, &p.AccountID, &p.Region, &p.TargetARN, &p.TargetType,
		&params, &before, &after, &diff, &p.LiveStateHash, &steps,
		&prechecks, &usage, &risk, &p.RequiredApprovals,
		&p.ScoreCurrent, &p.ScoreGain, &p.ScoreProjected, &p.FleetGain,
		&mode, &status, &p.StatusReason, &p.PlanHash, &p.SupersededBy, &p.ValidUntil,
		&p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
		&p.PolicyID, &p.TargetKey, &p.FollowUpOf, &p.ScanID)
	if err != nil {
		return nil, notFound(err)
	}
	p.Params, p.BeforeState, p.AfterState, p.Diff = rawFrom(params), rawFrom(before), rawFrom(after), rawFrom(diff)
	p.Steps, p.Prechecks, p.UsageBasis = rawFrom(steps), rawFrom(prechecks), rawFrom(usage)
	p.RiskLevel, p.Mode, p.Status = domain.Risk(risk), domain.Mode(mode), domain.PlanStatus(status)
	return &p, nil
}

// InsertPlan stores a new plan.
func (s *Store) InsertPlan(ctx context.Context, p *domain.Plan) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (plan_id, tenant_id, batch_id, finding_ids, rule_ids, identity_ids, action_type, platform,
			account_id, region, target_arn, target_type, params, before_state, after_state, diff, live_state_hash,
			steps, prechecks, usage_basis, risk_level, required_approvals, score_current, score_gain,
			score_projected, fleet_gain, mode, status, status_reason, plan_hash, valid_until, created_by)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text[]::uuid[], $5, $6, $7, $8, $9, NULLIF($10,''), $11, $12,
			$13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21, $22,
			$23, $24, $25, $26, $27, $28, NULLIF($29,''), $30, $31, $32)`, s.tbl("remediation_plans")),
		p.ID, p.TenantID, p.BatchID, nz(p.FindingIDs), nz(p.RuleIDs), nz(p.IdentityIDs), p.ActionType, p.Platform,
		p.AccountID, p.Region, p.TargetARN, p.TargetType,
		jsonOrEmpty(p.Params, "{}"), jsonOrEmpty(p.BeforeState, "{}"), jsonOrEmpty(p.AfterState, "{}"),
		jsonOrEmpty(p.Diff, "[]"), p.LiveStateHash, jsonOrEmpty(p.Steps, "[]"), jsonOrEmpty(p.Prechecks, "[]"),
		jsonOrEmpty(p.UsageBasis, "{}"), string(p.RiskLevel), p.RequiredApprovals,
		p.ScoreCurrent, p.ScoreGain, p.ScoreProjected, p.FleetGain, string(p.Mode), string(p.Status),
		p.StatusReason, p.PlanHash, p.ValidUntil, p.CreatedBy)
	return err
}

func nz(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func (s *Store) GetPlan(ctx context.Context, id string) (*domain.Plan, error) {
	return scanPlan(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND plan_id = $2::uuid`,
		planCols, s.tbl("remediation_plans")), s.TenantID, id))
}

type PlanFilter struct {
	Status    string
	Mode      string // GUIDED | ONE_CLICK
	AccountID string
	FindingID string
	BatchID   string
	TargetARN string
	Limit     int
	Offset    int
}

// PendingPlanFor returns the newest plan of any of the findings, created by the dashboard or by
// the engine's automatic remediation, that waits for approval or is about to run. It returns
// nil when there is none.
func (s *Store) PendingPlanFor(ctx context.Context, findingIDs []string) (*domain.Plan, error) {
	p, err := scanPlan(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid
		AND finding_ids && $2::text[]::uuid[] AND status IN ('PENDING_APPROVAL','APPROVED','SCHEDULED','EXECUTING')
		ORDER BY created_at DESC LIMIT 1`, planCols, s.tbl("remediation_plans")), s.TenantID, findingIDs))
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	return p, err
}

// planWhere is the WHERE clause of a plan filter (without LIMIT) and its arguments.
func (s *Store) planWhere(f PlanFilter) (string, []any) {
	where := " WHERE tenant_id = $1::uuid"
	args := []any{s.TenantID}
	add := func(cond string, v any) {
		args = append(args, v)
		where += fmt.Sprintf(" AND "+cond, len(args))
	}
	if f.Status != "" {
		add("status = $%d", f.Status)
	}
	if f.Mode != "" {
		add("mode = $%d", f.Mode)
	}
	if f.AccountID != "" {
		add("account_id = $%d", f.AccountID)
	}
	if f.FindingID != "" {
		add("finding_ids @> ARRAY[$%d::text]::uuid[]", f.FindingID)
	}
	if f.BatchID != "" {
		add("batch_id = $%d::uuid", f.BatchID)
	}
	if f.TargetARN != "" {
		add("target_arn = $%d", f.TargetARN)
	}
	return where, args
}

// CountPlans counts the plans that match the filter (Limit and Offset are ignored).
func (s *Store) CountPlans(ctx context.Context, f PlanFilter) (int, error) {
	where, args := s.planWhere(f)
	var n int
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s`, s.tbl("remediation_plans"))+where, args...).Scan(&n)
	return n, err
}

func (s *Store) ListPlans(ctx context.Context, f PlanFilter) ([]domain.Plan, error) {
	where, args := s.planWhere(f)
	q := fmt.Sprintf(`SELECT %s FROM %s`, planCols, s.tbl("remediation_plans")) + where
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	args = append(args, f.Limit, f.Offset)
	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Plan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// SetPlanStatus moves a plan to a new status when it is currently in one of `from`.
// Returns ErrConflict when the plan is in another state (lost race).
func (s *Store) SetPlanStatus(ctx context.Context, id string, to domain.PlanStatus, reason string, from ...domain.PlanStatus) error {
	fs := make([]string, len(from))
	for i, f := range from {
		fs[i] = string(f)
	}
	q := fmt.Sprintf(`UPDATE %s SET status = $3, status_reason = NULLIF($4,''), updated_at = now()
		WHERE tenant_id = $1::uuid AND plan_id = $2::uuid`, s.tbl("remediation_plans"))
	args := []any{s.TenantID, id, string(to), reason}
	if len(fs) > 0 {
		q += " AND status = ANY($5)"
		args = append(args, fs)
	}
	tag, err := s.pool.Exec(ctx, q, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrConflict
	}
	return nil
}

// SupersedePlans marks other open dashboard plans on the same target+action SUPERSEDED.
// Plans of the engine's automatic remediation (policy_id set) are never touched here.
func (s *Store) SupersedePlans(ctx context.Context, newID, targetARN, actionType string) ([]string, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		UPDATE %s SET status = 'SUPERSEDED', superseded_by = $4::uuid, status_reason = 'a newer plan was created', updated_at = now()
		WHERE tenant_id = $1::uuid AND target_arn = $2 AND action_type = $3 AND plan_id <> $4::uuid
		  AND status IN ('DRAFT','READY','WAITING_EXTERNAL','PENDING_APPROVAL','APPROVED')
		  AND policy_id IS NULL
		RETURNING plan_id::text`, s.tbl("remediation_plans")), s.TenantID, targetARN, actionType, newID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// UpdatePlanParams stores new params (external id) and status without re-planning.
func (s *Store) UpdatePlanParams(ctx context.Context, id string, params []byte, status domain.PlanStatus, reason string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET params = $3::jsonb, status = $4, status_reason = NULLIF($5,''), updated_at = now()
		WHERE tenant_id = $1::uuid AND plan_id = $2::uuid`, s.tbl("remediation_plans")), s.TenantID, id, string(params), string(status), reason)
	return err
}

// SetPlanValidUntil sets the approval expiry (set at submit).
func (s *Store) SetPlanValidUntil(ctx context.Context, id string, t time.Time) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET valid_until = $3, updated_at = now() WHERE tenant_id = $1::uuid AND plan_id = $2::uuid`,
		s.tbl("remediation_plans")), s.TenantID, id, t)
	return err
}

// ExpirePlans marks dashboard plans waiting for approval / execution past valid_until as EXPIRED.
func (s *Store) ExpirePlans(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		UPDATE %s SET status = 'EXPIRED', status_reason = 'approval expired', updated_at = now()
		WHERE tenant_id = $1::uuid AND policy_id IS NULL AND status IN ('PENDING_APPROVAL','APPROVED') AND valid_until IS NOT NULL AND valid_until < now()
		RETURNING plan_id::text`, s.tbl("remediation_plans")), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// PlansByStatus is used by the reconcile loop; plans of the engine's automatic remediation
// (policy_id set) are reconciled by the engine.
func (s *Store) PlansByStatus(ctx context.Context, statuses ...string) ([]domain.Plan, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND policy_id IS NULL AND status = ANY($2) ORDER BY updated_at LIMIT 200`,
		planCols, s.tbl("remediation_plans")), s.TenantID, statuses)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Plan
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// ---- approvals ----

func (s *Store) InsertApproval(ctx context.Context, a domain.Approval) error {
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (approval_id, plan_id, tenant_id, approver, approver_role, decision, comment, plan_hash)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, NULLIF($7,''), $8)
		ON CONFLICT (plan_id, approver, plan_hash) DO NOTHING`, s.tbl("remediation_approvals")),
		a.ID, a.PlanID, s.TenantID, a.Approver, a.ApproverRole, a.Decision, a.Comment, a.PlanHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrConflict
	}
	return nil
}

func (s *Store) ListApprovals(ctx context.Context, planID string) ([]domain.Approval, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT approval_id::text, plan_id::text, approver, approver_role, decision,
		COALESCE(comment,''), plan_hash, decided_at FROM %s WHERE tenant_id = $1::uuid AND plan_id = $2::uuid ORDER BY decided_at`,
		s.tbl("remediation_approvals")), s.TenantID, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Approval
	for rows.Next() {
		var a domain.Approval
		if err := rows.Scan(&a.ID, &a.PlanID, &a.Approver, &a.ApproverRole, &a.Decision, &a.Comment, &a.PlanHash, &a.DecidedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ---- batches ----

func (s *Store) InsertBatch(ctx context.Context, b domain.Batch) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (batch_id, tenant_id, mode, requested_by, plan_count, status)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`, s.tbl("remediation_batches")),
		b.ID, s.TenantID, string(b.Mode), b.RequestedBy, b.PlanCount, string(b.Status))
	return err
}

func (s *Store) GetBatch(ctx context.Context, id string) (*domain.Batch, error) {
	var b domain.Batch
	var mode, status string
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT batch_id::text, tenant_id::text, mode, requested_by, plan_count, status, created_at, completed_at
		FROM %s WHERE tenant_id = $1::uuid AND batch_id = $2::uuid`, s.tbl("remediation_batches")), s.TenantID, id).
		Scan(&b.ID, &b.TenantID, &mode, &b.RequestedBy, &b.PlanCount, &status, &b.CreatedAt, &b.CompletedAt)
	if err != nil {
		return nil, notFound(err)
	}
	b.Mode, b.Status = domain.BatchMode(mode), domain.BatchStatus(status)
	return &b, nil
}

func (s *Store) SetBatchStatus(ctx context.Context, id string, st domain.BatchStatus) error {
	final := st != domain.BatchRunning
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = $3,
		completed_at = CASE WHEN $4 THEN now() ELSE NULL END WHERE tenant_id = $1::uuid AND batch_id = $2::uuid`,
		s.tbl("remediation_batches")), s.TenantID, id, string(st), final)
	return err
}

func (s *Store) ListRunningBatches(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT batch_id::text FROM %s WHERE tenant_id = $1::uuid AND status = 'RUNNING'`,
		s.tbl("remediation_batches")), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
