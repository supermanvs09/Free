package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// RemediationConfig holds the settings of the remediation engine (plans,
// approvals, the execution queue and its background worker). Database,
// server, JWT, logging and the ispm-worker address are the backend's own
// settings and are not repeated here.
//
// It is read only from the environment (and .env), like MonitoringClickHouse:
//
//	REMEDIATION_ENABLED          default true; false = no remediation routes, no worker, other keys ignored
//	REMEDIATOR_AUTO_MIGRATE      default true; create remediation_* tables in a tenant schema on first use
//	REMEDIATOR_DRY_RUN_ONLY      default false; true = executions are simulated, nothing is written to AWS
//	EXECUTION_POLL_INTERVAL      3s     EXECUTION_CONCURRENCY 4   EXECUTION_LEASE 10m
//	PLAN_APPROVAL_TTL            72h    RECONCILE_INTERVAL 2m
//	KEY_MIN_IDLE_DAYS            7      USAGE_WINDOW_DAYS 90      KEY_CUTOVER_WAIT 72h
//	JIRA_SYNC_INTERVAL           15m    NOTIFY_INTERVAL 15s       NOTIFY_MAX_RETRIES 6
//	DIGEST_ENABLED               false  DIGEST_HOUR_UTC 6
//	AWS_REGION                   ap-south-1  AWS_SESSION_DURATION 15m  AWS_PLATFORM_ROLE_ARN (optional)
//	DASHBOARD_BASE_URL           http://localhost:3000 (links in e-mails and Jira tickets)
//	ACCOUNTS_TABLE               accounts (tenant table of the AWS accounts; holds the remediation_* settings)
//	REMEDIATION_TENANTS          empty = every tenant; or a comma-separated list of tenant schema names (db_name) or ids
//	JIRA_* / EMAIL_* / SES_REGION   platform defaults of the Jira and e-mail (Amazon SES) integrations
type RemediationConfig struct {
	Enabled     bool
	AutoMigrate bool
	// AccountsTable: tenant table holding the AWS accounts (ACCOUNTS_TABLE, default accounts),
	// shared with the engine; matched on account_id.
	AccountsTable string
	// Tenants limits remediation to these tenants (REMEDIATION_TENANTS: schema names or tenant ids).
	// Empty = every tenant of nhi_global.tenants.
	Tenants   []string
	Worker    RemediationWorkerConfig
	AWS       RemediationAWSConfig
	Dashboard RemediationDashboardConfig
	Safety    RemediationSafetyConfig
	// Integrations: platform defaults for Jira and e-mail, used by every tenant that has
	// not saved its own settings (PUT /remediation/integrations/{type} overrides them).
	Integrations RemediationIntegrationsConfig
}

type RemediationWorkerConfig struct {
	ExecutionPoll    time.Duration // how often the queue is polled
	Concurrency      int           // executions run at the same time
	LeaseDuration    time.Duration // worker lease on a running execution
	PlanTTL          time.Duration // approval expires after this time
	ReconcileEvery   time.Duration // finding-resolved check, cutover, expiry, grace reminders
	JiraSyncEvery    time.Duration
	NotifyEvery      time.Duration
	CutoverWait      time.Duration // rotate_access_key: how long to wait for the new key to be used
	MinKeyIdleDays   int           // deactivate_key: block when used within N days
	UsageWindowDays  int           // Access Advisor baseline window
	DigestEnabled    bool
	DigestHourUTC    int
	MaxNotifyRetries int
}

type RemediationAWSConfig struct {
	Region          string // region of the STS client
	SessionDuration time.Duration
	PlatformRoleARN string // optional: role the platform assumes first
}

type RemediationDashboardConfig struct{ BaseURL string }

type RemediationSafetyConfig struct {
	DryRunOnly bool // never write to AWS (Execute is simulated); useful in staging
}

// RemediationIntegrationsConfig holds the Jira / e-mail defaults read from the
// environment. Secrets (JIRA_API_TOKEN) are never copied into
// the database: the tenant row stores the reference env:JIRA_API_TOKEN. E-mail
// needs no secret: SES uses the server's own AWS credentials.
type RemediationIntegrationsConfig struct {
	Jira  RemediationJiraEnv
	Email RemediationEmailEnv
}

type RemediationJiraEnv struct {
	Enabled          bool
	BaseURL          string // JIRA_BASE_URL, e.g. https://acme.atlassian.net
	Email            string // JIRA_EMAIL (Jira Cloud user of the API token)
	TokenRef         string // where the token is: JIRA_API_TOKEN_REF (default env:JIRA_API_TOKEN)
	ProjectKey       string // JIRA_PROJECT_KEY
	IssueType        string // JIRA_ISSUE_TYPE (default Task)
	MinSeverity      string // JIRA_MIN_SEVERITY (default High)
	DoneTransition   string // JIRA_DONE_TRANSITION (default Done)
	ReopenTransition string // JIRA_REOPEN_TRANSITION (default To Do)
	WontDoTransition string // JIRA_WONTDO_TRANSITION (default Won't Do)
	Labels           []string
}

// RemediationEmailEnv: e-mail goes through Amazon SES only, and is on when
// EMAIL_FROM is set.
type RemediationEmailEnv struct {
	From      string // EMAIL_FROM (an address or domain verified in SES)
	Approvers []string
	Notify    []string
	SESRegion string // SES_REGION (default AWS_REGION)
}

// Remediation reads the remediation settings from the environment. With
// REMEDIATION_ENABLED=false nothing else is read or checked, so a wrong
// remediation key can never stop the rest of the backend from starting.
func Remediation() (RemediationConfig, error) {
	e := &remEnv{}
	if !e.bool("REMEDIATION_ENABLED", true) {
		return RemediationConfig{}, nil
	}
	c := RemediationConfig{
		Enabled:       true,
		AutoMigrate:   e.bool("REMEDIATOR_AUTO_MIGRATE", true),
		AccountsTable: e.str("ACCOUNTS_TABLE", "accounts"),
		Tenants:       e.list("REMEDIATION_TENANTS", nil),
		Worker: RemediationWorkerConfig{
			ExecutionPoll:    e.dur("EXECUTION_POLL_INTERVAL", 3*time.Second),
			Concurrency:      e.int("EXECUTION_CONCURRENCY", 4),
			LeaseDuration:    e.dur("EXECUTION_LEASE", 10*time.Minute),
			PlanTTL:          e.dur("PLAN_APPROVAL_TTL", 72*time.Hour),
			ReconcileEvery:   e.dur("RECONCILE_INTERVAL", 2*time.Minute),
			JiraSyncEvery:    e.dur("JIRA_SYNC_INTERVAL", 15*time.Minute),
			NotifyEvery:      e.dur("NOTIFY_INTERVAL", 15*time.Second),
			CutoverWait:      e.dur("KEY_CUTOVER_WAIT", 72*time.Hour),
			MinKeyIdleDays:   e.int("KEY_MIN_IDLE_DAYS", 7),
			UsageWindowDays:  e.int("USAGE_WINDOW_DAYS", 90),
			DigestEnabled:    e.bool("DIGEST_ENABLED", false),
			DigestHourUTC:    e.int("DIGEST_HOUR_UTC", 6),
			MaxNotifyRetries: e.int("NOTIFY_MAX_RETRIES", 6),
		},
		AWS: RemediationAWSConfig{
			Region:          e.str("AWS_REGION", "ap-south-1"),
			SessionDuration: e.dur("AWS_SESSION_DURATION", 15*time.Minute),
			PlatformRoleARN: e.str("AWS_PLATFORM_ROLE_ARN", ""),
		},
		Dashboard: RemediationDashboardConfig{BaseURL: e.str("DASHBOARD_BASE_URL", "http://localhost:3000")},
		Safety:    RemediationSafetyConfig{DryRunOnly: e.bool("REMEDIATOR_DRY_RUN_ONLY", false)},
		Integrations: RemediationIntegrationsConfig{
			Jira: RemediationJiraEnv{
				Enabled: e.bool("JIRA_ENABLED", false), BaseURL: e.str("JIRA_BASE_URL", ""), Email: e.str("JIRA_EMAIL", ""),
				TokenRef: e.str("JIRA_API_TOKEN_REF", "env:JIRA_API_TOKEN"), ProjectKey: e.str("JIRA_PROJECT_KEY", ""),
				IssueType: e.str("JIRA_ISSUE_TYPE", "Task"), MinSeverity: e.str("JIRA_MIN_SEVERITY", "High"),
				DoneTransition: e.str("JIRA_DONE_TRANSITION", "Done"), ReopenTransition: e.str("JIRA_REOPEN_TRANSITION", "To Do"),
				WontDoTransition: e.str("JIRA_WONTDO_TRANSITION", "Won't Do"), Labels: e.list("JIRA_LABELS", []string{"ispm"}),
			},
			Email: RemediationEmailEnv{
				From:      e.str("EMAIL_FROM", ""),
				Approvers: e.list("EMAIL_APPROVERS", nil), Notify: e.list("EMAIL_NOTIFY", nil),
				SESRegion: e.str("SES_REGION", e.str("AWS_REGION", "ap-south-1")),
			},
		},
	}
	if len(e.errs) > 0 {
		return c, fmt.Errorf("config: %s", strings.Join(e.errs, "; "))
	}
	return c, c.validate()
}

func (c RemediationConfig) validate() error {
	var errs []string
	if c.Worker.Concurrency < 1 {
		errs = append(errs, "EXECUTION_CONCURRENCY must be >= 1")
	}
	if c.Worker.DigestHourUTC < 0 || c.Worker.DigestHourUTC > 23 {
		errs = append(errs, "DIGEST_HOUR_UTC must be between 0 and 23")
	}
	if j := c.Integrations.Jira; j.Enabled && (j.BaseURL == "" || j.ProjectKey == "" || j.Email == "") {
		errs = append(errs, "JIRA_ENABLED=true needs JIRA_BASE_URL, JIRA_EMAIL and JIRA_PROJECT_KEY")
	}
	if len(errs) > 0 {
		return fmt.Errorf("config: %s", strings.Join(errs, "; "))
	}
	return nil
}

// remEnv reads typed values from the environment and collects parse errors.
type remEnv struct{ errs []string }

func (e *remEnv) lookup(k string) (string, bool) {
	v, ok := os.LookupEnv(k)
	v = strings.TrimSpace(v)
	return v, ok && v != ""
}

func (e *remEnv) str(k, def string) string {
	if v, ok := e.lookup(k); ok {
		return v
	}
	return def
}

func (e *remEnv) int(k string, def int) int {
	v, ok := e.lookup(k)
	if !ok {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		e.errs = append(e.errs, k+" must be an integer")
		return def
	}
	return n
}

func (e *remEnv) bool(k string, def bool) bool {
	v, ok := e.lookup(k)
	if !ok {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		e.errs = append(e.errs, k+" must be true or false")
		return def
	}
	return b
}

func (e *remEnv) dur(k string, def time.Duration) time.Duration {
	v, ok := e.lookup(k)
	if !ok {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		e.errs = append(e.errs, k+" must be a duration like 30s, 5m, 72h")
		return def
	}
	return d
}

func (e *remEnv) list(k string, def []string) []string {
	v, ok := e.lookup(k)
	if !ok {
		return def
	}
	var out []string
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
