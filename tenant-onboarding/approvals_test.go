package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
)

// approvalsTable creates nhi_global.connection_approvals from the API server's
// own migration, so both services agree on it.
func approvalsTable(t *testing.T, db *sql.DB) {
	t.Helper()
	raw, err := os.ReadFile("../nhi-backend/migrations/global/007_connection_approvals.sql")
	if err != nil {
		t.Skipf("API server migration not found: %v", err)
	}
	if _, err := db.Exec(string(raw)); err != nil {
		t.Fatalf("007_connection_approvals.sql: %v", err)
	}
}

func requestApproval(t *testing.T, db *sql.DB, tn Tenant, account string) int64 {
	t.Helper()
	var id int64
	err := db.QueryRow(`INSERT INTO nhi_global.connection_approvals
		(tenant_id, db_name, tenant_domain, account_id, role_arn, regions, checks, events, requested_by, email_status)
		VALUES ($1::uuid, $2, $3, $4, 'arn:aws:iam::'||$4||':role/NHIPlatformCollector', '{ap-south-1,global}',
		  '[{"key":"role","label":"Role can be assumed","state":"pass"}]', '{"stage":"after role and read access"}',
		  'priya@acme_corp', 'sent') RETURNING id`, tn.TenantID, tn.DBName, tn.DomainName, account).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(fmt.Sprintf(`UPDATE %s.accounts SET account_status = 'pending_approval', is_connected = false WHERE account_id = $1`, tn.DBName), account); err != nil {
		t.Fatal(err)
	}
	return id
}

func onboardedWithAccount(t *testing.T, db *sql.DB, account string) Tenant {
	t.Helper()
	r := valid()
	r.CustomerAccountID = account
	res, err := mustService(t, db).Onboard(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	return res.Tenant
}

func TestApprovalsWithoutTheTable(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	list, err := svc.ListApprovals(context.Background(), "pending")
	if err != nil || list.Ready || len(list.Approvals) != 0 {
		t.Fatalf("list = %+v, %v; want not ready and empty", list, err)
	}
	if n, _, ready, err := svc.PendingApprovals(context.Background()); err != nil || ready || n != 0 {
		t.Fatalf("pending = %d %v %v", n, ready, err)
	}
}

// Approving records the decision and lets the events check run; it does not
// connect the account or queue a scan - that happens when the first event
// arrives, on the API server.
func TestApproveDoesNotConnectTheAccountYet(t *testing.T) {
	db := scratchDB(t)
	approvalsTable(t, db)
	svc := mustService(t, db)
	tn := onboardedWithAccount(t, db, "210987654321")
	id := requestApproval(t, db, tn, "210987654321")
	ctx := context.Background()

	list, err := svc.ListApprovals(ctx, "pending")
	if err != nil || !list.Ready || list.Pending != 1 || list.LatestID != id || len(list.Approvals) != 1 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	a := list.Approvals[0]
	if a.Domain != tn.DomainName || a.Workspace != "acme_corp" || strings.Join(a.Regions, ",") != "ap-south-1,global" || a.EmailStatus != "sent" ||
		!strings.Contains(string(a.Checks), `"role"`) || !strings.Contains(string(a.Events), "after role and read access") {
		t.Fatalf("approval = %+v", a)
	}

	got, err := svc.Decide(ctx, id, true, "  looks right ", "superadmin")
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != ApprovalApproved || got.DecidedBy != "superadmin" || got.DecisionNote != "looks right" || got.DecidedAt == nil {
		t.Fatalf("decided = %+v", got)
	}
	var status, approval, sync, by string
	var connected, hasConnectedAt bool
	if err := db.QueryRow(`SELECT account_status, is_connected, approval_status, sync_status, approved_by, connected_at IS NOT NULL
		FROM acme_corp.accounts WHERE account_id = '210987654321'`).Scan(&status, &connected, &approval, &sync, &by, &hasConnectedAt); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || connected || approval != "approved" || sync == "queued" || hasConnectedAt || !strings.Contains(by, "superadmin") {
		t.Fatalf("account = %s %v %s %s %s %v", status, connected, approval, sync, by, hasConnectedAt)
	}
	if n, _, _, _ := svc.PendingApprovals(ctx); n != 0 {
		t.Errorf("pending after approval = %d", n)
	}

	// A second decision on the same request is refused and changes nothing.
	var derr DecidedError
	if _, err := svc.Decide(ctx, id, false, "no", "other"); !errors.As(err, &derr) || derr.Status != ApprovalApproved {
		t.Fatalf("second decision err = %v", err)
	}
	if n := count(t, db, `SELECT count(*) FROM acme_corp.accounts WHERE approval_status = 'approved'`); n != 1 {
		t.Error("the second decision changed the account")
	}
	if _, err := svc.Decide(ctx, 99999, true, "", "x"); !errors.Is(err, NotFoundError{}) {
		t.Errorf("unknown id err = %v", err)
	}
}

func TestRejectNeedsAReasonAndKeepsTheAccountOff(t *testing.T) {
	db := scratchDB(t)
	approvalsTable(t, db)
	svc := mustService(t, db)
	tn := onboardedWithAccount(t, db, "210987654321")
	id := requestApproval(t, db, tn, "210987654321")
	ctx := context.Background()
	var verr *ValidationError
	if _, err := svc.Decide(ctx, id, false, "   ", "superadmin"); !errors.As(err, &verr) || verr.Fields["note"] == "" {
		t.Fatalf("reject without reason err = %v", err)
	}
	if _, err := svc.Decide(ctx, id, false, "Trail is not multi-region", "superadmin"); err != nil {
		t.Fatal(err)
	}
	var status, note string
	var connected bool
	if err := db.QueryRow(`SELECT account_status, is_connected, approval_note FROM acme_corp.accounts WHERE account_id = '210987654321'`).
		Scan(&status, &connected, &note); err != nil {
		t.Fatal(err)
	}
	if status != "rejected" || connected || note != "Trail is not multi-region" {
		t.Fatalf("account = %s %v %q", status, connected, note)
	}
	decided, _ := svc.ListApprovals(ctx, "decided")
	if len(decided.Approvals) != 1 || decided.Approvals[0].Status != ApprovalRejected {
		t.Fatalf("decided = %+v", decided)
	}
	if _, err := svc.ListApprovals(ctx, "bogus"); !errors.As(err, &verr) {
		t.Errorf("bad filter err = %v", err)
	}
}

func TestApprovingARemovedAccountWithdrawsTheRequest(t *testing.T) {
	db := scratchDB(t)
	approvalsTable(t, db)
	svc := mustService(t, db)
	tn := onboardedWithAccount(t, db, "210987654321")
	id := requestApproval(t, db, tn, "210987654321")
	if _, err := db.Exec(`DELETE FROM acme_corp.accounts`); err != nil {
		t.Fatal(err)
	}
	var derr DecidedError
	if _, err := svc.Decide(context.Background(), id, true, "", "superadmin"); !errors.As(err, &derr) || derr.Status != ApprovalWithdrawn {
		t.Fatalf("err = %v", err)
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.connection_approvals WHERE status = 'withdrawn'`); n != 1 {
		t.Error("request not withdrawn")
	}
}

func TestApprovalsHTTP(t *testing.T) {
	db := scratchDB(t)
	approvalsTable(t, db)
	h := NewHandler(mustService(t, db), testAuth(t, db), db)
	tn := onboardedWithAccount(t, db, "210987654321")
	id := requestApproval(t, db, tn, "210987654321")
	c := &client{t: t, h: h}
	path := fmt.Sprintf("/api/approvals/%d", id)
	if w := c.do("GET", "/api/approvals", nil); w.Code != 401 {
		t.Errorf("list without a session = %d", w.Code)
	}
	if w := c.do("POST", path+"/approve", map[string]any{}); w.Code != 401 {
		t.Errorf("approve without a session = %d", w.Code)
	}
	c.signIn("superadmin", testPassword)
	w := c.do("GET", "/api/approvals/pending", nil)
	var p struct {
		Pending int   `json:"pending"`
		Latest  int64 `json:"latest_pending_id"`
		Ready   bool  `json:"ready"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if w.Code != 200 || p.Pending != 1 || p.Latest != id || !p.Ready {
		t.Fatalf("pending = %d %s", w.Code, w.Body)
	}
	if w := c.do("GET", "/api/approvals?status=pending", nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"210987654321"`) {
		t.Fatalf("list = %d %s", w.Code, w.Body)
	}
	if w := c.do("POST", path+"/reject", map[string]any{"note": ""}); w.Code != 422 {
		t.Errorf("reject without reason = %d", w.Code)
	}
	if w := c.do("POST", path+"/approve", map[string]any{"note": "ok", "status": "x"}); w.Code != 400 {
		t.Errorf("unknown field = %d", w.Code)
	}
	if w := c.do("POST", path+"/approve", map[string]any{"note": "ok"}); w.Code != 200 || !strings.Contains(w.Body.String(), `"approved"`) {
		t.Fatalf("approve = %d %s", w.Code, w.Body)
	}
	if w := c.do("POST", path+"/reject", map[string]any{"note": "late"}); w.Code != 409 {
		t.Errorf("second decision = %d", w.Code)
	}
	if w := c.do("POST", "/api/approvals/abc/approve", map[string]any{}); w.Code != 404 {
		t.Errorf("bad id = %d", w.Code)
	}
}
