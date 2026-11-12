// Package codesources connects a company's code repositories for
// credential-exposure scanning: GitHub (the GitHub App) and Bitbucket Data
// Center. Both are company settings in nhi_global.tenants (github_active,
// bitbucket_active), never per AWS account. A source is switched on only
// after its check passed, and the console shows its tab only then.
//
//   - Bitbucket: saved through the secret scanner's admin API (API guide,
//     Endpoint 9), which tests the token and URL, stores them encrypted with a
//     key only the scanner holds, and sets bitbucket_active. Status is read
//     from the database.
//   - GitHub: the company installs the GitHub App; Verify asks the scanner
//     for its installations and switches github_active on when the company's
//     organisation is among them.
//
// Settings: NHI_SECRET_SCANNER_URL (the scanner's base URL),
// NHI_SECRET_SCANNER_ADMIN_KEY (its X-Admin-Key, server side only) and
// NHI_GITHUB_APP_INSTALL_URL (the App's install link, shown on the page).
package codesources

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

type Handler struct {
	db         *database.PostgresDB
	global     string
	scannerURL string
	adminKey   string
	installURL string
	http       *http.Client
	columns    sync.Once
	columnsErr error
}

func NewHandler(db *database.PostgresDB) *Handler {
	global := "nhi_global"
	if db != nil && strings.TrimSpace(db.GlobalSchema()) != "" {
		global = db.GlobalSchema()
	}
	return &Handler{
		db:         db,
		global:     global,
		scannerURL: strings.TrimRight(strings.TrimSpace(os.Getenv("NHI_SECRET_SCANNER_URL")), "/"),
		adminKey:   strings.TrimSpace(os.Getenv("NHI_SECRET_SCANNER_ADMIN_KEY")),
		installURL: strings.TrimSpace(os.Getenv("NHI_GITHUB_APP_INSTALL_URL")),
		http:       &http.Client{Timeout: 45 * time.Second},
	}
}

// Register mounts the routes on the authenticated /api/v1 router.
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/integrations/code-sources", h.Get).Methods(http.MethodGet)
	r.HandleFunc("/integrations/code-sources/github", h.VerifyGitHub).Methods(http.MethodPost)
	r.HandleFunc("/integrations/code-sources/github", h.DisconnectGitHub).Methods(http.MethodDelete)
	r.HandleFunc("/integrations/code-sources/bitbucket", h.SaveBitbucket).Methods(http.MethodPost)
	r.HandleFunc("/integrations/code-sources/bitbucket/test", h.TestBitbucket).Methods(http.MethodPost)
	r.HandleFunc("/integrations/code-sources/bitbucket", h.DisconnectBitbucket).Methods(http.MethodDelete)
}

type caller struct{ tenantID, schema, actor string }

func (h *Handler) caller(w http.ResponseWriter, r *http.Request, write bool) (caller, bool) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		send(w, http.StatusUnauthorized, false, "Unauthorized", "UNAUTHORIZED", nil)
		return caller{}, false
	}
	w.Header().Set("Cache-Control", "no-store")
	if write && !strings.EqualFold(strings.TrimSpace(claims.Role), "admin") {
		send(w, http.StatusForbidden, false, "Only an admin can connect code repositories", "FORBIDDEN", nil)
		return caller{}, false
	}
	if h.db == nil || h.db.DB == nil {
		send(w, http.StatusServiceUnavailable, false, "The database is not configured", "UNAVAILABLE", nil)
		return caller{}, false
	}
	return caller{tenantID: claims.TenantID, schema: claims.DBName, actor: claims.UserID}, true
}

func send(w http.ResponseWriter, status int, ok bool, msg, code string, data any) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: ok, Message: msg, Error: code, Data: data})
}

/* ── Status ────────────────────────────────────────────────────────────── */

type GitHubStatus struct {
	Active          bool       `json:"active"`
	Org             string     `json:"org"`
	VerifiedAt      *time.Time `json:"verified_at"`
	InstallURL      string     `json:"install_url"`
	VerifyAvailable bool       `json:"verify_available"`
}

type BitbucketStatus struct {
	Active            bool       `json:"active"`
	Configured        bool       `json:"configured"`
	BaseURL           string     `json:"base_url"`
	Projects          []string   `json:"projects"`
	Repositories      []string   `json:"repositories"`
	TokenExpiresAt    string     `json:"token_expires_at"`
	TokenDaysLeft     *int       `json:"token_days_left"`
	TokenExpiryStatus string     `json:"token_expiry_status"` // ok | expiring_soon | expired | unknown
	WebhookURL        string     `json:"webhook_url"`
	LastVerifiedAt    *time.Time `json:"last_verified_at"`
	LastEventAt       *time.Time `json:"last_event_at"`
	SaveAvailable     bool       `json:"save_available"`
}

type Status struct {
	CanManage bool            `json:"can_manage"`
	GitHub    GitHubStatus    `json:"github"`
	Bitbucket BitbucketStatus `json:"bitbucket"`
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, false)
	if !ok {
		return
	}
	st, err := h.status(r.Context(), c)
	if err != nil {
		slog.Error("code sources: status", "tenant_id", c.tenantID, "err", err)
		send(w, http.StatusInternalServerError, false, "Could not read the code repository connections", "CODE_SOURCES_FAILED", nil)
		return
	}
	st.CanManage = strings.EqualFold(strings.TrimSpace(middleware.GetClaims(r).Role), "admin")
	send(w, http.StatusOK, true, "Code repositories", "", st)
}

func (h *Handler) status(ctx context.Context, c caller) (*Status, error) {
	if err := h.ensureColumns(ctx); err != nil {
		return nil, err
	}
	st := &Status{}
	st.GitHub.InstallURL = h.installURL
	st.GitHub.VerifyAvailable = h.scannerURL != "" && h.adminKey != ""
	st.Bitbucket.SaveAvailable = st.GitHub.VerifyAvailable
	var ghVerified, bbVerified, bbEvent sql.NullTime
	var ghActive, bbActive bool
	err := h.db.DB.QueryRowContext(ctx, `SELECT github_active = 1, COALESCE(github_org, ''), github_last_verified_at,
			bitbucket_active = 1, COALESCE(bitbucket_webhook_url, ''), bitbucket_last_verified_at, bitbucket_last_event_at
		FROM `+database.Table(h.global, "tenants")+` WHERE tenant_id = $1::uuid`, c.tenantID).
		Scan(&ghActive, &st.GitHub.Org, &ghVerified, &bbActive, &st.Bitbucket.WebhookURL, &bbVerified, &bbEvent)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	st.GitHub.Active, st.Bitbucket.Active = ghActive, bbActive
	st.GitHub.VerifiedAt, st.Bitbucket.LastVerifiedAt, st.Bitbucket.LastEventAt = timePtr(ghVerified), timePtr(bbVerified), timePtr(bbEvent)

	st.Bitbucket.Projects, st.Bitbucket.Repositories, st.Bitbucket.TokenExpiryStatus = []string{}, []string{}, "unknown"
	if c.schema != "" {
		var projects, repos string
		err := h.db.DB.QueryRowContext(ctx, `SELECT base_url, COALESCE(projects, '[]'), COALESCE(repositories, '[]'), COALESCE(token_expires_at, '')
			FROM `+database.Table(c.schema, "secscan_bitbucket_connection")+` WHERE tenant_id = $1`, c.tenantID).
			Scan(&st.Bitbucket.BaseURL, &projects, &repos, &st.Bitbucket.TokenExpiresAt)
		switch {
		case err == nil:
			st.Bitbucket.Configured = true
			_ = json.Unmarshal([]byte(projects), &st.Bitbucket.Projects)
			_ = json.Unmarshal([]byte(repos), &st.Bitbucket.Repositories)
			if d, err := time.Parse("2006-01-02", st.Bitbucket.TokenExpiresAt); err == nil {
				left := int(time.Until(d.Add(24*time.Hour)).Hours() / 24)
				st.Bitbucket.TokenDaysLeft = &left
				switch {
				case left < 0:
					st.Bitbucket.TokenExpiryStatus = "expired"
				case left <= 7:
					st.Bitbucket.TokenExpiryStatus = "expiring_soon"
				default:
					st.Bitbucket.TokenExpiryStatus = "ok"
				}
			}
		case errors.Is(err, sql.ErrNoRows), isMissingTable(err):
		default:
			return nil, err
		}
	}
	return st, nil
}

func timePtr(t sql.NullTime) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func isMissingTable(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "42P01") || strings.Contains(err.Error(), "does not exist"))
}

// ensureColumns: migrations/global/008 and 010, for a database without them.
// Once per process: ALTER TABLE takes a lock even when there is nothing to add.
func (h *Handler) ensureColumns(ctx context.Context) error {
	h.columns.Do(func() { h.columnsErr = h.addColumns(ctx) })
	return h.columnsErr
}

func (h *Handler) addColumns(ctx context.Context) error {
	_, err := h.db.DB.ExecContext(ctx, `ALTER TABLE `+database.Table(h.global, "tenants")+`
		ADD COLUMN IF NOT EXISTS github_active smallint NOT NULL DEFAULT 0,
		ADD COLUMN IF NOT EXISTS github_org character varying(100),
		ADD COLUMN IF NOT EXISTS github_updated_by character varying(300),
		ADD COLUMN IF NOT EXISTS github_updated_at timestamptz,
		ADD COLUMN IF NOT EXISTS github_last_verified_at timestamptz,
		ADD COLUMN IF NOT EXISTS bitbucket_active smallint NOT NULL DEFAULT 0,
		ADD COLUMN IF NOT EXISTS bitbucket_webhook_url character varying(1000),
		ADD COLUMN IF NOT EXISTS bitbucket_last_verified_at timestamptz,
		ADD COLUMN IF NOT EXISTS bitbucket_last_event_at timestamptz`)
	return err
}

/* ── GitHub ────────────────────────────────────────────────────────────── */

var orgRE = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)

// VerifyGitHub checks that the GitHub App is installed on the company's
// organisation and only then switches GitHub scanning on.
func (h *Handler) VerifyGitHub(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, true)
	if !ok {
		return
	}
	var body struct {
		Org string `json:"org"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
		send(w, http.StatusBadRequest, false, "Invalid request body", "INVALID_REQUEST", nil)
		return
	}
	org := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(body.Org), "@"))
	if !orgRE.MatchString(org) {
		send(w, http.StatusBadRequest, false, "Enter the GitHub organisation (or user) name the App is installed on, for example acme-corp.", "INVALID_ORG", nil)
		return
	}
	if h.scannerURL == "" || h.adminKey == "" {
		send(w, http.StatusServiceUnavailable, false, "The GitHub check is not available yet. Contact support.", "SCANNER_NOT_CONFIGURED", nil)
		return
	}
	status, raw, err := h.scanner(r.Context(), http.MethodGet, "/api/admin/github/installations", nil)
	if err != nil || status >= 300 {
		slog.Warn("code sources: listing GitHub installations failed", "tenant_id", c.tenantID, "status", status, "err", err)
		send(w, http.StatusBadGateway, false, "We could not check GitHub just now. Try again in a minute.", "SCANNER_UNREACHABLE", nil)
		return
	}
	checks := []check{{Key: "installed", Label: "The GitHub App is installed on " + org}}
	if !installedOn(raw, org) {
		checks[0].State, checks[0].Message = "fail", "No installation of the App was found on "+org+". Install it (step 1), choose the repositories, then check again."
		send(w, http.StatusUnprocessableEntity, false, checks[0].Message, "GITHUB_NOT_INSTALLED", map[string]any{"checks": checks})
		return
	}
	checks[0].State = "pass"
	if err := h.ensureColumns(r.Context()); err != nil {
		send(w, http.StatusInternalServerError, false, "Could not save the GitHub connection", "SAVE_FAILED", nil)
		return
	}
	if _, err := h.db.DB.ExecContext(r.Context(), `UPDATE `+database.Table(h.global, "tenants")+`
		SET github_active = 1, github_org = $2, github_updated_by = $3, github_updated_at = now(), github_last_verified_at = now()
		WHERE tenant_id = $1::uuid`, c.tenantID, org, c.actor); err != nil {
		slog.Error("code sources: save github", "tenant_id", c.tenantID, "err", err)
		send(w, http.StatusInternalServerError, false, "Could not save the GitHub connection", "SAVE_FAILED", nil)
		return
	}
	slog.Info("code sources: GitHub switched on", "tenant_id", c.tenantID, "org", org, "by", c.actor)
	send(w, http.StatusOK, true, "GitHub connected", "", map[string]any{"checks": checks, "org": org})
}

// installedOn looks for org in the scanner's installation list, whatever its
// exact shape: a list (or {"installations": [...]}) of objects naming the
// account as account / account_login / login / org / owner, or account.login.
func installedOn(raw []byte, org string) bool {
	var doc any
	if json.Unmarshal(raw, &doc) != nil {
		return false
	}
	var walk func(v any, depth int) bool
	walk = func(v any, depth int) bool {
		if depth > 4 {
			return false
		}
		switch t := v.(type) {
		case []any:
			for _, x := range t {
				if walk(x, depth+1) {
					return true
				}
			}
		case map[string]any:
			for _, k := range []string{"account", "account_login", "login", "org", "owner", "organization"} {
				if s, ok := t[k].(string); ok && strings.EqualFold(s, org) {
					return true
				}
			}
			for _, x := range t {
				if walk(x, depth+1) {
					return true
				}
			}
		}
		return false
	}
	return walk(doc, 0)
}

func (h *Handler) DisconnectGitHub(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, true)
	if !ok {
		return
	}
	if err := h.ensureColumns(r.Context()); err == nil {
		_, err = h.db.DB.ExecContext(r.Context(), `UPDATE `+database.Table(h.global, "tenants")+`
			SET github_active = 0, github_updated_by = $2, github_updated_at = now() WHERE tenant_id = $1::uuid`, c.tenantID, c.actor)
		if err == nil {
			slog.Info("code sources: GitHub switched off", "tenant_id", c.tenantID, "by", c.actor)
			send(w, http.StatusOK, true, "GitHub scanning switched off", "", nil)
			return
		}
	}
	send(w, http.StatusInternalServerError, false, "Could not switch GitHub off", "SAVE_FAILED", nil)
}

/* ── Bitbucket (the scanner's Endpoint 9) ─────────────────────────────── */

type check struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	State   string `json:"state"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) SaveBitbucket(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, true)
	if !ok {
		return
	}
	var in struct {
		BaseURL     string `json:"base_url"`
		Token       string `json:"token"`
		ExpiresAt   string `json:"token_expires_at"`
		CACertPEM   string `json:"ca_cert_pem"`
		RotateHooks bool   `json:"rotate_webhook_secret"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		send(w, http.StatusBadRequest, false, "Invalid request body", "INVALID_REQUEST", nil)
		return
	}
	bad := map[string]string{}
	in.BaseURL = strings.TrimRight(strings.TrimSpace(in.BaseURL), "/")
	if !strings.HasPrefix(in.BaseURL, "https://") && !strings.HasPrefix(in.BaseURL, "http://") {
		bad["base_url"] = "Enter the address of your Bitbucket, for example https://bitbucket.example.com"
	}
	if strings.TrimSpace(in.Token) == "" {
		bad["token"] = "Paste the HTTP access token"
	}
	if d, err := time.Parse("2006-01-02", strings.TrimSpace(in.ExpiresAt)); err != nil {
		bad["token_expires_at"] = "Enter the token's expiry date"
	} else if d.Before(time.Now().Truncate(24 * time.Hour)) {
		bad["token_expires_at"] = "This date is in the past: the token has already expired"
	}
	if len(bad) > 0 {
		send(w, http.StatusBadRequest, false, "Check the highlighted fields", "VALIDATION_ERROR", map[string]any{"fields": bad})
		return
	}
	payload := map[string]any{"tenant_id": c.tenantID, "base_url": in.BaseURL, "token": strings.TrimSpace(in.Token),
		"token_expires_at": strings.TrimSpace(in.ExpiresAt), "actor": c.actor}
	if strings.TrimSpace(in.CACertPEM) != "" {
		payload["ca_cert_pem"] = strings.TrimSpace(in.CACertPEM)
	}
	if in.RotateHooks {
		payload["rotate_webhook_secret"] = true
	}
	h.forward(w, r, c, http.MethodPost, "/api/admin/bitbucket/connections", payload, "Bitbucket connected")
}

func (h *Handler) TestBitbucket(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, true)
	if !ok {
		return
	}
	h.forward(w, r, c, http.MethodPost, "/api/admin/bitbucket/connections/"+c.tenantID+"/test", nil, "Connection checked")
}

func (h *Handler) DisconnectBitbucket(w http.ResponseWriter, r *http.Request) {
	c, ok := h.caller(w, r, true)
	if !ok {
		return
	}
	h.forward(w, r, c, http.MethodDelete, "/api/admin/bitbucket/connections/"+c.tenantID, nil, "Bitbucket scanning switched off")
}

// forward sends one call to the scanner and answers with what it said,
// reshaped for the console. The token is never logged or returned.
func (h *Handler) forward(w http.ResponseWriter, r *http.Request, c caller, method, path string, payload any, okMsg string) {
	if h.scannerURL == "" || h.adminKey == "" {
		send(w, http.StatusServiceUnavailable, false, "Bitbucket can't be connected from here yet. Contact support.", "SCANNER_NOT_CONFIGURED", nil)
		return
	}
	status, raw, err := h.scanner(r.Context(), method, path, payload)
	if err != nil {
		slog.Warn("code sources: scanner unreachable", "tenant_id", c.tenantID, "path", path, "err", err)
		send(w, http.StatusBadGateway, false, "We could not reach the scanning service just now. Try again in a minute.", "SCANNER_UNREACHABLE", nil)
		return
	}
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	if body == nil {
		body = map[string]any{}
	}
	delete(body, "token")
	slog.Info("code sources: bitbucket", "tenant_id", c.tenantID, "path", path, "status", status, "by", c.actor)
	switch {
	case status >= 200 && status < 300 && body["ok"] != false:
		send(w, http.StatusOK, true, okMsg, "", body)
	case status == http.StatusConflict:
		send(w, http.StatusConflict, false, "Bitbucket isn't ready for your company yet. Contact support.", "BITBUCKET_NOT_READY", nil)
	case status >= 200 && status < 300, status == http.StatusBadRequest:
		msg, _ := body["error"].(string)
		if msg == "" {
			msg = "The connection test failed. Nothing was saved."
		}
		send(w, http.StatusUnprocessableEntity, false, msg, "BITBUCKET_TEST_FAILED", body)
	case status == http.StatusNotFound:
		send(w, http.StatusNotFound, false, "Bitbucket is not connected", "NOT_FOUND", nil)
	default:
		send(w, http.StatusBadGateway, false, "The scanning service answered with an error. Try again in a minute.", "SCANNER_ERROR", nil)
	}
}

func (h *Handler) scanner(ctx context.Context, method, path string, payload any) (int, []byte, error) {
	var rd io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, h.scannerURL+path, rd)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Admin-Key", h.adminKey)
	req.Header.Set("Accept", "application/json")
	if rd != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := h.http.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, nil, fmt.Errorf("read scanner answer: %w", err)
	}
	return resp.StatusCode, raw, nil
}
