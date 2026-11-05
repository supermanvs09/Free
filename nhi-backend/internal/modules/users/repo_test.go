package users

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const testTenant = "11111111-1111-1111-1111-111111111111"

// testRepo builds a scratch schema with the two tables user management
// touches. Needs NHI_TEST_DSN.
func testRepo(t *testing.T) (*Repository, *sql.DB) {
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
	schema := "users_repo_test"
	for _, q := range []string{
		`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`,
		`CREATE SCHEMA ` + schema,
		`CREATE TABLE ` + schema + `.nhi_users (id integer PRIMARY KEY, email text NOT NULL, password text NOT NULL,
			full_name text, team text NOT NULL DEFAULT '', department text, role text, tenant_id uuid NOT NULL,
			status text, created_at timestamptz, last_login_at timestamptz, created_by text, updated_at timestamptz, updated_by text)`,
		`CREATE UNIQUE INDEX ON ` + schema + `.nhi_users (lower(email))`,
		`CREATE TABLE ` + schema + `.refresh_tokens (id serial PRIMARY KEY, user_id integer REFERENCES ` + schema + `.nhi_users (id) ON DELETE CASCADE,
			token_hash text, expires_at timestamptz, revoked_at timestamptz, session_id uuid, session_ended_at timestamptz)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(q, err)
		}
	}
	t.Cleanup(func() { db.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`) }) //nolint:errcheck
	return &Repository{db: db, schema: schema}, db
}

func addUser(t *testing.T, r *Repository, email, role string) *User {
	t.Helper()
	u, err := r.Create(context.Background(), NewUser{Email: email, PasswordHash: "$2a$10$x", Role: role, Status: "active", TenantID: testTenant})
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// The workspace can never be left with no active admin - not by a demotion,
// a switch-off or a removal, and not by two admins demoting each other at the
// same moment.
func TestLastAdminCannotBeTakenAway(t *testing.T) {
	r, _ := testRepo(t)
	ctx := context.Background()
	a := addUser(t, r, "a@ws", "admin")
	b := addUser(t, r, "b@ws", "admin")
	viewer := "viewer"

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, target := range []*User{a, b} {
		wg.Add(1)
		go func(i int, id int) {
			defer wg.Done()
			_, errs[i] = r.Update(ctx, testTenant, id, Changes{Role: &viewer}, "test", true)
		}(i, target.ID)
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		if err == nil {
			ok++
		} else if !errors.Is(err, ErrLastAdmin) {
			t.Fatal(err)
		}
	}
	if ok != 1 {
		t.Fatalf("%d of two concurrent demotions succeeded, want exactly 1", ok)
	}
	n, _ := r.CountActiveAdmins(ctx, testTenant, 0)
	if n != 1 {
		t.Fatalf("%d active admins left, want 1", n)
	}
	remaining := a
	if errs[0] == nil {
		remaining = b
	}
	off := "inactive"
	if _, err := r.Update(ctx, testTenant, remaining.ID, Changes{Status: &off}, "test", true); !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("switching off the last admin: %v, want ErrLastAdmin", err)
	}
	if err := r.Delete(ctx, testTenant, remaining.ID, true); !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("removing the last admin: %v, want ErrLastAdmin", err)
	}
}

// A reset password or a switched-off account ends the person's sessions at once.
func TestPasswordResetEndsSessions(t *testing.T) {
	r, db := testRepo(t)
	ctx := context.Background()
	addUser(t, r, "admin@ws", "admin")
	u := addUser(t, r, "u@ws", "analyst")
	if _, err := db.Exec(`INSERT INTO users_repo_test.refresh_tokens (user_id, token_hash, expires_at, session_id)
		VALUES ($1, 'h1', now() + interval '1 day', gen_random_uuid()), ($1, 'h2', now() + interval '1 day', gen_random_uuid())`, u.ID); err != nil {
		t.Fatal(err)
	}
	hash := "$2a$10$y"
	if _, err := r.Update(ctx, testTenant, u.ID, Changes{PasswordHash: &hash}, "admin@ws", false); err != nil {
		t.Fatal(err)
	}
	var open int
	if err := db.QueryRow(`SELECT count(*) FROM users_repo_test.refresh_tokens WHERE user_id = $1 AND session_ended_at IS NULL`, u.ID).Scan(&open); err != nil {
		t.Fatal(err)
	}
	if open != 0 {
		t.Fatalf("%d sessions still open after a password reset", open)
	}
}

// Two people added at the same moment both get an account; neither is told
// their (different) email is taken.
func TestConcurrentCreatesDoNotClaimEmailTaken(t *testing.T) {
	r, _ := testRepo(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	errs := make([]error, 6)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = r.Create(ctx, NewUser{Email: "p" + string(rune('a'+i)) + "@ws", PasswordHash: "$2a$10$x", Role: "viewer", Status: "active", TenantID: testTenant})
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}
	if _, err := r.Create(ctx, NewUser{Email: "PA@ws", PasswordHash: "x", Role: "viewer", Status: "active", TenantID: testTenant}); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("a real duplicate email: %v, want ErrEmailTaken", err)
	}
}

func TestSearchTreatsWildcardsLiterally(t *testing.T) {
	r, _ := testRepo(t)
	addUser(t, r, "a_b@ws", "viewer")
	addUser(t, r, "axb@ws", "viewer")
	list, err := r.List(context.Background(), testTenant, "a_b", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Email != "a_b@ws" {
		t.Fatalf("search for a_b matched %v", list)
	}
}
