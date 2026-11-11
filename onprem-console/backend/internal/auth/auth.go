// Package auth: local users, sessions and roles.
//
//	admin    everything, including users
//	analyst  set up and verify connections, run scans, triage findings
//	viewer   read only
package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"onprem-console/internal/store"
)

const (
	RoleAdmin   = "admin"
	RoleAnalyst = "analyst"
	RoleViewer  = "viewer"
)

func ValidRole(r string) bool { return r == RoleAdmin || r == RoleAnalyst || r == RoleViewer }

// CanManage: may set up connections, start scans and triage findings.
func CanManage(role string) bool { return role == RoleAdmin || role == RoleAnalyst }

type User struct {
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	Role        string     `json:"role"`
	Active      bool       `json:"active"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// PasswordProblem is the console's password rule: 12-72 characters with an
// upper-case letter, a lower-case letter, a number and a symbol.
func PasswordProblem(pw string) string {
	if len(pw) < 12 || len(pw) > 72 {
		return "Use 12 to 72 characters."
	}
	if strings.TrimSpace(pw) != pw {
		return "The password cannot start or end with a space."
	}
	var up, lo, dg, sy bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			up = true
		case unicode.IsLower(r):
			lo = true
		case unicode.IsDigit(r):
			dg = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			sy = true
		}
	}
	if !up || !lo || !dg || !sy {
		return "Use an upper-case letter, a lower-case letter, a number and a symbol."
	}
	return ""
}

type Service struct {
	st     *store.Store
	secret []byte
	ttl    time.Duration

	mu       sync.Mutex
	failures map[string][]time.Time // email -> recent failed sign-ins
}

func NewService(st *store.Store, secret []byte, ttl time.Duration) *Service {
	return &Service{st: st, secret: secret, ttl: ttl, failures: map[string][]time.Time{}}
}

var (
	ErrBadLogin = errors.New("the email and password do not match an active account")
	ErrLocked   = errors.New("too many failed sign-ins: try again in 15 minutes")
)

const (
	maxFailures = 5
	lockWindow  = 15 * time.Minute
)

// Bootstrap creates the first admin from ONPREM_ADMIN_EMAIL / _PASSWORD when
// the console has no user yet. Afterwards those settings are ignored.
func (s *Service) Bootstrap(ctx context.Context, email, password string) (bool, error) {
	var n int
	if err := s.st.DB.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil || n > 0 {
		return false, err
	}
	if email == "" || password == "" {
		return false, errors.New("no user exists: set ONPREM_ADMIN_EMAIL and ONPREM_ADMIN_PASSWORD to create the first admin")
	}
	if p := PasswordProblem(password); p != "" {
		return false, errors.New("ONPREM_ADMIN_PASSWORD: " + p)
	}
	_, err := s.CreateUser(ctx, email, "Administrator", password, RoleAdmin, "bootstrap")
	return err == nil, err
}

func (s *Service) CreateUser(ctx context.Context, email, name, password, role, by string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	u := &User{}
	err = s.st.DB.QueryRow(ctx, `INSERT INTO users (email, name, password_hash, role, created_by) VALUES (lower($1), $2, $3, $4, $5)
		RETURNING id, email, name, role, active, created_at, last_login_at`, strings.TrimSpace(email), strings.TrimSpace(name), string(hash), role, by).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt)
	return u, err
}

func (s *Service) locked(email string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	var recent []time.Time
	for _, t := range s.failures[email] {
		if now.Sub(t) < lockWindow {
			recent = append(recent, t)
		}
	}
	s.failures[email] = recent
	return len(recent) >= maxFailures
}

func (s *Service) fail(email string, now time.Time) {
	s.mu.Lock()
	s.failures[email] = append(s.failures[email], now)
	s.mu.Unlock()
}

// Login checks the pair and returns a signed session. The same answer is
// given for an unknown email and a wrong password.
func (s *Service) Login(ctx context.Context, email, password string) (string, *User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	now := time.Now()
	if s.locked(email, now) {
		return "", nil, ErrLocked
	}
	u := &User{}
	var hash string
	err := s.st.DB.QueryRow(ctx, `SELECT id, email, name, role, active, created_at, last_login_at, password_hash FROM users WHERE lower(email) = $1`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		// Spend the same time as a real check, so the answer's timing does not say which emails exist.
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWX4Z1YFvXyGcmuVPLkDYahEJPw6"), []byte(password))
		s.fail(email, now)
		return "", nil, ErrBadLogin
	}
	if err != nil {
		return "", nil, err
	}
	if !u.Active || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		s.fail(email, now)
		return "", nil, ErrBadLogin
	}
	_, _ = s.st.DB.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, u.ID)
	token, err := s.issue(u, now)
	return token, u, err
}

type claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func (s *Service) issue(u *User, now time.Time) (string, error) {
	c := claims{Role: u.Role, RegisteredClaims: jwt.RegisteredClaims{
		Subject: u.Email, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)), Issuer: "onprem-console",
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(s.secret)
}

// Caller is who is calling, as the database says now: a role changed or an
// account switched off takes effect on the next request, not at expiry.
type Caller struct {
	Email string
	Role  string
}

type ctxKey struct{}

func FromContext(ctx context.Context) Caller {
	c, _ := ctx.Value(ctxKey{}).(Caller)
	return c
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if raw == "" {
			writeErr(w, http.StatusUnauthorized, "Sign in to continue.")
			return
		}
		var c claims
		tok, err := jwt.ParseWithClaims(raw, &c, func(t *jwt.Token) (any, error) { return s.secret, nil },
			jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer("onprem-console"))
		if err != nil || !tok.Valid {
			writeErr(w, http.StatusUnauthorized, "Your session has ended. Sign in again.")
			return
		}
		var role string
		var active bool
		err = s.st.DB.QueryRow(r.Context(), `SELECT role, active FROM users WHERE lower(email) = lower($1)`, c.Subject).Scan(&role, &active)
		if err != nil || !active {
			writeErr(w, http.StatusUnauthorized, "This account is not active.")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, Caller{Email: c.Subject, Role: role})))
	})
}

// Require lets the request through only for the given roles.
func Require(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := FromContext(r.Context()).Role
			for _, allowed := range roles {
				if role == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}
			writeErr(w, http.StatusForbidden, "Your role cannot do this.")
		})
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":{"message":"` + strings.ReplaceAll(msg, `"`, `'`) + `"}}`))
}
