package audit

import (
	"context"
	"database/sql"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func storeDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("NHI_TEST_DSN")
	if dsn == "" {
		t.Skip("NHI_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, q := range []string{
		`DROP SCHEMA IF EXISTS audit_store_test CASCADE`,
		`CREATE SCHEMA audit_store_test`,
		`CREATE TABLE audit_store_test.audit_logs (id bigint GENERATED ALWAYS AS IDENTITY, occurred_at timestamptz, tenant_id uuid,
			actor text, actor_role text, action text, method text, route text, path text, target text, status int, outcome text,
			error_code text, request_id text, ip inet, user_agent text, duration_ms int, screen text, details jsonb)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { db.Exec(`DROP SCHEMA IF EXISTS audit_store_test CASCADE`) }) //nolint:errcheck
	return db
}

// One entry Postgres would refuse (an address that is not one, a tenant id
// that is not a uuid, a NUL byte) must not take the entries around it down.
func TestStoreKeepsEveryEntryOfABatch(t *testing.T) {
	db := storeDB(t)
	s := NewStore(db, "audit_store_test")
	ctx := context.Background()
	s.Record(ctx, Entry{OccurredAt: time.Now(), Actor: "a@ws", Action: "one", IP: "10.0.0.1"})
	s.Record(ctx, Entry{OccurredAt: time.Now(), Actor: "b@ws", Action: "two", IP: "not-an-ip", TenantID: "x", Details: map[string]any{"v": "a\x00b"}})
	s.Record(ctx, Entry{OccurredAt: time.Now(), Actor: "c\x00@ws", Action: "three"})
	closeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	s.Close(closeCtx)
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM audit_store_test.audit_logs`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("%d of 3 entries stored", n)
	}
	var raw string
	if err := db.QueryRow(`SELECT details->>'ip_raw' FROM audit_store_test.audit_logs WHERE action = 'two'`).Scan(&raw); err != nil || raw != "not-an-ip" {
		t.Fatalf("the unparsable address is not kept in details: %q %v", raw, err)
	}
	// A request finishing during shutdown records after Close: no panic.
	s.Record(ctx, Entry{Actor: "late@ws", Action: "late"})
}

// X-Forwarded-For is believed only from a proxy on a private address.
func TestClientIPTrustsOnlyAProxy(t *testing.T) {
	direct := httptest.NewRequest("GET", "/", nil)
	direct.RemoteAddr = "203.0.113.9:4242"
	direct.Header.Set("X-Forwarded-For", "1.2.3.4")
	if got := clientIP(direct); got != "203.0.113.9" {
		t.Fatalf("a direct caller set its own address: %s", got)
	}
	proxied := httptest.NewRequest("GET", "/", nil)
	proxied.RemoteAddr = "10.0.1.5:4242"
	proxied.Header.Set("X-Forwarded-For", "198.51.100.7, 10.0.0.2")
	if got := clientIP(proxied); got != "198.51.100.7" {
		t.Fatalf("behind the load balancer: %s", got)
	}
}
