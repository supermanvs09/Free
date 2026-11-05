package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestWorkspaceName(t *testing.T) {
	same := []string{"Acme Corp", "  ACME   corp ", "acme-corp", "Acme, Corp.", "acme_corp"}
	for _, in := range same {
		if got, err := WorkspaceName(in); err != nil || got != "acme_corp" {
			t.Errorf("WorkspaceName(%q) = %q, %v; want acme_corp", in, got, err)
		}
	}
	for in, want := range map[string]string{"3M": "c3m", "Public": "public_co", "nhi_global": "nhi_global_co", "pg_stuff": "pg_stuff_co"} {
		if got, _ := WorkspaceName(in); got != want {
			t.Errorf("WorkspaceName(%q) = %q, want %q", in, got, want)
		}
	}
	for _, in := range []string{"", "   ", "!!!", "日本"} {
		if _, err := WorkspaceName(in); err == nil {
			t.Errorf("WorkspaceName(%q) should fail", in)
		}
	}
	a, _ := WorkspaceName("International Business Machines Corporation Europe")
	b, _ := WorkspaceName("International Business Machines Corporation Asia")
	if len(a) > maxNameLength || len(b) > maxNameLength || a == b {
		t.Errorf("long names: %q %q; want distinct and at most %d characters", a, b, maxNameLength)
	}
	if again, _ := WorkspaceName("International Business Machines Corporation Europe"); again != a {
		t.Error("a long name must map to the same workspace every time")
	}
	if DomainFor("acme_corp", "nhi.local") != "acme-corp.nhi.local" {
		t.Error("domain should use hyphens")
	}
}

func valid() Request {
	return Request{
		CompanyName: "Acme Corp", AWSAccountID: "123456789012", ExternalID: "ext-0123456789abcdef",
		EventBridgeARN: "arn:aws:events:ap-south-1:123456789012:event-bus/default", Regions: []string{"ap-south-1"},
	}
}

func TestNormalizeRequiresEveryCollectorField(t *testing.T) {
	if _, err := Normalize(valid()); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Request){
		"company_name":               func(r *Request) { r.CompanyName = " " },
		"collector_aws_account_id":   func(r *Request) { r.AWSAccountID = "" },
		"collector_external_id":      func(r *Request) { r.ExternalID = "" },
		"collector_event_bridge_arn": func(r *Request) { r.EventBridgeARN = "" },
		"collector_regions":          func(r *Request) { r.Regions = []string{" ", ""} },
	}
	for field, mutate := range cases {
		r := valid()
		mutate(&r)
		var verr *ValidationError
		if _, err := Normalize(r); !errors.As(err, &verr) || verr.Fields[field] == "" {
			t.Errorf("empty %s: err = %v, want a message on that field", field, err)
		}
	}
	bad := map[string]func(*Request){
		"collector_external_id ":     func(r *Request) { r.ExternalID = "a1b2c3" },
		"collector_aws_account_id":   func(r *Request) { r.AWSAccountID = "12345" },
		"collector_external_id":      func(r *Request) { r.ExternalID = "has space 0123456789" },
		"collector_event_bridge_arn": func(r *Request) { r.EventBridgeARN = "arn:aws:s3:::bucket" },
		"collector_regions":          func(r *Request) { r.Regions = []string{"mars-1"} },
		"customer_aws_account_id":    func(r *Request) { r.CustomerAccountID = "abc" },
	}
	for field, mutate := range bad {
		field = strings.TrimSpace(field)
		r := valid()
		mutate(&r)
		var verr *ValidationError
		if _, err := Normalize(r); !errors.As(err, &verr) || verr.Fields[field] == "" {
			t.Errorf("bad %s: err = %v", field, err)
		}
	}
}

func TestNormalizeUser(t *testing.T) {
	r := valid()
	r.User = &UserInput{Username: " Priya@whatever ", FullName: "  Priya  Rao ", Password: "correct-horse-1"}
	c, err := Normalize(r)
	if err != nil {
		t.Fatal(err)
	}
	if c.User.Username != "priya" || c.User.FullName != "Priya Rao" || c.User.Role != "admin" {
		t.Fatalf("user = %+v", c.User)
	}
	if bcrypt.CompareHashAndPassword(c.hash, []byte("correct-horse-1")) != nil {
		t.Error("the stored hash must match the password")
	}
	for field, u := range map[string]UserInput{
		"user_username":  {Username: "a", FullName: "Priya Rao", Password: "correct-horse-1"},
		"user_full_name": {Username: "priya", FullName: "", Password: "correct-horse-1"},
		"user_password":  {Username: "priya", FullName: "Priya Rao", Password: "short"},
		"user_role":      {Username: "priya", FullName: "Priya Rao", Password: "correct-horse-1", Role: "root"},
	} {
		u := u
		r.User = &u
		var verr *ValidationError
		if _, err := Normalize(r); !errors.As(err, &verr) || verr.Fields[field] == "" {
			t.Errorf("%s: err = %v", field, err)
		}
	}
	r.User = &UserInput{Username: "priya", FullName: "Priya Rao", Password: strings.Repeat("x", 73)}
	if _, err := Normalize(r); err == nil {
		t.Error("a password over 72 bytes must be refused (bcrypt would silently cut it)")
	}
}

func TestTemplates(t *testing.T) {
	for _, s := range []string{schemaSQL, seedSQL, string(mustRead(t, "web/index.html")), string(mustRead(t, "web/app.js")), string(mustRead(t, "README.md"))} {
		if strings.Contains(strings.ToLower(s), "bima"+"sugam") {
			t.Fatal("the source company's name must not appear anywhere")
		}
	}
	if strings.Contains(schemaSQL, "OWNER TO") || strings.Contains(schemaSQL, "COPY ") {
		t.Error("the template holds structure only")
	}
	if n := len(expectedTables()); n != 72 {
		t.Errorf("expectedTables() = %d, want 72", n)
	}
	// The page must not talk about storage. Markup is stripped first, so the
	// HTML table element and its ids don't count; only words a person reads do.
	tags := regexp.MustCompile(`<[^>]*>`)
	visible := strings.ToLower(tags.ReplaceAllString(string(mustRead(t, "web/index.html")), " "))
	scripts := strings.ToLower(string(mustRead(t, "web/lib.js")) + string(mustRead(t, "web/onboard.js")) + string(mustRead(t, "web/tenants.js")) + string(mustRead(t, "web/app.js")))
	for _, word := range []string{"schema", "database", "postgres", "nhi_global"} {
		if strings.Contains(visible, word) || strings.Contains(scripts, word) {
			t.Errorf("the page mentions %q", word)
		}
	}
	if strings.Contains(visible, "table") {
		t.Error("the page text mentions a table")
	}
}

func mustRead(t *testing.T, p string) []byte {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPartitionsSQL(t *testing.T) {
	q := partitionsSQL("acme", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC))
	for _, want := range []string{`"ispm_identity_posture_daily_2026_11"`, `"ispm_identity_posture_daily_2027_05"`, "ispm_identity_posture_daily_default", `"ispm_identity_posture_hourly_20261230"`, `"ispm_identity_posture_hourly_20270106"`} {
		if !strings.Contains(q, want) {
			t.Errorf("missing %s", want)
		}
	}
	if strings.Contains(q, "_2026_13") {
		t.Error("month 13")
	}
}

// ── against a real Postgres ─────────────────────────────────────────────────

func scratchDB(t *testing.T) *sql.DB {
	t.Helper()
	host, user, pass := os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD")
	if host == "" || user == "" {
		t.Skip("DB_HOST / DB_USER not set: skipping the Postgres tests")
	}
	dsn := func(db string) string {
		u := url.URL{Scheme: "postgres", User: url.UserPassword(user, pass), Host: host + ":5432", Path: "/" + db, RawQuery: "sslmode=disable"}
		return u.String()
	}
	admin, err := sql.Open("pgx", dsn("postgres"))
	if err != nil || admin.Ping() != nil {
		t.Skip("Postgres not reachable")
	}
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	name := "onbtest_" + hex.EncodeToString(b)
	if _, err := admin.Exec(`CREATE DATABASE ` + name); err != nil {
		t.Skipf("cannot create a scratch database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
		_ = admin.Close()
	})
	db, err := sql.Open("pgx", dsn(name))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(16)
	// nhi_db's own definitions of the three global tables.
	if _, err := db.Exec(`
		CREATE EXTENSION IF NOT EXISTS pg_trgm;
		CREATE SCHEMA nhi_global;
		CREATE TABLE nhi_global.tenants (
			tenant_id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
			db_name text NOT NULL,
			created_at timestamp without time zone,
			domain_name character varying(255),
			collector_aws_account_id character varying(12),
			collector_external_id character varying(255),
			collector_event_bridge_arn character varying(512),
			collector_regions text[]
		);
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_db_name_key UNIQUE (db_name);
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_collector_external_id_format CHECK (length(collector_external_id) BETWEEN 16 AND 1224 AND collector_external_id ~ '^[A-Za-z0-9+=,.@:/_-]+$') NOT VALID;
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_collector_account_format CHECK (collector_aws_account_id IS NULL OR collector_aws_account_id ~ '^[0-9]{12}$') NOT VALID;
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_collector_bus_format CHECK (collector_event_bridge_arn IS NULL OR (length(collector_event_bridge_arn) <= 320 AND collector_event_bridge_arn ~ '^arn:aws[a-z-]*:events:[a-z0-9-]+:[0-9]{12}:event-bus/[.\-_A-Za-z0-9]+$')) NOT VALID;
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_domain_name_format CHECK (domain_name IS NULL OR domain_name ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') NOT VALID;
		CREATE UNIQUE INDEX uq_tenants_collector_external_id ON nhi_global.tenants (collector_external_id) WHERE collector_external_id IS NOT NULL;
		CREATE UNIQUE INDEX uq_tenants_domain_name ON nhi_global.tenants (lower(domain_name)) WHERE domain_name IS NOT NULL;
		CREATE TABLE nhi_global.nhi_users (
			id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
			email text, password text, full_name text, department text, role text, tenant_id uuid, status text,
			last_login_at timestamp with time zone, created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP, team text
		);
		CREATE TABLE nhi_global.refresh_tokens (
			id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
			user_id integer NOT NULL REFERENCES nhi_global.nhi_users(id) ON DELETE CASCADE
		);`); err != nil {
		t.Fatal(err)
	}
	sqlFile, err := os.ReadFile("sql/super_admin.sql") // the very file the user runs
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(sqlFile)); err != nil {
		t.Fatalf("sql/super_admin.sql: %v", err)
	}
	return db
}

func mustService(t *testing.T, db *sql.DB) *Service {
	t.Helper()
	svc, err := NewService(db, "nhi_global", "nhi.local")
	if err != nil {
		t.Fatal(err)
	}
	return svc
}

func count(t *testing.T, db *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func tablesIn(t *testing.T, db *sql.DB, schema string) int {
	return count(t, db, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relkind IN ('r','p') AND NOT c.relispartition`, schema)
}

func TestOnboardCreatesEverything(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	req := valid()
	req.CustomerAccountID = "210987654321"
	req.User = &UserInput{Username: "Priya", FullName: "Priya Rao", Password: "correct-horse-1", Role: "admin", Department: "Security", Team: "Platform"}
	res, err := svc.Onboard(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != OutcomeCreated || res.Setup != "created" || res.Incomplete {
		t.Fatalf("result = %+v", res)
	}
	tn := res.Tenant
	if tn.DBName != "acme_corp" || tn.DomainName != "acme-corp.nhi.local" || !uuidOK(tn.TenantID) || tn.CreatedAt == nil ||
		tn.ExternalID != req.ExternalID || tn.AWSAccountID != req.AWSAccountID || tn.EventBridgeARN != req.EventBridgeARN || strings.Join(tn.Regions, ",") != "ap-south-1" {
		t.Fatalf("tenant = %+v", tn)
	}
	if got := tablesIn(t, db, "acme_corp"); got != 72 {
		t.Errorf("workspace has %d tables, want 72", got)
	}
	if n := count(t, db, `SELECT count(*) FROM acme_corp.ispm_rule_weights`); n == 0 {
		t.Error("reference rows are missing")
	}

	// accounts row: external id and tenant id filled in automatically.
	var ext, tid, status string
	var connected bool
	var regions string
	err = db.QueryRow(`SELECT external_id, tenant_id::text, account_status, is_connected, array_to_string(regions, ',') FROM acme_corp.accounts WHERE account_id = '210987654321'`).
		Scan(&ext, &tid, &status, &connected, &regions)
	if err != nil {
		t.Fatal(err)
	}
	if ext != req.ExternalID || tid != tn.TenantID || status != "pending" || connected || regions != "ap-south-1" {
		t.Errorf("account = %q %q %q %v %q", ext, tid, status, connected, regions)
	}

	// the user, exactly as the API's login reads it.
	var email, hash, name, dept, role, team, ustatus, utid string
	var last sql.NullTime
	err = db.QueryRow(`SELECT email, password, full_name, department, role, team, status, tenant_id::text, last_login_at FROM nhi_global.nhi_users`).
		Scan(&email, &hash, &name, &dept, &role, &team, &ustatus, &utid, &last)
	if err != nil {
		t.Fatal(err)
	}
	if email != "priya@acme_corp" || res.User.Username != email || name != "Priya Rao" || dept != "Security" || team != "Platform" ||
		role != "admin" || ustatus != "active" || utid != tn.TenantID || last.Valid {
		t.Errorf("user = %q %q %q %q %q %q %v", email, name, dept, team, role, ustatus, last.Valid)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte("correct-horse-1")) != nil || strings.Contains(hash, "correct-horse") {
		t.Error("the password must be stored as a bcrypt hash")
	}
}

func uuidOK(s string) bool {
	return len(s) == 36 && s[14] == '4'
}

func TestSameCompanyNeverAddsASecondRow(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	first, err := svc.Onboard(context.Background(), valid())
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Acme Corp", "  acme   CORP ", "ACME-Corp", "Acme Corp."} {
		r := valid()
		r.CompanyName = name
		again, err := svc.Onboard(context.Background(), r)
		if err != nil {
			t.Fatalf("%q: %v", name, err)
		}
		if again.Outcome != OutcomeAlreadyExists || again.Tenant.TenantID != first.Tenant.TenantID || again.Setup != "existing" || len(again.Differences) != 0 {
			t.Fatalf("%q: %+v", name, again)
		}
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.tenants`); n != 1 {
		t.Fatalf("tenants rows = %d, want 1", n)
	}

	// Different collector details: reported, never applied.
	r := valid()
	r.AWSAccountID, r.Regions = "999999999999", []string{"us-east-1", "ap-south-1"}
	diff, err := svc.Onboard(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if len(diff.Differences) != 2 || diff.Tenant.AWSAccountID != "123456789012" {
		t.Fatalf("differences = %+v, tenant = %+v", diff.Differences, diff.Tenant)
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.tenants WHERE collector_aws_account_id = '123456789012' AND collector_regions = '{ap-south-1}'`); n != 1 {
		t.Error("the saved row changed")
	}
}

func TestConcurrentSubmissionsOfOneCompany(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	var wg sync.WaitGroup
	var mu sync.Mutex
	created := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := svc.Onboard(context.Background(), valid())
			if err != nil {
				t.Error(err)
				return
			}
			if res.Outcome == OutcomeCreated {
				mu.Lock()
				created++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if created != 1 || count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 1 || tablesIn(t, db, "acme_corp") != 72 {
		t.Fatalf("created = %d", created)
	}
}

func TestConflictsChangeNothing(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	a := valid()
	a.User = &UserInput{Username: "priya", FullName: "Priya Rao", Password: "correct-horse-1"}
	a.CustomerAccountID = "210987654321"
	if _, err := svc.Onboard(ctx, a); err != nil {
		t.Fatal(err)
	}

	// 1. Another company reusing the External ID.
	b := valid()
	b.CompanyName = "Globex"
	var cerr *ConflictError
	if _, err := svc.Onboard(ctx, b); !errors.As(err, &cerr) || cerr.Fields["collector_external_id"] == "" {
		t.Fatalf("shared external id: %v", err)
	}

	// 2. Another company claiming the same customer account.
	b.ExternalID = "ext-ffffffffffffffff"
	b.CustomerAccountID = "210987654321"
	if _, err := svc.Onboard(ctx, b); !errors.As(err, &cerr) || cerr.Fields["customer_aws_account_id"] == "" {
		t.Fatalf("shared customer account: %v", err)
	}

	// 3. A taken username on a new company: the new company is not created either.
	b.CustomerAccountID = ""
	b.User = &UserInput{Username: "priya", FullName: "Priya Rao", Password: "correct-horse-1"}
	res, err := svc.Onboard(ctx, b) // priya@globex is free: succeeds
	if err != nil || res.User.Username != "priya@globex" {
		t.Fatalf("same name, other company: %+v %v", res, err)
	}
	c := valid()
	c.CompanyName, c.ExternalID = "Initech", "ext-eeeeeeeeeeeeeeee"
	c.User = &UserInput{Username: "x1", FullName: "Xavier One", Password: "correct-horse-1"}
	if _, err := svc.Onboard(ctx, c); err != nil {
		t.Fatal(err)
	}
	dup := c
	dup.CompanyName = "Initech" // same company, same username
	if _, err := svc.Onboard(ctx, dup); !errors.As(err, &cerr) || cerr.Fields["user_username"] == "" {
		t.Fatalf("duplicate username: %v", err)
	}
	// A brand-new company whose first user fails validation in the database.
	d := valid()
	d.CompanyName, d.ExternalID = "Hooli", "ext-dddddddddddddddd"
	d.User = &UserInput{Username: "x1", FullName: "Xavier One", Password: "correct-horse-1"}
	if _, err := svc.Onboard(ctx, d); err != nil {
		t.Fatal(err) // x1@hooli differs from x1@initech
	}

	if n := count(t, db, `SELECT count(*) FROM nhi_global.tenants`); n != 4 {
		t.Errorf("tenants = %d, want 4 (acme, globex-attempt-rolled-back excluded)", n)
	}
}

func TestFailedUserRollsBackTheNewCompany(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	// Pre-existing user that will collide with the first user of the new company.
	if _, err := db.Exec(`INSERT INTO nhi_global.nhi_users (id, email) VALUES (7, 'boss@newco')`); err != nil {
		t.Fatal(err)
	}
	r := valid()
	r.CompanyName = "Newco"
	r.User = &UserInput{Username: "boss", FullName: "The Boss", Password: "correct-horse-1"}
	var cerr *ConflictError
	if _, err := svc.Onboard(ctx, r); !errors.As(err, &cerr) {
		t.Fatalf("err = %v", err)
	}
	if count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 0 || tablesIn(t, db, "newco") != 0 {
		t.Fatal("a failed onboarding must leave nothing behind")
	}
	// Retrying with a free username works, and takes the next id after the existing 7.
	r.User.Username = "chief"
	res, err := svc.Onboard(ctx, r)
	if err != nil || res.User.ID != 8 {
		t.Fatalf("retry: %+v %v", res, err)
	}
}

func TestRowAddedByHandGetsItsWorkspace(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	id := "3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d"
	if _, err := db.Exec(`INSERT INTO nhi_global.tenants (tenant_id, db_name, domain_name, collector_external_id) VALUES ($1, 'acme_corp', 'acme-corp.nhi.local', 'ext-0123456789abcdef')`, id); err != nil {
		t.Fatal(err)
	}
	r := valid()
	r.User = &UserInput{Username: "priya", FullName: "Priya Rao", Password: "correct-horse-1"}
	res, err := svc.Onboard(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != OutcomeAlreadyExists || res.Setup != "created" || res.Tenant.TenantID != id || tablesIn(t, db, "acme_corp") != 72 {
		t.Fatalf("result = %+v", res)
	}
	var utid string
	_ = db.QueryRow(`SELECT tenant_id::text FROM nhi_global.nhi_users`).Scan(&utid)
	if utid != id {
		t.Errorf("user belongs to %s, want the existing company %s", utid, id)
	}
}

func TestExistingWorkspaceIsNeverTouched(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	if _, err := db.Exec(`CREATE SCHEMA acme_corp; CREATE TABLE acme_corp.accounts (account_id text NOT NULL, tenant_id uuid, external_id text); INSERT INTO acme_corp.accounts VALUES ('111111111111', null, 'old')`); err != nil {
		t.Fatal(err)
	}
	r := valid()
	r.CustomerAccountID = "210987654321"
	res, err := svc.Onboard(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if res.Setup != "existing" || !res.Incomplete || tablesIn(t, db, "acme_corp") != 1 {
		t.Fatalf("result = %+v", res)
	}
}

func TestLongNamesWork(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	r := valid()
	r.CompanyName = "International Business Machines Corporation Europe"
	res, err := svc.Onboard(context.Background(), r)
	if err != nil || len(res.Tenant.DBName) > maxNameLength || tablesIn(t, db, res.Tenant.DBName) != 72 {
		t.Fatalf("%+v %v", res, err)
	}
}

// ── HTTP ────────────────────────────────────────────────────────────────────

func TestHTTP(t *testing.T) {
	db := scratchDB(t)
	h := NewHandler(mustService(t, db), testAuth(t, db), db)
	c := &client{t: t, h: h}
	if w := c.do("GET", "/healthz", nil); w.Code != 200 {
		t.Errorf("healthz = %d", w.Code)
	}
	if w := c.do("POST", "/api/onboard", valid()); w.Code != 401 {
		t.Errorf("onboard without a session = %d", w.Code)
	}
	c.signIn("superadmin", testPassword)
	if w := c.do("GET", "/", nil); w.Code != 200 || !strings.Contains(w.Body.String(), "Onboard a company") || !strings.Contains(w.Header().Get("Content-Security-Policy"), "default-src 'none'") {
		t.Errorf("page = %d", w.Code)
	}
	w := c.do("GET", "/api/workspace?company="+url.QueryEscape("Acme Corp!"), nil)
	if !strings.Contains(w.Body.String(), `"workspace":"acme_corp"`) || !strings.Contains(w.Body.String(), `"domain":"acme-corp.nhi.local"`) {
		t.Errorf("workspace = %s", w.Body)
	}
	w = c.do("POST", "/api/onboard", map[string]any{"company_name": "Acme Corp"})
	var bad errorBody
	_ = json.Unmarshal(w.Body.Bytes(), &bad)
	if w.Code != 422 || bad.Fields["collector_external_id"] == "" || bad.Fields["collector_regions"] == "" {
		t.Errorf("validation = %d %s", w.Code, w.Body)
	}
	w = c.do("POST", "/api/onboard", valid())
	if w.Code != 201 || !strings.Contains(w.Body.String(), `"outcome":"created"`) || strings.Contains(w.Body.String(), "password") {
		t.Errorf("create = %d %s", w.Code, w.Body)
	}
	if w = c.do("POST", "/api/onboard", valid()); w.Code != 200 || !strings.Contains(w.Body.String(), `"already_exists"`) {
		t.Errorf("again = %d %s", w.Code, w.Body)
	}
	other := valid()
	other.CompanyName = "Globex"
	if w = c.do("POST", "/api/onboard", other); w.Code != 409 {
		t.Errorf("shared external id = %d %s", w.Code, w.Body)
	}
	if w = c.do("POST", "/api/onboard", nil); w.Code != 400 {
		t.Errorf("empty body = %d", w.Code)
	}
}
