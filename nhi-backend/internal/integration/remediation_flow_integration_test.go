//go:build integration

// Runs the whole One-click flow against a real Postgres with a fake provider.
//
//	ENGINE_DIR=../NHI-ISPM scripts/setup_remediation_test_db.sh 57432
//	TEST_DB_PORT=57432 go test -tags integration -run TestOneClickFlow ./internal/integration
//
// The database needs the engine tables (ispm_*) in schema "bimasugam", a scanner
// table bimasugam.identities and nhi_global.tenants; the script creates them.
package integration_test

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/modules/remediation/auditlog"
	"nhi-backend-api/internal/modules/remediation/getplan"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/provider"
	"nhi-backend-api/internal/remediation/store"
	"nhi-backend-api/internal/remediation/tenants"
)

const (
	tenantID  = "11111111-1111-1111-1111-111111111111"
	findingID = "22222222-2222-2222-2222-222222222222"
	account   = "123456789012"
	keyARN    = "arn:aws:iam::123456789012:user/alice"
)

// fakeAWS keeps one access key whose status the plan changes.
type fakeAWS struct{ status string }

func (f *fakeAWS) Platform() string     { return "aws" }
func (f *fakeAWS) Supports(string) bool { return true }
func (f *fakeAWS) live() map[string]any { return map[string]any{"status": f.status} }
func (f *fakeAWS) LiveState(context.Context, provider.Target) (map[string]any, error) {
	return f.live(), nil
}
func (f *fakeAWS) Plan(_ context.Context, in provider.PlanInput) (*provider.PlanOutput, error) {
	return &provider.PlanOutput{
		TargetARN: keyARN, TargetType: "IAM_USER", Params: in.Params,
		Before: f.live(), After: map[string]any{"status": "Inactive"},
		Diff:      []domain.DiffEntry{{Path: "status", Change: "changed", Before: f.status, After: "Inactive"}},
		Prechecks: []domain.Precheck{{Name: "unused for 7 days", Result: domain.CheckPass}},
	}, nil
}
func (f *fakeAWS) Execute(_ context.Context, in provider.RunInput) (*provider.RunResult, error) {
	if in.DryRun {
		return &provider.RunResult{}, nil
	}
	snap := f.live()
	f.status = "Inactive"
	return &provider.RunResult{RollbackState: snap, Result: map[string]any{"status": f.status}}, nil
}
func (f *fakeAWS) Verify(context.Context, provider.RunInput) (map[string]any, error) {
	if f.status != "Inactive" {
		return nil, fmt.Errorf("key is still %s", f.status)
	}
	return map[string]any{"verified": true, "status": f.status}, nil
}
func (f *fakeAWS) Rollback(_ context.Context, in provider.RollbackInput) (*provider.RunResult, error) {
	f.status, _ = in.RollbackState["status"].(string)
	return &provider.RunResult{}, nil
}
func (f *fakeAWS) ValidateAccess(context.Context, domain.Account) provider.AccessReport {
	return provider.AccessReport{Status: "OK", At: time.Now()}
}

// claimWait claims the next due execution, retrying for about 2 seconds: the queue compares the Go clock
// with the database clock, which can differ by a few milliseconds (Docker).
func claimWait(ctx context.Context, svc *engine.Service, st *store.Store) *domain.Execution {
	var run *domain.Execution
	for i := 0; i < 10 && run == nil; i++ {
		if run = svc.Claim(ctx, st); run == nil {
			time.Sleep(200 * time.Millisecond)
		}
	}
	return run
}

func setup(t *testing.T) (*engine.Service, *fakeAWS) {
	t.Helper()
	return setupSeverity(t, "High")
}

// setupSeverity is setup with the severity of the test finding (Critical needs approval).
func setupSeverity(t *testing.T, severity string) (*engine.Service, *fakeAWS) {
	t.Helper()
	port := os.Getenv("TEST_DB_PORT")
	if port == "" {
		t.Skip("TEST_DB_PORT not set")
	}
	cfg, err := config.Remediation() // defaults: auto-migrate on, dry run off
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// The throwaway database of scripts/setup_remediation_test_db.sh (no TLS, any port).
	pool, err := pgxpool.New(ctx, fmt.Sprintf("postgres://postgres:pw@localhost:%s/nhi?sslmode=disable", port))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	// start from a clean slate
	for _, q := range []string{
		`DELETE FROM nhi_global.tenants`,
		`INSERT INTO nhi_global.tenants (tenant_id, db_name) VALUES ('` + tenantID + `', 'bimasugam')`,
		// plans of an earlier test would be found as the finding's existing plan (the tables
		// exist from the second test on)
		`DO $$ BEGIN IF to_regclass('bimasugam.remediation_plans') IS NOT NULL THEN
			DELETE FROM bimasugam.remediation_executions; DELETE FROM bimasugam.remediation_approvals;
			DELETE FROM bimasugam.remediation_plans; END IF; END $$`,
		`DELETE FROM bimasugam.ispm_nhi_findings`,
		`INSERT INTO bimasugam.ispm_nhi_findings (finding_id, tenant_id, account_id, rule_id, rule_name, severity, identity_id, identity_name,
			identity_type, credential_arn, title, evidence, status, first_seen, last_seen, finding_key)
		 VALUES ('` + findingID + `', '` + tenantID + `', '` + account + `', 'IAM-01', 'Unused access key', '` + severity + `', 'alice', 'alice', 'IAM_USER',
			'` + keyARN + `', 'Access key unused', '{"user_name":"alice","access_key_id":"AKIAEXAMPLE000000001"}', 'OPEN', now(), now(), 'k1')`,
		// the onboarded account: remediation settings are columns of the platform's accounts table
		`DELETE FROM bimasugam.accounts`,
		`INSERT INTO bimasugam.accounts (tenant_id, account_id, external_id) VALUES ('` + tenantID + `', '` + account + `', 'ext-onboarding-1')`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatalf("fixture: %v\n%s", err, q)
		}
	}

	fake := &fakeAWS{status: "Active"}
	svc := engine.New(&cfg, tenants.NewResolver(pool, "nhi_global"), provider.NewRegistry(fake), nil, slog.New(slog.DiscardHandler))
	return svc, fake
}

// TestOneClickFlow: a Critical finding needs approval; once approved the plan runs by itself.
func TestOneClickFlow(t *testing.T) {
	svc, fake := setupSeverity(t, "Critical")
	ctx := context.Background()
	admin := domain.Actor{TenantID: tenantID, UserID: "admin@x", Role: domain.RoleAdmin}
	analyst := domain.Actor{TenantID: tenantID, UserID: "ann@x", Role: domain.RoleAnalyst}
	approver := domain.Actor{TenantID: tenantID, UserID: "bob@x", Role: domain.RoleApprover}

	if _, err := svc.PutAccount(ctx, admin, account, engine.AccountReq{
		Enabled: true, RoleARN: "arn:aws:iam::" + account + ":role/ISPMRemediation",
		AllowedActionTypes: []string{"deactivate_key"}, EnabledRegions: []string{"ap-south-1"},
		GraceDays: []byte(`{"deactivate_key":0}`),
	}); err != nil {
		t.Fatalf("put account: %v", err)
	}

	// IAM-01 maps to rotate_access_key (default) with deactivate_key as alternative (ispm_rule_weights)
	plan, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "deactivate_key"})
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	t.Logf("plan %s mode=%s status=%s approvals=%d", plan.ID, plan.Mode, plan.Status, plan.RequiredApprovals)
	// a Critical One-click plan is submitted at once: it waits for approval
	if plan.Mode != domain.ModeOneClick || plan.Status != domain.PlanPendingApproval || plan.RequiredApprovals != 1 {
		t.Fatalf("want ONE_CLICK/PENDING_APPROVAL with exactly 1 approval, got %s/%s/%d", plan.Mode, plan.Status, plan.RequiredApprovals)
	}
	if _, err = svc.Decide(ctx, analyst, plan.ID, true, "self"); err == nil {
		t.Fatal("an analyst must not approve")
	}
	if plan, err = svc.Decide(ctx, approver, plan.ID, true, "ok"); err != nil {
		t.Fatalf("approve: %v", err)
	}
	// the approval queues the run: nobody calls execute
	if plan.Status != domain.PlanScheduled {
		t.Fatalf("after approval want SCHEDULED, got %s (%s)", plan.Status, plan.StatusReason)
	}

	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	run := claimWait(ctx, svc, st)
	if run == nil || run.PlanID != plan.ID || run.TriggeredBy != analyst.UserID {
		t.Fatalf("worker did not claim the execution started for the plan's creator: %v", run)
	}
	ex := run
	svc.RunExecution(ctx, st, run)

	done, err := getplan.NewGetPlanRepository(svc).Get(ctx, tenantID, plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("final status %s, executions=%d", done.Plan.Status, len(done.Executions))
	if fake.status != "Inactive" {
		t.Fatalf("the fake key was not changed: %s", fake.status)
	}
	if done.Plan.Status != domain.PlanVerified {
		t.Fatalf("want VERIFIED, got %s", done.Plan.Status)
	}

	// rollback restores the key
	rb, err := svc.Rollback(ctx, approver, ex.ID)
	if err == nil {
		t.Fatalf("an approver must not roll back, got %v", rb)
	}
	rb, err = svc.Rollback(ctx, analyst, ex.ID)
	if err != nil {
		t.Fatalf("rollback: %v", err)
	}
	if run = claimWait(ctx, svc, st); run == nil || run.ID != rb.ID {
		t.Fatalf("rollback not claimed: %v", run)
	}
	svc.RunExecution(ctx, st, run)
	if fake.status != "Active" {
		t.Fatalf("rollback did not restore the key: %s", fake.status)
	}

	evs, err := auditlog.NewAuditLogRepository(svc).List(ctx, tenantID, plan.ID, 100)
	if err != nil || len(evs) < 5 {
		t.Fatalf("audit trail too short: %d %v", len(evs), err)
	}
	for _, e := range evs {
		t.Logf("audit %-22s by %s", e.Event, e.Actor)
	}
}

// TestOneClickNoApproval: a finding below Critical runs right after the plan is created,
// with no approval and no approval e-mail.
func TestOneClickNoApproval(t *testing.T) {
	svc, fake := setup(t) // High
	ctx := context.Background()
	admin := domain.Actor{TenantID: tenantID, UserID: "admin@x", Role: domain.RoleAdmin}
	analyst := domain.Actor{TenantID: tenantID, UserID: "ann@x", Role: domain.RoleAnalyst}
	if _, err := svc.PutAccount(ctx, admin, account, engine.AccountReq{
		Enabled: true, RoleARN: "arn:aws:iam::" + account + ":role/ISPMRemediation",
		AllowedActionTypes: []string{"deactivate_key"}, EnabledRegions: []string{"ap-south-1"},
		GraceDays: []byte(`{"deactivate_key":0}`),
	}); err != nil {
		t.Fatalf("put account: %v", err)
	}
	plan, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "deactivate_key"})
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	if plan.Mode != domain.ModeOneClick || plan.Status != domain.PlanScheduled || plan.RequiredApprovals != 0 {
		t.Fatalf("want ONE_CLICK/SCHEDULED/0 approvals, got %s/%s/%d (%s)", plan.Mode, plan.Status, plan.RequiredApprovals, plan.StatusReason)
	}
	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	run := claimWait(ctx, svc, st)
	if run == nil || run.PlanID != plan.ID {
		t.Fatalf("execution not claimed: %v", run)
	}
	svc.RunExecution(ctx, st, run)
	if fake.status != "Inactive" {
		t.Fatalf("the fake key was not changed: %s", fake.status)
	}
	done, err := st.GetPlan(ctx, plan.ID)
	if err != nil || done.Status != domain.PlanVerified {
		t.Fatalf("want VERIFIED, got %v %v", done, err)
	}

	// Guided stays Guided on the same account when asked for
	g, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "deactivate_key", Mode: domain.ModeGuided})
	if err != nil || g.Mode != domain.ModeGuided || g.Status != domain.PlanReady {
		t.Fatalf("guided plan: %v %v", g, err)
	}
}

// TestEmailsFollowTheSeverityRule: the e-mails that really reach the outbox. A Critical
// One-click plan, or a risky fix on any severity, sends one approval e-mail to the approvers
// and nothing when it is approved or finished; a safe fix on a High finding and a Guided plan
// send none. One approval is always enough, whatever the account's approval_policy says.
func TestEmailsFollowTheSeverityRule(t *testing.T) {
	store.SetEnvIntegrations(config.RemediationIntegrationsConfig{Email: config.RemediationEmailEnv{
		Provider: "ses", From: "alerts@example.com", Approvers: []string{"approver@example.com"},
		Notify: []string{"team@example.com"}, SESRegion: "ap-south-1"}})
	t.Cleanup(func() { store.SetEnvIntegrations(config.RemediationIntegrationsConfig{}) })

	mails := func(t *testing.T, planID string) []string {
		t.Helper()
		pool, err := pgxpool.New(context.Background(), fmt.Sprintf("postgres://postgres:pw@localhost:%s/nhi?sslmode=disable", os.Getenv("TEST_DB_PORT")))
		if err != nil {
			t.Fatal(err)
		}
		defer pool.Close()
		rows, err := pool.Query(context.Background(), `SELECT type || ' -> ' || array_to_string(recipients, ',')
			FROM bimasugam.remediation_notifications WHERE plan_id = $1::uuid ORDER BY created_at`, planID)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		return out
	}
	oneClickAccount := func(svc *engine.Service) {
		admin := domain.Actor{TenantID: tenantID, UserID: "admin@x", Role: domain.RoleAdmin}
		// an approval policy that used to ask for 2 or 3 approvers: it no longer counts
		if _, err := svc.PutAccount(context.Background(), admin, account, engine.AccountReq{
			Enabled: true, RoleARN: "arn:aws:iam::" + account + ":role/ISPMRemediation",
			AllowedActionTypes: []string{"deactivate_key", "rotate_access_key"}, EnabledRegions: []string{"ap-south-1"},
			ApprovalPolicy: []byte(`{"low":2,"medium":2,"high":3}`),
			GraceDays:      []byte(`{"deactivate_key":0}`)}); err != nil {
			t.Fatal(err)
		}
	}
	ctx := context.Background()
	analyst := domain.Actor{TenantID: tenantID, UserID: "ann@x", Role: domain.RoleAnalyst}
	approver := domain.Actor{TenantID: tenantID, UserID: "bob@x", Role: domain.RoleApprover}
	req := engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "deactivate_key", Mode: domain.ModeOneClick}

	// Critical: one approval e-mail, to the approvers only
	svc, _ := setupSeverity(t, "Critical")
	oneClickAccount(svc)
	plan, err := svc.CreatePlan(ctx, analyst, req)
	if err != nil || plan.Status != domain.PlanPendingApproval {
		t.Fatalf("critical plan: %+v %v", plan, err)
	}
	if got := mails(t, plan.ID); len(got) != 1 || got[0] != "APPROVAL_REQUESTED -> approver@example.com" {
		t.Fatalf("critical: want one approval e-mail to the approver, got %v", got)
	}
	// approving and running send nothing more
	if plan, err = svc.Decide(ctx, approver, plan.ID, true, "ok"); err != nil || plan.Status != domain.PlanScheduled {
		t.Fatalf("approve: %+v %v", plan, err)
	}
	st, _ := svc.Store(ctx, tenantID)
	if run := claimWait(ctx, svc, st); run == nil {
		t.Fatal("not claimed")
	} else {
		svc.RunExecution(ctx, st, run)
	}
	if got := mails(t, plan.ID); len(got) != 1 {
		t.Fatalf("critical after approval and run: want still 1 e-mail, got %v", got)
	}

	// a failed run sends nothing either
	svc, fake := setupSeverity(t, "Critical")
	oneClickAccount(svc)
	if plan, err = svc.CreatePlan(ctx, analyst, req); err != nil {
		t.Fatal(err)
	}
	if plan, err = svc.Decide(ctx, approver, plan.ID, true, "ok"); err != nil {
		t.Fatal(err)
	}
	fake.status = "Deleted" // AWS changed after the plan was made: the run fails with drift
	st, _ = svc.Store(ctx, tenantID)
	if run := claimWait(ctx, svc, st); run != nil {
		svc.RunExecution(ctx, st, run)
	}
	if failed, err := st.GetPlan(ctx, plan.ID); err != nil || failed.Status != domain.PlanFailed {
		t.Fatalf("the run was meant to fail, plan is %v %v", failed, err)
	}
	for _, m := range mails(t, plan.ID) {
		if !strings.HasPrefix(m, "APPROVAL_REQUESTED") {
			t.Fatalf("a finished or failed run sent an e-mail: %s", m)
		}
	}

	// High: no approval, no e-mail at all, even after the run
	svc, _ = setupSeverity(t, "High")
	oneClickAccount(svc)
	if plan, err = svc.CreatePlan(ctx, analyst, req); err != nil || plan.Status != domain.PlanScheduled {
		t.Fatalf("high plan: %+v %v", plan, err)
	}
	st, _ = svc.Store(ctx, tenantID)
	if run := claimWait(ctx, svc, st); run != nil {
		svc.RunExecution(ctx, st, run)
	}
	if got := mails(t, plan.ID); len(got) != 0 {
		t.Fatalf("high: want no e-mail, got %v", got)
	}

	// a risky fix (rotate_access_key) always needs approval, on a Low and on a High finding:
	// one approval e-mail, and one approval is enough
	for _, sev := range []string{"Low", "High"} {
		svc, _ = setupSeverity(t, sev)
		oneClickAccount(svc)
		rp, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "rotate_access_key", Mode: domain.ModeOneClick})
		if err != nil || rp.Status != domain.PlanPendingApproval || rp.RequiredApprovals != 1 {
			t.Fatalf("%s finding, risky fix: want PENDING_APPROVAL with 1 approval, got %+v %v", sev, rp, err)
		}
		if got := mails(t, rp.ID); len(got) != 1 || got[0] != "APPROVAL_REQUESTED -> approver@example.com" {
			t.Fatalf("%s finding, risky fix: want one approval e-mail, got %v", sev, got)
		}
		if rp, err = svc.Decide(ctx, approver, rp.ID, true, "ok"); err != nil || rp.Status != domain.PlanScheduled {
			t.Fatalf("%s finding, risky fix: one approval must be enough: %+v %v", sev, rp, err)
		}
	}

	// Guided: no e-mail
	svc, _ = setupSeverity(t, "Critical")
	oneClickAccount(svc)
	g, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}, ActionType: "deactivate_key", Mode: domain.ModeGuided})
	if err != nil || g.Mode != domain.ModeGuided {
		t.Fatalf("guided: %+v %v", g, err)
	}
	if got := mails(t, g.ID); len(got) != 0 {
		t.Fatalf("guided: want no e-mail, got %v", got)
	}
}
