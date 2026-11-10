//go:build integration

// Plans created by the engine's automatic remediation (remediation_plans.policy_id set) live in
// the same tables. Here they can be approved or rejected, but never executed, claimed, expired,
// reconciled or superseded: the engine does that. Same database as TestOneClickFlow:
//
//	TEST_DB_PORT=57432 go test -tags integration -run TestEnginePlans ./internal/integration
package integration_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/modules/remediation/findingfix"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

const (
	enginePlanID  = "33333333-3333-3333-3333-333333333333"
	engineExpired = "44444444-4444-4444-4444-444444444444"
	enginePolicy  = "55555555-5555-5555-5555-555555555555"
	engineTarget  = "arn:aws:iam::123456789012:user/engine-target"
)

func TestEnginePlansAreSharedNotRun(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	st, err := svc.Store(ctx, tenantID) // creates the remediation tables (migrations 007-010)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, fmt.Sprintf("postgres://postgres:pw@localhost:%s/nhi?sslmode=disable", os.Getenv("TEST_DB_PORT")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	insert := func(id, status, validUntil string) {
		q := `INSERT INTO bimasugam.remediation_plans (plan_id, tenant_id, finding_ids, rule_ids, identity_ids, action_type, account_id,
				target_arn, target_type, risk_level, required_approvals, mode, status, plan_hash, created_by, valid_until,
				policy_id, target_key, scan_id)
			VALUES ('` + id + `', '` + tenantID + `', '{}', '{IAM-02}', '{}', 'deactivate_key', '` + account + `',
				'` + engineTarget + `', 'iam_user', 'LOW', 1, 'ONE_CLICK', '` + status + `', 'h1', 'auto:Deactivate unused keys', ` + validUntil + `,
				'` + enginePolicy + `', 'user/engine-target', 'scan-42')`
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatalf("engine plan fixture: %v", err)
		}
	}
	for _, q := range []string{`DELETE FROM bimasugam.remediation_executions`, `DELETE FROM bimasugam.remediation_approvals`, `DELETE FROM bimasugam.remediation_plans`} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	insert(enginePlanID, "PENDING_APPROVAL", "NULL")
	insert(engineExpired, "PENDING_APPROVAL", "now() - interval '1 day'")

	// the new columns are read back
	p, err := st.GetPlan(ctx, enginePlanID)
	if err != nil || p.PolicyID == nil || *p.PolicyID != enginePolicy || p.TargetKey != "user/engine-target" || p.ScanID != "scan-42" {
		t.Fatalf("engine plan columns: %+v %v", p, err)
	}

	analyst := domain.Actor{TenantID: tenantID, UserID: "ann@x", Role: domain.RoleAnalyst}
	approver := domain.Actor{TenantID: tenantID, UserID: "bob@x", Role: domain.RoleApprover}

	// a person approves it here ...
	if got, err := svc.Decide(ctx, approver, enginePlanID, true, "ok"); err != nil || got.Status != domain.PlanApproved {
		t.Fatalf("approve an engine plan: %v %v", got, err)
	}
	// ... but this service never submits, executes or rolls it back
	if _, err := svc.Execute(ctx, analyst, enginePlanID); err == nil || !strings.Contains(err.Error(), "engine") {
		t.Fatalf("execute an engine plan must be refused, got %v", err)
	}
	if _, err := svc.Submit(ctx, analyst, enginePlanID); err == nil || !strings.Contains(err.Error(), "engine") {
		t.Fatalf("submit an engine plan must be refused, got %v", err)
	}

	// its queued execution is not claimed by this service's worker
	if _, err := pool.Exec(ctx, `INSERT INTO bimasugam.remediation_executions (execution_id, plan_id, tenant_id, kind, triggered_by, status, scheduled_for)
		VALUES ('66666666-6666-6666-6666-666666666666', '`+enginePlanID+`', '`+tenantID+`', 'EXECUTE', 'auto:Deactivate unused keys', 'QUEUED', now())`); err != nil {
		t.Fatal(err)
	}
	if run := svc.Claim(ctx, st); run != nil {
		t.Fatalf("an engine execution was claimed by the dashboard worker: %+v", run)
	}

	// reconcile does not expire it, and a newer dashboard plan does not supersede it
	if err := svc.Reconcile(ctx, st); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.GetPlan(ctx, engineExpired); got == nil || got.Status != domain.PlanPendingApproval {
		t.Fatalf("an engine plan past valid_until was expired here: %+v", got)
	}
	if _, err := st.SupersedePlans(ctx, "77777777-7777-7777-7777-777777777777", engineTarget, "deactivate_key"); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.GetPlan(ctx, enginePlanID); got == nil || got.Status != domain.PlanApproved {
		t.Fatalf("an engine plan was superseded here: %+v", got)
	}

	// account columns shared with the engine
	if _, err := pool.Exec(ctx, `UPDATE bimasugam.accounts SET auto_remediation_enabled = true, jira_project_key = 'SEC' WHERE account_id = '`+account+`'`); err != nil {
		t.Fatal(err)
	}
	if a, err := st.GetAccount(ctx, account); err != nil || !a.AutoRemediationEnabled || a.JiraProjectKey != "SEC" {
		t.Fatalf("account columns: %+v %v", a, err)
	}
}

// TestEnginePendingPlanReused: the engine's automatic remediation made a plan for a Critical
// finding after a scan and nobody approved it yet. One-click from the dashboard returns that
// plan (pending) instead of making a second plan and a second approval e-mail; the fix view
// shows it; approving it here leaves the run to the engine.
func TestEnginePendingPlanReused(t *testing.T) {
	svc, _ := setupSeverity(t, "Critical")
	ctx := context.Background()
	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, fmt.Sprintf("postgres://postgres:pw@localhost:%s/nhi?sslmode=disable", os.Getenv("TEST_DB_PORT")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, q := range []string{`DELETE FROM bimasugam.remediation_executions`, `DELETE FROM bimasugam.remediation_approvals`,
		`DELETE FROM bimasugam.remediation_plans`,
		`INSERT INTO bimasugam.remediation_plans (plan_id, tenant_id, finding_ids, rule_ids, identity_ids, action_type, account_id,
			target_arn, target_type, risk_level, required_approvals, mode, status, plan_hash, created_by, policy_id, target_key, scan_id)
		 VALUES ('` + enginePlanID + `', '` + tenantID + `', '{` + findingID + `}', '{IAM-01}', '{}', 'deactivate_key', '` + account + `',
			'` + keyARN + `', 'iam_access_key', 'LOW', 1, 'ONE_CLICK', 'PENDING_APPROVAL', 'h1', 'auto:Critical keys',
			'` + enginePolicy + `', 'key/1', 'scan-43')`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatalf("fixture: %v\n%s", err, q)
		}
	}
	analyst := domain.Actor{TenantID: tenantID, UserID: "ann@x", Role: domain.RoleAnalyst}
	approver := domain.Actor{TenantID: tenantID, UserID: "bob@x", Role: domain.RoleApprover}

	p, existing, err := svc.CreateOrPendingPlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, Mode: domain.ModeOneClick})
	if err != nil || !existing || p.ID != enginePlanID || p.Status != domain.PlanPendingApproval {
		t.Fatalf("One-click must return the engine's pending plan: %+v existing=%v %v", p, existing, err)
	}
	var plans int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bimasugam.remediation_plans`).Scan(&plans); err != nil || plans != 1 {
		t.Fatalf("want 1 plan (no second one), got %d %v", plans, err)
	}
	// a request that mixes this finding with one that has no plan is refused, not silently cut
	if _, _, err := svc.CreateOrPendingPlan(ctx, analyst, engine.CreatePlanReq{
		FindingIDs: []string{findingID, "99999999-9999-9999-9999-999999999999"}, Mode: domain.ModeOneClick}); err == nil ||
		!strings.Contains(err.Error(), "already have a plan") {
		t.Fatalf("mixed request must be refused, got %v", err)
	}

	// the fix view shows the pending engine plan
	fix, err := findingfix.NewFindingFixService(findingfix.NewFindingFixRepository(svc)).
		Get(ctx, common.Caller{UserID: "vic@x", TenantID: tenantID, Role: "user"}, findingID)
	if err != nil {
		t.Fatal(err)
	}
	if pp := fix.Modes.OneClick.PendingPlan; pp == nil || pp.PlanID != enginePlanID || !pp.ByEngine || !fix.Modes.OneClick.ApprovalRequired {
		t.Fatalf("fix view pending plan: %+v", fix.Modes.OneClick)
	}

	// approving it in the dashboard: APPROVED, and the engine (not this service) runs it
	if got, err := svc.Decide(ctx, approver, enginePlanID, true, "ok"); err != nil || got.Status != domain.PlanApproved {
		t.Fatalf("approve the engine plan: %+v %v", got, err)
	}
	if run := svc.Claim(ctx, st); run != nil {
		t.Fatalf("the dashboard worker must not run an engine plan: %+v", run)
	}

	// Guided always gets its own plan
	g, existing, err := svc.CreateOrPendingPlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, Mode: domain.ModeGuided})
	if err != nil || existing || g.Mode != domain.ModeGuided {
		t.Fatalf("guided plan: %+v existing=%v %v", g, existing, err)
	}
}
