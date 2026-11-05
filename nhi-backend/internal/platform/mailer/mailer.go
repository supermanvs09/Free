// Package mailer sends the platform's own e-mail (not a tenant's): today, the
// notice to the platform admins that a new AWS connection waits for their
// approval. It reuses the remediation module's SMTP sender and the same
// settings, so a deployment configures mail once:
//
//	SMTP_HOST, SMTP_PORT (587), SMTP_USERNAME, SMTP_PASSWORD, SMTP_TLS
//	(starttls | tls | none), EMAIL_FROM
//
// and lists who is told in CONNECTION_APPROVAL_EMAILS (comma-separated).
package mailer

import (
	"context"
	"errors"
	"net/mail"
	"os"
	"strconv"
	"strings"

	"nhi-backend-api/internal/remediation/notify"
)

// ErrNotConfigured: no SMTP host, sender or recipients are set.
var ErrNotConfigured = errors.New("e-mail is not configured (set SMTP_HOST, EMAIL_FROM and CONNECTION_APPROVAL_EMAILS)")

// Mailer sends to a fixed list of platform recipients.
type Mailer struct {
	smtp *notify.SMTP
	from string
	to   []string
}

// FromEnv reads the settings. It never fails: an incomplete configuration
// gives a mailer whose Send returns ErrNotConfigured, so the caller can record
// that and carry on (the approval still shows in the onboarding console).
func FromEnv() *Mailer {
	port, err := strconv.Atoi(strings.TrimSpace(os.Getenv("SMTP_PORT")))
	if err != nil || port <= 0 {
		port = 587
	}
	tls := strings.ToLower(strings.TrimSpace(os.Getenv("SMTP_TLS")))
	if tls == "" {
		tls = "starttls"
	}
	m := &Mailer{from: strings.TrimSpace(os.Getenv("EMAIL_FROM"))}
	if host := strings.TrimSpace(os.Getenv("SMTP_HOST")); host != "" {
		m.smtp = &notify.SMTP{Host: host, Port: port, Username: strings.TrimSpace(os.Getenv("SMTP_USERNAME")), Password: os.Getenv("SMTP_PASSWORD"), TLS: tls}
	}
	m.to = Recipients(os.Getenv("CONNECTION_APPROVAL_EMAILS"))
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
func (m *Mailer) Configured() bool { return m != nil && m.smtp != nil && m.from != "" && len(m.to) > 0 }

// Recipients is who is told (for logs and the UI).
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
	return m.smtp.Send(ctx, m.from, m.to, subject, html, text)
}
