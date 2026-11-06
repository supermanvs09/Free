// Package notify renders remediation e-mails and sends them through Amazon SES
// (the only mail service). Mail is never sent inline: the engine writes remediation_notifications
// and a worker sends it with retries, so a mail outage never blocks a remediation.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	htmltpl "html/template"
	"strings"
	texttpl "text/template"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"

	"nhi-backend-api/internal/remediation/domain"
)

// Config is remediation_integrations.config for type SES.
type Config struct {
	From      string   `json:"from"`
	Approvers []string `json:"approvers"` // get APPROVAL_REQUESTED and GRACE_ENDING
	Notify    []string `json:"notify"`    // get results and the digest
	Region    string   `json:"region"`    // SES region (default AWS_REGION)
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
