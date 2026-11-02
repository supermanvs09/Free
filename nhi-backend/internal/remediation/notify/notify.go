// Package notify renders remediation e-mails and sends them through SMTP or
// Amazon SES. Mail is never sent inline: the engine writes remediation_notifications
// and a worker sends it with retries, so a mail outage never blocks a remediation.
package notify

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	htmltpl "html/template"
	"net"
	"net/smtp"
	"strings"
	texttpl "text/template"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"

	"nhi-backend-api/internal/remediation/domain"
)

// Config is remediation_integrations.config for type SMTP / SES.
type Config struct {
	From      string   `json:"from"`
	Approvers []string `json:"approvers"` // get APPROVAL_REQUESTED and GRACE_ENDING
	Notify    []string `json:"notify"`    // get results and the digest
	// SMTP
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	TLS      string `json:"tls"` // starttls (default) | tls | none
	// SES
	Region string `json:"region"`
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	var c Config
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, fmt.Errorf("email config: %w", err)
	}
	return c, nil
}

// Data feeds the templates.
type Data struct {
	Kind         string
	PlanID       string
	ActionTitle  string
	Target       string
	Account      string
	Risk         string
	Status       string
	Reason       string
	Requester    string
	Approvals    int
	ScheduledFor string
	Error        string
	URL          string
	ScoreGain    string
	Diff         []string
	Lines        []string // digest lines
}

var subjects = map[string]string{
	"APPROVAL_REQUESTED": "[ISPM] Approval needed: {{.ActionTitle}} on {{.Target}}",
	"EXECUTED":           "[ISPM] Remediation applied: {{.ActionTitle}} on {{.Target}}",
	"FAILED":             "[ISPM] Remediation FAILED: {{.ActionTitle}} on {{.Target}}",
	"ROLLED_BACK":        "[ISPM] Remediation rolled back: {{.ActionTitle}} on {{.Target}}",
	"GRACE_ENDING":       "[ISPM] Starts soon: {{.ActionTitle}} on {{.Target}}",
	"DIGEST":             "[ISPM] New critical findings",
}

const bodyText = `{{if eq .Kind "DIGEST"}}New critical findings in the last 24 hours:
{{range .Lines}}- {{.}}
{{end}}{{else}}{{.ActionTitle}}
Target:   {{.Target}}
Account:  {{.Account}}
Risk:     {{.Risk}}
Status:   {{.Status}}{{if .Reason}} ({{.Reason}}){{end}}
Requested by: {{.Requester}}
{{if .ScoreGain}}Score gain: +{{.ScoreGain}} points
{{end}}{{if .ScheduledFor}}Scheduled for: {{.ScheduledFor}}
{{end}}{{if .Error}}Error: {{.Error}}
{{end}}{{if .Diff}}
Changes:
{{range .Diff}}  {{.}}
{{end}}{{end}}{{end}}
Open in the dashboard: {{.URL}}
`

const bodyHTML = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
{{if eq .Kind "DIGEST"}}<h3>New critical findings in the last 24 hours</h3><ul>{{range .Lines}}<li>{{.}}</li>{{end}}</ul>
{{else}}<h3>{{.ActionTitle}}</h3>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td><b>Target</b></td><td>{{.Target}}</td></tr>
<tr><td><b>Account</b></td><td>{{.Account}}</td></tr>
<tr><td><b>Risk</b></td><td>{{.Risk}}</td></tr>
<tr><td><b>Status</b></td><td>{{.Status}}{{if .Reason}} ({{.Reason}}){{end}}</td></tr>
<tr><td><b>Requested by</b></td><td>{{.Requester}}</td></tr>
{{if .ScoreGain}}<tr><td><b>Score gain</b></td><td>+{{.ScoreGain}} points</td></tr>{{end}}
{{if .ScheduledFor}}<tr><td><b>Scheduled for</b></td><td>{{.ScheduledFor}}</td></tr>{{end}}
{{if .Error}}<tr><td><b>Error</b></td><td style="color:#b00020">{{.Error}}</td></tr>{{end}}
</table>
{{if .Diff}}<p><b>Changes</b></p><pre style="background:#f5f5f5;padding:8px">{{range .Diff}}{{.}}
{{end}}</pre>{{end}}{{end}}
<p><a href="{{.URL}}">Open in the dashboard</a></p></div>`

var (
	tText = texttpl.Must(texttpl.New("text").Parse(bodyText))
	tHTML = htmltpl.Must(htmltpl.New("html").Parse(bodyHTML))
)

// Render builds subject, HTML and text bodies.
func Render(d Data) (subject, html, text string, err error) {
	st, ok := subjects[d.Kind]
	if !ok {
		return "", "", "", fmt.Errorf("unknown notification type %q", d.Kind)
	}
	var s, h, t bytes.Buffer
	if err = texttpl.Must(texttpl.New("s").Parse(st)).Execute(&s, d); err != nil {
		return
	}
	if err = tHTML.Execute(&h, d); err != nil {
		return
	}
	if err = tText.Execute(&t, d); err != nil {
		return
	}
	return strings.TrimSpace(s.String()), h.String(), t.String(), nil
}

// Sender sends one message.
type Sender interface {
	Send(ctx context.Context, from string, to []string, subject, html, text string) error
}

// ---- SMTP ----

type SMTP struct {
	Host, Username, Password, TLS string
	Port                          int
}

func (s *SMTP) Send(ctx context.Context, from string, to []string, subject, html, text string) error {
	addr := net.JoinHostPort(s.Host, fmt.Sprint(s.Port))
	d := net.Dialer{Timeout: 15 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	if s.TLS == "tls" {
		conn = tls.Client(conn, &tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12})
	}
	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		conn.Close()
		return err
	}
	defer c.Close()
	if s.TLS == "" || s.TLS == "starttls" {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12}); err != nil {
				return err
			}
		}
	}
	if s.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.Username, s.Password, s.Host)); err != nil {
			return err
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	for _, r := range to {
		if err := c.Rcpt(r); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(buildMIME(from, to, subject, html, text)); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

func buildMIME(from string, to []string, subject, html, text string) []byte {
	const boundary = "ispm-boundary-7f3a"
	var b bytes.Buffer
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n", from, strings.Join(to, ", "), mimeHeader(subject))
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary)
	fmt.Fprintf(&b, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", boundary, text)
	fmt.Fprintf(&b, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n--%s--\r\n", boundary, html, boundary)
	return b.Bytes()
}

func mimeHeader(s string) string {
	s = strings.NewReplacer("\r", "", "\n", "").Replace(s) // no header injection
	return s
}

// ---- SES ----

type SES struct{ client *sesv2.Client }

func NewSES(ctx context.Context, region string) (*SES, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, err
	}
	return &SES{client: sesv2.NewFromConfig(cfg)}, nil
}

func (s *SES) Send(ctx context.Context, from string, to []string, subject, html, text string) error {
	_, err := s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(from),
		Destination:      &sestypes.Destination{ToAddresses: to},
		Content: &sestypes.EmailContent{Simple: &sestypes.Message{
			Subject: &sestypes.Content{Data: aws.String(mimeHeader(subject)), Charset: aws.String("UTF-8")},
			Body: &sestypes.Body{
				Html: &sestypes.Content{Data: aws.String(html), Charset: aws.String("UTF-8")},
				Text: &sestypes.Content{Data: aws.String(text), Charset: aws.String("UTF-8")},
			},
		}},
	})
	return err
}

// Describe summarises a plan for the e-mail diff section.
func DiffLines(diff []domain.DiffEntry, max int) []string {
	var out []string
	for i, d := range diff {
		if i == max {
			out = append(out, fmt.Sprintf("... and %d more", len(diff)-max))
			break
		}
		out = append(out, fmt.Sprintf("%s %s", d.Change, d.Path))
	}
	return out
}
