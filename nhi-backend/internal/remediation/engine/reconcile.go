package engine

import (
	"context"
	"encoding/json"
	"time"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/provider"
	"nhi-backend-api/internal/remediation/store"
)

// Reconcile is the periodic housekeeping of one tenant:
//   - expire plans whose approval is too old
//   - fail executions whose worker died
//   - move plans to RESOLVED when the engine's scan resolved their findings
//   - run the second phase of key rotations (deactivate the old key)
//   - announce executions that start within 24 hours
//   - roll up running batches
func (s *Service) Reconcile(ctx context.Context, st *store.Store) error {
	if ids, err := st.ExpirePlans(ctx); err == nil {
		for _, id := range ids {
			st.Audit(ctx, id, "", "", domain.EvExpired, "system", nil)
		}
	}

	if stale, err := st.StaleExecutions(ctx); err == nil {
		for i := range stale {
			ex := stale[i]
			if p, err := st.GetPlan(ctx, ex.PlanID); err == nil {
				s.finishWithError(ctx, st, &ex, p, "WORKER_LOST",
					"the worker stopped during the execution: the live state is unknown, check the target and create a new plan", nil)
			}
		}
	}

	for _, status := range []domain.PlanStatus{domain.PlanExecuted, domain.PlanVerified, domain.PlanManuallyDone} {
		plans, err := st.PlansByStatus(ctx, string(status))
		if err != nil {
			continue
		}
		for _, p := range plans {
			s.resolveIfFixed(ctx, st, &p)
		}
	}

	if plans, err := st.AwaitingCutover(ctx); err == nil {
		for _, p := range plans {
			s.finalizePlan(ctx, st, &p)
		}
	}

	if exs, err := st.GraceEnding(ctx, 24*time.Hour); err == nil {
		for _, ex := range exs {
			if p, err := st.GetPlan(ctx, ex.PlanID); err == nil && p.Status == domain.PlanScheduled {
				p.StatusReason = "starts " + ex.ScheduledFor.UTC().Format(time.RFC3339)
				s.notifyPlan(ctx, st, "GRACE_ENDING", p, "")
			}
			_ = st.MarkGraceNotified(ctx, ex.ID)
		}
	}

	if ids, err := st.ListRunningBatches(ctx); err == nil {
		for _, id := range ids {
			s.updateBatch(ctx, st, id)
		}
	}
	return nil
}

// resolveIfFixed: a fix is confirmed when the engine's next scan marks the
// findings RESOLVED. The remediator never writes the engine's tables.
func (s *Service) resolveIfFixed(ctx context.Context, st *store.Store, p *domain.Plan) {
	if len(p.FindingIDs) == 0 {
		return
	}
	statuses, err := st.FindingStatuses(ctx, p.FindingIDs)
	if err != nil || len(statuses) != len(p.FindingIDs) {
		return
	}
	for _, v := range statuses {
		if v != "RESOLVED" {
			return
		}
	}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanResolved, "findings resolved by the engine scan", p.Status); err == nil {
		st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvResolved, "system", map[string]any{"finding_ids": p.FindingIDs})
	}
}

// finalizePlan runs phase two of rotate_access_key: once the new key is used,
// deactivate the old one and prepare a delete plan for it.
func (s *Service) finalizePlan(ctx context.Context, st *store.Store, p *domain.Plan) {
	prov, ok := s.prov.Get(p.Platform)
	if !ok {
		return
	}
	fin, ok := prov.(provider.Finalizer)
	if !ok {
		return
	}
	ex, err := st.LastExecutionOfKind(ctx, p.ID, domain.KindExecute, domain.ExecSucceeded)
	if err != nil || ex.CompletedAt == nil {
		return
	}
	setReason := func(reason string) {
		if p.StatusReason != reason {
			_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExecuted, reason, domain.PlanExecuted)
		}
	}
	if s.now().Sub(*ex.CompletedAt) > s.cfg.Worker.CutoverWait {
		setReason("the new key was not used within " + s.cfg.Worker.CutoverWait.String() + ": switch the workload to the new key, then deactivate the old key by hand")
		return
	}
	acct, err := AccountFor(ctx, st, p.AccountID)
	if err != nil || !acct.Enabled || acct.RoleARN == "" {
		return
	}
	target, err := targetOf(p, acct)
	if err != nil {
		return
	}
	var outcome *provider.FinalizeOutcome
	var ferr error
	acquired, lerr := withTargetLock(ctx, st, p.TargetARN, func() {
		fe := &domain.Execution{ID: newID(), PlanID: p.ID, TenantID: st.TenantID, Kind: domain.KindFinalize, TriggeredBy: "system",
			Status: domain.ExecRunning, ScheduledFor: s.now(), RollbackState: json.RawMessage(`{}`)}
		in := provider.FinalizeInput{RunInput: provider.RunInput{Target: target, PlanID: p.ID, ExecutionID: fe.ID, SessionName: fe.ID,
			Before: decodeMap(p.BeforeState), After: decodeMap(p.AfterState), DryRun: s.cfg.Safety.DryRunOnly}, ExecResult: decodeMap(ex.Result)}
		outcome, ferr = fin.Finalize(ctx, in)
		if outcome == nil || !outcome.Done {
			return // nothing was changed: no execution row, only the status text
		}
		if err := st.InsertExecution(ctx, fe); err != nil {
			s.log.Error("finalize: insert execution", "err", err)
			return
		}
		fe.Status = domain.ExecSucceeded
		if outcome.Run != nil {
			fe.Steps, fe.Result = mustJSON(outcome.Run.Steps, "[]"), mustJSON(outcome.Run.Result, "{}")
			for _, stp := range outcome.Run.Steps {
				st.Audit(ctx, p.ID, fe.ID, "", domain.EvAWSCall, "system",
					map[string]any{"step": stp.Step, "api": stp.API, "request_id": stp.RequestID, "status": stp.Status})
			}
		}
		fe.AssumedRoleARN, fe.SessionName = acct.RoleARN, "ispm-"+fe.ID
		_ = st.FinishExecution(ctx, fe)
		// the row was inserted RUNNING above: FinishExecution sets the final status
		_ = st.SetExecutionStatus(ctx, fe.ID, domain.ExecSucceeded)
	})
	if lerr != nil || !acquired {
		return
	}
	switch {
	case ferr != nil:
		setReason("cutover check failed: " + ferr.Error())
	case outcome == nil || !outcome.Done:
		if outcome != nil {
			setReason("waiting: " + outcome.Detail)
		}
	default:
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanVerified, outcome.Detail, domain.PlanExecuted)
		st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvVerified, "system", map[string]any{"cutover": outcome.Detail})
		if fu := outcome.NextPlan; fu != nil {
			params := map[string]any{"target_arn": fu.TargetARN}
			for k, v := range fu.Params {
				params[k] = v
			}
			np, err := s.createPlan(ctx, st, domain.Actor{TenantID: st.TenantID, UserID: systemActor, Role: domain.RoleAdmin},
				CreatePlanReq{FindingIDs: p.FindingIDs, ActionType: fu.ActionType, Params: params})
			if err != nil {
				s.log.Warn("follow-up plan not created", "plan", p.ID, "err", err)
			} else {
				st.Audit(ctx, p.ID, "", "", domain.EvPlanCreated, systemActor, map[string]any{"follow_up_plan": np.ID, "reason": fu.Reason})
			}
		}
		s.requestRescan(ctx, st, &domain.Execution{ID: ex.ID}, p)
	}
}
