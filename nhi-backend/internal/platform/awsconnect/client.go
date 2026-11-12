package awsconnect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
)

var (
	// ErrAccessDenied: AWS refused the call. For AssumeRole this covers a wrong
	// External ID, a wrong trusted account, and a role that does not exist -
	// STS deliberately does not say which.
	ErrAccessDenied = errors.New("aws denied access")
	// ErrNothingRead: the read succeeded but returned nothing.
	ErrNothingRead = errors.New("aws read returned no data")
	// ErrPlatformCredentials: the platform's own AWS credentials were refused
	// (InvalidClientTokenId, an expired token, no credentials at all). Nothing
	// the customer did can cause this, so it must never be reported as a
	// problem with their role.
	ErrPlatformCredentials = errors.New("the platform's aws credentials were refused")
)

// platformCredentialCodes are AWS's answers to a call signed with bad, expired
// or missing credentials of our own.
var platformCredentialCodes = map[string]struct{}{
	"InvalidClientTokenId":        {},
	"UnrecognizedClientException": {},
	"ExpiredToken":                {},
	"ExpiredTokenException":       {},
	"InvalidAccessKeyId":          {},
	"SignatureDoesNotMatch":       {},
	"MissingAuthenticationToken":  {},
}

// accessDeniedCodes are the error codes AWS uses for "not allowed".
var accessDeniedCodes = map[string]struct{}{
	"AccessDenied":          {},
	"AccessDeniedException": {},
	"UnauthorizedOperation": {},
	"NotAuthorized":         {},
}

// awsDetail is everything AWS said about a refusal: the code, its own message
// (which usually names the principal, the action and the resource, and so says
// whether our policy or the customer's trust policy refused) and the request
// id to find the call in CloudTrail. It goes to the API log only: customers are
// shown fixed texts, never this.
func awsDetail(err error, apiErr smithy.APIError) string {
	detail := apiErr.ErrorCode()
	if msg := strings.TrimSpace(apiErr.ErrorMessage()); msg != "" {
		detail += ": " + msg
	}
	var resp *awshttp.ResponseError
	if errors.As(err, &resp) {
		detail += fmt.Sprintf(" (aws request id %s, http %d)", resp.ServiceRequestID(), resp.HTTPStatusCode())
	}
	return detail
}

func classify(err error) error {
	if err == nil {
		return nil
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		if _, denied := accessDeniedCodes[apiErr.ErrorCode()]; denied {
			return fmt.Errorf("%w: %s", ErrAccessDenied, awsDetail(err, apiErr))
		}
		if _, ours := platformCredentialCodes[apiErr.ErrorCode()]; ours {
			return fmt.Errorf("%w: %s", ErrPlatformCredentials, awsDetail(err, apiErr))
		}
	}
	// The SDK found no credentials at all (no role, no profile, no keys).
	if strings.Contains(err.Error(), "failed to retrieve credentials") || strings.Contains(err.Error(), "no EC2 IMDS role found") {
		return fmt.Errorf("%w: %v", ErrPlatformCredentials, err)
	}
	return err
}

// stsFallbackRegion is where STS is always on, whatever an account turned off.
const stsFallbackRegion = "us-east-1"

// regionDisabled: STS is turned off in the region the call was made in.
func regionDisabled(err error) bool {
	var apiErr smithy.APIError
	return errors.As(err, &apiErr) && apiErr.ErrorCode() == "RegionDisabledException"
}

// accessDenied: AWS answered with one of its "not allowed" codes.
func accessDenied(err error) bool {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	_, ok := accessDeniedCodes[apiErr.ErrorCode()]
	return ok
}

// Client talks to AWS as the platform. It is safe for concurrent use.
type Client struct {
	base              aws.Config
	assumeAssumerRole bool
	eventQueueURL     string // SQS queue a rule on the central bus delivers to

	mu        sync.Mutex
	providers map[string]aws.CredentialsProvider
}

// NewClient wraps the process's default AWS configuration. With
// assumeAssumerRole set, every call is made as the platform's assumer role
// (assumed from the process's own identity); otherwise the process must
// already be running as that role.
func NewClient(base aws.Config, assumeAssumerRole bool) *Client {
	return &Client{
		base:              base,
		assumeAssumerRole: assumeAssumerRole,
		providers:         make(map[string]aws.CredentialsProvider),
	}
}

// WithEventQueue sets the SQS queue the "events received" check peeks at.
func (c *Client) WithEventQueue(url string) *Client {
	c.eventQueueURL = strings.TrimSpace(url)
	return c
}

// platformConfig is the configuration for calls made as the platform, in the
// platform's region.
func (c *Client) platformConfig(p Platform) aws.Config {
	cfg := c.base.Copy()
	cfg.Region = p.Region
	if !c.assumeAssumerRole {
		return cfg
	}
	key := p.Region + "|" + p.AssumerRoleARN
	c.mu.Lock()
	defer c.mu.Unlock()
	provider, ok := c.providers[key]
	if !ok {
		provider = aws.NewCredentialsCache(stscreds.NewAssumeRoleProvider(sts.NewFromConfig(cfg), p.AssumerRoleARN, func(o *stscreds.AssumeRoleOptions) {
			o.RoleSessionName = "nhi-platform-assumer"
		}))
		c.providers[key] = provider
	}
	cfg.Credentials = provider
	return cfg
}

// Session is short-lived access to a client's account through their role.
type Session struct {
	config aws.Config
}

// AssumeRole assumes the client's role with their External ID - exactly what
// discovery does - and returns a 15-minute session.
func (c *Client) AssumeRole(ctx context.Context, p Platform, role RoleARN, externalID string) (*Session, error) {
	in := &sts.AssumeRoleInput{
		RoleArn:         aws.String(role.ARN),
		RoleSessionName: aws.String("nhi-connection-check"),
		ExternalId:      aws.String(externalID),
		DurationSeconds: aws.Int32(900),
	}
	// STS is called in the platform region (p.Region). The role ARN carries the
	// account; IAM roles are global, so AssumeRole itself takes no region. But
	// the customer's account must have that region enabled: an opt-in region
	// (ap-south-2, say) the customer never enabled, or STS turned off there,
	// refuses the call - with RegionDisabledException or a plain AccessDenied.
	// us-east-1 is enabled in every account and cannot be turned off, so a
	// refused call is made once more there. A real refusal (trust policy,
	// External ID) is refused there too and reported as before.
	stsCfg := c.platformConfig(p)
	out, err := sts.NewFromConfig(stsCfg).AssumeRole(ctx, in)
	if (regionDisabled(err) || accessDenied(err)) && stsCfg.Region != stsFallbackRegion {
		stsCfg.Region = stsFallbackRegion
		out, err = sts.NewFromConfig(stsCfg).AssumeRole(ctx, in)
	}
	if err != nil {
		return nil, classify(err)
	}
	if out.Credentials == nil || out.Credentials.AccessKeyId == nil || out.Credentials.SecretAccessKey == nil || out.Credentials.SessionToken == nil {
		return nil, errors.New("sts returned no credentials")
	}
	cfg := c.base.Copy()
	cfg.Region = p.Region
	cfg.Credentials = aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(
		*out.Credentials.AccessKeyId, *out.Credentials.SecretAccessKey, *out.Credentials.SessionToken,
	))
	return &Session{config: cfg}, nil
}

// TestRead makes one read in the client's account (iam:ListRoles, one item).
// SecurityAudit and ViewOnlyAccess both grant it.
func (c *Client) TestRead(ctx context.Context, s *Session) error {
	if s == nil {
		return errors.New("no session")
	}
	out, err := iam.NewFromConfig(s.config).ListRoles(ctx, &iam.ListRolesInput{MaxItems: aws.Int32(1)})
	if err != nil {
		return classify(err)
	}
	if len(out.Roles) == 0 {
		return ErrNothingRead
	}
	return nil
}

// AllowAccountOnBus adds a statement to the central bus's resource policy so
// the client's account may put events on it. It reads the policy first and
// does nothing when the statement is already there.
func (c *Client) AllowAccountOnBus(ctx context.Context, p Platform, accountID string) error {
	if !accountIDRE.MatchString(accountID) {
		return fmt.Errorf("invalid account id")
	}
	client := eventbridge.NewFromConfig(c.platformConfig(p))
	sid := BusStatementID(accountID)

	bus, err := client.DescribeEventBus(ctx, &eventbridge.DescribeEventBusInput{Name: aws.String(p.EventBusName)})
	if err != nil {
		return fmt.Errorf("describe event bus: %w", err)
	}
	if bus.Policy != nil && policyHasStatement(*bus.Policy, sid) {
		return nil
	}
	_, err = client.PutPermission(ctx, &eventbridge.PutPermissionInput{
		EventBusName: aws.String(p.EventBusName),
		Action:       aws.String("events:PutEvents"),
		Principal:    aws.String(accountID),
		StatementId:  aws.String(sid),
	})
	if err != nil {
		// Two checks for the same account racing each other: the other one won.
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "ResourceAlreadyExistsException" {
			return nil
		}
		return fmt.Errorf("put event bus permission: %w", err)
	}
	return nil
}

// RevokeAccountOnBus removes the statement AllowAccountOnBus added, so a
// removed account's events are refused. Already gone counts as done.
func (c *Client) RevokeAccountOnBus(ctx context.Context, p Platform, accountID string) error {
	if !accountIDRE.MatchString(accountID) {
		return fmt.Errorf("invalid account id")
	}
	_, err := eventbridge.NewFromConfig(c.platformConfig(p)).RemovePermission(ctx, &eventbridge.RemovePermissionInput{
		EventBusName: aws.String(p.EventBusName),
		StatementId:  aws.String(BusStatementID(accountID)),
	})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "ResourceNotFoundException" {
			return nil
		}
		return fmt.Errorf("remove event bus permission: %w", err)
	}
	return nil
}

func policyHasStatement(policy, sid string) bool {
	var doc struct {
		Statement []struct {
			Sid string `json:"Sid"`
		} `json:"Statement"`
	}
	if err := json.Unmarshal([]byte(policy), &doc); err != nil {
		return false
	}
	for _, statement := range doc.Statement {
		if statement.Sid == sid {
			return true
		}
	}
	return false
}
