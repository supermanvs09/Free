package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"nhi-backend-api/internal/remediation/domain"
)

const execCols = `execution_id::text, plan_id::text, tenant_id::text, kind, rollback_of::text, attempt, triggered_by,
	status, scheduled_for, started_at, completed_at, COALESCE(assumed_role_arn,''), COALESCE(session_name,''),
	steps::text, rollback_state::text, result::text, verify_result::text, COALESCE(error_code,''),
	COALESCE(error_message,''), COALESCE(rescan_job_id,''), grace_notified, created_at`

func scanExec(row pgx.Row) (*domain.Execution, error) {
	var e domain.Execution
	var kind, status, steps, rb, result, verify string
	err := row.Scan(&e.ID, &e.PlanID, &e.TenantID, &kind, &e.RollbackOf, &e.Attempt, &e.TriggeredBy,
		&status, &e.ScheduledFor, &e.StartedAt, &e.CompletedAt, &e.AssumedRoleARN, &e.SessionName,
		&steps, &rb, &result, &verify, &e.ErrorCode, &e.ErrorMessage, &e.RescanJobID, &e.GraceNotified, &e.CreatedAt)
	if err != nil {
		return nil, notFound(err)
	}
	e.Kind, e.Status = domain.ExecKind(kind), domain.ExecStatus(status)
	e.Steps, e.RollbackState, e.Result, e.VerifyResult = rawFrom(steps), rawFrom(rb), rawFrom(result), rawFrom(verify)
	return &e, nil
}

func (s *Store) InsertExecution(ctx context.Context, e *domain.Execution) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s (execution_id, plan_id, tenant_id, kind, rollback_of, triggered_by, status, scheduled_for, rollback_state)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, $8, $9::jsonb)`, s.tbl("remediation_executions")),
		e.ID, e.PlanID, s.TenantID, string(e.Kind), e.RollbackOf, e.TriggeredBy, string(e.Status), e.ScheduledFor,
		jsonOrEmpty(e.RollbackState, "{}"))
	return err
}

func (s *Store) GetExecution(ctx context.Context, id string) (*domain.Execution, error) {
	return scanExec(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND execution_id = $2::uuid`,
		execCols, s.tbl("remediation_executions")), s.TenantID, id))
}

func (s *Store) ListExecutions(ctx context.Context, planID string) ([]domain.Execution, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND plan_id = $2::uuid ORDER BY created_at DESC`,
		execCols, s.tbl("remediation_executions")), s.TenantID, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Execution
	for rows.Next() {
		e, err := scanExec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// dashboardExec is a condition on remediation_executions: the execution belongs to a dashboard
// plan (policy_id NULL). Plans of the engine's automatic remediation are run, verified and rolled
// back by the engine, so no background job of this service may touch their executions.
func (s *Store) dashboardExec() string {
	return fmt.Sprintf(`NOT EXISTS (SELECT 1 FROM %s dp WHERE dp.plan_id = %s.plan_id AND dp.policy_id IS NOT NULL)`,
		s.tbl("remediation_plans"), s.tbl("remediation_executions"))
}

// QueuedByDashboard is the details.queued_by value on the EXECUTION_QUEUED audit row of a
// ROLLBACK queued by this service (POST /plans/{id}/rollback).
const QueuedByDashboard = "dashboard"

// dashboardRollback is a condition on remediation_executions: a ROLLBACK queued by this service
// (audit row EXECUTION_QUEUED with details.queued_by = dashboard). It lets the worker run the
// rollback of a plan of the engine's automatic remediation; the engine's own executions are
// never claimed here.
func (s *Store) dashboardRollback() string {
	t := s.tbl("remediation_executions")
	return fmt.Sprintf(`(%s.kind = 'ROLLBACK' AND EXISTS (SELECT 1 FROM %s qa WHERE qa.tenant_id = %s.tenant_id
		AND qa.execution_id = %s.execution_id AND qa.event = '%s' AND qa.details->>'queued_by' = '%s'))`,
		t, s.tbl("remediation_audit_log"), t, t, domain.EvExecQueued, QueuedByDashboard)
}

// RollbackTargetExecution returns the newest succeeded EXECUTE execution of a plan: the one a
// rollback replays. It is linked by plan_id on remediation_executions, or through the
// execution_id the plan's rows in remediation_audit_log carry (plans of the engine's automatic
// remediation record their plan_id there).
func (s *Store) RollbackTargetExecution(ctx context.Context, planID string) (*domain.Execution, error) {
	return scanExec(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s
		WHERE tenant_id = $1::uuid AND kind = 'EXECUTE' AND status = 'SUCCEEDED'
		  AND (plan_id = $2::uuid OR execution_id IN (SELECT a.execution_id FROM %s a
		       WHERE a.tenant_id = $1::uuid AND a.plan_id = $2::uuid AND a.execution_id IS NOT NULL))
		ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT 1`,
		execCols, s.tbl("remediation_executions"), s.tbl("remediation_audit_log")), s.TenantID, planID))
}

// ClaimExecution takes the oldest due QUEUED execution of a dashboard plan of this tenant (or
// one whose lease expired while RUNNING) with FOR UPDATE SKIP LOCKED, and leases it.
// Executions of the engine's automatic plans (policy_id set) are claimed by the engine, except
// a ROLLBACK queued by this service (dashboardRollback).
func (s *Store) ClaimExecution(ctx context.Context, worker string, lease time.Duration) (*domain.Execution, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var id string
	err = tx.QueryRow(ctx, fmt.Sprintf(`
		SELECT execution_id::text FROM %s
		WHERE tenant_id = $1::uuid
		  AND ((status = 'QUEUED' AND scheduled_for <= now())
		    OR (status = 'RUNNING' AND locked_until < now() AND kind <> 'EXECUTE'))
		  AND (%s OR %s)
		ORDER BY scheduled_for LIMIT 1 FOR UPDATE SKIP LOCKED`, s.tbl("remediation_executions"), s.dashboardExec(), s.dashboardRollback()), s.TenantID).Scan(&id)
	if err != nil {
		return nil, notFound(err)
	}
	_, err = tx.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = 'RUNNING', attempt = attempt + 1,
		started_at = COALESCE(started_at, now()), locked_by = $2, locked_until = now() + $3::interval
		WHERE execution_id = $1::uuid`, s.tbl("remediation_executions")), id, worker, fmt.Sprintf("%d seconds", int(lease.Seconds())))
	if err != nil {
		return nil, err
	}
	e, err := scanExec(tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE execution_id = $1::uuid`, execCols, s.tbl("remediation_executions")), id))
	if err != nil {
		return nil, err
	}
	return e, tx.Commit(ctx)
}

// StaleExecutions returns EXECUTE executions whose worker died mid-run. They
// are NOT retried automatically (a partial apply needs a fresh live-state read):
// the engine fails them and asks for a new plan.
func (s *Store) StaleExecutions(ctx context.Context) ([]domain.Execution, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND status = 'RUNNING'
		AND kind = 'EXECUTE' AND locked_until < now() AND %s`, execCols, s.tbl("remediation_executions"), s.dashboardExec()), s.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Execution
	for rows.Next() {
		e, err := scanExec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// Reschedule puts a leased execution back in the queue (target locked, not ready).
func (s *Store) Reschedule(ctx context.Context, id string, delay time.Duration, attemptBack bool) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = 'QUEUED', locked_by = NULL, locked_until = NULL,
		scheduled_for = now() + $2::interval, attempt = GREATEST(attempt - $3, 0) WHERE execution_id = $1::uuid`,
		s.tbl("remediation_executions")), id, fmt.Sprintf("%d seconds", int(delay.Seconds())), boolInt(attemptBack))
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// FinishExecution writes the outcome of a run.
func (s *Store) FinishExecution(ctx context.Context, e *domain.Execution) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = $2, completed_at = now(), assumed_role_arn = NULLIF($3,''),
		session_name = NULLIF($4,''), steps = $5::jsonb, rollback_state = $6::jsonb, result = $7::jsonb, verify_result = $8::jsonb,
		error_code = NULLIF($9,''), error_message = NULLIF($10,''), locked_by = NULL, locked_until = NULL
		WHERE execution_id = $1::uuid`, s.tbl("remediation_executions")),
		e.ID, string(e.Status), e.AssumedRoleARN, e.SessionName, jsonOrEmpty(e.Steps, "[]"),
		jsonOrEmpty(e.RollbackState, "{}"), jsonOrEmpty(e.Result, "{}"), jsonOrEmpty(e.VerifyResult, "{}"),
		e.ErrorCode, e.ErrorMessage)
	return err
}

func (s *Store) SetExecutionRescan(ctx context.Context, id, job string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET rescan_job_id = $2 WHERE execution_id = $1::uuid`, s.tbl("remediation_executions")), id, job)
	return err
}

// CancelQueued cancels QUEUED executions of a plan (grace period cancel).
func (s *Store) CancelQueued(ctx context.Context, planID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = 'CANCELLED', completed_at = now()
		WHERE tenant_id = $1::uuid AND plan_id = $2::uuid AND status = 'QUEUED'`, s.tbl("remediation_executions")), s.TenantID, planID)
	return tag.RowsAffected(), err
}

// ActiveExecution returns a QUEUED / RUNNING execution of the plan, if any.
func (s *Store) ActiveExecution(ctx context.Context, planID string) (*domain.Execution, error) {
	return scanExec(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND plan_id = $2::uuid
		AND status IN ('QUEUED','RUNNING') ORDER BY created_at DESC LIMIT 1`, execCols, s.tbl("remediation_executions")), s.TenantID, planID))
}

// LastExecutionOfKind returns the newest execution of a kind / status for a plan.
func (s *Store) LastExecutionOfKind(ctx context.Context, planID string, kind domain.ExecKind, status domain.ExecStatus) (*domain.Execution, error) {
	return scanExec(s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND plan_id = $2::uuid
		AND kind = $3 AND status = $4 ORDER BY created_at DESC LIMIT 1`, execCols, s.tbl("remediation_executions")),
		s.TenantID, planID, string(kind), string(status)))
}

// GraceEnding returns QUEUED executions that start within `within` and were not announced yet.
func (s *Store) GraceEnding(ctx context.Context, within time.Duration) ([]domain.Execution, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE tenant_id = $1::uuid AND status = 'QUEUED' AND kind = 'EXECUTE'
		AND grace_notified = false AND scheduled_for > now() AND scheduled_for <= now() + $2::interval AND %s`,
		execCols, s.tbl("remediation_executions"), s.dashboardExec()), s.TenantID, fmt.Sprintf("%d seconds", int(within.Seconds())))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Execution
	for rows.Next() {
		e, err := scanExec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *Store) MarkGraceNotified(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET grace_notified = true WHERE execution_id = $1::uuid`, s.tbl("remediation_executions")), id)
	return err
}

// AwaitingCutover lists plans whose rotate_access_key execution succeeded and
// whose FINALIZE did not run yet.
func (s *Store) AwaitingCutover(ctx context.Context) ([]domain.Plan, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s p WHERE p.tenant_id = $1::uuid AND p.status = 'EXECUTED' AND p.policy_id IS NULL
		AND p.action_type = 'rotate_access_key'
		AND NOT EXISTS (SELECT 1 FROM %s e WHERE e.plan_id = p.plan_id AND e.kind = 'FINALIZE' AND e.status IN ('QUEUED','RUNNING'))`,
		planColsP, s.tbl("remediation_plans"), s.tbl("remediation_executions")), s.TenantID)
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

// planColsP is planCols with every column prefixed by the alias p.
const planColsP = `p.plan_id::text, p.tenant_id::text, p.batch_id::text, p.finding_ids::text[], p.rule_ids, p.identity_ids,
	p.action_type, p.platform, p.account_id, COALESCE(p.region,''), p.target_arn, p.target_type,
	p.params::text, p.before_state::text, p.after_state::text, p.diff::text, p.live_state_hash, p.steps::text,
	p.prechecks::text, p.usage_basis::text, p.risk_level, p.required_approvals,
	p.score_current::float8, p.score_gain::float8, p.score_projected::float8, p.fleet_gain::float8,
	p.mode, p.status, COALESCE(p.status_reason,''), p.plan_hash, p.superseded_by::text, p.valid_until,
	p.created_by, p.created_at, p.updated_at,
	p.policy_id::text, COALESCE(p.target_key,''), p.follow_up_of::text, COALESCE(p.scan_id,'')`

// SetExecutionStatus changes only the status (the original execution after a rollback).
func (s *Store) SetExecutionStatus(ctx context.Context, id string, status domain.ExecStatus) error {
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET status = $2 WHERE execution_id = $1::uuid`, s.tbl("remediation_executions")), id, string(status))
	return err
}
