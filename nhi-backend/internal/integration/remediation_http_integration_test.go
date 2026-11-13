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
	"fmt"
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

func (m httpUsers) ValidateAuthContext(_ context.Context, email, _, _, _ string) (bool, string, error) {
	role, ok := m[email]
	return ok, role, nil
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
	if setupData["external_id"] != "ext-onboarding-1" {
		t.Fatalf("setup must reuse the onboarding external id: %v", setupData)
	}
	// an account that is not onboarded (not in the accounts table) cannot be configured
	call("admin@x", http.MethodPut, "/accounts/999999999999", `{"remediation_enabled":false}`, http.StatusNotFound)

	// the fix view shows both modes. IAM-01's default fix is rotate_access_key: this account does
	// not allow it, so One-click says why not, and as a risky fix it needs approval on any severity.
	modes, _ := data(call("vic@x", http.MethodGet, "/findings/"+findingID+"/fix", "", http.StatusOK))["modes"].(map[string]any)
	oneClick, _ := modes["one_click"].(map[string]any)
	guided, _ := modes["guided"].(map[string]any)
	if guided["available"] != true || oneClick["available"] != false || oneClick["approval_required"] != true ||
		!strings.Contains(fmt.Sprint(oneClick["reason"]), "rotate_access_key") {
		t.Fatalf("fix modes: %v", modes)
	}

	// One-click for a High finding: no submit, no approval, no execute call
	plan := data(call("ann@x", http.MethodPost, "/plans", `{"finding_ids":["`+findingID+`"],"action_type":"deactivate_key","mode":"ONE_CLICK"}`, http.StatusCreated))
	planID, _ := plan["plan_id"].(string)
	if plan["mode"] != string(domain.ModeOneClick) || plan["status"] != string(domain.PlanScheduled) {
		t.Fatalf("want ONE_CLICK/SCHEDULED, got %v/%v (%v)", plan["mode"], plan["status"], plan["status_reason"])
	}
	detail := data(call("vic@x", http.MethodGet, "/plans/"+planID, "", http.StatusOK))
	if p, _ := detail["plan"].(map[string]any); p["plan_id"] != planID {
		t.Fatalf("plan detail: %v", detail)
	}
	call("ann@x", http.MethodPost, "/plans/"+planID+"/submit", "", http.StatusConflict)

	// the background worker's job, done inline
	ctx := context.Background()
	st, err := svc.Store(ctx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	run := claimWait(ctx, svc, st)
	if run == nil || run.PlanID != planID {
		t.Fatalf("execution not claimed: %v", run)
	}
	execID := run.ID
	svc.RunExecution(ctx, st, run)
	if ex := data(call("vic@x", http.MethodGet, "/executions/"+execID, "", http.StatusOK)); ex["status"] != string(domain.ExecSucceeded) {
		t.Fatalf("execution status %v", ex["status"])
	}
	if fake.status != "Inactive" {
		t.Fatalf("the fake key was not changed: %s", fake.status)
	}

	// the read-only fix view: finding details, the engine's how-to-fix and the guided steps
	fix := data(call("vic@x", http.MethodGet, "/findings/"+findingID+"/fix", "", http.StatusOK))
	if fix["rule_id"] != "IAM-01" || fix["fix"] == nil || !strings.Contains(fix["summary_text"].(string), "Rule: IAM-01") {
		t.Fatalf("fix view: %v", fix)
	}
	call("vic@x", http.MethodGet, "/findings/00000000-0000-0000-0000-000000000000/fix", "", http.StatusNotFound)
	if l, _ := call("vic@x", http.MethodGet, "/findings/"+findingID, "", http.StatusOK)["data"].([]any); len(l) == 0 {
		t.Fatal("finding has no plans")
	}
	if l, _ := call("vic@x", http.MethodGet, "/plans?status=VERIFIED&account_id="+account, "", http.StatusOK)["data"].([]any); len(l) == 0 {
		t.Fatal("no VERIFIED plan listed")
	}
	// the mode filter (other tests leave plans of both modes in the database)
	for _, mode := range []domain.Mode{domain.ModeOneClick, domain.ModeGuided} {
		l, _ := call("vic@x", http.MethodGet, "/plans?limit=200&mode="+strings.ToLower(string(mode)), "", http.StatusOK)["data"].([]any)
		for _, it := range l {
			if p, _ := it.(map[string]any); p["mode"] != string(mode) {
				t.Fatalf("mode=%s lists a %v plan", mode, p["mode"])
			}
		}
		if mode == domain.ModeOneClick && len(l) == 0 {
			t.Fatal("mode=ONE_CLICK lists no plan")
		}
	}
	call("vic@x", http.MethodGet, "/plans?mode=AUTO", "", http.StatusBadRequest)
	// the list says how many plans match in all pages, also when the page is smaller
	pg := call("vic@x", http.MethodGet, "/plans?account_id="+account+"&limit=1", "", http.StatusOK)
	pagination, _ := pg["pagination"].(map[string]any)
	if n, _ := pagination["page_size"].(float64); n != 1 {
		t.Fatalf("page_size = %v, want 1", pagination["page_size"])
	}
	if n, _ := pagination["count"].(float64); n != 1 {
		t.Fatalf("count = %v, want 1", pagination["count"])
	}
	if total, _ := pagination["total_count"].(float64); total < 1 {
		t.Fatalf("total_count = %v, want at least 1", pagination["total_count"])
	}
	if l, _ := call("vic@x", http.MethodGet, "/actions", "", http.StatusOK)["data"].([]any); len(l) < 10 {
		t.Fatalf("catalog has %d actions", len(l))
	}
	if l, _ := call("vic@x", http.MethodGet, "/accounts", "", http.StatusOK)["data"].([]any); len(l) != 1 {
		t.Fatalf("want 1 account, got %d", len(l))
	}

	rb := data(call("ann@x", http.MethodPost, "/plans/"+planID+"/rollback", "", http.StatusAccepted))
	if run = claimWait(ctx, svc, st); run == nil || run.ID != rb["execution_id"] {
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
