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

func TestSettings(t *testing.T) {
	full := map[string]string{"EMAIL_FROM": "noreply@example.com", "CONNECTION_APPROVAL_EMAILS": "a@example.com", "SES_REGION": "ap-south-1"}
	without := func(k string, extra ...string) map[string]string {
		out := map[string]string{}
		for kk, v := range full {
			if kk != k {
				out[kk] = v
			}
		}
		for i := 0; i+1 < len(extra); i += 2 {
			out[extra[i]] = extra[i+1]
		}
		return out
	}
	cases := []struct {
		name       string
		env        map[string]string
		sesErr     error
		configured bool
		region     string
		problem    string
	}{
		{"complete", full, nil, true, "ap-south-1", ""},
		{"region from AWS_REGION", without("SES_REGION", "AWS_REGION", "us-east-1"), nil, true, "us-east-1", ""},
		{"e-mail off", without("EMAIL_FROM"), nil, false, "ap-south-1", "EMAIL_FROM"},
		{"no recipients", without("CONNECTION_APPROVAL_EMAILS", "CONNECTION_APPROVAL_EMAILS", "nope"), nil, false, "ap-south-1", "CONNECTION_APPROVAL_EMAILS"},
		{"no region", without("SES_REGION"), nil, false, "", "SES_REGION"},
		{"ses setup fails", full, errors.New("boom"), false, "ap-south-1", "boom"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m, _ := build(c.env, c.sesErr)
			if m.Configured() != c.configured || m.Region() != c.region {
				t.Fatalf("configured=%v region=%q problem=%q", m.Configured(), m.Region(), m.Problem())
			}
			if c.problem != "" && !strings.Contains(m.Problem(), c.problem) {
				t.Fatalf("problem %q does not mention %q", m.Problem(), c.problem)
			}
			if !c.configured {
				if err := m.Send(context.Background(), "s", "h", "t"); !errors.Is(err, ErrNotConfigured) {
					t.Fatalf("send: %v", err)
				}
			}
		})
	}
}

func TestSendsToEveryRecipient(t *testing.T) {
	m, ses := build(map[string]string{"SES_REGION": "ap-south-1", "EMAIL_FROM": "noreply@example.com",
		"CONNECTION_APPROVAL_EMAILS": "a@example.com;b@example.com"}, nil)
	if err := m.Send(context.Background(), "Approval needed", "<p>x</p>", "x"); err != nil {
		t.Fatal(err)
	}
	if ses.region != "ap-south-1" || len(ses.sent) != 1 || ses.sent[0] != "noreply@example.com|a@example.com,b@example.com|Approval needed" {
		t.Fatalf("region=%s sent=%v", ses.region, ses.sent)
	}
}
