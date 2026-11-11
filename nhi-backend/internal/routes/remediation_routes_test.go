package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/remediation"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
)

const (
	remTestSecret  = "remediation-routes-test-secret-0123456789"
	remTestTenant  = "11111111-1111-1111-1111-111111111111"
	remTestSession = "22222222-2222-2222-2222-222222222222"
	remTestPlan    = "33333333-3333-3333-3333-333333333333"
)

// roleByEmail stands in for the user table: the middleware takes the role
// from here, not from the token.
type roleByEmail map[string]string

func (m roleByEmail) ValidateAuthContext(_ context.Context, email, _, _ string) (bool, string, string, error) {
	role, ok := m[email]
	return ok, role, "bimasugam", nil
}

// remediationRouter mounts the remediation endpoints behind the real auth
// middleware. The engine is nil: every case below is answered before a
// repository is reached.
func remediationRouter() *mux.Router {
	users := roleByEmail{"viewer@x": "user", "analyst@x": "analyst", "manager@x": "manager", "admin@x": "admin"}
	return SetupRoutes(HandlerContainer{
		AuthMiddleware:      middleware.NewAuthMiddleware(config.JWTConfig{Secret: remTestSecret}, users),
		RemediationHandlers: remediation.NewHandlers(nil),
	})
}

func remCall(t *testing.T, r http.Handler, user, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if user != "" {
		tok, err := jwt.GenerateToken(user, remTestTenant, "bimasugam", "", remTestSession, remTestSecret, time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestRemediationNeedsLogin(t *testing.T) {
	rec := remCall(t, remediationRouter(), "", http.MethodGet, "/api/v1/remediation/plans", "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	var body struct {
		Error struct{ Code string } `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error.Code != "UNAUTHORIZED" {
		t.Fatalf("401 body is not {error:{code}}: %s", rec.Body.String())
	}
}

func TestRemediationRolesAreEnforced(t *testing.T) {
	const base = "/api/v1/remediation"
	plan := base + "/plans/" + remTestPlan
	r := remediationRouter()
	for _, tc := range []struct{ user, method, path, body string }{
		{"viewer@x", http.MethodPost, base + "/plans", `{"finding_ids":["` + remTestPlan + `"]}`},
		{"viewer@x", http.MethodPost, plan + "/approve", ""},
		{"analyst@x", http.MethodPost, plan + "/approve", ""},
		{"analyst@x", http.MethodPost, plan + "/reject", ""},
		{"manager@x", http.MethodPost, plan + "/execute", ""},
		{"manager@x", http.MethodPost, plan + "/submit", ""},
		{"viewer@x", http.MethodPost, base + "/executions/" + remTestPlan + "/rollback", ""},
		{"analyst@x", http.MethodPut, base + "/accounts/123456789012", `{}`},
		{"analyst@x", http.MethodGet, base + "/accounts/123456789012/setup", ""},
		{"manager@x", http.MethodPut, base + "/integrations/jira", `{}`},
		{"analyst@x", http.MethodGet, base + "/integrations", ""},
	} {
		if rec := remCall(t, r, tc.user, tc.method, tc.path, tc.body); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s as %s: got %d (%s), want 403", tc.method, tc.path, tc.user, rec.Code, rec.Body.String())
		}
	}
}

func TestRemediationRejectsBadInput(t *testing.T) {
	const base = "/api/v1/remediation"
	r := remediationRouter()
	for _, tc := range []struct{ user, method, path, body, field string }{
		{"admin@x", http.MethodGet, base + "/plans/not-a-uuid", "", "id"},
		{"admin@x", http.MethodGet, base + "/accounts/12", "", "account_id"},
		{"admin@x", http.MethodGet, base + "/plans?colour=red", "", "colour"},
		{"admin@x", http.MethodGet, base + "/plans?limit=-1", "", "limit"},
		{"analyst@x", http.MethodPost, base + "/plans", `{}`, "finding_ids"},
		{"analyst@x", http.MethodPost, base + "/plans", `{"finding_ids":["x"]}`, "finding_ids"},
		{"analyst@x", http.MethodPost, base + "/plans", `{"finding_ids":["` + remTestPlan + `"],"mode":"AUTO"}`, "mode"},
		{"analyst@x", http.MethodPost, base + "/plans", `{"finding_ids":[],"batch_id":"x"}`, "body"},
		{"analyst@x", http.MethodPost, base + "/plans", "", "body"},
		{"analyst@x", http.MethodPost, base + "/batches", `{"mode":"SOMETIMES","items":[]}`, "mode"},
		{"admin@x", http.MethodPut, base + "/integrations/slack", `{"config":{}}`, "type"},
		{"admin@x", http.MethodGet, base + "/audit?plan_id=abc", "", "plan_id"},
	} {
		rec := remCall(t, r, tc.user, tc.method, tc.path, tc.body)
		var body struct {
			Error struct{ Code, Field string } `json:"error"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != http.StatusBadRequest || body.Error.Field != tc.field {
			t.Errorf("%s %s: got %d field=%q (%s), want 400 field=%q", tc.method, tc.path, rec.Code, body.Error.Field, rec.Body.String(), tc.field)
		}
	}
}

// Every remediation route is mounted under /api/v1/remediation and /api/remediation.
func TestRemediationRoutesAreMounted(t *testing.T) {
	var v1, legacy int
	_ = remediationRouter().Walk(func(route *mux.Route, _ *mux.Router, _ []*mux.Route) error {
		tpl, err := route.GetPathTemplate()
		if err != nil {
			return nil
		}
		if _, err := route.GetMethods(); err != nil {
			return nil // a subrouter prefix, not an endpoint
		}
		switch {
		case strings.HasPrefix(tpl, "/api/v1/remediation/"):
			v1++
		case strings.HasPrefix(tpl, "/api/remediation/"):
			legacy++
		}
		return nil
	})
	if v1 != 30 || legacy != 30 { // 30 with GET /findings (the backlog)
		t.Fatalf("mounted %d routes under /api/v1/remediation and %d under /api/remediation, want 30 each", v1, legacy)
	}
}
