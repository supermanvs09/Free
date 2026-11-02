package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
	"nhi-backend-api/internal/remediation/store"
)

// WorkerID identifies this process in execution leases.
func WorkerID() string {
	h, _ := os.Hostname()
	return fmt.Sprintf("%s-%d", h, os.Getpid())
}

// Claim leases one due execution of the tenant (nil when the queue is empty).
func (s *Service) Claim(ctx context.Context, st *store.Store) *domain.Execution {
	ex, err := st.ClaimExecution(ctx, WorkerID(), s.cfg.Worker.LeaseDuration)
	if err != nil {
		if !isStoreNotFound(err) {
			s.log.Error("claim execution", "err", err)
		}
		return nil
	}
	return ex
}

// withTargetLock holds a session advisory lock per target ARN so two plans
// never change the same role / key / secret at the same time.
func withTargetLock(ctx context.Context, st *store.Store, key string, fn func()) (bool, error) {
	conn, err := st.Pool().Acquire(ctx)
	if err != nil {
		return false, err
	}
	defer conn.Release()
	k := st.TenantID + "|" + key
	var ok bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext($1))`, k).Scan(&ok); err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	defer func() { _, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtext($1))`, k) }()
	fn()
	return true, nil
}

func (s *Service) RunExecution(ctx context.Context, st *store.Store, ex *domain.Execution) {
	log := s.log.With("execution", ex.ID, "plan", ex.PlanID, "kind", string(ex.Kind))
	p, err := st.GetPlan(ctx, ex.PlanID)
	if err != nil {
		s.finishWithError(ctx, st, ex, nil, "PLAN_MISSING", err.Error(), nil)
		return
	}
	acquired, err := withTargetLock(ctx, st, p.TargetARN, func() {
		defer func() {
			if r := recover(); r != nil {
				log.Error("execution panicked", "panic", r)
				s.finishWithError(context.Background(), st, ex, p, "PANIC", fmt.Sprint(r), nil)
			}
		}()
		switch ex.Kind {
		case domain.KindRollback:
			s.doRollback(ctx, st, ex, p)
		default:
			s.doExecute(ctx, st, ex, p)
		}
	})
	if err != nil {
		log.Error("target lock", "err", err)
		_ = st.Reschedule(ctx, ex.ID, 30*time.Second, true)
		return
	}
	if !acquired {
		log.Info("target is locked by another execution; retrying later", "target", p.TargetARN)
		_ = st.Reschedule(ctx, ex.ID, 30*time.Second, true)
	}
}

func targetOf(p *domain.Plan, acct *domain.Account) (provider.Target, error) {
	var params map[string]any
	if err := json.Unmarshal(p.Params, &params); err != nil {
		return provider.Target{}, fmt.Errorf("plan params: %w", err)
	}
	return provider.Target{TenantID: p.TenantID, Account: *acct, Region: p.Region, ActionType: p.ActionType,
		TargetARN: p.TargetARN, TargetType: p.TargetType, Params: params}, nil
}

func decodeMap(b json.RawMessage) map[string]any {
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

func (s *Service) doExecute(ctx context.Context, st *store.Store, ex *domain.Execution, p *domain.Plan) {
	if p.Status != domain.PlanScheduled {
		// cancelled / changed during the grace period
		ex.Status, ex.ErrorCode, ex.ErrorMessage = domain.ExecCancelled, "PLAN_STATE", "the plan is "+string(p.Status)
		_ = st.FinishExecution(ctx, ex)
		return
	}
	acct, _, err := s.preflight(ctx, st, p)
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "PRECONDITION", err.Error(), nil)
		return
	}
	if n := CountApprovals(ctx, st, p); n < p.RequiredApprovals {
		s.finishWithError(ctx, st, ex, p, "APPROVALS", fmt.Sprintf("%d of %d approvals for the current plan hash", n, p.RequiredApprovals), nil)
		return
	}
	prov, _ := s.prov.Get(p.Platform)
	target, err := targetOf(p, acct)
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "PLAN_DATA", err.Error(), nil)
		return
	}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanExecuting, "", domain.PlanScheduled); err != nil {
		ex.Status, ex.ErrorCode = domain.ExecCancelled, "PLAN_STATE"
		_ = st.FinishExecution(ctx, ex)
		return
	}
	ex.AssumedRoleARN, ex.SessionName = acct.RoleARN, "ispm-"+ex.ID
	st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvExecStarted, ex.TriggeredBy, map[string]any{"role": acct.RoleARN, "dry_run": s.cfg.Safety.DryRunOnly})

	// drift check: the live state must still be the one the plan and the approval were built on
	live, err := prov.LiveState(ctx, target)
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "STATE_READ", err.Error(), nil)
		return
	}
	if h := policydoc.Hash(live); h != p.LiveStateHash {
		st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvDrift, "system", map[string]any{"plan_hash": p.LiveStateHash, "live_hash": h})
		s.finishWithError(ctx, st, ex, p, "DRIFT_DETECTED", "the live state changed after the plan was built: create a new plan and approve it again", nil)
		return
	}

	in := provider.RunInput{Target: target, PlanID: p.ID, ExecutionID: ex.ID, SessionName: ex.ID,
		Before: decodeMap(p.BeforeState), After: decodeMap(p.AfterState), DryRun: s.cfg.Safety.DryRunOnly}
	res, err := prov.Execute(ctx, in)
	if res != nil {
		ex.Steps = mustJSON(res.Steps, "[]")
		ex.RollbackState = mustJSON(res.RollbackState, "{}")
		ex.Result = mustJSON(res.Result, "{}")
		for _, stp := range res.Steps {
			st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvAWSCall, ex.TriggeredBy,
				map[string]any{"step": stp.Step, "api": stp.API, "request_id": stp.RequestID, "status": stp.Status, "error": stp.Error})
		}
	}
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "EXECUTE_FAILED", err.Error(), res)
		return
	}
	if len(res.OneTime) > 0 {
		s.oneTime.Put(ex.ID, res.OneTime)
	}

	if s.cfg.Safety.DryRunOnly {
		ex.Status, ex.Result = domain.ExecSucceeded, json.RawMessage(`{"dry_run":true}`)
		_ = st.FinishExecution(ctx, ex)
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExecuted, "dry run: nothing was changed in AWS")
		return
	}

	// verify
	in.Result = res.Result
	vr, verr := prov.Verify(ctx, in)
	if verr != nil {
		vr = map[string]any{"verified": false, "error": verr.Error()}
	}
	ex.VerifyResult = mustJSON(vr, "{}")
	ex.Status = domain.ExecSucceeded
	_ = st.FinishExecution(ctx, ex)

	_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExecuted, "", domain.PlanExecuting)
	next, reason := domain.PlanVerified, ""
	switch {
	case vr["verified"] != true:
		next, reason = domain.PlanExecuted, "applied, but the verification did not confirm the change: check the target"
	case p.ActionType == catalog.RotateAccessKey:
		next, reason = domain.PlanExecuted, "waiting until the new key is used; then the old key is deactivated"
	}
	if next == domain.PlanVerified {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanVerified, "", domain.PlanExecuted)
		st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvVerified, "system", vr)
	} else {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExecuted, reason, domain.PlanExecuted)
	}
	s.requestRescan(ctx, st, ex, p)
	if fresh, err := st.GetPlan(ctx, p.ID); err == nil {
		s.notifyPlan(ctx, st, "EXECUTED", fresh, "")
	}
	if p.BatchID != nil {
		s.updateBatch(ctx, st, *p.BatchID)
	}
}

// finishWithError records a failed execution and fails the plan.
func (s *Service) finishWithError(ctx context.Context, st *store.Store, ex *domain.Execution, p *domain.Plan, code, msg string, res *provider.RunResult) {
	ex.Status, ex.ErrorCode, ex.ErrorMessage = domain.ExecFailed, code, msg
	if ex.Kind == domain.KindRollback {
		ex.Status = domain.ExecRollbackFailed
	}
	if res != nil && len(ex.Steps) == 0 {
		ex.Steps = mustJSON(res.Steps, "[]")
	}
	_ = st.FinishExecution(ctx, ex)
	if p == nil {
		return
	}
	if ex.Kind == domain.KindExecute {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanFailed, code+": "+msg, domain.PlanScheduled, domain.PlanExecuting, domain.PlanApproved)
	}
	st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvFailed, "system", map[string]any{"code": code, "error": msg, "kind": ex.Kind})
	if fresh, err := st.GetPlan(ctx, p.ID); err == nil {
		s.notifyPlan(ctx, st, "FAILED", fresh, msg)
	}
	if p.BatchID != nil {
		s.updateBatch(ctx, st, *p.BatchID)
	}
}

func (s *Service) doRollback(ctx context.Context, st *store.Store, ex *domain.Execution, p *domain.Plan) {
	acct, _, err := s.preflightRollback(ctx, st, p)
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "PRECONDITION", err.Error(), nil)
		return
	}
	prov, _ := s.prov.Get(p.Platform)
	target, err := targetOf(p, acct)
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "PLAN_DATA", err.Error(), nil)
		return
	}
	ex.AssumedRoleARN, ex.SessionName = acct.RoleARN, "ispm-"+ex.ID
	st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvExecStarted, ex.TriggeredBy, map[string]any{"kind": "ROLLBACK"})
	in := provider.RollbackInput{RunInput: provider.RunInput{Target: target, PlanID: p.ID, ExecutionID: ex.ID, SessionName: ex.ID,
		Before: decodeMap(p.BeforeState), After: decodeMap(p.AfterState), DryRun: s.cfg.Safety.DryRunOnly}, RollbackState: decodeMap(ex.RollbackState)}
	res, err := prov.Rollback(ctx, in)
	if res != nil {
		ex.Steps, ex.Result = mustJSON(res.Steps, "[]"), mustJSON(res.Result, "{}")
		for _, stp := range res.Steps {
			st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvAWSCall, ex.TriggeredBy,
				map[string]any{"step": stp.Step, "api": stp.API, "request_id": stp.RequestID, "status": stp.Status, "error": stp.Error})
		}
	}
	if err != nil {
		s.finishWithError(ctx, st, ex, p, "ROLLBACK_FAILED", err.Error(), res)
		return
	}
	ex.Status = domain.ExecRolledBack
	_ = st.FinishExecution(ctx, ex)
	if ex.RollbackOf != nil {
		_ = st.SetExecutionStatus(ctx, *ex.RollbackOf, domain.ExecRolledBack)
	}
	_ = st.SetPlanStatus(ctx, p.ID, domain.PlanRolledBack, "")
	st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvRolledBack, ex.TriggeredBy, nil)
	s.requestRescan(ctx, st, ex, p)
	if fresh, err := st.GetPlan(ctx, p.ID); err == nil {
		s.notifyPlan(ctx, st, "ROLLED_BACK", fresh, "")
	}
	if p.BatchID != nil {
		s.updateBatch(ctx, st, *p.BatchID)
	}
}

// preflightRollback is like preflight but ignores the allow-list of action
// types: undoing a change must stay possible after the client narrowed the list.
func (s *Service) preflightRollback(ctx context.Context, st *store.Store, p *domain.Plan) (*domain.Account, *domain.Action, error) {
	acct, err := AccountFor(ctx, st, p.AccountID)
	if err != nil {
		return nil, nil, err
	}
	if acct.RoleARN == "" || !acct.Enabled {
		return nil, nil, fmt.Errorf("remediation is not enabled for account %s", p.AccountID)
	}
	act, err := st.GetAction(ctx, p.ActionType)
	return acct, act, err
}

// requestRescan asks the engine to rescan the tenant so the finding resolves (or reopens).
func (s *Service) requestRescan(ctx context.Context, st *store.Store, ex *domain.Execution, p *domain.Plan) {
	if s.scan == nil || s.cfg.Safety.DryRunOnly {
		return
	}
	job, err := s.scan.RequestScan(ctx, st.TenantID, "ispm-remediator:"+p.ID)
	if err != nil {
		s.log.Warn("rescan request failed; the next scheduled scan will pick the change up", "err", err)
		st.Audit(ctx, p.ID, ex.ID, "", domain.EvRescan, "system", map[string]any{"error": err.Error()})
		return
	}
	_ = st.SetExecutionRescan(ctx, ex.ID, job)
	st.Audit(ctx, p.ID, ex.ID, "", domain.EvRescan, "system", map[string]any{"job_id": job})
}
