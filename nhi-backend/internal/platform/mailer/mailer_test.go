package mailer

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type fakeSES struct {
	region string
	sent   []string
}

func (f *fakeSES) Send(_ context.Context, from string, to []string, subject, _, _ string) error {
	f.sent = append(f.sent, from+"|"+strings.Join(to, ",")+"|"+subject)
	return nil
}

func build(env map[string]string, sesErr error) (*Mailer, *fakeSES) {
	var made *fakeSES
	m := fromLookup(func(k string) string { return env[k] }, func(region string) (sender, error) {
		if sesErr != nil {
			return nil, sesErr
		}
		made = &fakeSES{region: region}
		return made, nil
	})
	return m, made
}

func TestProviderChoice(t *testing.T) {
	base := map[string]string{"EMAIL_FROM": "noreply@example.com", "CONNECTION_APPROVAL_EMAILS": "a@example.com, b@example.com"}
	with := func(extra map[string]string) map[string]string {
		out := map[string]string{}
		for k, v := range base {
			out[k] = v
		}
		for k, v := range extra {
			out[k] = v
		}
		return out
	}
	cases := []struct {
		name         string
		env          map[string]string
		sesErr       error
		provider     string
		configured   bool
		problemMatch string
	}{
		{"smtp by host", with(map[string]string{"SMTP_HOST": "smtp.example.com"}), nil, "smtp", true, ""},
		{"ses by region", with(map[string]string{"SES_REGION": "ap-south-1"}), nil, "ses", true, ""},
		{"ses by AWS_REGION", with(map[string]string{"AWS_REGION": "us-east-1"}), nil, "ses", true, ""},
		{"explicit ses wins over smtp host", with(map[string]string{"EMAIL_PROVIDER": "SES", "SMTP_HOST": "smtp.example.com", "SES_REGION": "eu-west-1"}), nil, "ses", true, ""},
		{"explicit smtp without host", with(map[string]string{"EMAIL_PROVIDER": "smtp"}), nil, "smtp", false, "SMTP_HOST"},
		{"explicit ses without region", with(map[string]string{"EMAIL_PROVIDER": "ses"}), nil, "ses", false, "SES_REGION"},
		{"ses setup fails", with(map[string]string{"EMAIL_PROVIDER": "ses", "SES_REGION": "ap-south-1"}), errors.New("boom"), "ses", false, "boom"},
		{"unknown provider", with(map[string]string{"EMAIL_PROVIDER": "sendgrid"}), nil, "sendgrid", false, "not smtp or ses"},
		{"nothing set", with(nil), nil, "", false, "no e-mail provider"},
		{"no sender", map[string]string{"SMTP_HOST": "h", "CONNECTION_APPROVAL_EMAILS": "a@example.com"}, nil, "smtp", false, "EMAIL_FROM"},
		{"no recipients", map[string]string{"SMTP_HOST": "h", "EMAIL_FROM": "x@example.com", "CONNECTION_APPROVAL_EMAILS": "not-an-address"}, nil, "smtp", false, "CONNECTION_APPROVAL_EMAILS"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m, _ := build(c.env, c.sesErr)
			if m.Provider() != c.provider || m.Configured() != c.configured {
				t.Fatalf("provider=%q configured=%v problem=%q", m.Provider(), m.Configured(), m.Problem())
			}
			if c.problemMatch != "" && !strings.Contains(m.Problem(), c.problemMatch) {
				t.Fatalf("problem %q does not mention %q", m.Problem(), c.problemMatch)
			}
			if !c.configured {
				if err := m.Send(context.Background(), "s", "h", "t"); !errors.Is(err, ErrNotConfigured) {
					t.Fatalf("send: %v", err)
				}
			}
		})
	}
}

func TestSESSendsToEveryRecipient(t *testing.T) {
	m, ses := build(map[string]string{"SES_REGION": "ap-south-1", "EMAIL_FROM": "noreply@example.com",
		"CONNECTION_APPROVAL_EMAILS": "a@example.com;b@example.com"}, nil)
	if err := m.Send(context.Background(), "Approval needed", "<p>x</p>", "x"); err != nil {
		t.Fatal(err)
	}
	if ses.region != "ap-south-1" || len(ses.sent) != 1 || ses.sent[0] != "noreply@example.com|a@example.com,b@example.com|Approval needed" {
		t.Fatalf("region=%s sent=%v", ses.region, ses.sent)
	}
}
