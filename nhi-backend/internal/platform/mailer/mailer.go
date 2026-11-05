// Package mailer sends the platform's own e-mail (not a tenant's): today, the
// notice to the platform admins that a new AWS connection waits for their
// approval. It sends through SMTP or Amazon SES, chosen by EMAIL_PROVIDER, and
// reuses the remediation module's senders and settings:
//
//	EMAIL_PROVIDER   smtp | ses | empty (smtp when SMTP_HOST is set, else ses
//	                 when SES_REGION or AWS_REGION is set)
//	EMAIL_FROM       the sender (for SES, a verified address or domain)
//	SMTP_HOST, SMTP_PORT (587), SMTP_USERNAME, SMTP_PASSWORD,
//	SMTP_TLS (starttls | tls | none)                         for smtp
//	SES_REGION (else AWS_REGION)                             for ses; the
//	                 credentials are the API server's own AWS credentials
//	                 (its IAM role), which need ses:SendEmail
//
// and lists who is told in CONNECTION_APPROVAL_EMAILS (comma-separated).
package mailer

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/remediation/notify"
)

// ErrNotConfigured: no provider, sender or recipients are set.
var ErrNotConfigured = errors.New("e-mail is not configured (set EMAIL_PROVIDER with SMTP_HOST or SES_REGION, EMAIL_FROM and CONNECTION_APPROVAL_EMAILS)")

// Providers.
const (
	ProviderSMTP = "smtp"
	ProviderSES  = "ses"
)

// sender is one way of delivering mail (notify.SMTP, notify.SES).
type sender interface {
	Send(ctx context.Context, from string, to []string, subject, html, text string) error
}

// Mailer sends to a fixed list of platform recipients.
type Mailer struct {
	provider string
	sender   sender
	from     string
	to       []string
	problem  string // why it cannot send, for the log and the Approvals page
}

// FromEnv reads the settings. It never fails: an incomplete configuration
// gives a mailer whose Send returns ErrNotConfigured, and Problem says what is
// missing, so the caller can record that and carry on (the approval still
// shows in the onboarding console).
func FromEnv() *Mailer {
	return fromLookup(os.Getenv, func(region string) (sender, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return notify.NewSES(ctx, region)
	})
}

func fromLookup(env func(string) string, newSES func(region string) (sender, error)) *Mailer {
	get := func(k string) string { return strings.TrimSpace(env(k)) }
	m := &Mailer{from: get("EMAIL_FROM"), to: Recipients(env("CONNECTION_APPROVAL_EMAILS"))}
	sesRegion := get("SES_REGION")
	if sesRegion == "" {
		sesRegion = get("AWS_REGION")
	}

	provider := strings.ToLower(get("EMAIL_PROVIDER"))
	if provider == "" {
		switch {
		case get("SMTP_HOST") != "":
			provider = ProviderSMTP
		case sesRegion != "":
			provider = ProviderSES
		}
	}
	m.provider = provider

	switch provider {
	case ProviderSMTP:
		host := get("SMTP_HOST")
		if host == "" {
			m.problem = "EMAIL_PROVIDER is smtp but SMTP_HOST is not set"
			break
		}
		port, err := strconv.Atoi(get("SMTP_PORT"))
		if err != nil || port <= 0 {
			port = 587
		}
		tls := strings.ToLower(get("SMTP_TLS"))
		if tls == "" {
			tls = "starttls"
		}
		m.sender = &notify.SMTP{Host: host, Port: port, Username: get("SMTP_USERNAME"), Password: env("SMTP_PASSWORD"), TLS: tls}
	case ProviderSES:
		if sesRegion == "" {
			m.problem = "EMAIL_PROVIDER is ses but neither SES_REGION nor AWS_REGION is set"
			break
		}
		s, err := newSES(sesRegion)
		if err != nil {
			m.problem = fmt.Sprintf("Amazon SES (%s) could not be set up: %v", sesRegion, err)
			break
		}
		m.sender = s
	case "":
		m.problem = "no e-mail provider: set SMTP_HOST (smtp) or SES_REGION (ses)"
	default:
		m.problem = fmt.Sprintf("EMAIL_PROVIDER %q is not smtp or ses", provider)
	}
	if m.problem == "" {
		switch {
		case m.from == "":
			m.problem = "EMAIL_FROM is not set"
		case len(m.to) == 0:
			m.problem = "CONNECTION_APPROVAL_EMAILS has no valid address"
		}
	}
	return m
}

// Recipients parses a comma- or semicolon-separated list, keeping valid
// addresses only.
func Recipients(raw string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' || r == ' ' }) {
		a, err := mail.ParseAddress(strings.TrimSpace(part))
		if err != nil {
			continue
		}
		key := strings.ToLower(a.Address)
		if !seen[key] {
			seen[key] = true
			out = append(out, a.Address)
		}
	}
	return out
}

// Configured reports whether Send can work.
func (m *Mailer) Configured() bool { return m != nil && m.sender != nil && m.problem == "" }

// Provider is "smtp", "ses" or "" (for logs).
func (m *Mailer) Provider() string {
	if m == nil {
		return ""
	}
	return m.provider
}

// Problem says why the mailer cannot send ("" when it can).
func (m *Mailer) Problem() string {
	if m == nil {
		return "no mailer"
	}
	return m.problem
}

// To is who is told (for logs and the UI).
func (m *Mailer) To() []string {
	if m == nil {
		return nil
	}
	return append([]string(nil), m.to...)
}

// Send delivers one message to the configured recipients.
func (m *Mailer) Send(ctx context.Context, subject, html, text string) error {
	if !m.Configured() {
		return ErrNotConfigured
	}
	if err := m.sender.Send(ctx, m.from, m.to, subject, html, text); err != nil {
		return fmt.Errorf("%s: %w", m.provider, err)
	}
	return nil
}
