// Package jira creates, updates and closes Jira tickets for findings (one way:
// findings -> Jira, nothing is read back except the status of our own tickets).
package jira

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Config is remediation_integrations.config for type JIRA.
type Config struct {
	BaseURL              string            `json:"base_url"`
	ProjectKey           string            `json:"project_key"`
	IssueType            string            `json:"issue_type"`
	Email                string            `json:"email"`
	PriorityMap          map[string]string `json:"priority_map"`
	SLADays              map[string]int    `json:"sla_days"`
	MinSeverity          string            `json:"min_severity"`
	DoneTransition       string            `json:"done_transition"`
	ReopenTransition     string            `json:"reopen_transition"`
	WontDoTransition     string            `json:"wontdo_transition"`
	ReopenIfClosedManual bool              `json:"reopen_if_closed_manually"`
	Labels               []string          `json:"labels"`
}

func ParseConfig(raw json.RawMessage) (Config, error) {
	c := Config{IssueType: "Task", MinSeverity: "High", DoneTransition: "Done", ReopenTransition: "To Do", WontDoTransition: "Won't Do",
		PriorityMap: map[string]string{"Critical": "Highest", "High": "High", "Medium": "Medium", "Low": "Low"},
		SLADays:     map[string]int{"Critical": 7, "High": 14, "Medium": 30, "Low": 90}}
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, fmt.Errorf("jira config: %w", err)
	}
	c.BaseURL = strings.TrimRight(c.BaseURL, "/")
	if c.BaseURL == "" || c.ProjectKey == "" || c.Email == "" {
		return c, fmt.Errorf("jira config needs base_url, project_key and email")
	}
	return c, nil
}

type Client struct {
	cfg   Config
	token string
	http  *http.Client
	sleep func(time.Duration)
}

func NewClient(cfg Config, apiToken string) *Client {
	return &Client{cfg: cfg, token: apiToken, http: &http.Client{Timeout: 30 * time.Second}, sleep: time.Sleep}
}

type Issue struct{ ID, Key, URL string }

// do sends a request, retrying 429 / 5xx with back-off (Retry-After wins).
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, c.cfg.BaseURL+path, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.SetBasicAuth(c.cfg.Email, c.token)
		req.Header.Set("Accept", "application/json")
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := c.http.Do(req)
		if err != nil {
			last = err
			c.sleep(time.Duration(1<<attempt) * time.Second)
			continue
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		switch {
		case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
			last = fmt.Errorf("jira %s %s: %d", method, path, resp.StatusCode)
			wait := time.Duration(1<<attempt) * time.Second
			if ra, _ := strconv.Atoi(resp.Header.Get("Retry-After")); ra > 0 {
				wait = time.Duration(ra) * time.Second
			}
			c.sleep(wait)
			continue
		case resp.StatusCode >= 300:
			return fmt.Errorf("jira %s %s: %d %s", method, path, resp.StatusCode, snippet(raw))
		}
		if out != nil && len(raw) > 0 {
			return json.Unmarshal(raw, out)
		}
		return nil
	}
	return last
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

// ADF builds an Atlassian Document Format body from paragraphs.
func ADF(paragraphs ...string) map[string]any {
	var content []map[string]any
	for _, p := range paragraphs {
		if p == "" {
			continue
		}
		content = append(content, map[string]any{"type": "paragraph", "content": []map[string]any{{"type": "text", "text": p}}})
	}
	return map[string]any{"type": "doc", "version": 1, "content": content}
}

type NewIssue struct {
	Summary     string
	Description []string
	Severity    string
	Labels      []string
	DueDate     time.Time
}

func (c *Client) CreateIssue(ctx context.Context, n NewIssue) (*Issue, error) {
	fields := map[string]any{
		"project":     map[string]any{"key": c.cfg.ProjectKey},
		"issuetype":   map[string]any{"name": c.cfg.IssueType},
		"summary":     truncate(n.Summary, 250),
		"description": ADF(n.Description...),
		"labels":      append(append([]string{"ispm"}, c.cfg.Labels...), n.Labels...),
	}
	if p := c.cfg.PriorityMap[n.Severity]; p != "" {
		fields["priority"] = map[string]any{"name": p}
	}
	if !n.DueDate.IsZero() {
		fields["duedate"] = n.DueDate.Format("2006-01-02")
	}
	var out struct{ ID, Key string }
	if err := c.do(ctx, http.MethodPost, "/rest/api/3/issue", map[string]any{"fields": fields}, &out); err != nil {
		return nil, err
	}
	return &Issue{ID: out.ID, Key: out.Key, URL: c.cfg.BaseURL + "/browse/" + out.Key}, nil
}

func (c *Client) AddComment(ctx context.Context, key, text string) error {
	return c.do(ctx, http.MethodPost, "/rest/api/3/issue/"+url.PathEscape(key)+"/comment", map[string]any{"body": ADF(text)}, nil)
}

// ErrNoTransition means the workflow has no transition with that name.
var ErrNoTransition = fmt.Errorf("no such transition")

// Transition moves the issue with the named workflow transition.
func (c *Client) Transition(ctx context.Context, key, name string) error {
	var list struct {
		Transitions []struct{ ID, Name string } `json:"transitions"`
	}
	if err := c.do(ctx, http.MethodGet, "/rest/api/3/issue/"+url.PathEscape(key)+"/transitions", nil, &list); err != nil {
		return err
	}
	for _, t := range list.Transitions {
		if strings.EqualFold(t.Name, name) {
			return c.do(ctx, http.MethodPost, "/rest/api/3/issue/"+url.PathEscape(key)+"/transitions",
				map[string]any{"transition": map[string]any{"id": t.ID}}, nil)
		}
	}
	return fmt.Errorf("%w %q on %s", ErrNoTransition, name, key)
}

// StatusCategory returns "new", "indeterminate" or "done".
func (c *Client) StatusCategory(ctx context.Context, key string) (string, error) {
	var out struct {
		Fields struct {
			Status struct {
				StatusCategory struct{ Key string } `json:"statusCategory"`
			} `json:"status"`
		} `json:"fields"`
	}
	if err := c.do(ctx, http.MethodGet, "/rest/api/3/issue/"+url.PathEscape(key)+"?fields=status", nil, &out); err != nil {
		return "", err
	}
	return out.Fields.Status.StatusCategory.Key, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
