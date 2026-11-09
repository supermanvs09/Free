//go:build integration

// The One-click flow over HTTP: the real router and JWT middleware, every
// remediation endpoint layer (handler → service → repository → engine) and a
// real Postgres; only AWS is faked. Same database as TestOneClickFlow:
//
//	TEST_DB_PORT=57432 go test -tags integration -run TestOneClickFlowHTTP ./internal/integration
package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"nhi-backend-api/internal/modules/remediation"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/routes"
)

const httpTestSecret = "remediation-http-integration-secret-0123456789"

type httpUsers map[string]string

func (m httpUsers) ValidateAuthContext(_ context.Context, email, _, _ string) (bool, string, string, error) {
	role, ok := m[email]
	return ok, role, "bimasugam", nil
}

func TestOneClickFlowHTTP(t *testing.T) {
	svc, fake := setup(t)
	router := routes.SetupRoutes(routes.HandlerContainer{
		AuthMiddleware: middleware.NewAuthMiddleware(config.JWTConfig{Secret: httpTestSecret},
			httpUsers{"admin@x": "admin", "ann@x": "analyst", "bob@x": "manager", "vic@x": "user"}),
		RemediationHandlers: remediation.NewHandlers(svc),
	})
	call := func(user, method, path, body string, want int) map[string]any {
		t.Helper()
		tok, err := jwt.GenerateToken(user, tenantID, "bimasugam", "", "44444444-4444-4444-4444-444444444444", httpTestSecret, time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, "/api/v1/remediation"+path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s %s as %s: got %d, want %d: %s", method, path, user, rec.Code, want, rec.Body.String())
		}
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}
	data := func(m map[string]any) map[string]any { d, _ := m["data"].(map[string]any); return d }

	call("admin@x", http.MethodPut, "/accounts/"+account, `{"remediation_enabled":true,
		"remediation_role_arn":"arn:aws:iam::`+account+`:role/ISPMRemediation",
		"allowed_action_types":["deactivate_key"],"enabled_regions":["ap-south-1"],"grace_days":{"deactivate_key":0}}`, http.StatusOK)
	call("vic@x", http.MethodGet, "/accounts/"+account+"/setup", "", http.StatusForbidden)
	setupData := data(call("admin@x", http.MethodGet, "/accounts/"+account+"/setup", "", http.StatusOK))
	if setupData["external_id"] == "" {
		t.Fatalf("setup has no external id: %v", setupData)
	}

	plan := data(call("ann@x", http.MethodPost, "/plans", `{"finding_ids":["`+findingID+`"]}`, http.StatusCreated))
	planID, _ := plan["plan_id"].(string)
	if plan["mode"] != string(domain.ModeOneClick) || plan["status"] != string(domain.PlanReady) {
		t.Fatalf("want ONE_CLICK/READY, got %v/%v", plan["mode"], plan["status"])
	}
	detail := data(call("vic@x", http.MethodGet, "/plans/"+planID, "", http.StatusOK))
	if p, _ := detail["plan"].(map[string]any); p["plan_id"] != planID {
		t.Fatalf("plan detail: %v", detail)
	}
	call("ann@x", http.MethodPost, "/plans/"+planID+"/submit", "", http.StatusOK)
	call("ann@x", http.MethodPost, "/plans/"+planID+"/approve", `{"comment":"self"}`, http.StatusForbidden)
	if p := data(call("bob@x", http.MethodPost, "/plans/"+planID+"/approve", `{"comment":"ok"}`, http.StatusOK)); p["status"] != string(domain.PlanApproved) {
		t.Fatalf("after approve: %v", p["status"])
	}
	queued := call("ann@x", http.MethodPost, "/plans/"+planID+"/execute", "", http.StatusAccepted)
	execID, _ := data(queued)["execution_id"].(string)
	if queued["status_url"] != "/api/v1/remediation/executions/"+execID {
		t.Fatalf("status_url: %v", queued["status_url"])
	}

	// the background worker's job, done inline
	ctx := context.Background()
	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	run := svc.Claim(ctx, st)
	if run == nil || run.ID != execID {
		t.Fatalf("execution not claimed: %v", run)
	}
	svc.RunExecution(ctx, st, run)
	if ex := data(call("vic@x", http.MethodGet, "/executions/"+execID, "", http.StatusOK)); ex["status"] != string(domain.ExecSucceeded) {
		t.Fatalf("execution status %v", ex["status"])
	}
	if fake.status != "Inactive" {
		t.Fatalf("the fake key was not changed: %s", fake.status)
	}

	if l, _ := call("vic@x", http.MethodGet, "/findings/"+findingID, "", http.StatusOK)["data"].([]any); len(l) == 0 {
		t.Fatal("finding has no plans")
	}
	if l, _ := call("vic@x", http.MethodGet, "/plans?status=VERIFIED&account_id="+account, "", http.StatusOK)["data"].([]any); len(l) == 0 {
		t.Fatal("no VERIFIED plan listed")
	}
	if l, _ := call("vic@x", http.MethodGet, "/actions", "", http.StatusOK)["data"].([]any); len(l) < 10 {
		t.Fatalf("catalog has %d actions", len(l))
	}
	if l, _ := call("vic@x", http.MethodGet, "/accounts", "", http.StatusOK)["data"].([]any); len(l) != 1 {
		t.Fatalf("want 1 account, got %d", len(l))
	}

	rb := data(call("ann@x", http.MethodPost, "/executions/"+execID+"/rollback", "", http.StatusAccepted))
	if run = svc.Claim(ctx, st); run == nil || run.ID != rb["execution_id"] {
		t.Fatalf("rollback not claimed: %v", run)
	}
	svc.RunExecution(ctx, st, run)
	if fake.status != "Active" {
		t.Fatalf("rollback did not restore the key: %s", fake.status)
	}
	if l, _ := call("vic@x", http.MethodGet, "/audit?plan_id="+planID, "", http.StatusOK)["data"].([]any); len(l) < 8 {
		t.Fatalf("audit trail too short: %d", len(l))
	}
	call("vic@x", http.MethodGet, "/plans/00000000-0000-0000-0000-000000000000", "", http.StatusNotFound)
}
