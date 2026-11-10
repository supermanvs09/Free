//go:build integration

// GET /remediation/email-sync: the position of the rule engine's e-mail sync (ispm_email_sync) and the
// finding events after it. The backend only reads the table. Same database as TestOneClickFlow:
//
//	TEST_DB_PORT=57432 go test -tags integration -run TestEmailSync ./internal/integration
package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/modules/remediation"
	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/modules/remediation/emailsync"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/routes"
)

func TestEmailSyncStatus(t *testing.T) {
	svc, _ := setup(t)
	ctx := context.Background()
	if _, err := svc.Store(ctx, tenantID); err != nil { // creates the remediation tables
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, fmt.Sprintf("postgres://postgres:pw@localhost:%s/nhi?sslmode=disable", os.Getenv("TEST_DB_PORT")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
	}
	repo := emailsync.NewEmailSyncRepository(svc)
	viewer := common.Caller{UserID: "vic@x", TenantID: tenantID, Role: "user"}
	service := emailsync.NewEmailSyncService(repo)

	// 1. the engine has not created the table: a clear 404
	exec(`DROP TABLE IF EXISTS bimasugam.ispm_email_sync`)
	if _, err := service.Get(ctx, viewer, 0); err == nil || !strings.Contains(err.Error(), "ispm_email_sync does not exist") {
		t.Fatalf("a missing table must be reported, got %v", err)
	}

	// 2. the table exists, the engine has not written a row: every event is still waiting
	exec(`CREATE TABLE bimasugam.ispm_email_sync (tenant_id uuid PRIMARY KEY, cursor_at timestamptz, cursor_id text, updated_at timestamptz DEFAULT now())`)
	exec(`DELETE FROM bimasugam.ispm_finding_history`)
	base := time.Now().Add(-time.Hour).Truncate(time.Second)
	events := []struct{ id, action string }{
		{"aaaaaaaa-0000-0000-0000-000000000001", "OPENED"},
		{"aaaaaaaa-0000-0000-0000-000000000002", "RESOLVED"},
		{"aaaaaaaa-0000-0000-0000-000000000003", "REOPENED"},
	}
	for i, e := range events {
		exec(`INSERT INTO bimasugam.ispm_finding_history (id, finding_id, action, new_value, reason, created_at) VALUES ($1::uuid, $2::uuid, $3, 'x', 'test', $4)`,
			e.id, findingID, e.action, base.Add(time.Duration(i)*time.Minute))
	}
	st, err := service.Get(ctx, viewer, 0)
	if err != nil {
		t.Fatal(err)
	}
	if st.CursorAt != nil || st.LastEvent != nil || st.PendingCount != 3 || len(st.Pending) != 3 || st.Pending[0].Action != "OPENED" {
		t.Fatalf("no row yet: %+v", st)
	}

	// 3. the engine has handled the first two events: one is left, and the last handled one is shown
	exec(`INSERT INTO bimasugam.ispm_email_sync (tenant_id, cursor_at, cursor_id) VALUES ($1::uuid, $2, $3)`,
		tenantID, base.Add(time.Minute), events[1].id)
	if st, err = service.Get(ctx, viewer, 0); err != nil {
		t.Fatal(err)
	}
	if st.CursorID != events[1].id || st.LastEvent == nil || st.LastEvent.Action != "RESOLVED" || st.LastEvent.RuleID != "IAM-01" ||
		st.LastEvent.FindingID != findingID {
		t.Fatalf("last handled event: %+v", st)
	}
	if st.PendingCount != 1 || len(st.Pending) != 1 || st.Pending[0].EventID != events[2].id || st.Pending[0].Action != "REOPENED" {
		t.Fatalf("pending: %d %+v", st.PendingCount, st.Pending)
	}
	// limit shortens the list, not the count
	exec(`UPDATE bimasugam.ispm_email_sync SET cursor_at = $1, cursor_id = $2`, base.Add(-time.Minute), "not-a-history-id")
	if st, err = service.Get(ctx, viewer, 1); err != nil {
		t.Fatal(err)
	}
	if st.LastEvent != nil || st.PendingCount != 3 || len(st.Pending) != 1 {
		t.Fatalf("limit / unknown cursor id: %+v", st)
	}

	// 4. over HTTP: every role may read it, an unknown query parameter is refused, and nothing is written
	router := routes.SetupRoutes(routes.HandlerContainer{
		AuthMiddleware:      middleware.NewAuthMiddleware(config.JWTConfig{Secret: httpTestSecret}, httpUsers{"vic@x": "user"}),
		RemediationHandlers: remediation.NewHandlers(svc),
	})
	get := func(path string, want int) map[string]any {
		t.Helper()
		tok, err := jwt.GenerateToken("vic@x", tenantID, "bimasugam", "", "44444444-4444-4444-4444-444444444444", httpTestSecret, time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/remediation"+path, nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("GET %s: got %d, want %d: %s", path, rec.Code, want, rec.Body.String())
		}
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}
	data, _ := get("/email-sync?limit=2", http.StatusOK)["data"].(map[string]any)
	if data["pending_count"] != float64(3) || data["cursor_id"] != "not-a-history-id" {
		t.Fatalf("http answer: %v", data)
	}
	get("/email-sync?bogus=1", http.StatusBadRequest)
	var cursorID string
	if err := pool.QueryRow(ctx, `SELECT cursor_id FROM bimasugam.ispm_email_sync`).Scan(&cursorID); err != nil || cursorID != "not-a-history-id" {
		t.Fatalf("the backend must not write ispm_email_sync: %q %v", cursorID, err)
	}
}
