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
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/modules/remediation/auditlog"
	"nhi-backend-api/internal/modules/remediation/getplan"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/provider"
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

func setup(t *testing.T) (*engine.Service, *fakeAWS) {
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
		`DELETE FROM bimasugam.ispm_nhi_findings`,
		`INSERT INTO bimasugam.ispm_nhi_findings (finding_id, tenant_id, account_id, rule_id, rule_name, severity, identity_id, identity_name,
			identity_type, credential_arn, title, evidence, status, first_seen, last_seen, finding_key)
		 VALUES ('` + findingID + `', '` + tenantID + `', '` + account + `', 'IAM-01', 'Unused access key', 'High', 'alice', 'alice', 'IAM_USER',
			'` + keyARN + `', 'Access key unused', '{"user_name":"alice","access_key_id":"AKIAEXAMPLE000000001"}', 'OPEN', now(), now(), 'k1')`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatalf("fixture: %v\n%s", err, q)
		}
	}

	fake := &fakeAWS{status: "Active"}
	svc := engine.New(&cfg, tenants.NewResolver(pool, "nhi_global"), provider.NewRegistry(fake), nil, slog.New(slog.DiscardHandler))
	return svc, fake
}

func TestOneClickFlow(t *testing.T) {
	svc, fake := setup(t)
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

	plan, err := svc.CreatePlan(ctx, analyst, engine.CreatePlanReq{FindingIDs: []string{findingID}})
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	t.Logf("plan %s mode=%s status=%s approvals=%d", plan.ID, plan.Mode, plan.Status, plan.RequiredApprovals)
	if plan.Mode != domain.ModeOneClick || plan.Status != domain.PlanReady {
		t.Fatalf("want ONE_CLICK/READY, got %s/%s", plan.Mode, plan.Status)
	}

	if plan, err = svc.Submit(ctx, analyst, plan.ID); err != nil || plan.Status != domain.PlanPendingApproval {
		t.Fatalf("submit: %v %v", plan, err)
	}
	if _, err = svc.Decide(ctx, analyst, plan.ID, true, "self"); err == nil {
		t.Fatal("an analyst must not approve")
	}
	if plan, err = svc.Decide(ctx, approver, plan.ID, true, "ok"); err != nil {
		t.Fatalf("approve: %v", err)
	}
	t.Logf("after approval: %s", plan.Status)

	ex, err := svc.Execute(ctx, analyst, plan.ID)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}

	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	var run *domain.Execution
	for i := 0; i < 10 && run == nil; i++ {
		if run = svc.Claim(ctx, st); run == nil {
			time.Sleep(200 * time.Millisecond)
		}
	}
	if run == nil || run.ID != ex.ID {
		t.Fatalf("worker did not claim the execution: %v", run)
	}
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
	if run = svc.Claim(ctx, st); run == nil || run.ID != rb.ID {
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
