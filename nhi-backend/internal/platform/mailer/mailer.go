// Package mailer sends the platform's own e-mail (not a tenant's): today, the
// notices to the platform admins that somebody clicked "Verify connection" for
// an AWS account (sent before the checks run) and that a connection waits for
// their approval. Mail goes through Amazon SES only, with the same settings as the
// remediation notifications:
//
//	EMAIL_FROM                  the sender: an address or domain verified in SES.
//	                            Empty turns e-mail off.
//	SES_REGION                  the SES region (default AWS_REGION)
//	CONNECTION_APPROVAL_EMAILS  who is told (comma-separated)
//
// No keys are configured: the API server's own AWS credentials (its IAM role)
// are used and need ses:SendEmail.
package mailer

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"strings"
	"time"

	"nhi-backend-api/internal/remediation/notify"
)

// ErrNotConfigured: e-mail is off or incomplete.
var ErrNotConfigured = errors.New("e-mail is not configured (set EMAIL_FROM, SES_REGION and CONNECTION_APPROVAL_EMAILS)")

// sender delivers one message (notify.SES).
type sender interface {
	Send(ctx context.Context, from string, to []string, subject, html, text string) error
}

// Mailer sends to a fixed list of platform recipients through SES.
type Mailer struct {
	region  string
	sender  sender
	from    string
	to      []string
	problem string // why it cannot send, for the log and the Approvals page
}

// FromEnv reads the settings. It never fails: an incomplete configuration
// gives a mailer whose Send returns ErrNotConfigured, and Problem says what is
// missing, so the caller can record that and carry on (the approval is still
// in the database, where the onboarding tool's Approvals page reads it).
func FromEnv() *Mailer {
	return fromLookup(os.Getenv, func(region string) (sender, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return notify.NewSES(ctx, region)
	})
}

func fromLookup(env func(string) string, newSES func(region string) (sender, error)) *Mailer {
	get := func(k string) string { return strings.TrimSpace(env(k)) }
	m := &Mailer{from: get("EMAIL_FROM"), to: Recipients(env("CONNECTION_APPROVAL_EMAILS")), region: get("SES_REGION")}
	if m.region == "" {
		m.region = get("AWS_REGION")
	}
	switch {
	case m.from == "":
		m.problem = "e-mail is off: EMAIL_FROM is not set"
	case len(m.to) == 0:
		m.problem = "CONNECTION_APPROVAL_EMAILS has no valid address"
	case m.region == "":
		m.problem = "neither SES_REGION nor AWS_REGION is set"
	default:
		s, err := newSES(m.region)
		if err != nil {
			m.problem = fmt.Sprintf("Amazon SES (%s) could not be set up: %v", m.region, err)
			break
		}
		m.sender = s
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

// Provider names the mail service, for logs.
func (m *Mailer) Provider() string { return "ses" }

// Region is the SES region in use.
func (m *Mailer) Region() string {
	if m == nil {
		return ""
	}
	return m.region
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
		return fmt.Errorf("ses (%s): %w", m.region, err)
	}
	return nil
}
