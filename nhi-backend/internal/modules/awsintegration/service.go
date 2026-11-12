package awsintegration

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/modules/codesources"
	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/githubcheck"
	"nhi-backend-api/internal/platform/logging"
)

var (
	// ErrAWSTenantNotConfigured: the tenant's row in nhi_global.tenants lacks
	// (or has inconsistent) collector values. The super admin fills them in.
	ErrAWSTenantNotConfigured = errors.New("aws integration is not configured for this tenant")
	// ErrAWSUnavailable: this process has no usable AWS configuration.
	ErrAWSUnavailable = errors.New("aws is not reachable from the api")
	// ErrAWSVerifyInProgress: a check for this tenant is already running.
	ErrAWSVerifyInProgress = errors.New("a connection check is already running")
	// ErrAWSAccountClaimed: the account belongs to another workspace.
	ErrAWSAccountClaimed = errors.New("aws account is connected to another workspace")
	// ErrRegionNotOffered: a region outside the tenant's collector_regions.
	ErrRegionNotOffered = errors.New("region not offered")
)

// What the customer is asked to set up. Kept next to the checks that prove it.
var (
	awsManagedPolicies = []string{"SecurityAudit", "ViewOnlyAccess"}
	// The rule's event pattern (setup guide, step 4). aws.codecommit is only
	// needed with code scanning; the guide says to drop it otherwise.
	awsEventSources = []string{
		"aws.ssm", "aws.rolesanywhere", "aws.ec2", "aws.ecs", "aws.iam", "aws.sts", "aws.lambda", "aws.eks",
		"aws.secretsmanager", "aws.kms", "aws.batch", "aws.codecommit", "aws.s3", "aws.amplify", "aws.glue",
		"aws.states", "aws.scheduler", "aws.codebuild", "aws.codedeploy", "aws.codepipeline", "aws.cloudformation",
	}
	// CodeCommit: the four reads the secret scanner uses, as an inline policy on
	// the role. There is no managed policy for exactly these; listing the
	// repositories comes from the ViewOnlyAccess the role already has.
	codeCommitActions = []string{
		"codecommit:GetBranch", "codecommit:GetCommit", "codecommit:GetDifferences", "codecommit:GetBlob",
	}
	// GitHub: read the token secret, nothing else.
	gitHubSecretActions    = []string{"secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"}
	gitHubTokenPermissions = []string{"Contents: Read-only", "Metadata: Read-only"}
)

// Time budget for one check. The HTTP server's write timeout is 15s.
const (
	awsVerifyBudget     = 12 * time.Second
	awsAssumeTimeout    = 4 * time.Second
	awsReadTimeout      = 3 * time.Second
	awsPermissionBudget = 3 * time.Second
	awsCleanupTimeout   = 5 * time.Second
	exposureStepTimeout = 5 * time.Second
)

// AWSIntegrationStore is the persistence (repository.AWSIntegrationRepository).
type AWSIntegrationStore interface {
	TenantSettings(ctx context.Context, tenantID string) (*AWSTenantSettings, error)
	ListAccounts(ctx context.Context, schema string) ([]AWSAccountRecord, error)
	GetAccount(ctx context.Context, schema, accountID string) (*AWSAccountRecord, error)
	AccountClaimedByOther(ctx context.Context, tenantID, accountID string) (bool, error)
	SaveVerification(ctx context.Context, tenantID, schema string, rec AWSAccountRecord) (*AWSAccountRecord, bool, error)
	UpdateRegions(ctx context.Context, tenantID, schema, accountID string, regions []string) (*AWSAccountRecord, error)
	SaveExposure(ctx context.Context, schema, accountID string, u ExposureUpdate) (*AWSAccountRecord, error)
	RequestSync(ctx context.Context, schema, accountID, actor string, at time.Time) (*AWSAccountRecord, bool, error)
	CancelSync(ctx context.Context, schema, accountID string) (*AWSAccountRecord, error)
	DeleteAccount(ctx context.Context, tenantID, schema, accountID string) (map[string]int64, error)
	ArchiveAccount(ctx context.Context, tenantID, schema, accountID string) (map[string]int64, error)
	RestoreAccount(ctx context.Context, schema, accountID string) (map[string]int64, error)
	SaveCheckStart(ctx context.Context, tenantID, schema string, rec AWSAccountRecord) (*AWSAccountRecord, error)
	SaveApprovalAsk(ctx context.Context, tenantID, schema string, rec AWSAccountRecord) (*AWSAccountRecord, error)
	FinishPendingRequest(ctx context.Context, tenantID, accountID, outcome, detail string, checks []AWSCheck) error
	SaveChecks(ctx context.Context, schema, accountID string, checks []AWSCheck) error
	RequestApproval(ctx context.Context, req ApprovalRequest) (int64, *AWSAccountRecord, error)
	SetApprovalEmail(ctx context.Context, id int64, status, errText string) error
	HasPendingApproval(ctx context.Context, tenantID, accountID string) (bool, error)
	RecordConnectionRequest(ctx context.Context, req ConnectionRequest) (int64, error)
	SetRequestEmail(ctx context.Context, id int64, status, errText string) error
	FinishConnectionRequest(ctx context.Context, id int64, outcome, detail string, checks []AWSCheck) error
	WithdrawApprovals(ctx context.Context, tenantID, accountID string) error
}

// AWSVerifier is the AWS side (awsconnect.Client in production).
type AWSVerifier interface {
	AssumeRole(ctx context.Context, p awsconnect.Platform, role awsconnect.RoleARN, externalID string) (*awsconnect.Session, error)
	TestRead(ctx context.Context, s *awsconnect.Session) error
	AllowAccountOnBus(ctx context.Context, p awsconnect.Platform, accountID string) error
	RevokeAccountOnBus(ctx context.Context, p awsconnect.Platform, accountID string) error
	ListCodeCommit(ctx context.Context, s *awsconnect.Session, regions []string) (awsconnect.CodeCommitResult, error)
	ProbeCodeCommit(ctx context.Context, s *awsconnect.Session, region, repository string) awsconnect.RepoProbe
	ReadSecretToken(ctx context.Context, s *awsconnect.Session, arn awsconnect.SecretARN) (string, error)
	// DiagnoseAssumeRole checks our own side after AWS refused AssumeRole.
	DiagnoseAssumeRole(ctx context.Context, p awsconnect.Platform, role awsconnect.RoleARN) awsconnect.Diagnosis
}

// GitHubChecker validates a GitHub token (githubcheck.Checker in production).
type GitHubChecker interface {
	Check(ctx context.Context, token string) (githubcheck.Result, error)
}

// AWSEventSource reads the central event queue: one poll reports the events
// from an account it found, by region.
type AWSEventSource interface {
	PollEvents(ctx context.Context, p awsconnect.Platform, accountID string) (awsconnect.EventPoll, error)
}

// QueueEventSource is the "Receive your events" check: it peeks at the central
// SQS queue that the bus delivers every customer event to. It is the only
// source on purpose: the per-tenant ClickHouse database is created by another
// service only after an account is connected, so it cannot be asked first.
type QueueEventSource struct{ Client *awsconnect.Client }

func (s QueueEventSource) PollEvents(ctx context.Context, p awsconnect.Platform, accountID string) (awsconnect.EventPoll, error) {
	poll, err := s.Client.PollEventsFrom(ctx, p, accountID)
	if err == nil {
		// Seen tells an empty queue (nothing delivered, or already consumed)
		// from one carrying only other accounts' events.
		logging.FromContext(ctx).Debug("aws integration: events check, queue polled", "account_id", accountID, "messages_seen", poll.Seen, "regions", poll.Regions)
	}
	return poll, err
}

// AWSIntegrationOptions are the deployment's names and limits.
type AWSIntegrationOptions struct {
	AssumerRoleName    string
	CollectorRoleName  string
	ForwardRuleName    string
	GitHubSecretPrefix string
	// ForwardRoleName is the customer's role EventBridge uses to put events
	// on our bus (NHIEventBridgeForwardRole).
	ForwardRoleName string
	// TrailName is the CloudTrail trail to create when none qualifies.
	TrailName string
	// EventPollInterval is how often the events check reads the queue (5-10s).
	EventPollInterval time.Duration
	// EventWaitLimit is how long it watches before concluding.
	EventWaitLimit time.Duration
	// Mailer sends the approval notice; nil or unconfigured records
	// "not_configured" on the request.
	Mailer AWSMailer
	// ApprovalsLocation names where approval requests are written
	// ("<database>, schema <schema>"), so the e-mail says where the onboarding
	// tool must look.
	ApprovalsLocation string
}

// AWSCaller is who is asking, from the signed token.
type AWSCaller struct {
	TenantID string
	Schema   string
	Actor    string
}

type AWSIntegrationService struct {
	store    AWSIntegrationStore
	verifier AWSVerifier
	github   GitHubChecker
	events   AWSEventSource
	opts     AWSIntegrationOptions
	mailer   AWSMailer
	now      func() time.Time

	running sync.Map // tenantID -> struct{}: one check per tenant at a time
	watches sync.Map // watchKey -> *watchEntry: the events checks running now
	// resuming guards starting the events check of an approved account, so two
	// requests reading the page at once start one watch.
	resuming sync.Map // watchKey -> struct{}
	// testPoll overrides the 5-10s poll interval in tests.
	testPoll time.Duration
}

// NewAWSIntegrationService wires the service. verifier may be nil when the
// process has no AWS configuration (the page still loads; checks answer
// ErrAWSUnavailable), and events may be nil when there is no event store (the
// events check then reports it cannot run).
func NewAWSIntegrationService(store AWSIntegrationStore, verifier AWSVerifier, github GitHubChecker, events AWSEventSource, opts AWSIntegrationOptions) *AWSIntegrationService {
	opts.AssumerRoleName = orDefault(opts.AssumerRoleName, "NHIPlatformAssumer")
	opts.CollectorRoleName = orDefault(opts.CollectorRoleName, "NHIPlatformCollector")
	opts.ForwardRuleName = orDefault(opts.ForwardRuleName, "nhi-forward-activity")
	opts.ForwardRoleName = orDefault(opts.ForwardRoleName, "NHIEventBridgeForwardRole")
	opts.TrailName = orDefault(opts.TrailName, "adapid-nhi-trail")
	opts.GitHubSecretPrefix = orDefault(opts.GitHubSecretPrefix, "nhi/github")
	return &AWSIntegrationService{store: store, verifier: verifier, github: github, events: events, opts: opts, mailer: opts.Mailer, now: time.Now}
}

// platform reads the tenant's collector values and checks them against each other.
func (s *AWSIntegrationService) platform(ctx context.Context, tenantID string) (awsconnect.Platform, *AWSTenantSettings, error) {
	settings, err := s.store.TenantSettings(ctx, tenantID)
	if err != nil {
		return awsconnect.Platform{}, nil, err
	}
	if settings == nil || settings.AWSAccountID == "" || settings.EventBusARN == "" || settings.ExternalID == "" {
		logging.FromContext(ctx).Warn("aws integration: tenant has no collector_aws_account_id / collector_event_bridge_arn / collector_external_id in nhi_global.tenants", "tenant_id", tenantID)
		return awsconnect.Platform{}, settings, ErrAWSTenantNotConfigured
	}
	p, err := awsconnect.PlatformForTenant(settings.AWSAccountID, settings.EventBusARN, s.opts.AssumerRoleName)
	if err != nil {
		logging.FromContext(ctx).Warn("aws integration: platform lookup failed", "tenant_id", tenantID, "err", err)
		return awsconnect.Platform{}, settings, ErrAWSTenantNotConfigured
	}
	return p, settings, nil
}

// offeredRegions is the catalogue limited to the tenant's collector_regions
// (all regions when that is empty).
func offeredRegions(settings *AWSTenantSettings) []AWSRegion {
	allowed := map[string]bool{}
	if settings != nil {
		for _, r := range settings.Regions {
			allowed[r] = true
		}
	}
	out := make([]AWSRegion, 0, len(awsconnect.Regions))
	for _, r := range awsconnect.Regions {
		if len(allowed) == 0 || allowed[r.Code] {
			out = append(out, AWSRegion{Code: r.Code, Name: r.Name, Group: r.Group, OptIn: r.OptIn})
		}
	}
	return out
}

// normalizeRegions validates the codes and that the tenant is offered them.
func normalizeRegions(raw []string, settings *AWSTenantSettings) ([]string, error) {
	regions, err := awsconnect.NormalizeRegions(raw)
	if err != nil {
		return nil, err
	}
	if settings == nil || len(settings.Regions) == 0 {
		return regions, nil
	}
	allowed := map[string]bool{}
	for _, r := range settings.Regions {
		allowed[r] = true
	}
	for _, r := range regions {
		if !allowed[r] {
			return nil, &awsconnect.ErrInvalidRegions{Message: "Region " + r + " is not available for your workspace."}
		}
	}
	return regions, nil
}

// Get returns the tenant's connection status and accounts and, for those who
// may manage them, the values to copy and the regions to choose from.
func (s *AWSIntegrationService) Get(ctx context.Context, caller AWSCaller, canManage bool) (*AWSIntegrationResponse, error) {
	records, err := s.store.ListAccounts(ctx, caller.Schema)
	if err != nil {
		return nil, err
	}
	out := &AWSIntegrationResponse{
		Status:    tenantStatus(records),
		CanManage: canManage,
		Accounts:  make([]AWSConnectedAccount, 0, len(records)),
	}
	for _, rec := range records {
		// An admin approved this connection since the last read: its events
		// check starts now.
		s.resumeApproved(ctx, caller, &rec)
		// Shown as waiting for approval: make sure the admins have something
		// to approve.
		s.ensureApprovalRequest(ctx, caller, rec)
		// An events check saved as running whose watcher is not in this
		// process stopped with it (a restart, a deploy): say so, rather than
		// show a check that will never finish.
		for i := range rec.Checks {
			stale := rec.Checks[i].State == AWSCheckRunning && !s.watching(caller.TenantID, rec.AccountID) && !s.checksRunning(caller.TenantID, rec.AccountID)
			if rec.Checks[i].Key != AWSCheckEvents && rec.Checks[i].State == AWSCheckRunning && stale {
				rec.Checks[i].State = AWSCheckError
				rec.Checks[i].Message = "The check stopped before it finished (the service restarted). Check again to resume it."
			}
			if rec.Checks[i].Key == AWSCheckEvents && rec.Checks[i].State == AWSCheckRunning && !s.watching(caller.TenantID, rec.AccountID) {
				rec.Checks[i].State = AWSCheckError
				rec.Checks[i].Message = "The events check stopped before it finished (the service restarted). Check again to resume it."
			}
		}
		out.Accounts = append(out.Accounts, rec.ToAPI())
		if rec.ConnectedAt != nil {
			out.HasConnectedAccount = true
		}
		if rec.Approval.Status == ApprovalPending {
			out.AwaitingApproval = true
		}
		if rec.CodeCommitConnected {
			out.Platforms.CodeCommit = true
		}
	}

	p, settings, err := s.platform(ctx, caller.TenantID)
	if settings != nil {
		out.Workspace.Domain = settings.Domain
		out.Platforms.GitHub = settings.GitHubActive && codesources.GitHubOn()
		out.Platforms.Bitbucket = settings.BitbucketActive && codesources.BitbucketOn()
	}
	out.ExposureEnabled = out.Platforms.CodeCommit || out.Platforms.GitHub || out.Platforms.Bitbucket
	if !canManage {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	out.Setup = &AWSSetupValues{
		AccountID:        p.AccountID,
		ExternalID:       settings.ExternalID,
		EventBusARN:      p.EventBusARN,
		Region:           p.Region,
		AssumerRoleARN:   p.AssumerRoleARN,
		RoleName:         s.opts.CollectorRoleName,
		RuleName:         s.opts.ForwardRuleName,
		ForwardRoleName:  s.opts.ForwardRoleName,
		TrailName:        s.opts.TrailName,
		EventWaitMinutes: int(s.waitLimit() / time.Minute),
		ManagedPolicies:  append([]string(nil), awsManagedPolicies...),
		EventSources:     append([]string(nil), awsEventSources...),
		Regions:          offeredRegions(settings),
		Exposure: AWSExposureSetup{
			CodeCommit: CodeCommitSetup{
				ManagedPolicy: "", // none: the four actions go in an inline policy
				Actions:       append([]string(nil), codeCommitActions...),
			},
			GitHub: GitHubSetup{
				SecretPrefix:     s.opts.GitHubSecretPrefix,
				Actions:          append([]string(nil), gitHubSecretActions...),
				TokenPermissions: append([]string(nil), gitHubTokenPermissions...),
			},
		},
	}
	return out, nil
}

func tenantStatus(records []AWSAccountRecord) string {
	if len(records) == 0 {
		return AWSStatusNotConnected
	}
	for _, rec := range records {
		if rec.IsConnected {
			return AWSStatusConnected
		}
	}
	for _, rec := range records {
		if rec.Approval.Status == ApprovalPending {
			return AWSStatusPendingApproval
		}
	}
	return AWSStatusActionNeeded
}

// begin claims the tenant's single check slot.
func (s *AWSIntegrationService) begin(tenantID string) (func(), error) {
	if _, busy := s.running.LoadOrStore(tenantID, struct{}{}); busy {
		return nil, ErrAWSVerifyInProgress
	}
	return func() { s.running.Delete(tenantID) }, nil
}

// Verify runs the checks for a pasted role ARN and the regions the customer
// allows, in this order:
//
//  1. sts:AssumeRole with the ARN and the tenant's External ID
//  2. iam:ListRoles with the assumed role (one test read)
//  3. approval: a first connection is put in front of the platform admins
//  4. an event from the account has reached us
//
// Events come last because the account is only allowed to put events on the
// central bus (the queue the check reads) once an admin has approved it. An
// account that is already approved (a re-check) goes straight to (4). Nothing
// is stored or granted until (1) passes, because only then has the tenant
// shown it controls the account. When (4) passes a sync is queued and the
// account joins the tenant's scope.
func (s *AWSIntegrationService) Verify(ctx context.Context, caller AWSCaller, rawRoleARN string, rawRegions []string) (*AWSVerifyResponse, error) {
	log := logging.FromContext(ctx).With("role_arn", strings.TrimSpace(rawRoleARN))
	log.Info("aws integration: connection check started", "regions", rawRegions, "by", caller.Actor)
	result, err := s.verify(ctx, caller, rawRoleARN, rawRegions)
	if err != nil {
		// Mapped to a response (and logged with its code) by the handler.
		return nil, err
	}
	logChecks(ctx, "aws integration: connection check finished", result.AccountID, result.Checks,
		"status", result.Status, "watching_events", result.Watching, "sync_queued", result.SyncQueued)
	return result, nil
}

func (s *AWSIntegrationService) verify(ctx context.Context, caller AWSCaller, rawRoleARN string, rawRegions []string) (out *AWSVerifyResponse, retErr error) {
	p, settings, err := s.platform(ctx, caller.TenantID)
	if err != nil {
		return nil, err
	}
	role, err := awsconnect.ParseRoleARN(rawRoleARN)
	if err != nil {
		return nil, err
	}
	if role.AccountID == p.AccountID {
		return nil, &awsconnect.ErrInvalidRoleARN{Message: "That ARN is in our account (" + p.AccountID + "). Paste the ARN of the role you created in your own AWS account."}
	}
	regions, err := normalizeRegions(rawRegions, settings)
	if err != nil {
		return nil, err
	}
	if s.verifier == nil {
		return nil, ErrAWSUnavailable
	}
	done, err := s.begin(caller.TenantID)
	if err != nil {
		return nil, err
	}
	defer done()

	// The click is stored first, whatever follows, so a request is known even
	// when it is refused or its checks fail.
	requestID := s.recordRequest(ctx, caller, settings, role.AccountID, role.ARN, regions)
	defer func() { s.finishRequest(ctx, requestID, out, retErr) }()

	rec := AWSAccountRecord{
		AccountID:      role.AccountID,
		RoleARN:        role.ARN,
		Regions:        regions,
		ExternalID:     settings.ExternalID,
		Status:         AWSStatusPending,
		LastVerifiedAt: s.now().UTC(),
		LastVerifiedBy: caller.Actor,
	}
	existing, err := s.store.GetAccount(ctx, caller.Schema, role.AccountID)
	if err != nil {
		return nil, err
	}

	// Every AWS account is approved on its own, before any check runs:
	// nothing is read from the customer's AWS account until it is approved
	// (the role, read and events checks then run by themselves, see
	// resumeApproved). A workspace with one approved account still needs
	// approval for the next. Only a re-check of an account that is itself
	// approved runs the checks directly, with no e-mail. An account an admin
	// rejected, or whose request is still open, stays in the approval flow.
	// The same AWS account removed earlier with its data kept: the data comes
	// back now. A failure leaves it archived (tried again on the next Verify).
	if restored, err := s.store.RestoreAccount(ctx, caller.Schema, role.AccountID); err != nil {
		logging.FromContext(ctx).Error("aws integration: restoring the removed account's data failed, it stays archived", "account_id", role.AccountID, "err", err)
	} else if restored != nil {
		logging.FromContext(ctx).Info("aws integration: the removed account's data is back", "account_id", role.AccountID, "tables", restored)
	}
	if !isApproved(existing) {
		return s.askApprovalFirst(ctx, caller, settings, rec, requestID, existing)
	}
	s.setRequestMail(ctx, requestID, "not_needed", "a re-check of an approved account sends no e-mail")
	return s.runChecks(ctx, caller, p, settings, role, regions, rec)
}

// runChecks runs the role, read access and events checks of an approved account
// and saves what they found. The caller has the approval; nothing here asks.
func (s *AWSIntegrationService) runChecks(ctx context.Context, caller AWSCaller, p awsconnect.Platform, settings *AWSTenantSettings, role awsconnect.RoleARN, regions []string, rec AWSAccountRecord) (*AWSVerifyResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, awsVerifyBudget)
	defer cancel()

	checks := newChecks()
	result := &AWSVerifyResponse{
		Status:     AWSStatusPending,
		AccountID:  role.AccountID,
		RoleARN:    role.ARN,
		Regions:    regions,
		Checks:     checks,
		VerifiedAt: s.now().UTC(),
	}

	// 1. AssumeRole
	stepCtx, stepCancel := context.WithTimeout(ctx, awsAssumeTimeout)
	session, err := s.verifier.AssumeRole(stepCtx, p, role, settings.ExternalID)
	stepCancel()
	if err != nil {
		if errors.Is(err, awsconnect.ErrAccessDenied) {
			s.explainDenied(ctx, caller, p, role, err, &checks[0], result)
		} else if errors.Is(err, awsconnect.ErrPlatformCredentials) {
			logCheckError(ctx, caller.TenantID, role.AccountID, checks[0].Key, err)
			platformError(&checks[0], err)
			checks[0].Message = "Our platform could not sign in to AWS (its own credentials were refused, e.g. InvalidClientTokenId). This is on our side, not in your account; we have been alerted. Try again later."
		} else {
			logCheckError(ctx, caller.TenantID, role.AccountID, checks[0].Key, err)
			unavailable(&checks[0])
		}
		skip(&checks[1])
		skip(&checks[2])
		return s.saveFailedChecks(ctx, caller, rec, result)
	}
	pass(&checks[0], "Signed in to your account with your External ID.")

	// The tenant controls this account. It may still belong to another tenant.
	claimed, err := s.store.AccountClaimedByOther(ctx, caller.TenantID, role.AccountID)
	if err != nil {
		return nil, err
	}
	if claimed {
		logging.FromContext(ctx).Warn("aws integration: account already connected to another workspace, refused", "account_id", role.AccountID)
		return nil, ErrAWSAccountClaimed
	}

	// 2. One test read
	stepCtx, stepCancel = context.WithTimeout(ctx, awsReadTimeout)
	err = s.verifier.TestRead(stepCtx, session)
	stepCancel()
	switch {
	case err == nil:
		pass(&checks[1], "Read access works.")
	case errors.Is(err, awsconnect.ErrAccessDenied), errors.Is(err, awsconnect.ErrNothingRead):
		logCustomerDenied(ctx, role.AccountID, checks[1].Key, err)
		// The customer may have named the role anything: name the one they pasted.
		fail(&checks[1], "The role cannot read your account.", "Attach SecurityAudit and ViewOnlyAccess to "+role.ARN[strings.LastIndex(role.ARN, "/")+1:])
	default:
		logCheckError(ctx, caller.TenantID, role.AccountID, checks[1].Key, err)
		unavailable(&checks[1])
	}

	// 3. Events: the account is let onto the bus and watched for its first
	// event. EventBridge retries refused deliveries, so events sent before the
	// approval still arrive.
	saveCtx, saveCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer saveCancel()
	if checks[1].State != AWSCheckPass {
		// No point watching for events while the role cannot read the account.
		checks[2].State, checks[2].Message, checks[2].Fix = AWSCheckSkipped, "Runs once the checks above pass.", ""
	} else {
		checks[2].State, checks[2].Message, checks[2].Fix = AWSCheckSkipped, "Starting.", ""
		rec.Checks = checks
		saved, err := s.store.SaveCheckStart(saveCtx, caller.TenantID, caller.Schema, rec)
		if errors.Is(err, ErrAWSAccountClaimedByTenant) {
			return nil, ErrAWSAccountClaimed
		}
		if err != nil {
			return nil, err
		}
		check, started := s.startEvents(ctx, caller, p, settings, rec)
		checks[2] = check
		rec.Checks = checks
		if started {
			if err := s.store.SaveChecks(saveCtx, caller.Schema, rec.AccountID, checks); err != nil {
				return nil, err
			}
			result.Checks = checks
			result.Status = saved.Status
			result.Saved = true
			result.Watching = true
			return result, nil
		}
		// It could not start (our bus or queue): save the checks as they are.
	}
	return s.saveFinishedChecks(saveCtx, caller, rec, checks, result)
}

// saveFailedChecks keeps what the role check found when it stopped the run, so
// the console can show it. The account row exists already (it was asked for
// approval), and the connection is not changed.
func (s *AWSIntegrationService) saveFailedChecks(ctx context.Context, caller AWSCaller, rec AWSAccountRecord, result *AWSVerifyResponse) (*AWSVerifyResponse, error) {
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	// An account whose role could not be assumed is not stored until the tenant
	// has proved it controls it: nothing to update when it has no row yet.
	if cur, err := s.store.GetAccount(saveCtx, caller.Schema, rec.AccountID); err != nil {
		return nil, err
	} else if cur == nil {
		return result, nil
	}
	if err := s.store.SaveChecks(saveCtx, caller.Schema, rec.AccountID, result.Checks); err != nil {
		return nil, err
	}
	result.Saved = true
	return result, nil
}

// saveFinishedChecks saves a finished run (the events check did not start).
// Saved even if the caller has gone: the checks really ran.
func (s *AWSIntegrationService) saveFinishedChecks(saveCtx context.Context, caller AWSCaller, rec AWSAccountRecord, checks []AWSCheck, result *AWSVerifyResponse) (*AWSVerifyResponse, error) {
	rec.Checks = checks
	saved, queued, err := s.store.SaveVerification(saveCtx, caller.TenantID, caller.Schema, rec)
	if errors.Is(err, ErrAWSAccountClaimedByTenant) {
		return nil, ErrAWSAccountClaimed
	}
	if err != nil {
		return nil, err
	}
	result.Checks = checks
	result.Status = saved.Status
	result.Saved = true
	result.SyncQueued = queued
	return result, nil
}

// UpdateRegions changes the regions an account is read in.
func (s *AWSIntegrationService) UpdateRegions(ctx context.Context, caller AWSCaller, accountID string, rawRegions []string) (*AWSConnectedAccount, error) {
	settings, err := s.store.TenantSettings(ctx, caller.TenantID)
	if err != nil {
		return nil, err
	}
	regions, err := normalizeRegions(rawRegions, settings)
	if err != nil {
		return nil, err
	}
	rec, err := s.store.UpdateRegions(ctx, caller.TenantID, caller.Schema, accountID, regions)
	if err != nil {
		return nil, err
	}
	logging.FromContext(ctx).Info("aws integration: regions changed", "account_id", accountID, "regions", regions, "by", caller.Actor)
	account := rec.ToAPI()
	return &account, nil
}

// SetExposure turns exposed-credential scanning on or off for one connected
// account. Each platform turned on is checked now with the account's role;
// it is marked connected only when every check passes. Turning a platform off
// needs no check.
func (s *AWSIntegrationService) SetExposure(ctx context.Context, caller AWSCaller, accountID string, req AWSExposureRequest) (*AWSExposureResponse, error) {
	rec, err := s.store.GetAccount(ctx, caller.Schema, accountID)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return nil, ErrAWSAccountNotFound
	}
	if rec.ConnectedAt == nil {
		return nil, ErrAWSAccountNotConnected
	}
	// GitHub is switched on for the whole company (nhi_global.tenants
	// github_active), not per AWS account.
	if req.GitHub {
		return nil, ErrGitHubPerCompany
	}
	var secret awsconnect.SecretARN

	update := ExposureUpdate{Actor: caller.Actor, At: s.now().UTC()}
	if !req.GitHub {
		update.GitHub = &ExposurePlatformUpdate{}
	}
	if !req.CodeCommit {
		update.CodeCommit = &ExposurePlatformUpdate{}
	}

	if req.GitHub || req.CodeCommit {
		p, settings, err := s.platform(ctx, caller.TenantID)
		if err != nil {
			return nil, err
		}
		if s.verifier == nil {
			return nil, ErrAWSUnavailable
		}
		role, err := awsconnect.ParseRoleARN(rec.RoleARN)
		if err != nil {
			return nil, err
		}
		done, err := s.begin(caller.TenantID)
		if err != nil {
			return nil, err
		}
		defer done()
		ctx, cancel := context.WithTimeout(ctx, awsVerifyBudget)
		defer cancel()

		stepCtx, stepCancel := context.WithTimeout(ctx, awsAssumeTimeout)
		session, assumeErr := s.verifier.AssumeRole(stepCtx, p, role, settings.ExternalID)
		stepCancel()

		if req.CodeCommit {
			checks := s.checkCodeCommit(ctx, caller, session, assumeErr, rec)
			update.CodeCommit = &ExposurePlatformUpdate{Connected: allPass(checks), Checks: checks}
			logChecks(ctx, "aws integration: credential exposure, CodeCommit checked", accountID, checks, "connected", allPass(checks))
		}
		if req.GitHub {
			checks := s.checkGitHub(ctx, caller, session, assumeErr, rec, secret)
			update.GitHub = &ExposurePlatformUpdate{Connected: allPass(checks), Checks: checks, SecretARN: secret.ARN}
			logChecks(ctx, "aws integration: credential exposure, GitHub checked", accountID, checks, "connected", allPass(checks), "secret_arn", secret.ARN)
		}
	}

	saveCtx, saveCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer saveCancel()
	saved, err := s.store.SaveExposure(saveCtx, caller.Schema, accountID, update)
	if err != nil {
		return nil, err
	}
	all, err := s.store.ListAccounts(saveCtx, caller.Schema)
	if err != nil {
		return nil, err
	}
	logging.FromContext(ctx).Info("aws integration: credential exposure settings saved", "account_id", accountID,
		"github", req.GitHub, "codecommit", req.CodeCommit, "by", caller.Actor)
	resp := &AWSExposureResponse{Account: saved.ToAPI()}
	for _, a := range all {
		if a.CodeCommitConnected {
			resp.ExposureEnabled = true
		}
	}
	if settings, err := s.store.TenantSettings(saveCtx, caller.TenantID); err == nil && settings != nil && ((settings.GitHubActive && codesources.GitHubOn()) || (settings.BitbucketActive && codesources.BitbucketOn())) {
		resp.ExposureEnabled = true
	}
	return resp, nil
}

// roleUnusable fills checks when the account's role could not be assumed:
// the connection itself is broken, so nothing else can be tried.
func roleUnusable(ctx context.Context, checks []AWSCheck, caller AWSCaller, accountID string, err error) {
	if errors.Is(err, awsconnect.ErrAccessDenied) {
		logCustomerDenied(ctx, accountID, checks[0].Key, err)
		fail(&checks[0], "AWS would not let us use this account's role any more.", "Re-check the account connection")
	} else {
		logCheckError(ctx, caller.TenantID, accountID, checks[0].Key, err)
		unavailable(&checks[0])
	}
	for i := 1; i < len(checks); i++ {
		skip(&checks[i])
	}
}

// Repositories the read check samples: a few per region, a handful overall,
// each read with the four permissions the scanner uses.
const (
	probePerRegion = 3
	probeTotal     = 9
	probeStep      = 8 * time.Second
)

// checkCodeCommit: list repositories in every allowed region, then read a
// sample of them exactly as the scanner will (GetBranch, GetCommit,
// GetDifferences, GetBlob) and say, per repository, what could not be read.
func (s *AWSIntegrationService) checkCodeCommit(ctx context.Context, caller AWSCaller, session *awsconnect.Session, assumeErr error, rec *AWSAccountRecord) []AWSCheck {
	checks := []AWSCheck{
		{Key: ExposureCheckCodeCommitList, Label: "Find your repositories"},
		{Key: ExposureCheckCodeCommitRead, Label: "Read code from them"},
	}
	if assumeErr != nil {
		roleUnusable(ctx, checks, caller, rec.AccountID, assumeErr)
		return checks
	}
	stepCtx, cancel := context.WithTimeout(ctx, exposureStepTimeout)
	found, err := s.verifier.ListCodeCommit(stepCtx, session, rec.Regions)
	cancel()
	if err != nil {
		if errors.Is(err, awsconnect.ErrAccessDenied) {
			fail(&checks[0], "The role cannot list CodeCommit repositories.", "Keep ViewOnlyAccess attached to the role: it allows codecommit:ListRepositories")
		} else {
			logCheckError(ctx, caller.TenantID, rec.AccountID, checks[0].Key, err)
			unavailable(&checks[0])
		}
		skip(&checks[1])
		return checks
	}
	msg := fmt.Sprintf("%s in %s.", plural(found.Repositories, "repository", "repositories"), plural(len(found.Regions), "region", "regions"))
	if found.Repositories == 0 {
		msg = "No repositories yet in your selected regions (" + strings.Join(rec.Regions, ", ") + "). New ones are scanned as they appear."
	}
	if len(found.Unavailable) > 0 {
		msg += " CodeCommit is not available in " + strings.Join(found.Unavailable, ", ") + "."
	}
	pass(&checks[0], msg)

	sample := sampleRepos(found.Repos)
	if len(sample) == 0 {
		checks[1].State, checks[1].Message = AWSCheckSkipped, "Nothing to read yet."
		return checks
	}
	probes := make([]awsconnect.RepoProbe, len(sample))
	var wg sync.WaitGroup
	for i, ref := range sample {
		wg.Add(1)
		go func(i int, ref awsconnect.RepoRef) {
			defer wg.Done()
			stepCtx, cancel := context.WithTimeout(ctx, probeStep)
			defer cancel()
			probes[i] = s.verifier.ProbeCodeCommit(stepCtx, session, ref.Region, ref.Name)
		}(i, ref)
	}
	wg.Wait()
	summarizeCodeCommitRead(ctx, caller, rec, &checks[1], probes)
	return checks
}

// sampleRepos takes up to probePerRegion repositories per region, probeTotal overall.
func sampleRepos(repos []awsconnect.RepoRef) []awsconnect.RepoRef {
	perRegion := map[string]int{}
	var out []awsconnect.RepoRef
	for _, r := range repos {
		if perRegion[r.Region] >= probePerRegion || len(out) >= probeTotal {
			continue
		}
		perRegion[r.Region]++
		out = append(out, r)
	}
	return out
}

// summarizeCodeCommitRead turns the probes into the check's one result: which
// repositories (and regions) could be read, and for the ones that could not,
// which of the four permissions to add.
func summarizeCodeCommitRead(ctx context.Context, caller AWSCaller, rec *AWSAccountRecord, check *AWSCheck, probes []awsconnect.RepoProbe) {
	var readable, empty, broken []string
	var blocked []string
	missing := map[string]bool{}
	files := 0
	for _, p := range probes {
		label := p.Repository + " (" + p.Region + ")"
		switch {
		case len(p.Denied) > 0:
			blocked = append(blocked, label+": "+strings.Join(p.Denied, ", "))
			for _, d := range p.Denied {
				missing[d] = true
			}
		case p.Err != nil:
			logCheckError(ctx, caller.TenantID, rec.AccountID, check.Key, p.Err)
			broken = append(broken, label)
		case p.Empty:
			empty = append(empty, label)
		default:
			readable = append(readable, label)
			files += p.Files
		}
	}
	switch {
	case len(blocked) > 0:
		names := make([]string, 0, len(missing))
		for _, a := range awsconnect.CodeCommitActions {
			if missing[a] {
				names = append(names, a)
			}
		}
		okNote := ""
		if len(readable) > 0 {
			okNote = fmt.Sprintf(" Readable: %s.", strings.Join(readable, ", "))
		}
		fail(check, "The role cannot read: "+strings.Join(blocked, "; ")+"."+okNote,
			"Add "+strings.Join(names, ", ")+" for those repositories (the policy is on the setup page)")
	case len(broken) > 0 && len(readable) == 0:
		unavailable(check)
	default:
		msg := fmt.Sprintf("Read code from %s: %s.", plural(len(readable), "repository", "repositories"), strings.Join(readable, ", "))
		if len(readable) == 0 {
			msg = "The repositories found have no commits yet, so there is nothing to read. They are scanned once they have code."
		} else if files > 0 {
			msg = fmt.Sprintf("Read code from %s (%s fetched): %s.", plural(len(readable), "repository", "repositories"), plural(files, "file", "files"), strings.Join(readable, ", "))
		}
		if len(empty) > 0 {
			msg += " No commits yet: " + strings.Join(empty, ", ") + "."
		}
		pass(check, msg)
	}
}

// checkGitHub: read the token from the customer's secret with the role, then
// ask GitHub what it can reach. The token is never stored or logged.
func (s *AWSIntegrationService) checkGitHub(ctx context.Context, caller AWSCaller, session *awsconnect.Session, assumeErr error, rec *AWSAccountRecord, secret awsconnect.SecretARN) []AWSCheck {
	checks := []AWSCheck{
		{Key: ExposureCheckSecretRead, Label: "Read the token secret"},
		{Key: ExposureCheckGitHubToken, Label: "GitHub accepts the token"},
	}
	if assumeErr != nil {
		roleUnusable(ctx, checks, caller, rec.AccountID, assumeErr)
		return checks
	}
	stepCtx, cancel := context.WithTimeout(ctx, exposureStepTimeout)
	token, err := s.verifier.ReadSecretToken(stepCtx, session, secret)
	cancel()
	switch {
	case err == nil:
		pass(&checks[0], "Read the secret with your role.")
	case errors.Is(err, awsconnect.ErrSecretNotFound):
		fail(&checks[0], "No secret with that ARN in "+secret.Region+".", "Check the secret ARN")
	case errors.Is(err, awsconnect.ErrKMSDenied):
		fail(&checks[0], "The secret's KMS key does not let the role decrypt it.", "Allow kms:Decrypt on the secret's key")
	case errors.Is(err, awsconnect.ErrSecretEmpty):
		fail(&checks[0], "The secret has no token in it.", "Store the GitHub token as the secret value")
	case errors.Is(err, awsconnect.ErrAccessDenied):
		fail(&checks[0], "The role may not read this secret.", "Add the secret read policy to the role")
	default:
		logCheckError(ctx, caller.TenantID, rec.AccountID, checks[0].Key, err)
		unavailable(&checks[0])
	}
	if checks[0].State != AWSCheckPass {
		skip(&checks[1])
		return checks
	}
	if s.github == nil {
		unavailable(&checks[1])
		return checks
	}
	stepCtx, cancel = context.WithTimeout(ctx, exposureStepTimeout)
	res, err := s.github.Check(stepCtx, token)
	cancel()
	token = ""
	switch {
	case err == nil:
		count := plural(res.Repositories, "repository", "repositories")
		if res.More {
			count = fmt.Sprintf("More than %d repositories", res.Repositories)
		}
		who := ""
		if res.Login != "" {
			who = " as " + res.Login
		}
		pass(&checks[1], count+" visible"+who+".")
	case errors.Is(err, githubcheck.ErrTokenRejected):
		fail(&checks[1], "GitHub does not accept this token. It may be wrong, expired or revoked.", "Create a new token and update the secret")
	case errors.Is(err, githubcheck.ErrNoRepositories):
		fail(&checks[1], "The token works but cannot see any repository.", "Give the token access to your repositories")
	case errors.Is(err, githubcheck.ErrNoContents):
		fail(&checks[1], "The token can see repositories but not read their files.", "Give the token Contents: Read-only")
	default:
		logCheckError(ctx, caller.TenantID, rec.AccountID, checks[1].Key, err)
		unavailable(&checks[1])
	}
	return checks
}

func allPass(checks []AWSCheck) bool {
	for _, c := range checks {
		if c.State != AWSCheckPass && c.State != AWSCheckSkipped {
			return false
		}
	}
	// A skip only counts when nothing failed before it and something passed.
	return len(checks) > 0 && checks[0].State == AWSCheckPass
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// RequestSync queues a sync of one connected account, in its allowed
// regions. Asking again while one is queued or running changes nothing.
func (s *AWSIntegrationService) RequestSync(ctx context.Context, caller AWSCaller, accountID string) (*AWSSyncResponse, error) {
	rec, already, err := s.store.RequestSync(ctx, caller.Schema, accountID, caller.Actor, s.now().UTC())
	if err != nil {
		return nil, err
	}
	logging.FromContext(ctx).Info("aws integration: sync requested", "account_id", accountID, "already_queued", already, "by", caller.Actor)
	return &AWSSyncResponse{Account: rec.ToAPI(), AlreadyQueued: already}, nil
}

// CancelSync withdraws a queued sync of one account.
func (s *AWSIntegrationService) CancelSync(ctx context.Context, caller AWSCaller, accountID string) (*AWSSyncResponse, error) {
	rec, err := s.store.CancelSync(ctx, caller.Schema, accountID)
	if err != nil {
		return nil, err
	}
	logging.FromContext(ctx).Info("aws integration: queued sync cancelled", "account_id", accountID, "by", caller.Actor)
	return &AWSSyncResponse{Account: rec.ToAPI()}, nil
}

// RemoveAccount disconnects an account: its row and everything stored for it
// (identities, credentials, posture, findings, history) are deleted in one
// transaction, so it disappears from every page,
// and its permission on the central bus is revoked so its events are refused.
// Nothing changes in the customer's AWS account; the page tells them to
// delete the role and rule themselves.
//
// deleteData false keeps the data: it is moved to archive tables and comes
// back when the same AWS account is connected again (see verify).
func (s *AWSIntegrationService) RemoveAccount(ctx context.Context, caller AWSCaller, accountID string, deleteData bool) error {
	log := logging.FromContext(ctx).With("account_id", accountID, "delete_data", deleteData)
	remove, done := s.store.DeleteAccount, "aws integration: account removed with its data"
	if !deleteData {
		remove, done = s.store.ArchiveAccount, "aws integration: account removed, its data kept in the archive tables"
	}
	purged, err := remove(ctx, caller.TenantID, caller.Schema, accountID)
	if err != nil {
		if !errors.Is(err, ErrAWSAccountNotFound) {
			log.Error("aws integration: removing the account failed, nothing was deleted", "err", err)
		}
		return err
	}
	var total int64
	var skipped []string
	for table, n := range purged {
		if strings.HasPrefix(table, purgeSkipped) {
			skipped = append(skipped, strings.TrimPrefix(table, purgeSkipped))
			delete(purged, table)
			continue
		}
		total += n
	}
	log.Info(done, "rows", total, "tables", purged)
	if len(skipped) > 0 {
		sort.Strings(skipped)
		log.Warn("aws integration: some of the removed account's rows could not be deleted, remove them by hand",
			"tables", skipped)
	}
	// Stop a check still watching for its events, and close its approval.
	if v, ok := s.watches.LoadAndDelete(watchKey{caller.TenantID, accountID}); ok {
		v.(*watchEntry).cancel()
	}
	if err := s.store.WithdrawApprovals(ctx, caller.TenantID, accountID); err != nil {
		logging.FromContext(ctx).Warn("aws integration: withdrawing the approval request failed", "account_id", accountID, "err", err)
	}
	// Best effort: the account is already removed; a permission left behind
	// only lets events in that no tenant scope includes.
	if s.verifier != nil {
		if p, _, err := s.platform(ctx, caller.TenantID); err == nil {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), awsCleanupTimeout)
			defer cancel()
			if err := s.verifier.RevokeAccountOnBus(cleanupCtx, p, accountID); err != nil {
				logging.FromContext(ctx).Warn("aws integration: revoke bus permission failed, remove the statement by hand",
					"tenant_id", caller.TenantID, "account_id", accountID, "statement", awsconnect.BusStatementID(accountID), "err", err)
			}
		}
	}
	return nil
}

func newChecks() []AWSCheck {
	return []AWSCheck{
		{Key: AWSCheckAssumeRole, Label: "The role can be assumed"},
		{Key: AWSCheckReadAccess, Label: "Your configuration is readable"},
		{Key: AWSCheckEvents, Label: "Events arrive from your account"},
	}
}

// isApproved: an admin approved the account, or it was connected before
// approvals existed.
func isApproved(rec *AWSAccountRecord) bool {
	return rec != nil && (rec.Approval.Status == ApprovalApproved || (rec.Approval.Status == "" && rec.ConnectedAt != nil))
}

// awaitingEvents: approved, readable, not connected yet, and its events
// check has been waiting for the approval.
func awaitingEvents(rec AWSAccountRecord) bool {
	if rec.Approval.Status != ApprovalApproved || rec.IsConnected {
		return false
	}
	var read, events bool
	for _, c := range rec.Checks {
		switch c.Key {
		case AWSCheckReadAccess:
			read = c.State == AWSCheckPass
		case AWSCheckEvents:
			events = c.State == AWSCheckSkipped
		}
	}
	return read && events
}

func withEventsCheck(checks []AWSCheck, check AWSCheck) []AWSCheck {
	out := append([]AWSCheck(nil), checks...)
	for i := range out {
		if out[i].Key == AWSCheckEvents {
			out[i] = check
			return out
		}
	}
	return append(out, check)
}

// waitingChecks are the three checks of an account that has asked for
// approval: none has run, and each says when it will.
func waitingChecks() []AWSCheck {
	checks := newChecks()
	for i := range checks {
		checks[i].State, checks[i].Fix = AWSCheckSkipped, ""
	}
	checks[0].Message = "Runs once the connection is approved: we then sign in to your account with your role and External ID."
	checks[1].Message = "Runs after the role check: one test read of your account."
	checks[2].Message = "Runs once the connection is approved: we then open our event queue to your account and wait for its first event."
	return checks
}

// askApprovalFirst puts a connection in front of the platform admins the moment
// it is asked for, before anything is checked. The account is saved as waiting
// for approval, one pending request is written for the onboarding tool and the
// admins are e-mailed. Asked again while the request is open, nothing changes
// and nobody is e-mailed twice - provided the request really is there for the
// admins to see: the account's own status is not proof of that.
func (s *AWSIntegrationService) askApprovalFirst(ctx context.Context, caller AWSCaller, settings *AWSTenantSettings, rec AWSAccountRecord, requestID int64, existing *AWSAccountRecord) (*AWSVerifyResponse, error) {
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	rec.Checks = waitingChecks()
	result := &AWSVerifyResponse{
		Status: AWSStatusPendingApproval, AccountID: rec.AccountID, RoleARN: rec.RoleARN, Regions: rec.Regions,
		Checks: rec.Checks, VerifiedAt: rec.LastVerifiedAt, Saved: true,
	}
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	saved, err := s.store.SaveApprovalAsk(saveCtx, caller.TenantID, caller.Schema, rec)
	if err != nil {
		return nil, err
	}
	if saved.Approval.Status == ApprovalPending {
		exists, err := s.store.HasPendingApproval(saveCtx, caller.TenantID, rec.AccountID)
		if err == nil && exists {
			log.Info("aws integration: connection already waits for approval")
			s.setRequestMail(ctx, requestID, "not_needed", "the request was already waiting; the admins were told then")
			return result, nil
		}
		log.Warn("aws integration: the account waits for approval but no pending request exists for the admins; asking again", "lookup_err", err)
	}
	domain := ""
	if settings != nil {
		domain = settings.Domain
	}
	events := map[string]any{"stage": "before any check"}
	// For the admin: another workspace already holds this account (proven), so
	// approving would end in a refusal and the asker may not own the account.
	if elsewhere, err := s.store.AccountClaimedByOther(saveCtx, caller.TenantID, rec.AccountID); err == nil && elsewhere {
		events["claimed_elsewhere"] = true
	}
	id, _, err := s.store.RequestApproval(saveCtx, ApprovalRequest{
		TenantID: caller.TenantID, Schema: caller.Schema, Domain: domain, Account: rec, Events: events, RequestedBy: caller.Actor,
	})
	if err != nil {
		log.Error("aws integration: recording the approval request failed", "err", err)
		return nil, err
	}
	log.Info("aws integration: connection asks for approval before any check", "approval_id", id)
	go func() {
		nctx, ncancel := context.WithTimeout(context.WithoutCancel(ctx), 90*time.Second)
		defer ncancel()
		s.notifyApprovers(nctx, id, caller, domain, rec, requestID)
	}()
	return result, nil
}

// ensureApprovalRequest repairs an account that waits for approval while no
// pending request exists in connection_approvals: without this it would wait
// forever, with nothing on the onboarding tool's Approvals page. The request is
// recreated as it was asked (same role, regions and requester) and the admins
// are e-mailed. Runs at most once at a time per account.
func (s *AWSIntegrationService) ensureApprovalRequest(ctx context.Context, caller AWSCaller, rec AWSAccountRecord) {
	if rec.Status != AWSStatusPendingApproval || rec.Approval.Status != ApprovalPending {
		return
	}
	key := watchKey{caller.TenantID, "approval:" + rec.AccountID}
	if _, busy := s.resuming.LoadOrStore(key, struct{}{}); busy {
		return
	}
	defer s.resuming.Delete(key)
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	exists, err := s.store.HasPendingApproval(ctx, caller.TenantID, rec.AccountID)
	if err != nil || exists {
		if err != nil {
			log.Warn("aws integration: could not check the approval request", "err", err)
		}
		return
	}
	settings, _ := s.store.TenantSettings(ctx, caller.TenantID)
	domain := ""
	if settings != nil {
		domain = settings.Domain
	}
	asker := caller
	if rec.Approval.RequestedBy != "" {
		asker.Actor = rec.Approval.RequestedBy
	}
	reqCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	id, _, err := s.store.RequestApproval(reqCtx, ApprovalRequest{
		TenantID: caller.TenantID, Schema: caller.Schema, Domain: domain, Account: rec,
		Events: map[string]any{"stage": "before any check", "recreated": true}, RequestedBy: asker.Actor,
	})
	if err != nil {
		log.Error("aws integration: the account waits for approval but its request is missing, and recreating it failed", "err", err)
		return
	}
	log.Warn("aws integration: the account waited for approval with no request for the admins; the request was recreated", "approval_id", id)
	go func() {
		nctx, ncancel := context.WithTimeout(context.WithoutCancel(ctx), 90*time.Second)
		defer ncancel()
		s.notifyApprovers(nctx, id, asker, domain, rec, 0)
	}()
}

// startEvents lets the account put events on the central bus (the queue the
// check reads is fed from it) and starts watching for its first event. It
// returns the events check as it now stands: running, or in error when our bus
// or queue is the problem (never a fix for the customer).
func (s *AWSIntegrationService) startEvents(ctx context.Context, caller AWSCaller, p awsconnect.Platform, settings *AWSTenantSettings, rec AWSAccountRecord) (AWSCheck, bool) {
	check := AWSCheck{Key: AWSCheckEvents, Label: "Events arrive from your account"}
	stepCtx, cancel := context.WithTimeout(ctx, awsPermissionBudget)
	err := s.verifier.AllowAccountOnBus(stepCtx, p, rec.AccountID)
	cancel()
	switch {
	case err != nil:
		logCheckError(ctx, caller.TenantID, rec.AccountID, "bus_permission", err)
		if errors.Is(err, awsconnect.ErrPlatformCredentials) {
			platformError(&check, err)
		} else {
			unavailable(&check)
		}
		return check, false
	case s.events == nil:
		logCheckError(ctx, caller.TenantID, rec.AccountID, check.Key, errors.New("no event queue: set NHI_AWS_EVENT_QUEUE_URL"))
		unavailable(&check)
		return check, false
	}
	logging.FromContext(ctx).Info("aws integration: account allowed on the event bus, watching for its first event",
		"tenant_id", caller.TenantID, "account_id", rec.AccountID)
	rec.Checks = withEventsCheck(rec.Checks, check) // the watcher's own copy
	return s.startWatch(caller, p, settings, rec), true
}

// awaitingChecks: an admin approved the account and none of its checks has run
// yet (the role check still says it waits for the approval).
func awaitingChecks(rec AWSAccountRecord) bool {
	if rec.Approval.Status != ApprovalApproved || rec.IsConnected {
		return false
	}
	for _, c := range rec.Checks {
		if c.Key == AWSCheckAssumeRole {
			return c.State == AWSCheckSkipped
		}
	}
	return false
}

// checksKey identifies the background run of an account's checks.
func checksKey(tenantID, accountID string) watchKey { return watchKey{tenantID, "checks:" + accountID} }

// checksRunning: this process is running the account's checks right now.
func (s *AWSIntegrationService) checksRunning(tenantID, accountID string) bool {
	_, ok := s.resuming.Load(checksKey(tenantID, accountID))
	return ok
}

// startApprovedChecks runs the role, read access and events checks of an
// account an admin has just approved. Nobody is waiting on a request any more
// (the customer asked earlier and the admin decided in another tool), so it
// runs in the background: the role check shows as running at once, and the
// page, which reads the account while it waits, follows the rest as it is
// saved. Once at a time per account.
func (s *AWSIntegrationService) startApprovedChecks(ctx context.Context, caller AWSCaller, rec *AWSAccountRecord) {
	if s.verifier == nil {
		return
	}
	key := checksKey(caller.TenantID, rec.AccountID)
	if _, busy := s.resuming.LoadOrStore(key, struct{}{}); busy {
		return
	}
	release := func() { s.resuming.Delete(key) }
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	// Another request may have started it while this one waited its turn.
	cur, err := s.store.GetAccount(ctx, caller.Schema, rec.AccountID)
	if err != nil || cur == nil || !awaitingChecks(*cur) {
		release()
		if err != nil {
			log.Warn("aws integration: could not re-read the approved account", "err", err)
		} else if cur != nil {
			*rec = *cur
		}
		return
	}
	p, settings, err := s.platform(ctx, caller.TenantID)
	if err != nil {
		release()
		return // platform() has logged why
	}
	role, err := awsconnect.ParseRoleARN(cur.RoleARN)
	if err != nil {
		release()
		log.Error("aws integration: the approved account's role ARN is not valid", "role_arn", cur.RoleARN, "err", err)
		return
	}
	// The role check shows as running before anything else is read, so a second
	// read of the page neither starts another run nor shows a stale "waiting".
	running := newChecks()
	running[0].State, running[0].Message = AWSCheckRunning, "Signing in to your account with your role."
	for i := 1; i < len(running); i++ {
		skip(&running[i])
	}
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.store.SaveChecks(saveCtx, caller.Schema, rec.AccountID, running); err != nil {
		release()
		log.Error("aws integration: saving the running check failed", "err", err)
		return
	}
	rec.Checks = running
	log.Info("aws integration: connection approved, running its checks", "approved_by", cur.Approval.DecidedBy)

	asker := caller
	if cur.Approval.RequestedBy != "" {
		asker.Actor = cur.Approval.RequestedBy
	}
	run := AWSAccountRecord{
		AccountID: cur.AccountID, RoleARN: cur.RoleARN, Regions: cur.Regions, ExternalID: settings.ExternalID,
		Status: AWSStatusPending, LastVerifiedAt: s.now().UTC(), LastVerifiedBy: asker.Actor,
	}
	go func() {
		defer release()
		bctx, bcancel := context.WithTimeout(context.WithoutCancel(ctx), awsVerifyBudget+10*time.Second)
		defer bcancel()
		res, err := s.runChecks(bctx, asker, p, settings, role, cur.Regions, run)
		outcome, detail := requestOutcome(res, err)
		if err != nil {
			log.Error("aws integration: the checks after approval did not finish", "err", err)
			// The role check was saved as running: say how it ended, or the page
			// would show it running for ever.
			stopped := newChecks()
			if errors.Is(err, ErrAWSAccountClaimed) {
				fail(&stopped[0], "This AWS account is already connected to another workspace. If it is yours, contact support.", "")
			} else {
				unavailable(&stopped[0])
			}
			skip(&stopped[1])
			skip(&stopped[2])
			sctx, scancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			_ = s.store.SaveChecks(sctx, caller.Schema, cur.AccountID, stopped)
			scancel()
			res = &AWSVerifyResponse{Checks: stopped}
		} else {
			logChecks(bctx, "aws integration: checks after approval finished", cur.AccountID, res.Checks, "status", res.Status, "watching_events", res.Watching)
		}
		fctx, fcancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer fcancel()
		var checks []AWSCheck
		if res != nil {
			checks = res.Checks
		}
		if ferr := s.store.FinishPendingRequest(fctx, caller.TenantID, cur.AccountID, outcome, detail, checks); ferr != nil {
			log.Warn("aws integration: recording the outcome after approval failed", "err", ferr)
		}
	}()
}

// resumeApproved starts the events check of an account an admin has approved
// since its last read: until then the check waits ("skipped"). The first read
// of the account after the approval - the page polls while it waits - starts it.
func (s *AWSIntegrationService) resumeApproved(ctx context.Context, caller AWSCaller, rec *AWSAccountRecord) {
	if awaitingChecks(*rec) {
		s.startApprovedChecks(ctx, caller, rec)
		return
	}
	if !awaitingEvents(*rec) || s.verifier == nil || s.watching(caller.TenantID, rec.AccountID) {
		return
	}
	key := watchKey{caller.TenantID, rec.AccountID}
	if _, busy := s.resuming.LoadOrStore(key, struct{}{}); busy {
		return
	}
	defer s.resuming.Delete(key)
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	// Another request may have started it while this one waited its turn.
	cur, err := s.store.GetAccount(ctx, caller.Schema, rec.AccountID)
	if err != nil || cur == nil || !awaitingEvents(*cur) {
		if err != nil {
			log.Warn("aws integration: could not re-read the approved account", "err", err)
		} else if cur != nil {
			*rec = *cur
		}
		return
	}
	p, settings, err := s.platform(ctx, caller.TenantID)
	if err != nil {
		return // platform() has logged why
	}
	log.Info("aws integration: connection approved, starting the events check", "approved_by", cur.Approval.DecidedBy)
	check, _ := s.startEvents(ctx, caller, p, settings, *cur)
	rec.Checks = withEventsCheck(cur.Checks, check)
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.store.SaveChecks(saveCtx, caller.Schema, rec.AccountID, rec.Checks); err != nil {
		log.Error("aws integration: saving the events check failed", "err", err)
	}
}

func pass(c *AWSCheck, message string) {
	c.State, c.Message, c.Fix = AWSCheckPass, message, ""
}

// awsDiagnoseTimeout bounds the two AWS calls that check our own side after a
// refusal (it runs inside awsVerifyBudget).
const awsDiagnoseTimeout = 4 * time.Second

// explainDenied turns AWS's refusal to let us assume the customer's role into
// the right answer. STS says AccessDenied whatever the cause, so our own side
// is checked first (who we call AWS as, in which account, and whether our own
// policies allow assuming that role):
//
//   - something is wrong on our side: the customer is told it is not theirs
//     to fix, and the log says exactly what to change;
//   - our side is verified: the cause is in the customer's role, and the
//     message says what must be true of it;
//   - our side could not be checked: the general message, as before.
func (s *AWSIntegrationService) explainDenied(ctx context.Context, caller AWSCaller, p awsconnect.Platform, role awsconnect.RoleARN, awsErr error, check *AWSCheck, result *AWSVerifyResponse) {
	dctx, cancel := context.WithTimeout(ctx, awsDiagnoseTimeout)
	d := s.verifier.DiagnoseAssumeRole(dctx, p, role)
	cancel()
	result.diagnosis = "aws: " + awsErr.Error() + " | " + d.Summary()
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", role.AccountID, "role_arn", role.ARN, "sts_region", p.Region,
		"check", check.Key, "err", awsErr, "our_side", d.Summary(), "caller_arn", d.CallerARN)
	// The customer sees what to check in their role (step 2 of the setup);
	// a fault of our own is only in the log, never named on the page.
	roleName := role.ARN[strings.LastIndex(role.ARN, "/")+1:]
	step2 := fmt.Sprintf("Check step 2 (Create the read-only role): the role %s must exist in account %s, and its trust policy must allow sts:AssumeRole for %s with your External ID exactly as shown on this page.", roleName, role.AccountID, p.AssumerRoleARN)
	switch {
	case d.OurFault():
		result.ourSide = true
		log.Error("aws integration: AssumeRole refused because of OUR setup, not the customer's; no customer can connect until it is fixed")
		fail(check, "AWS would not let us use the role "+roleName+". "+step2, "Check the role and its trust policy (step 2), then re-check")
	case d.OurSideClear():
		log.Info("aws integration: AssumeRole refused by the customer's role (our side checked and fine)")
		fail(check, "AWS refused the role "+roleName+" in your account. "+step2, "Fix the role's trust policy (step 2), then re-check")
	default:
		log.Info("aws integration: check failed in the customer's account (our side could not be fully checked)")
		fail(check, "AWS would not let us use the role "+roleName+". "+step2, "Check the role and its trust policy (step 2), then re-check")
	}
}

func fail(c *AWSCheck, message, fix string) {
	c.State, c.Message, c.Fix = AWSCheckFail, message, fix
}

func skip(c *AWSCheck) {
	c.State, c.Message, c.Fix = AWSCheckSkipped, "Runs once the check above passes.", ""
}

func unavailable(c *AWSCheck) {
	c.State, c.Message, c.Fix = AWSCheckError, "We could not run this check just now. Try again in a minute.", ""
}

// logCheckError keeps AWS's own error text in the server log only. A refusal
// of our own platform credentials is an operations problem (every tenant is
// affected), so it is logged as an error with what to do.
func logCheckError(ctx context.Context, tenantID, accountID, check string, err error) {
	log := logging.FromContext(ctx).With("tenant_id", tenantID, "account_id", accountID, "check", check, "err", err)
	switch {
	case errors.Is(err, awsconnect.ErrPlatformCredentials):
		log.Error("aws integration: OUR platform AWS credentials were refused (e.g. InvalidClientTokenId, ExpiredToken, SignatureDoesNotMatch). " +
			"Rotate or fix the API server's AWS credentials; no customer can connect until then")
	case errors.Is(err, context.DeadlineExceeded):
		log.Warn("aws integration: check timed out talking to AWS")
	default:
		log.Warn("aws integration: check could not run")
	}
}

// logCustomerDenied records AWS's refusal in the customer's account: the
// customer sees what to fix, support sees AWS's exact words here.
func logCustomerDenied(ctx context.Context, accountID, check string, err error) {
	logging.FromContext(ctx).Info("aws integration: check failed in the customer's account", "account_id", accountID, "check", check, "err", err)
}

// logChecks writes one line per finished check run: each check's state, and
// for every check that did not pass, the message the customer was shown.
// The level follows the worst state: an error on our side is a warning, a
// failure in the customer's setup is info.
func logChecks(ctx context.Context, msg, accountID string, checks []AWSCheck, extra ...any) {
	states := make([]string, 0, len(checks))
	var problems []string
	level := slog.LevelInfo
	for _, c := range checks {
		states = append(states, c.Key+"="+string(c.State))
		switch c.State {
		case AWSCheckPass, AWSCheckRunning, AWSCheckSkipped:
			continue
		case AWSCheckError:
			level = slog.LevelWarn
		}
		problems = append(problems, c.Key+": "+c.Message)
	}
	args := append([]any{"account_id", accountID, "checks", strings.Join(states, " ")}, extra...)
	if len(problems) > 0 {
		args = append(args, "problems", problems)
	}
	logging.FromContext(ctx).Log(ctx, level, msg, args...)
}

func humanHours(d time.Duration) string {
	hours := int(d.Round(time.Hour) / time.Hour)
	switch {
	case hours <= 1:
		return "hour"
	case hours%24 == 0 && hours > 24:
		return fmt.Sprintf("%d days", hours/24)
	default:
		return fmt.Sprintf("%d hours", hours)
	}
}

func orDefault(value, fallback string) string {
	if v := strings.TrimSpace(value); v != "" {
		return v
	}
	return fallback
}
