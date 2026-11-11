package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"

	"onprem-console/internal/auth"
	"onprem-console/internal/sources"
)

var kinds = []string{"github", "bitbucket", "jenkins"}

func validKind(k string) bool { return k == "github" || k == "bitbucket" || k == "jenkins" }

// connConfig is what may be shown about a connection. The secret (private
// key or token) is sealed separately and never returned.
type connConfig struct {
	APIURL         string `json:"api_url,omitempty"`
	AppID          string `json:"app_id,omitempty"`
	InstallationID string `json:"installation_id,omitempty"`
	URL            string `json:"url,omitempty"`
	Username       string `json:"username,omitempty"`
}

type connection struct {
	Kind          string          `json:"kind"`
	Status        string          `json:"status"`
	Config        connConfig      `json:"config"`
	HasSecret     bool            `json:"has_secret"`
	HasCACert     bool            `json:"has_ca_cert"`
	Checks        []sources.Check `json:"checks"`
	VerifiedAt    *time.Time      `json:"verified_at"`
	SyncStatus    string          `json:"sync_status"`
	SyncDetail    string          `json:"sync_detail"`
	SyncStartedAt *time.Time      `json:"sync_started_at"`
	LastSyncAt    *time.Time      `json:"last_sync_at"`
	UpdatedBy     string          `json:"updated_by"`
	UpdatedAt     *time.Time      `json:"updated_at"`
	Webhook       *webhookInfo    `json:"webhook,omitempty"`

	secret, webhookSecret []byte
	caCert                string
}

// webhookInfo is shown to admins and analysts only: they paste it into the source.
type webhookInfo struct {
	URL    string `json:"url"`
	Secret string `json:"secret,omitempty"`
}

func (s *Server) loadConnection(ctx context.Context, kind string) (*connection, error) {
	c := &connection{Kind: kind, Status: "not_configured", SyncStatus: "idle", Checks: []sources.Check{}}
	var cfgRaw, checksRaw []byte
	var updatedAt time.Time
	err := s.st.DB.QueryRow(ctx, `SELECT status, config, secret, ca_cert, webhook_secret, checks, verified_at, sync_status, sync_detail,
		sync_started_at, last_sync_at, updated_by, updated_at FROM connections WHERE kind = $1`, kind).
		Scan(&c.Status, &cfgRaw, &c.secret, &c.caCert, &c.webhookSecret, &checksRaw, &c.VerifiedAt, &c.SyncStatus, &c.SyncDetail,
			&c.SyncStartedAt, &c.LastSyncAt, &c.UpdatedBy, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, nil
	}
	if err != nil {
		return nil, err
	}
	c.UpdatedAt = &updatedAt
	_ = json.Unmarshal(cfgRaw, &c.Config)
	_ = json.Unmarshal(checksRaw, &c.Checks)
	c.HasSecret, c.HasCACert = len(c.secret) > 0, c.caCert != ""
	return c, nil
}

func (s *Server) webhookFor(c *connection) *webhookInfo {
	if len(c.webhookSecret) == 0 {
		return nil
	}
	plain, err := s.box.Open(c.webhookSecret)
	if err != nil {
		return nil
	}
	base := s.cfg.PublicURL // empty: the console fills in its own address
	if c.Kind == "jenkins" {
		// The Notification plugin cannot sign, so the secret is the URL's last part.
		return &webhookInfo{URL: base + "/webhooks/jenkins/" + string(plain)}
	}
	return &webhookInfo{URL: base + "/webhooks/" + c.Kind, Secret: string(plain)}
}

func (s *Server) present(r *http.Request, c *connection) *connection {
	if auth.CanManage(caller(r).Role) {
		c.Webhook = s.webhookFor(c)
	}
	return c
}

func (s *Server) listConnections(w http.ResponseWriter, r *http.Request) {
	out := make([]*connection, 0, len(kinds))
	for _, k := range kinds {
		c, err := s.loadConnection(r.Context(), k)
		if err != nil {
			serverError(w, err)
			return
		}
		out = append(out, s.present(r, c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": out, "public_url": s.cfg.PublicURL})
}

func (s *Server) kindOr404(w http.ResponseWriter, r *http.Request) (string, bool) {
	k := mux.Vars(r)["kind"]
	if !validKind(k) {
		writeError(w, http.StatusNotFound, "Unknown source: use github, bitbucket or jenkins.")
		return "", false
	}
	return k, true
}

func (s *Server) getConnection(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	c, err := s.loadConnection(r.Context(), k)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connection": s.present(r, c), "public_url": s.cfg.PublicURL})
}

func newWebhookSecret() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// saveConnection stores what was typed, then tests it straight away. A blank
// secret keeps the one already saved, so a URL can be fixed without pasting
// the token again.
func (s *Server) saveConnection(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	var in struct {
		connConfig
		Secret string  `json:"secret"`
		CACert *string `json:"ca_cert"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cur, err := s.loadConnection(r.Context(), k)
	if err != nil {
		serverError(w, err)
		return
	}
	cfg, problem := cleanConfig(k, in.connConfig)
	if problem == "" && in.Secret == "" && !cur.HasSecret {
		problem = map[string]string{"github": "Paste the App's private key.", "bitbucket": "Paste the HTTP access token.", "jenkins": "Paste the API token."}[k]
	}
	if problem == "" && k == "github" && in.Secret != "" {
		if _, err := sources.ParseGitHubKey(in.Secret); err != nil {
			problem = "The private key is not the .pem file GitHub generated for the App."
		}
	}
	caCert := cur.caCert
	if in.CACert != nil {
		caCert = strings.TrimSpace(*in.CACert)
		if caCert != "" && !strings.Contains(caCert, "BEGIN CERTIFICATE") {
			problem = "The CA certificate must be in PEM form (it starts with -----BEGIN CERTIFICATE-----)."
		}
	}
	if problem != "" {
		writeError(w, http.StatusBadRequest, problem)
		return
	}
	secret := cur.secret
	if in.Secret != "" {
		if secret, err = s.box.Seal([]byte(strings.TrimSpace(in.Secret))); err != nil {
			serverError(w, err)
			return
		}
	}
	hook := cur.webhookSecret
	if len(hook) == 0 {
		if hook, err = s.box.Seal([]byte(newWebhookSecret())); err != nil {
			serverError(w, err)
			return
		}
	}
	cfgJSON, _ := json.Marshal(cfg)
	by := caller(r).Email
	_, err = s.st.DB.Exec(r.Context(), `INSERT INTO connections (kind, config, secret, ca_cert, webhook_secret, status, checks, updated_by, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'saved', '[]', $6, now())
		ON CONFLICT (kind) DO UPDATE SET config = $2, secret = $3, ca_cert = $4, webhook_secret = $5, status = 'saved', checks = '[]',
			verified_at = NULL, updated_by = $6, updated_at = now()`, k, cfgJSON, secret, caCert, hook, by)
	if err != nil {
		serverError(w, err)
		return
	}
	detail := "settings saved"
	if in.Secret != "" {
		detail = "settings and secret saved"
	}
	s.st.Audit(r.Context(), by, "connection_saved", k, detail)
	s.verifyAndRespond(w, r, k, by)
}

func cleanConfig(kind string, in connConfig) (connConfig, string) {
	switch kind {
	case "github":
		out := connConfig{AppID: strings.TrimSpace(in.AppID), InstallationID: strings.TrimSpace(in.InstallationID), APIURL: "https://api.github.com"}
		if strings.TrimSpace(in.APIURL) != "" {
			u, err := sources.BaseURL(in.APIURL)
			if err != nil {
				return out, "Enter the GitHub API address, for example https://github.example.com/api/v3 for GitHub Enterprise Server."
			}
			out.APIURL = u
		}
		if !digits(out.AppID) {
			return out, "The App ID is the number on the App's settings page (General → App ID)."
		}
		if !digits(out.InstallationID) {
			return out, "The installation ID is the number at the end of the installation's address (…/settings/installations/12345678)."
		}
		return out, ""
	case "bitbucket":
		u, err := sources.BaseURL(in.URL)
		if err != nil {
			return connConfig{}, "Enter the Bitbucket address, for example https://bitbucket.example.com"
		}
		return connConfig{URL: u}, ""
	default:
		u, err := sources.BaseURL(in.URL)
		if err != nil {
			return connConfig{}, "Enter the Jenkins address, for example https://jenkins.example.com"
		}
		user := strings.TrimSpace(in.Username)
		if user == "" || len(user) > 100 {
			return connConfig{}, "Enter the Jenkins username (adapid-reader)."
		}
		return connConfig{URL: u, Username: user}, ""
	}
}

func digits(s string) bool {
	if s == "" || len(s) > 20 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (s *Server) verifyConnection(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	s.verifyAndRespond(w, r, k, caller(r).Email)
}

// verifyAndRespond tests the saved connection and, the first time it passes,
// starts the first scan (or Jenkins sync) without waiting to be asked.
func (s *Server) verifyAndRespond(w http.ResponseWriter, r *http.Request, kind, by string) {
	c, err := s.loadConnection(r.Context(), kind)
	if err != nil {
		serverError(w, err)
		return
	}
	if !c.HasSecret {
		writeError(w, http.StatusBadRequest, "Save the connection details first.")
		return
	}
	checks := s.runChecks(r.Context(), c)
	status := "connected"
	for _, ch := range checks {
		if !ch.OK {
			status = "failing"
		}
	}
	checksJSON, _ := json.Marshal(checks)
	if _, err := s.st.DB.Exec(r.Context(), `UPDATE connections SET status = $2, checks = $3, verified_at = now() WHERE kind = $1`, kind, status, checksJSON); err != nil {
		serverError(w, err)
		return
	}
	s.st.Audit(r.Context(), by, "connection_verified", kind, status)
	if status == "connected" && c.LastSyncAt == nil && c.SyncStatus != "running" {
		_ = s.startSync(kind, by)
	}
	c, err = s.loadConnection(r.Context(), kind)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connection": s.present(r, c), "public_url": s.cfg.PublicURL})
}

func (s *Server) runChecks(ctx context.Context, c *connection) []sources.Check {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	src, err := s.client(c)
	if err != nil {
		return []sources.Check{{Name: "Settings readable", OK: false, Detail: err.Error()}}
	}
	return src.(interface {
		Verify(context.Context) []sources.Check
	}).Verify(ctx)
}

// client builds the source client from the saved settings.
func (s *Server) client(c *connection) (any, error) {
	plain, err := s.box.Open(c.secret)
	if err != nil {
		return nil, errors.New("the saved secret cannot be read with this console's ONPREM_ENCRYPTION_KEY: save it again")
	}
	secret := string(plain)
	switch c.Kind {
	case "github":
		return sources.NewGitHub(c.Config.APIURL, c.Config.AppID, c.Config.InstallationID, secret, c.caCert)
	case "bitbucket":
		return sources.NewBitbucket(c.Config.URL, secret, c.caCert)
	default:
		return sources.NewJenkins(c.Config.URL, c.Config.Username, secret, c.caCert)
	}
}

func (s *Server) rotateWebhookSecret(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	sealed, err := s.box.Seal([]byte(newWebhookSecret()))
	if err != nil {
		serverError(w, err)
		return
	}
	tag, err := s.st.DB.Exec(r.Context(), `UPDATE connections SET webhook_secret = $2 WHERE kind = $1`, k, sealed)
	if err != nil {
		serverError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusBadRequest, "Save the connection details first.")
		return
	}
	s.st.Audit(r.Context(), caller(r).Email, "webhook_secret_rotated", k, "")
	s.getConnection(w, r)
}

func (s *Server) deleteConnection(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	if _, err := s.st.DB.Exec(r.Context(), `DELETE FROM connections WHERE kind = $1`, k); err != nil {
		serverError(w, err)
		return
	}
	s.st.Audit(r.Context(), caller(r).Email, "connection_removed", k, "secret and webhook secret deleted; findings kept")
	s.getConnection(w, r)
}

func (s *Server) startScanHandler(w http.ResponseWriter, r *http.Request) {
	k, ok := s.kindOr404(w, r)
	if !ok {
		return
	}
	c, err := s.loadConnection(r.Context(), k)
	if err != nil {
		serverError(w, err)
		return
	}
	if c.Status != "connected" {
		writeError(w, http.StatusBadRequest, "Verify the connection first: scans run on a connected source.")
		return
	}
	if err := s.startSync(k, caller(r).Email); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	s.getConnection(w, r)
}
