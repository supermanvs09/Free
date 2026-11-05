package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	cookieName    = "nhi_admin_session"
	sessionLength = 12 * time.Hour // signed out after this; the cookie also goes when the browser closes
)

// failDelay slows every wrong sign-in a little, so guessing is slow.
var failDelay = 400 * time.Millisecond

var adminNameRE = regexp.MustCompile(`^[A-Za-z0-9._@-]{3,64}$`)

// A wrong username must take as long as a wrong password, so one bcrypt
// comparison always happens; this is what it is compared against.
var (
	dummyOnce sync.Once
	dummyHash []byte
)

func dummy() []byte {
	dummyOnce.Do(func() { dummyHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-administrator"), 12) })
	return dummyHash
}

// Auth signs a super admin in. The admins are rows of nhi_global.super_admins
// (username and a bcrypt hash); a sign-in is a random cookie whose sha-256 is a row
// of nhi_global.super_admin_sessions. Nothing is configured in the environment.
type Auth struct {
	db     *sql.DB
	global string
	now    func() time.Time
}

// NewAuth returns the sign-in over the database that holds the global schema.
func NewAuth(db *sql.DB, globalSchema string) *Auth {
	if strings.TrimSpace(globalSchema) == "" {
		globalSchema = "nhi_global"
	}
	return &Auth{db: db, global: globalSchema, now: time.Now}
}

func (a *Auth) table(name string) string { return quote(a.global) + "." + quote(name) }

// CountAdmins is the number of super admins who can sign in. It fails, with a message
// that says what to do, when the tables have not been created.
func (a *Auth) CountAdmins(ctx context.Context) (int, error) {
	var n int
	err := a.db.QueryRowContext(ctx, `SELECT count(*) FROM `+a.table("super_admins")+` WHERE is_active`).Scan(&n)
	if err != nil && strings.Contains(err.Error(), "42P01") { // undefined_table
		return 0, fmt.Errorf("the super admin tables do not exist yet: run sql/super_admin.sql in your %s database first", a.global)
	}
	return n, err
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

/* ---------- the cookie ---------- */

// isSecure: https straight to the service, or https at a load balancer in front of it.
func (a *Auth) isSecure(r *http.Request) bool {
	return r.TLS != nil || strings.Contains(strings.ToLower(r.Header.Get("X-Forwarded-Proto")), "https")
}

func (a *Auth) setCookie(w http.ResponseWriter, r *http.Request, token string) {
	// No Expires/Max-Age: a session cookie, gone when the browser closes. The database enforces the real limit.
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", HttpOnly: true, Secure: a.isSecure(r), SameSite: http.SameSiteStrictMode,
	})
}

func (a *Auth) clearCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.isSecure(r), SameSite: http.SameSiteStrictMode,
	})
}

// lookup finds who the request's cookie belongs to. ok is false for no cookie, an
// unknown or expired one, or an admin who has been disabled. err is only a database failure.
func (a *Auth) lookup(r *http.Request) (user string, ok bool, err error) {
	c, e := r.Cookie(cookieName)
	if e != nil || c.Value == "" || len(c.Value) > 128 {
		return "", false, nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	e = a.db.QueryRowContext(ctx, `SELECT u.username FROM `+a.table("super_admin_sessions")+` s
		JOIN `+a.table("super_admins")+` u ON u.id = s.admin_id
		WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.is_active`, hashToken(c.Value), a.now()).Scan(&user)
	if errors.Is(e, sql.ErrNoRows) {
		return "", false, nil
	}
	if e != nil {
		return "", false, e
	}
	return user, true, nil
}

// current says who is signed in, for deciding between the page and the sign-in form.
func (a *Auth) current(r *http.Request) (string, bool) {
	u, ok, err := a.lookup(r)
	if err != nil {
		log.Printf("check session: %v", err)
	}
	return u, ok
}

/* ---------- handlers ---------- */

type ctxKey struct{}

// Who is the signed-in super admin of a request that passed requireSession.
func Who(r *http.Request) string {
	u, _ := r.Context().Value(ctxKey{}).(string)
	return u
}

// requireSession lets only a signed-in super admin through. An API call that is
// refused gets a code so the page can say what happened.
func (a *Auth) requireSession(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok, err := a.lookup(r)
		switch {
		case err != nil:
			log.Printf("check session: %v", err)
			if strings.HasPrefix(r.URL.Path, "/api/") {
				writeJSON(w, http.StatusServiceUnavailable, errorBody{Error: "The service could not check your sign-in just now. Try again in a moment."})
			} else {
				http.Error(w, "Try again in a moment.", http.StatusServiceUnavailable)
			}
		case !ok:
			if strings.HasPrefix(r.URL.Path, "/api/") {
				writeJSON(w, http.StatusUnauthorized, errorBody{Error: "Your session has ended. Sign in again.", Code: "session"})
			} else {
				http.Error(w, "Sign in to continue.", http.StatusUnauthorized)
			}
		default:
			next(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, user)))
		}
	}
}

type loginBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *Auth) login(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var in loginBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{Error: "That request could not be read. Reload the page and try again."})
		return
	}
	username := strings.TrimSpace(in.Username)
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var id int
	var storedName, hash string
	found := true
	err := a.db.QueryRowContext(ctx, `SELECT id, username, password_hash FROM `+a.table("super_admins")+`
		WHERE lower(username) = lower($1) AND is_active`, username).Scan(&id, &storedName, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		found, hash = false, string(dummy())
	} else if err != nil {
		log.Printf("sign-in lookup: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong on our side, not with your password. Try again in a moment."})
		return
	}
	// Always one bcrypt comparison, so a wrong username takes as long as a wrong password.
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil || !found {
		time.Sleep(failDelay)
		// The log (never the page) says whether the username was a known one, so a mistyped
		// username is not mistaken for a wrong password.
		audit(r, "login_failed", map[string]any{"username": clip(in.Username, 64), "username_ok": found})
		writeJSON(w, http.StatusUnauthorized, errorBody{Error: "Incorrect username or password.", Code: "credentials"})
		return
	}

	token, err := newToken()
	if err == nil {
		err = a.startSession(ctx, id, token)
	}
	if err != nil {
		log.Printf("start session: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody{Error: "Something went wrong on our side, not with your password. Try again in a moment."})
		return
	}
	a.setCookie(w, r, token)
	audit(r.WithContext(context.WithValue(r.Context(), ctxKey{}, storedName)), "login", nil)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "user": storedName})
}

func (a *Auth) startSession(ctx context.Context, adminID int, token string) error {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	now := a.now()
	if _, err := tx.ExecContext(ctx, `DELETE FROM `+a.table("super_admin_sessions")+` WHERE expires_at < $1`, now); err != nil { // tidy up
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO `+a.table("super_admin_sessions")+` (token_hash, admin_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
		hashToken(token), adminID, now, now.Add(sessionLength)); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+a.table("super_admins")+` SET last_login_at = $2 WHERE id = $1`, adminID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (a *Auth) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
		user, _ := a.current(r)
		// Signing out really ends the session: the row goes, so the cookie is dead everywhere.
		if _, err := a.db.ExecContext(r.Context(), `DELETE FROM `+a.table("super_admin_sessions")+` WHERE token_hash = $1`, hashToken(c.Value)); err != nil {
			log.Printf("end session: %v", err)
		} else if user != "" {
			audit(r.WithContext(context.WithValue(r.Context(), ctxKey{}, user)), "logout", nil)
		}
	}
	a.clearCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// state tells the page who is signed in.
func (a *Auth) state(w http.ResponseWriter, r *http.Request) {
	user, ok := a.current(r)
	out := map[string]any{"signed_in": ok}
	if ok {
		out["user"] = user
	}
	writeJSON(w, http.StatusOK, out)
}

// SetAdmin creates a super admin, or changes the password of an existing one (which
// also signs that admin out everywhere). It reports which of the two happened.
func (a *Auth) SetAdmin(ctx context.Context, username, password string) (created bool, err error) {
	if !adminNameRE.MatchString(username) {
		return false, errors.New("the username must be 3-64 characters: letters, digits, and . _ @ -")
	}
	if len(password) < 12 || len(password) > 72 {
		return false, errors.New("the password must be 12 to 72 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return false, err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var id int
	err = tx.QueryRowContext(ctx, `INSERT INTO `+a.table("super_admins")+` (username, password_hash) VALUES ($1, $2)
		ON CONFLICT ((lower(username))) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true
		RETURNING id, (xmax = 0)`, username, string(hash)).Scan(&id, &created)
	if err != nil {
		if strings.Contains(err.Error(), "42P01") {
			return false, fmt.Errorf("the super admin tables do not exist yet: run sql/super_admin.sql in your %s database first", a.global)
		}
		return false, err
	}
	if !created {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+a.table("super_admin_sessions")+` WHERE admin_id = $1`, id); err != nil {
			return false, err
		}
	}
	return created, tx.Commit()
}

/* ---------- audit log ---------- */

// audit writes one JSON line per event to the service log: who and what. Never
// a password, a hash or a full External ID.
func audit(r *http.Request, event string, detail map[string]any) {
	rec := map[string]any{"audit": event, "time": time.Now().UTC().Format(time.RFC3339)}
	if r != nil {
		if u := Who(r); u != "" {
			rec["user"] = u
		}
	}
	for k, v := range detail {
		rec[k] = v
	}
	b, _ := json.Marshal(rec)
	log.Print(string(b))
}

func clip(s string, n int) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1 // no control characters in a log line
		}
		return r
	}, strings.TrimSpace(s))
	if len(s) > n {
		return s[:n]
	}
	return s
}
