package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/notify"
	"nhi-backend-api/internal/remediation/store"
)

func (s *Service) planAndStore(ctx context.Context, actor domain.Actor, planID string, perm domain.Permission) (*store.Store, *domain.Plan, error) {
	if err := requireRole(actor, perm); err != nil {
		return nil, nil, err
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, nil, err
	}
	p, err := st.GetPlan(ctx, planID)
	if isStoreNotFound(err) {
		return nil, nil, notFoundErr("plan")
	}
	return st, p, err
}

func hasBlock(p *domain.Plan) bool {
	var pcs []domain.Precheck
	_ = json.Unmarshal(p.Prechecks, &pcs)
	for _, pc := range pcs {
		if pc.Result == domain.CheckBlock {
			return true
		}
	}
	return false
}

// engineOwned refuses a plan created by the engine's automatic remediation (policy_id set): the
// engine submits, executes and verifies it. Here such a plan can be approved, rejected,
// cancelled or rolled back (RollbackPlan, by plan_id).
func engineOwned(p *domain.Plan, what string) error {
	if p.PolicyID == nil {
		return nil
	}
	return conflict("this plan was created by the engine's automatic remediation (policy %s): the engine %s it", *p.PolicyID, what)
}

// Submit asks the approvers to approve a One-click plan.
func (s *Service) Submit(ctx context.Context, actor domain.Actor, planID string) (*domain.Plan, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermPlan)
	if err != nil {
		return nil, err
	}
	if err := engineOwned(p, "submits and runs"); err != nil {
		return nil, err
	}
	if p.Mode != domain.ModeOneClick {
		return nil, conflict("a Guided plan has no approval flow: apply it by hand and use mark-done")
	}
	if p.Status != domain.PlanReady {
		return nil, conflict("only a READY plan can be submitted (this one is %s)", p.Status)
	}
	if hasBlock(p) {
		return nil, conflict("the plan is blocked by a pre-check")
	}
	if p.RequiredApprovals == 0 {
		// a safe fix on a finding below Critical: no approval and no approval e-mail, the plan is queued to run
		if err := st.SetPlanStatus(ctx, p.ID, domain.PlanApproved, "no approval needed (safe fix, finding below Critical)", domain.PlanReady); err != nil {
			return nil, conflict("the plan changed; reload it")
		}
		_ = st.SetPlanValidUntil(ctx, p.ID, s.now().Add(s.cfg.Worker.PlanTTL))
		st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvSubmitted, actor.UserID, map[string]any{"required_approvals": 0})
		p.Status = domain.PlanApproved
		s.startApproved(ctx, st, p)
		return st.GetPlan(ctx, p.ID)
	}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanPendingApproval, "", domain.PlanReady); err != nil {
		return nil, conflict("the plan changed; reload it")
	}
	_ = st.SetPlanValidUntil(ctx, p.ID, s.now().Add(s.cfg.Worker.PlanTTL))
	st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvSubmitted, actor.UserID, map[string]any{"required_approvals": p.RequiredApprovals})
	s.notifyPlan(ctx, st, "APPROVAL_REQUESTED", p, "")
	return st.GetPlan(ctx, p.ID)
}

// submitterOf returns who submitted the plan (from the audit log).
func submitterOf(ctx context.Context, st *store.Store, planID string) string {
	evs, _ := st.ListAudit(ctx, planID, 500)
	for _, e := range evs {
		if e.Event == domain.EvSubmitted {
			return e.Actor
		}
	}
	return ""
}

// Decide records an approval or rejection. Approvals are bound to the plan hash.
func (s *Service) Decide(ctx context.Context, actor domain.Actor, planID string, approve bool, comment string) (*domain.Plan, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermApprove)
	if err != nil {
		return nil, err
	}
	if p.Status != domain.PlanPendingApproval {
		return nil, conflict("the plan is %s, not waiting for approval", p.Status)
	}
	if p.ValidUntil != nil && s.now().After(*p.ValidUntil) {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExpired, "approval expired", domain.PlanPendingApproval)
		return nil, conflict("the approval window of this plan has expired; create a new plan")
	}
	if actor.UserID == p.CreatedBy || actor.UserID == submitterOf(ctx, st, p.ID) {
		return nil, forbidden("the requester cannot approve or reject their own plan")
	}
	decision := "REJECTED"
	if approve {
		decision = "APPROVED"
	}
	a := domain.Approval{ID: newID(), PlanID: p.ID, Approver: actor.UserID, ApproverRole: string(actor.Role),
		Decision: decision, Comment: comment, PlanHash: p.PlanHash}
	if err := st.InsertApproval(ctx, a); err != nil {
		if err == store.ErrConflict {
			return nil, conflict("you already decided on this plan")
		}
		return nil, err
	}
	if !approve {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanRejected, comment, domain.PlanPendingApproval)
		st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvRejected, actor.UserID, map[string]any{"comment": comment})
		return st.GetPlan(ctx, p.ID)
	}
	st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvApproved, actor.UserID, map[string]any{"comment": comment})
	if n := CountApprovals(ctx, st, p); n >= p.RequiredApprovals {
		if err := st.SetPlanStatus(ctx, p.ID, domain.PlanApproved, "", domain.PlanPendingApproval); err == nil {
			p.Status = domain.PlanApproved
			s.startApproved(ctx, st, p)
		}
	}
	return st.GetPlan(ctx, p.ID)
}

// startApproved queues an approved One-click dashboard plan to run (after its grace
// period), so nobody has to call execute. The run is started on behalf of the plan's
// creator. Plans of a batch wait for the batch execute, and engine plans are run by the
// engine. When the run cannot be queued (for example the account settings changed), the
// plan stays APPROVED with the reason and POST /plans/{id}/execute can try again.
func (s *Service) startApproved(ctx context.Context, st *store.Store, p *domain.Plan) {
	if p.Mode != domain.ModeOneClick || p.BatchID != nil || p.PolicyID != nil {
		return
	}
	creator := domain.Actor{TenantID: st.TenantID, UserID: p.CreatedBy, Role: domain.RoleAnalyst}
	if _, err := s.queueExecution(ctx, st, creator, p); err != nil {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanApproved, "approved, but the run could not be started: "+err.Error(), domain.PlanApproved)
		s.log.Warn("remediation: approved plan not queued", "plan", p.ID, "err", err)
	}
}

// CountApprovals counts distinct approvers of the current plan hash.
func CountApprovals(ctx context.Context, st *store.Store, p *domain.Plan) int {
	as, _ := st.ListApprovals(ctx, p.ID)
	seen := map[string]bool{}
	for _, a := range as {
		if a.Decision == "APPROVED" && a.PlanHash == p.PlanHash && a.Approver != p.CreatedBy {
			seen[a.Approver] = true
		}
	}
	return len(seen)
}

// preflight checks account settings before an execution is queued (and again by the worker).
func (s *Service) preflight(ctx context.Context, st *store.Store, p *domain.Plan) (*domain.Account, *domain.Action, error) {
	acct, err := AccountFor(ctx, st, p.AccountID)
	if err != nil {
		return nil, nil, err
	}
	act, err := st.GetAction(ctx, p.ActionType)
	if err != nil {
		return nil, nil, err
	}
	prov, _ := s.prov.Get(p.Platform)
	if ok, why := s.oneClickEligible(acct, act, prov, p.Region); !ok {
		return nil, nil, conflict("%s", why)
	}
	return acct, act, nil
}

// Execute queues an approved plan. The execution starts after the grace period.
func (s *Service) Execute(ctx context.Context, actor domain.Actor, planID string) (*domain.Execution, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermExecute)
	if err != nil {
		return nil, err
	}
	if p.BatchID != nil {
		b, err := st.GetBatch(ctx, *p.BatchID)
		if err == nil && b.Mode == domain.BatchAllOrNothing {
			return nil, conflict("this plan belongs to an all-or-nothing batch: execute the batch")
		}
	}
	return s.queueExecution(ctx, st, actor, p)
}

func (s *Service) queueExecution(ctx context.Context, st *store.Store, actor domain.Actor, p *domain.Plan) (*domain.Execution, error) {
	return s.queueExecutionAt(ctx, st, actor, p, time.Time{})
}

// queueExecutionAt queues an execution that starts after the grace period and not before notBefore.
func (s *Service) queueExecutionAt(ctx context.Context, st *store.Store, actor domain.Actor, p *domain.Plan, notBefore time.Time) (*domain.Execution, error) {
	if err := engineOwned(p, "executes"); err != nil {
		return nil, err
	}
	if p.Mode != domain.ModeOneClick {
		return nil, conflict("a Guided plan cannot be executed")
	}
	if p.Status != domain.PlanApproved {
		return nil, conflict("the plan is %s, it must be APPROVED", p.Status)
	}
	if n := CountApprovals(ctx, st, p); n < p.RequiredApprovals {
		return nil, conflict("%d of %d approvals", n, p.RequiredApprovals)
	}
	if p.ValidUntil != nil && s.now().After(*p.ValidUntil) {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanExpired, "approval expired", domain.PlanApproved)
		return nil, conflict("the approval of this plan has expired; create a new plan")
	}
	acct, act, err := s.preflight(ctx, st, p)
	if err != nil {
		return nil, err
	}
	when := s.now()
	if g := graceDays(acct, act); g > 0 {
		when = when.Add(time.Duration(g) * 24 * time.Hour)
	}
	if notBefore.After(when) {
		when = notBefore
	}
	ex := &domain.Execution{ID: newID(), PlanID: p.ID, TenantID: st.TenantID, Kind: domain.KindExecute,
		TriggeredBy: actor.UserID, Status: domain.ExecQueued, ScheduledFor: when, RollbackState: json.RawMessage(`{}`)}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanScheduled, "", domain.PlanApproved); err != nil {
		return nil, conflict("the plan changed; reload it")
	}
	if err := st.InsertExecution(ctx, ex); err != nil {
		_ = st.SetPlanStatus(ctx, p.ID, domain.PlanApproved, "")
		return nil, err
	}
	st.Audit(ctx, p.ID, ex.ID, derefStr(p.BatchID), domain.EvExecQueued, actor.UserID, map[string]any{"scheduled_for": when})
	return st.GetExecution(ctx, ex.ID)
}

// Cancel stops a plan that has not been applied (also during the grace period).
func (s *Service) Cancel(ctx context.Context, actor domain.Actor, planID, reason string) (*domain.Plan, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermPlan)
	if err != nil {
		return nil, err
	}
	switch p.Status {
	case domain.PlanDraft, domain.PlanReady, domain.PlanWaitingExternal, domain.PlanPendingApproval, domain.PlanApproved, domain.PlanScheduled:
	default:
		return nil, conflict("a %s plan cannot be cancelled", p.Status)
	}
	if p.Status == domain.PlanScheduled {
		if n, _ := st.CancelQueued(ctx, p.ID); n == 0 {
			return nil, conflict("the execution already started")
		}
	}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanCancelled, reason, p.Status); err != nil {
		return nil, conflict("the plan changed; reload it")
	}
	st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvCancelled, actor.UserID, map[string]any{"reason": reason})
	if p.BatchID != nil {
		s.updateBatch(ctx, st, *p.BatchID)
	}
	return st.GetPlan(ctx, p.ID)
}

// MarkDone is the Guided path: the analyst applied the change by hand. The
// next scan confirms it (the plan becomes RESOLVED when the findings do).
func (s *Service) MarkDone(ctx context.Context, actor domain.Actor, planID, note string) (*domain.Plan, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermPlan)
	if err != nil {
		return nil, err
	}
	switch p.Status {
	case domain.PlanDraft, domain.PlanReady, domain.PlanWaitingExternal:
	default:
		return nil, conflict("a %s plan cannot be marked done", p.Status)
	}
	if err := st.SetPlanStatus(ctx, p.ID, domain.PlanManuallyDone, note, p.Status); err != nil {
		return nil, conflict("the plan changed; reload it")
	}
	st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvMarkedDone, actor.UserID, map[string]any{"note": note})
	return st.GetPlan(ctx, p.ID)
}

// ConfirmExternal records that the vendor configured the ExternalId, which
// releases a WAITING_EXTERNAL trust-policy plan.
func (s *Service) ConfirmExternal(ctx context.Context, actor domain.Actor, planID string) (*domain.Plan, error) {
	st, p, err := s.planAndStore(ctx, actor, planID, domain.PermPlan)
	if err != nil {
		return nil, err
	}
	if p.Status != domain.PlanWaitingExternal {
		return nil, conflict("the plan is %s, not waiting for the vendor", p.Status)
	}
	var params map[string]any
	_ = json.Unmarshal(p.Params, &params)
	params["external_id_status"] = "CONFIRMED"
	b, _ := json.Marshal(params)
	next, reason := domain.PlanReady, ""
	if hasBlock(p) {
		next, reason = domain.PlanDraft, "blocked by pre-check"
	}
	if err := st.UpdatePlanParams(ctx, p.ID, b, next, reason); err != nil {
		return nil, err
	}
	st.Audit(ctx, p.ID, "", derefStr(p.BatchID), domain.EvExternalConfirm, actor.UserID, nil)
	return st.GetPlan(ctx, p.ID)
}

// RollbackPlan undoes the applied change of a plan, given its plan_id. It works for dashboard
// plans and for plans of the rule engine's automatic remediation (policy_id set): the plan_id
// (as written to remediation_audit_log) is linked to its last succeeded EXECUTE execution, found
// in remediation_executions or through the execution_id on the plan's audit rows, and that
// execution's saved snapshot is replayed.
func (s *Service) RollbackPlan(ctx context.Context, actor domain.Actor, planID string) (*domain.Execution, error) {
	if err := requireRole(actor, domain.PermExecute); err != nil {
		return nil, err
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	if _, err := st.GetPlan(ctx, planID); err != nil {
		if isStoreNotFound(err) {
			return nil, notFoundErr("plan")
		}
		return nil, err
	}
	ex, err := st.RollbackTargetExecution(ctx, planID)
	if isStoreNotFound(err) {
		return nil, conflict("plan %s has no succeeded execution to roll back", planID)
	}
	if err != nil {
		return nil, err
	}
	return s.queueRollback(ctx, st, actor.UserID, ex)
}

func (s *Service) queueRollback(ctx context.Context, st *store.Store, by string, ex *domain.Execution) (*domain.Execution, error) {
	if ex.Kind != domain.KindExecute || ex.Status != domain.ExecSucceeded {
		return nil, conflict("only a succeeded execution can be rolled back (this one is %s %s)", ex.Kind, ex.Status)
	}
	p, err := st.GetPlan(ctx, ex.PlanID)
	if err != nil {
		return nil, err
	}
	act, err := st.GetAction(ctx, p.ActionType)
	if err != nil {
		return nil, err
	}
	if !act.Reversible {
		return nil, conflict("%s cannot be rolled back", act.ActionType)
	}
	if prev, err := st.ActiveExecution(ctx, p.ID); err == nil {
		return nil, conflict("execution %s is still %s", prev.ID, prev.Status)
	}
	switch p.Status {
	case domain.PlanExecuted, domain.PlanVerified, domain.PlanResolved:
	default:
		return nil, conflict("the plan is %s, nothing to roll back", p.Status)
	}
	rb := &domain.Execution{ID: newID(), PlanID: p.ID, TenantID: st.TenantID, Kind: domain.KindRollback, RollbackOf: &ex.ID,
		TriggeredBy: by, Status: domain.ExecQueued, ScheduledFor: s.now(), RollbackState: ex.RollbackState}
	if err := st.InsertExecution(ctx, rb); err != nil {
		return nil, err
	}
	// queued_by=dashboard marks the ROLLBACK as this service's, so its worker also claims it
	// when the plan belongs to the engine's automatic remediation (see store.ClaimExecution).
	st.Audit(ctx, p.ID, rb.ID, derefStr(p.BatchID), domain.EvExecQueued, by,
		map[string]any{"kind": "ROLLBACK", "rollback_of": ex.ID, "queued_by": store.QueuedByDashboard})
	return st.GetExecution(ctx, rb.ID)
}

// ---- notifications ----

// notifyPlan writes an e-mail to the outbox (best effort). The recipients come only from the
// e-mail settings (EMAIL_APPROVERS, EMAIL_NOTIFY); the plan's creator is not mailed.
func (s *Service) notifyPlan(ctx context.Context, st *store.Store, kind string, p *domain.Plan, errMsg string) {
	var integ *domain.Integration
	for _, typ := range notify.Providers {
		if i, err := st.GetIntegration(ctx, typ); err == nil && i.Enabled {
			integ = i
			break
		}
	}
	if integ == nil {
		return
	}
	cfg, err := notify.ParseConfig(integ.Config)
	if err != nil {
		return
	}
	var to []string
	switch kind {
	case "APPROVAL_REQUESTED":
		to = append(to, cfg.Approvers...)
	case "GRACE_ENDING":
		to = append(to, cfg.Approvers...)
		to = append(to, cfg.Notify...)
	default:
		to = append(to, cfg.Notify...)
	}
	to = dedupe(to)
	if len(to) == 0 {
		return
	}
	title := p.ActionType
	if a, err := st.GetAction(ctx, p.ActionType); err == nil {
		title = a.Title
	}
	var diff []domain.DiffEntry
	_ = json.Unmarshal(p.Diff, &diff)
	d := notify.Data{Kind: kind, PlanID: p.ID, ActionTitle: title, Target: p.TargetARN, Account: p.AccountID,
		Risk: string(p.RiskLevel), Status: string(p.Status), Reason: p.StatusReason, Requester: p.CreatedBy,
		Approvals: p.RequiredApprovals, Error: errMsg, Diff: notify.DiffLines(diff, 20),
		URL: strings.TrimRight(s.cfg.Dashboard.BaseURL, "/") + "/remediation/plans/" + p.ID}
	if p.ScoreGain != nil {
		d.ScoreGain = fmt.Sprintf("%.1f", *p.ScoreGain)
	}
	subj, html, text, err := notify.Render(d)
	if err != nil {
		s.log.Warn("render notification", "err", err)
		return
	}
	id := p.ID
	if err := st.EnqueueNotification(ctx, domain.Notification{Type: kind, PlanID: &id, Recipients: to, Subject: subj, BodyHTML: html, BodyText: text}); err != nil {
		s.log.Warn("enqueue notification", "err", err)
	}
}

var _ = catalog.RewriteTrust

// QueueDigest queues the daily mail with the new Critical findings (at most one per 20 hours).
func (s *Service) QueueDigest(ctx context.Context, st *store.Store) error {
	if last, err := st.LastDigestAt(ctx); err == nil && last != nil && s.now().Sub(*last) < 20*time.Hour {
		return nil
	}
	var integ *domain.Integration
	for _, typ := range notify.Providers {
		if i, err := st.GetIntegration(ctx, typ); err == nil && i.Enabled {
			integ = i
			break
		}
	}
	if integ == nil {
		return nil
	}
	cfg, err := notify.ParseConfig(integ.Config)
	if err != nil || len(cfg.Notify) == 0 {
		return err
	}
	fs, err := st.NewCriticalFindings(ctx, s.now().Add(-24*time.Hour))
	if err != nil || len(fs) == 0 {
		return err
	}
	d := notify.Data{Kind: "DIGEST", URL: strings.TrimRight(s.cfg.Dashboard.BaseURL, "/") + "/findings?severity=Critical"}
	for _, f := range fs {
		d.Lines = append(d.Lines, fmt.Sprintf("%s: %s (%s, account %s)", f.RuleID, f.Title, f.IdentityName, f.AccountID))
	}
	subj, html, text, err := notify.Render(d)
	if err != nil {
		return err
	}
	return st.EnqueueNotification(ctx, domain.Notification{Type: "DIGEST", Recipients: cfg.Notify, Subject: subj, BodyHTML: html, BodyText: text})
}
