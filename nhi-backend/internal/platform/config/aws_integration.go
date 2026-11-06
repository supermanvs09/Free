package config

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var (
	awsIAMNameRE  = regexp.MustCompile(`^[\w+=,.@-]{1,64}$`)
	awsRuleNameRE = regexp.MustCompile(`^[.\-_A-Za-z0-9]{1,64}$`)
)

// AWSIntegrationConfig is how this process reaches AWS to verify a customer's
// connection. The per-tenant values (our account, External ID, event bus)
// live in nhi_global.tenants; these are the names every tenant shares.
//
// No AWS credentials belong here: the SDK's default chain supplies them (ECS
// task role / EC2 instance profile in production, AWS_PROFILE locally).
type AWSIntegrationConfig struct {
	// AssumeAssumerRole: true when this process runs as some other identity (a
	// developer's AWS profile, say) and must first assume the tenant's
	// assumer role. false when it already runs as that role.
	AssumeAssumerRole bool `yaml:"assume_assumer_role"`
	// AssumerRoleName is the role in our collector account that every
	// customer trust policy names. Default NHIPlatformAssumer.
	AssumerRoleName string `yaml:"assumer_role_name"`
	// CollectorRoleName / ForwardRuleName are what customers are told to call
	// the role and the EventBridge rule they create.
	CollectorRoleName string `yaml:"collector_role_name"`
	ForwardRuleName   string `yaml:"forward_rule_name"`
	// GitHubSecretPrefix is the name prefix of the Secrets Manager secret a
	// customer stores their GitHub token in; the read policy we show them is
	// scoped to it. Default nhi/github.
	GitHubSecretPrefix string `yaml:"github_secret_prefix"`
	// GitHubAPIURL is where GitHub tokens are checked: https://api.github.com,
	// or https://<host>/api/v3 for GitHub Enterprise Server.
	GitHubAPIURL string `yaml:"github_api_url"`
	// EventQueueURL is an SQS queue in our account that a rule on the central
	// bus delivers to. The "events received" check peeks at it (nothing is
	// deleted) and at nothing else.
	EventQueueURL string `yaml:"event_queue_url"`
	// ForwardRoleName is the role customers create for EventBridge to put
	// events on our bus. Default NHIEventBridgeForwardRole.
	ForwardRoleName string `yaml:"forward_role_name"`
	// TrailName is the CloudTrail trail customers create when none qualifies.
	TrailName string `yaml:"trail_name"`
	// EventPollSeconds is how often the "Receive your events" check reads the
	// queue (5-10; default 7). EventWaitMinutes is how long it watches
	// before concluding (default 15).
	EventPollSeconds int `yaml:"event_poll_seconds"`
	EventWaitMinutes int `yaml:"event_wait_minutes"`
}

var awsSecretPrefixRE = regexp.MustCompile(`^[A-Za-z0-9/_+=.@-]{1,256}$`)

// load applies NHI_AWS_* overrides, defaults and validation.
func (a *AWSIntegrationConfig) load() error {
	set := func(dst *string, key string) {
		if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
			*dst = strings.TrimSpace(v)
		}
	}
	set(&a.AssumerRoleName, "NHI_AWS_ASSUMER_ROLE_NAME")
	set(&a.CollectorRoleName, "NHI_AWS_COLLECTOR_ROLE_NAME")
	set(&a.ForwardRuleName, "NHI_AWS_FORWARD_RULE_NAME")
	set(&a.GitHubSecretPrefix, "NHI_AWS_GITHUB_SECRET_PREFIX")
	set(&a.GitHubAPIURL, "NHI_GITHUB_API_URL")
	set(&a.EventQueueURL, "NHI_AWS_EVENT_QUEUE_URL")
	set(&a.ForwardRoleName, "NHI_AWS_FORWARD_ROLE_NAME")
	set(&a.TrailName, "NHI_AWS_TRAIL_NAME")
	for _, kv := range []struct {
		key string
		dst *int
	}{{"NHI_AWS_EVENT_POLL_SECONDS", &a.EventPollSeconds}, {"NHI_AWS_EVENT_WAIT_MINUTES", &a.EventWaitMinutes}} {
		if v, ok := os.LookupEnv(kv.key); ok && strings.TrimSpace(v) != "" {
			n, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil || n <= 0 {
				return fmt.Errorf("config: %s must be a positive integer", kv.key)
			}
			*kv.dst = n
		}
	}
	if v, ok := os.LookupEnv("NHI_AWS_ASSUME_ASSUMER_ROLE"); ok && strings.TrimSpace(v) != "" {
		b, err := strconv.ParseBool(strings.TrimSpace(v))
		if err != nil {
			return fmt.Errorf("config: NHI_AWS_ASSUME_ASSUMER_ROLE must be true or false")
		}
		a.AssumeAssumerRole = b
	}

	a.AssumerRoleName = strings.TrimSpace(a.AssumerRoleName)
	if a.AssumerRoleName == "" {
		a.AssumerRoleName = "NHIPlatformAssumer"
	}
	a.CollectorRoleName = strings.TrimSpace(a.CollectorRoleName)
	if a.CollectorRoleName == "" {
		a.CollectorRoleName = "NHIPlatformCollector"
	}
	a.ForwardRuleName = strings.TrimSpace(a.ForwardRuleName)
	if a.ForwardRuleName == "" {
		a.ForwardRuleName = "nhi-forward-activity"
	}
	if a.ForwardRoleName = strings.TrimSpace(a.ForwardRoleName); a.ForwardRoleName == "" {
		a.ForwardRoleName = "NHIEventBridgeForwardRole"
	}
	if a.TrailName = strings.TrimSpace(a.TrailName); a.TrailName == "" {
		a.TrailName = "adapid-nhi-trail"
	}
	if a.EventPollSeconds == 0 {
		a.EventPollSeconds = 7
	}
	if a.EventPollSeconds < 5 || a.EventPollSeconds > 10 {
		return fmt.Errorf("config: aws_integration.event_poll_seconds must be between 5 and 10")
	}
	if a.EventWaitMinutes == 0 {
		a.EventWaitMinutes = 15
	}
	a.GitHubSecretPrefix = strings.Trim(strings.TrimSpace(a.GitHubSecretPrefix), "/")
	if a.GitHubSecretPrefix == "" {
		a.GitHubSecretPrefix = "nhi/github"
	}
	a.GitHubAPIURL = strings.TrimRight(strings.TrimSpace(a.GitHubAPIURL), "/")
	if a.GitHubAPIURL == "" {
		a.GitHubAPIURL = "https://api.github.com"
	}

	if !awsIAMNameRE.MatchString(a.AssumerRoleName) || !awsIAMNameRE.MatchString(a.CollectorRoleName) {
		return fmt.Errorf("config: aws_integration role names must be valid IAM role names")
	}
	if !awsRuleNameRE.MatchString(a.ForwardRuleName) {
		return fmt.Errorf("config: aws_integration.forward_rule_name must be a valid EventBridge rule name")
	}
	if !awsSecretPrefixRE.MatchString(a.GitHubSecretPrefix) {
		return fmt.Errorf("config: aws_integration.github_secret_prefix must be a valid Secrets Manager name prefix")
	}
	if u, err := url.Parse(a.GitHubAPIURL); err != nil || (u.Scheme != "https" && u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || u.Host == "" {
		return fmt.Errorf("config: aws_integration.github_api_url must be an https URL")
	}
	return nil
}
