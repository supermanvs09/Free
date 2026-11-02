package engine

import (
	"context"
	"fmt"
	"time"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

type CreateBatchReq struct {
	Mode  domain.BatchMode `json:"mode"` // INDEPENDENT (default) | ALL_OR_NOTHING
	Items []CreatePlanReq  `json:"items"`
}

type ItemError struct {
	Index int    `json:"index"`
	Error string `json:"error"`
}

type BatchResult struct {
	Batch  *domain.Batch `json:"batch"`
	Errors []ItemError   `json:"errors,omitempty"`
}

// CreateBatch builds one plan per item. Plans requested together form a batch
// with a mode chosen now (design 7.3).
func (s *Service) CreateBatch(ctx context.Context, actor domain.Actor, req CreateBatchReq) (*BatchResult, error) {
	if err := requireRole(actor, domain.PermPlan); err != nil {
		return nil, err
	}
	if req.Mode == "" {
		req.Mode = domain.BatchIndependent
	}
	if req.Mode != domain.BatchIndependent && req.Mode != domain.BatchAllOrNothing {
		return nil, badRequest("mode must be INDEPENDENT or ALL_OR_NOTHING")
	}
	if len(req.Items) == 0 || len(req.Items) > 100 {
		return nil, badRequest("a batch needs 1 to 100 items")
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, it := range req.Items {
		ids = append(ids, it.FindingIDs...)
	}
	fs, err := st.GetFindings(ctx, dedupe(ids))
	if err != nil {
		return nil, err
	}
	accounts := map[string]bool{}
	for _, f := range fs {
		accounts[f.AccountID] = true
	}
	if len(accounts) > 1 && !actor.Role.Can(domain.PermSettings) {
		return nil, forbidden("a batch across accounts needs the admin role")
	}

	batchID := newID()
	res := &BatchResult{}
	var plans []domain.Plan
	for i, it := range req.Items {
		it.BatchID = batchID
		p, err := s.createPlan(ctx, st, actor, it)
		if err != nil {
			res.Errors = append(res.Errors, ItemError{i, err.Error()})
			if req.Mode == domain.BatchAllOrNothing {
				for _, c := range plans {
					_ = st.SetPlanStatus(ctx, c.ID, domain.PlanCancelled, "batch creation failed")
				}
				return nil, badRequest("item %d failed, the all-or-nothing batch was not created: %v", i, err)
			}
			continue
		}
		plans = append(plans, *p)
	}
	if len(plans) == 0 {
		return nil, badRequest("no plan could be created: %v", res.Errors)
	}
	b := domain.Batch{ID: batchID, TenantID: st.TenantID, Mode: req.Mode, RequestedBy: actor.UserID, PlanCount: len(plans), Status: domain.BatchRunning}
	if err := st.InsertBatch(ctx, b); err != nil {
		return nil, err
	}
	st.Audit(ctx, "", "", batchID, domain.EvBatchCreated, actor.UserID, map[string]any{"mode": req.Mode, "plans": len(plans), "accounts": len(accounts)})
	out, _ := st.GetBatch(ctx, batchID)
	out.Plans = plans
	res.Batch = out
	return res, nil
}

func (s *Service) GetBatch(ctx context.Context, tenantID, id string) (*domain.Batch, error) {
	st, err := s.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	b, err := st.GetBatch(ctx, id)
	if isStoreNotFound(err) {
		return nil, notFoundErr("batch")
	}
	if err != nil {
		return nil, err
	}
	b.Plans, err = st.ListPlans(ctx, store.PlanFilter{BatchID: id, Limit: 200})
	return b, err
}

// SubmitBatch submits every READY plan of the batch.
func (s *Service) SubmitBatch(ctx context.Context, actor domain.Actor, id string) (*domain.Batch, error) {
	b, err := s.GetBatch(ctx, actor.TenantID, id)
	if err != nil {
		return nil, err
	}
	if b.Mode == domain.BatchAllOrNothing {
		for _, p := range b.Plans {
			if p.Status != domain.PlanReady {
				return nil, conflict("plan %s is %s: in an all-or-nothing batch every plan must be READY", p.ID, p.Status)
			}
		}
	}
	for _, p := range b.Plans {
		if p.Status == domain.PlanReady {
			if _, err := s.Submit(ctx, actor, p.ID); err != nil && b.Mode == domain.BatchAllOrNothing {
				return nil, err
			}
		}
	}
	return s.GetBatch(ctx, actor.TenantID, id)
}

type ExecuteBatchResult struct {
	Queued  []domain.Execution `json:"queued"`
	Skipped []ItemError        `json:"skipped,omitempty"`
}

// ExecuteBatch queues the approved plans. In an all-or-nothing batch every
// plan must be approved before any starts, and all start at the same time.
func (s *Service) ExecuteBatch(ctx context.Context, actor domain.Actor, id string) (*ExecuteBatchResult, error) {
	if err := requireRole(actor, domain.PermExecute); err != nil {
		return nil, err
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	b, err := s.GetBatch(ctx, actor.TenantID, id)
	if err != nil {
		return nil, err
	}
	if b.Status != domain.BatchRunning {
		return nil, conflict("the batch is %s", b.Status)
	}
	res := &ExecuteBatchResult{}
	var queue []domain.Plan
	for i, p := range b.Plans {
		if p.Status == domain.PlanApproved {
			queue = append(queue, p)
			continue
		}
		if b.Mode == domain.BatchAllOrNothing {
			return nil, conflict("plan %s is %s: in an all-or-nothing batch every plan must be APPROVED before any starts", p.ID, p.Status)
		}
		res.Skipped = append(res.Skipped, ItemError{i, fmt.Sprintf("plan %s is %s", p.ID, p.Status)})
	}
	if len(queue) == 0 {
		return nil, conflict("no approved plan to execute")
	}
	// one common start time for the all-or-nothing mode: the longest grace period
	start := s.now()
	if b.Mode == domain.BatchAllOrNothing {
		for i := range queue {
			acct, act, err := s.preflight(ctx, st, &queue[i])
			if err != nil {
				return nil, fmt.Errorf("plan %s: %w", queue[i].ID, err)
			}
			if t := s.now().Add(time.Duration(graceDays(acct, act)) * 24 * time.Hour); t.After(start) {
				start = t
			}
		}
	}
	for i := range queue {
		ex, err := s.queueExecutionAt(ctx, st, actor, &queue[i], start)
		if err != nil {
			if b.Mode == domain.BatchAllOrNothing { // undo the queueing: nothing has started
				for _, q := range res.Queued {
					_, _ = st.CancelQueued(ctx, q.PlanID)
					_ = st.SetPlanStatus(ctx, q.PlanID, domain.PlanApproved, "")
				}
				return nil, err
			}
			res.Skipped = append(res.Skipped, ItemError{i, err.Error()})
			continue
		}
		res.Queued = append(res.Queued, *ex)
	}
	return res, nil
}

// planClass groups plan states for the batch roll-up.
type planClass int

const (
	clsPending planClass = iota
	clsRunning
	clsOK
	clsFailed
	clsRolledBack
	clsStopped
)

func classify(status domain.PlanStatus) planClass {
	switch status {
	case domain.PlanExecuting:
		return clsRunning
	case domain.PlanExecuted, domain.PlanVerified, domain.PlanResolved:
		return clsOK
	case domain.PlanFailed:
		return clsFailed
	case domain.PlanRolledBack:
		return clsRolledBack
	case domain.PlanCancelled, domain.PlanRejected, domain.PlanExpired, domain.PlanSuperseded:
		return clsStopped
	}
	return clsPending // DRAFT .. SCHEDULED, MANUALLY_DONE counts as pending (never started by us)
}

// updateBatch rolls the plan states up into the batch status and, in
// all-or-nothing mode, compensates when a plan failed. It is idempotent and
// called after every execution and by the reconcile loop.
func (s *Service) updateBatch(ctx context.Context, st *store.Store, batchID string) {
	b, err := st.GetBatch(ctx, batchID)
	if err != nil || b.Status != domain.BatchRunning {
		return
	}
	plans, err := st.ListPlans(ctx, store.PlanFilter{BatchID: batchID, Limit: 200})
	if err != nil || len(plans) == 0 {
		return
	}
	count := map[planClass]int{}
	for _, p := range plans {
		count[classify(p.Status)]++
	}
	set := func(status domain.BatchStatus) {
		_ = st.SetBatchStatus(ctx, batchID, status)
		st.Audit(ctx, "", "", batchID, domain.EvBatchStatus, "system", map[string]any{"status": status})
	}

	if b.Mode == domain.BatchAllOrNothing && (count[clsFailed] > 0 || count[clsStopped] > 0) {
		s.abortBatch(ctx, st, batchID, plans)
		// re-read after compensation
		plans, _ = st.ListPlans(ctx, store.PlanFilter{BatchID: batchID, Limit: 200})
		busy, rolled, stuck, failed := 0, 0, 0, 0
		for _, p := range plans {
			switch classify(p.Status) {
			case clsRunning:
				busy++
			case clsOK:
				if _, err := st.LastExecutionOfKind(ctx, p.ID, domain.KindRollback, domain.ExecRollbackFailed); err == nil {
					stuck++
				} else {
					busy++ // rollback queued or running
				}
			case clsRolledBack:
				rolled++
			case clsFailed:
				failed++
			}
		}
		switch {
		case stuck > 0 && busy == stuck:
			set(domain.BatchRollbackFailed)
		case busy > 0:
		case rolled > 0:
			set(domain.BatchRolledBack)
		case failed > 0:
			set(domain.BatchFailed)
		default:
			set(domain.BatchCancelled)
		}
		return
	}
	if count[clsPending]+count[clsRunning] > 0 {
		return
	}
	switch {
	case count[clsOK] == len(plans):
		set(domain.BatchCompleted)
	case count[clsOK] == 0 && count[clsFailed] == 0 && count[clsRolledBack] == 0:
		set(domain.BatchCancelled)
	case count[clsOK] == 0:
		set(domain.BatchFailed)
	default:
		set(domain.BatchPartial)
	}
}

// abortBatch cancels the plans that have not started and rolls back the ones
// that were applied (compensating rollbacks: AWS has no cross-resource transactions).
func (s *Service) abortBatch(ctx context.Context, st *store.Store, batchID string, plans []domain.Plan) {
	for _, p := range plans {
		switch p.Status {
		case domain.PlanDraft, domain.PlanReady, domain.PlanWaitingExternal, domain.PlanPendingApproval, domain.PlanApproved, domain.PlanScheduled:
			if p.Status == domain.PlanScheduled {
				if n, _ := st.CancelQueued(ctx, p.ID); n == 0 {
					continue // already started: handled on the next call
				}
			}
			if err := st.SetPlanStatus(ctx, p.ID, domain.PlanCancelled, "all-or-nothing batch aborted", p.Status); err == nil {
				st.Audit(ctx, p.ID, "", batchID, domain.EvCancelled, "system", map[string]any{"reason": "all-or-nothing batch aborted"})
			}
		case domain.PlanExecuted, domain.PlanVerified, domain.PlanResolved:
			if _, err := st.ActiveExecution(ctx, p.ID); err == nil {
				continue // a rollback is already queued / running
			}
			if _, err := st.LastExecutionOfKind(ctx, p.ID, domain.KindRollback, domain.ExecRollbackFailed); err == nil {
				continue // do not retry a failed rollback automatically
			}
			ex, err := st.LastExecutionOfKind(ctx, p.ID, domain.KindExecute, domain.ExecSucceeded)
			if err != nil {
				continue
			}
			if _, err := s.queueRollback(ctx, st, "system", ex); err != nil {
				s.log.Warn("batch compensation: cannot queue rollback", "plan", p.ID, "err", err)
				st.Audit(ctx, p.ID, "", batchID, domain.EvFailed, "system", map[string]any{"error": "cannot roll back: " + err.Error()})
			}
		}
	}
}
