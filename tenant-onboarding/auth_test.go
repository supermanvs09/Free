package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const testPassword = "correct horse battery"

func init() {
	failDelay = 0
	log.SetOutput(io.Discard) // the audit lines are checked where they matter
}

// testAuth returns the sign-in over db, with one super admin, "superadmin", who
// signs in with testPassword.
func testAuth(t testing.TB, db *sql.DB) *Auth {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(testPassword), 10)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO nhi_global.super_admins (username, password_hash) VALUES ('superadmin', $1)
		ON CONFLICT DO NOTHING`, string(h)); err != nil {
		t.Fatal(err)
	}
	return NewAuth(db, "nhi_global")
}

// client is a tiny browser: it keeps the session cookie between requests.
type client struct {
	t      testing.TB
	h      http.Handler
	cookie *http.Cookie
}

func (c *client) do(method, path string, body any, mutate ...func(*http.Request)) *httptest.ResponseRecorder {
	c.t.Helper()
	rd := bytes.NewReader(nil)
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	r := httptest.NewRequest(method, path, rd)
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	for _, m := range mutate {
		m(r)
	}
	w := httptest.NewRecorder()
	c.h.ServeHTTP(w, r)
	for _, ck := range w.Result().Cookies() {
		if ck.Name == cookieName {
			if ck.MaxAge < 0 || ck.Value == "" {
				c.cookie = nil
			} else {
				c.cookie = ck
			}
		}
	}
	return w
}

func (c *client) signIn(user, pass string) *httptest.ResponseRecorder {
	return c.do("POST", "/api/login", map[string]string{"username": user, "password": pass})
}

func authClient(t testing.TB, a *Auth) *client {
	return &client{t: t, h: NewHandler(&Service{suffix: "nhi.local"}, a, a.db)}
}

func sessionCount(t *testing.T, db *sql.DB) int {
	return count(t, db, `SELECT count(*) FROM nhi_global.super_admin_sessions`)
}

func TestSignInPageAndProtectedFiles(t *testing.T) {
	db := scratchDB(t)
	c := authClient(t, testAuth(t, db))
	// Nobody signed in: the sign-in page at /, and only its own assets.
	if w := c.do("GET", "/", nil); w.Code != 200 || !strings.Contains(w.Body.String(), "Sign in") || strings.Contains(w.Body.String(), "view-tenants") {
		t.Errorf("/ before sign-in = %d", w.Code)
	}
	for _, p := range []string{"/app.css", "/login.js", "/brand/mark.png", "/brand/wave-v.svg"} {
		if w := c.do("GET", p, nil); w.Code != 200 {
			t.Errorf("%s should be public, got %d", p, w.Code)
		}
	}
	for _, p := range []string{"/lib.js", "/tenants.js", "/onboard.js", "/app.js", "/index.html"} {
		if w := c.do("GET", p, nil); w.Code != 401 {
			t.Errorf("%s without a session = %d, want 401", p, w.Code)
		}
	}
	for _, p := range []string{"/api/workspace?company=x", "/api/tenants"} {
		w := c.do("GET", p, nil)
		if w.Code != 401 || !strings.Contains(w.Body.String(), `"session"`) {
			t.Errorf("%s = %d %s", p, w.Code, w.Body)
		}
	}
	if w := c.do("POST", "/api/onboard", valid()); w.Code != 401 {
		t.Errorf("onboard without a session = %d", w.Code)
	}
	if w := c.do("PATCH", "/api/tenants/3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d", map[string]any{}); w.Code != 401 {
		t.Errorf("edit without a session = %d", w.Code)
	}
	if w := c.do("DELETE", "/api/tenants/3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d", map[string]any{"confirm": "x"}); w.Code != 401 {
		t.Errorf("delete without a session = %d", w.Code)
	}
	if w := c.do("GET", "/api/session", nil); !strings.Contains(w.Body.String(), `"signed_in":false`) {
		t.Errorf("session = %s", w.Body)
	}

	if w := c.signIn("superadmin", testPassword); w.Code != 200 {
		t.Fatalf("sign in = %d %s", w.Code, w.Body)
	}
	if w := c.do("GET", "/", nil); w.Code != 200 || !strings.Contains(w.Body.String(), "Onboard a company") {
		t.Errorf("/ after sign-in = %d", w.Code)
	}
	for _, p := range []string{"/lib.js", "/tenants.js", "/app.js"} {
		if w := c.do("GET", p, nil); w.Code != 200 {
			t.Errorf("%s after sign-in = %d", p, w.Code)
		}
	}
	if w := c.do("GET", "/api/session", nil); !strings.Contains(w.Body.String(), `"user":"superadmin"`) {
		t.Errorf("session = %s", w.Body)
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.super_admins WHERE last_login_at IS NOT NULL`); n != 1 {
		t.Errorf("last_login_at not recorded: %d", n)
	}
}

func TestWrongCredentials(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	c := authClient(t, a)
	var msgs []string
	for _, in := range [][2]string{{"superadmin", "wrong password!"}, {"someone", testPassword}, {"", ""}, {"superadmin", ""}} {
		w := c.signIn(in[0], in[1])
		if w.Code != 401 || c.cookie != nil {
			t.Errorf("%v: %d", in, w.Code)
		}
		msgs = append(msgs, w.Body.String())
	}
	if msgs[0] != msgs[1] {
		t.Error("a wrong username and a wrong password must look identical")
	}
	if sessionCount(t, db) != 0 {
		t.Error("a failed sign-in created a session")
	}
	// The username is trimmed and not case-sensitive; the password is neither.
	for _, u := range []string{"  superadmin ", "SuperAdmin", "SUPERADMIN"} {
		if w := authClient(t, a).signIn(u, testPassword); w.Code != 200 {
			t.Errorf("username %q = %d", u, w.Code)
		}
	}
	if w := authClient(t, a).signIn("superadmin", strings.ToUpper(testPassword)); w.Code != 401 {
		t.Errorf("the password must stay case-sensitive: %d", w.Code)
	}
	if w := authClient(t, a).signIn("superadmin", testPassword+" "); w.Code != 401 {
		t.Errorf("a trailing space in the password must matter: %d", w.Code)
	}
	if w := c.do("POST", "/api/login", nil); w.Code != 400 {
		t.Errorf("empty body = %d", w.Code)
	}
	// SQL in the username is just a wrong username.
	if w := authClient(t, a).signIn("' OR '1'='1", "x"); w.Code != 401 {
		t.Errorf("injection attempt = %d", w.Code)
	}
}

func TestDisabledAdminCannotSignInAndLosesTheSession(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	c := authClient(t, a)
	c.signIn("superadmin", testPassword)
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 200 {
		t.Fatalf("signed in = %d", w.Code)
	}
	if _, err := db.Exec(`UPDATE nhi_global.super_admins SET is_active = false`); err != nil {
		t.Fatal(err)
	}
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
		t.Errorf("a disabled admin's open session must stop working at once: %d", w.Code)
	}
	if w := authClient(t, a).signIn("superadmin", testPassword); w.Code != 401 {
		t.Errorf("a disabled admin signed in: %d", w.Code)
	}
}

func TestCookie(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	c := authClient(t, a)
	w := c.signIn("superadmin", testPassword)
	ck := c.cookie
	if ck == nil || !ck.HttpOnly || ck.SameSite != http.SameSiteStrictMode || ck.Path != "/" {
		t.Fatalf("cookie = %+v", ck)
	}
	if ck.MaxAge != 0 || !ck.Expires.IsZero() {
		t.Error("the cookie must be a session cookie, gone when the browser closes")
	}
	if ck.Secure || w.Header().Get("Strict-Transport-Security") != "" {
		t.Error("plain http must not claim Secure/HSTS")
	}
	// The cookie value is never stored: only its hash.
	if n := count(t, db, `SELECT count(*) FROM nhi_global.super_admin_sessions WHERE token_hash = $1`, ck.Value); n != 0 {
		t.Error("the raw cookie value is in the database")
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.super_admin_sessions WHERE token_hash = $1`, hashToken(ck.Value)); n != 1 {
		t.Error("the session is not stored under the hash of the cookie")
	}
	// Behind https at a load balancer the cookie becomes Secure by itself; nothing to configure.
	sc := authClient(t, a)
	w = sc.do("POST", "/api/login", map[string]string{"username": "superadmin", "password": testPassword},
		func(r *http.Request) { r.Header.Set("X-Forwarded-Proto", "https") })
	if sc.cookie == nil || !sc.cookie.Secure || w.Header().Get("Strict-Transport-Security") == "" {
		t.Error("behind https the cookie must be Secure and HSTS sent")
	}
}

func TestSessionExpiryAndForgery(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	clock := time.Now()
	a.now = func() time.Time { return clock }
	c := authClient(t, a)
	c.signIn("superadmin", testPassword)
	clock = clock.Add(sessionLength - time.Minute)
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 200 {
		t.Errorf("still inside the session = %d", w.Code)
	}
	clock = clock.Add(2 * time.Minute)
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
		t.Errorf("past the session = %d", w.Code)
	}
	// Expired rows are tidied away at the next sign-in.
	authClient(t, a).signIn("superadmin", testPassword)
	if n := sessionCount(t, db); n != 1 {
		t.Errorf("sessions after tidy-up = %d, want only the new one", n)
	}

	for name, v := range map[string]string{
		"random token": "not-a-real-session-token-0123456789abcdef",
		"empty":        "",
		"garbage":      "x.y",
		"huge":         strings.Repeat("A", 5000),
		"sql":          "' OR 1=1 --",
		"a hash":       hashToken("anything"),
	} {
		f := authClient(t, a)
		f.cookie = &http.Cookie{Name: cookieName, Value: v}
		if w := f.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
			t.Errorf("%s accepted: %d", name, w.Code)
		}
	}
	// Knowing a stored hash is not enough: the cookie must be the value it came from.
	good := authClient(t, a)
	good.signIn("superadmin", testPassword)
	var stored string
	if err := db.QueryRow(`SELECT token_hash FROM nhi_global.super_admin_sessions ORDER BY created_at DESC LIMIT 1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	thief := authClient(t, a)
	thief.cookie = &http.Cookie{Name: cookieName, Value: stored}
	if w := thief.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
		t.Errorf("a stolen database row signed someone in: %d", w.Code)
	}
}

func TestLogoutEndsTheSessionInTheDatabase(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	c := authClient(t, a)
	c.signIn("superadmin", testPassword)
	stolen := &http.Cookie{Name: cookieName, Value: c.cookie.Value}
	if w := c.do("POST", "/api/logout", nil); w.Code != 200 || c.cookie != nil {
		t.Fatalf("logout = %d, cookie kept = %v", w.Code, c.cookie != nil)
	}
	if sessionCount(t, db) != 0 {
		t.Error("the session row is still there")
	}
	thief := authClient(t, a)
	thief.cookie = stolen
	if w := thief.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
		t.Errorf("a signed-out cookie still works: %d", w.Code)
	}
	if w := authClient(t, a).do("POST", "/api/logout", nil); w.Code != 200 {
		t.Errorf("logout without a session = %d", w.Code)
	}
}

func TestSeveralSessionsAtOnceAndAcrossRestarts(t *testing.T) {
	db := scratchDB(t)
	a, b := authClient(t, testAuth(t, db)), authClient(t, testAuth(t, db))
	a.signIn("superadmin", testPassword)
	b.signIn("superadmin", testPassword)
	if w := a.do("GET", "/api/workspace?company=x", nil); w.Code != 200 {
		t.Error("signing in on a second device must not end the first")
	}
	// A "restart" or a second copy of the service: a brand-new Auth over the same database.
	other := authClient(t, NewAuth(db, "nhi_global"))
	other.cookie = a.cookie
	if w := other.do("GET", "/api/workspace?company=x", nil); w.Code != 200 {
		t.Errorf("a session must survive a restart and work on another copy: %d", w.Code)
	}
	a.do("POST", "/api/logout", nil)
	if w := b.do("GET", "/api/workspace?company=x", nil); w.Code != 200 {
		t.Error("signing out one device must not end the other")
	}
}

func TestPasswordIsOnlyEverStoredAsAHash(t *testing.T) {
	db := scratchDB(t)
	a := testAuth(t, db)
	var stored string
	if err := db.QueryRow(`SELECT password_hash FROM nhi_global.super_admins WHERE username = 'superadmin'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == testPassword || strings.Contains(stored, testPassword) || !strings.HasPrefix(stored, "$2") {
		t.Errorf("stored value = %q", stored)
	}
	// The table itself refuses a plain-text password, and a bad username.
	if _, err := db.Exec(`INSERT INTO nhi_global.super_admins (username, password_hash) VALUES ('oops', 'plain-password')`); err == nil {
		t.Error("the table accepted a plain-text password")
	}
	if _, err := db.Exec(`INSERT INTO nhi_global.super_admins (username, password_hash) VALUES ('a b', $1)`, stored); err == nil {
		t.Error("the table accepted a username with a space")
	}
	if _, err := db.Exec(`INSERT INTO nhi_global.super_admins (username, password_hash) VALUES ('SUPERADMIN', $1)`, stored); err == nil {
		t.Error("the table accepted the same username in other letters")
	}
	_ = a
}

func TestSetAdmin(t *testing.T) {
	db := scratchDB(t)
	a := NewAuth(db, "nhi_global")
	ctx := t.Context()
	created, err := a.SetAdmin(ctx, "Priya.Rao", "a-long-enough-password")
	if err != nil || !created {
		t.Fatalf("create = %v %v", created, err)
	}
	c := authClient(t, a)
	if w := c.signIn("priya.rao", "a-long-enough-password"); w.Code != 200 {
		t.Fatalf("the new admin cannot sign in: %d %s", w.Code, w.Body)
	}
	// A new password for the same account (in other letters): no second account, old password dead, sessions ended.
	created, err = a.SetAdmin(ctx, "PRIYA.RAO", "another-long-password")
	if err != nil || created {
		t.Fatalf("update = %v %v", created, err)
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.super_admins WHERE lower(username) = 'priya.rao'`); n != 1 {
		t.Errorf("accounts = %d", n)
	}
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 401 {
		t.Errorf("changing the password must sign the admin out: %d", w.Code)
	}
	if w := authClient(t, a).signIn("priya.rao", "a-long-enough-password"); w.Code != 401 {
		t.Error("the old password still works")
	}
	if w := authClient(t, a).signIn("priya.rao", "another-long-password"); w.Code != 200 {
		t.Error("the new password does not work")
	}
	// Changing the password of a disabled admin re-enables them (it is an explicit act by an operator).
	if _, err := db.Exec(`UPDATE nhi_global.super_admins SET is_active = false`); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SetAdmin(ctx, "priya.rao", "third-long-password!"); err != nil {
		t.Fatal(err)
	}
	if w := authClient(t, a).signIn("priya.rao", "third-long-password!"); w.Code != 200 {
		t.Error("a re-created admin cannot sign in")
	}
	for name, in := range map[string][2]string{
		"short username": {"ab", "a-long-enough-password"}, "space": {"a b c", "a-long-enough-password"},
		"short password": {"priya", "short"}, "long password": {"priya", strings.Repeat("x", 73)},
	} {
		if _, err := a.SetAdmin(ctx, in[0], in[1]); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestStartupCheckAndDatabaseTrouble(t *testing.T) {
	db := scratchDB(t)
	a := NewAuth(db, "nhi_global")
	if n, err := a.CountAdmins(t.Context()); err != nil || n != 0 {
		t.Errorf("no admin yet: %d %v", n, err)
	}
	testAuth(t, db)
	if n, err := a.CountAdmins(t.Context()); err != nil || n != 1 {
		t.Errorf("one admin: %d %v", n, err)
	}
	// Tables not created: a message that says what to do.
	missing := NewAuth(db, "no_such_schema")
	if _, err := missing.CountAdmins(t.Context()); err == nil || !strings.Contains(err.Error(), "sql/super_admin.sql") {
		t.Errorf("missing tables: %v", err)
	}

	// The database goes away: a sign-in says it is our problem, not a wrong password, and creates nothing.
	c := authClient(t, a)
	c.signIn("superadmin", testPassword)
	_ = db.Close()
	if w := authClient(t, a).signIn("superadmin", testPassword); w.Code != 500 || strings.Contains(w.Body.String(), "Incorrect") {
		t.Errorf("sign-in with the database down = %d %s", w.Code, w.Body)
	}
	if w := c.do("GET", "/api/workspace?company=x", nil); w.Code != 503 {
		t.Errorf("a signed-in request with the database down = %d, want 503", w.Code)
	}
}

func TestLogNeverHoldsSecrets(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(io.Discard)
	db := scratchDB(t)
	a := testAuth(t, db)
	c := authClient(t, a)
	c.signIn("superadmin", "my wrong password 1")
	c.signIn("evil\nuser", testPassword)
	c.signIn("superadmin", testPassword)
	token := c.cookie.Value
	var hash string
	_ = db.QueryRow(`SELECT password_hash FROM nhi_global.super_admins`).Scan(&hash)
	c.do("POST", "/api/logout", nil)
	out := buf.String()
	for _, secret := range []string{testPassword, "my wrong password 1", hash, token} {
		if strings.Contains(out, secret) {
			t.Fatalf("the log contains a secret: %q", secret)
		}
	}
	for _, want := range []string{`"audit":"login_failed"`, `"audit":"login"`, `"audit":"logout"`, `"username_ok":true`, `"username_ok":false`} {
		if !strings.Contains(out, want) {
			t.Errorf("log lacks %s:\n%s", want, out)
		}
	}
	if strings.Count(out, "\n") != strings.Count(out, `"audit"`) {
		t.Errorf("an entry spans lines (log forging): %q", out)
	}
	// The page itself must not say which part was wrong.
	x, y := authClient(t, a).signIn("superadmin", "wrong password!"), authClient(t, a).signIn("somebody", testPassword)
	if x.Body.String() != y.Body.String() {
		t.Error("the page must give the same answer for a wrong username and a wrong password")
	}
}
