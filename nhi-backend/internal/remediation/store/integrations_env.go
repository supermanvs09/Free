package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/remediation/domain"
)

// Platform defaults for Jira / e-mail, read from .env (see config.RemediationIntegrationsConfig).
//
// A tenant without its own row in remediation_integrations gets one on first use, with
// config {"from_env": true}: the row only keeps the tenant's Jira cursors, while the
// settings themselves are always read from the current .env. A tenant admin overrides
// them with PUT /integrations/{type} (a row without from_env); sending
// {"config":{"from_env":true}} goes back to the .env defaults.

type envIntegration struct {
	Config    json.RawMessage
	SecretRef string
}

var (
	envMu       sync.RWMutex
	envDefaults = map[string]envIntegration{}
)

// SetEnvIntegrations loads the .env defaults (called once at start-up).
func SetEnvIntegrations(c config.RemediationIntegrationsConfig) {
	m := map[string]envIntegration{}
	if j := c.Jira; j.Enabled {
		cfg := map[string]any{"from_env": true, "base_url": j.BaseURL, "email": j.Email, "project_key": j.ProjectKey,
			"issue_type": j.IssueType, "min_severity": j.MinSeverity, "done_transition": j.DoneTransition,
			"reopen_transition": j.ReopenTransition, "wontdo_transition": j.WontDoTransition}
		if len(j.Labels) > 0 {
			cfg["labels"] = j.Labels
		}
		m["JIRA"] = envIntegration{Config: mustJSON(cfg), SecretRef: j.TokenRef}
	}
	e := c.Email
	base := map[string]any{"from_env": true, "from": e.From, "approvers": nonNil(e.Approvers), "notify": nonNil(e.Notify)}
	// E-mail is Amazon SES only; it is on when EMAIL_FROM is set.
	if e.From != "" {
		base["region"] = e.SESRegion
		m["SES"] = envIntegration{Config: mustJSON(base)}
	}
	envMu.Lock()
	envDefaults = m
	envMu.Unlock()
}

func envFor(typ string) (envIntegration, bool) {
	envMu.RLock()
	defer envMu.RUnlock()
	e, ok := envDefaults[typ]
	return e, ok
}

// fromEnv reports whether a stored row follows the .env defaults.
func fromEnv(i *domain.Integration) bool {
	var c struct {
		FromEnv bool `json:"from_env"`
	}
	_ = json.Unmarshal(i.Config, &c)
	return c.FromEnv
}

// overlayEnv replaces the settings of a from_env row with the current .env values
// (cursors and sync state stay). When .env no longer configures the type, the row is
// reported disabled.
func overlayEnv(i *domain.Integration) {
	if i == nil || !fromEnv(i) {
		return
	}
	if e, ok := envFor(i.Type); ok {
		i.Config, i.SecretRef, i.Enabled = e.Config, e.SecretRef, true
		return
	}
	i.Enabled = false
}

// ensureEnvRow creates the tenant's from_env row for a type configured in .env.
func (s *Store) ensureEnvRow(ctx context.Context, typ string) error {
	if _, ok := envFor(typ); !ok {
		return ErrNotFound
	}
	// NOT EXISTS rather than ON CONFLICT: a tenant schema restored without the
	// (tenant_id, type) unique constraint would otherwise fail every listing.
	_, err := s.pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %[1]s (integration_id, tenant_id, type, enabled, config)
		SELECT $1::uuid, $2::uuid, $3, true, '{"from_env": true}'::jsonb
		WHERE NOT EXISTS (SELECT 1 FROM %[1]s WHERE tenant_id = $2::uuid AND type = $3)`,
		s.tbl("remediation_integrations")), uuid.NewString(), s.TenantID, typ)
	if isUniqueViolation(err) { // a concurrent request created it first
		return nil
	}
	return err
}

// EnvIntegrationTypes lists the integration types configured in .env.
func EnvIntegrationTypes() []string {
	envMu.RLock()
	defer envMu.RUnlock()
	var out []string
	for _, t := range []string{"JIRA", "SES"} {
		if _, ok := envDefaults[t]; ok {
			out = append(out, t)
		}
	}
	return out
}

func isNotFound(err error) bool { return errors.Is(err, ErrNotFound) }

func mustJSON(v any) json.RawMessage { b, _ := json.Marshal(v); return b }

func nonNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

// isUniqueViolation reports a unique_violation (23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
