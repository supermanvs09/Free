package awsintegration

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/githubcheck"
)

const (
	awsTestTenant  = "11111111-1111-1111-1111-111111111111"
	awsTestRoleARN = "arn:aws:iam::222222222222:role/NHIPlatformCollector"
	awsTestSecret  = "arn:aws:secretsmanager:us-east-1:222222222222:secret:nhi/github-token-AbCdEf"
)

var awsTestCaller = AWSCaller{TenantID: awsTestTenant, Schema: "tenant_a", Actor: "alice@acme.test"}

// ── fakes ────────────────────────────────────────────────────────────────

type fakeAWSStore struct {
	mu        sync.Mutex
	settings  *AWSTenantSettings
	accounts  map[string]AWSAccountRecord // per account, single tenant
	claimed   bool
	saved     []ExposureUpdate
	approvals []ApprovalRequest
	emails    map[int64]string
	withdrawn []string
	linkErr   error                       // CreateApprovalLinks fails with it
	links     map[int64]map[string]string // approval id -> address -> token
}

func newFakeAWSStore() *fakeAWSStore {
	return &fakeAWSStore{
		settings: &AWSTenantSettings{
			Domain:       "acme.com",
			AWSAccountID: "999999999999",
			ExternalID:   "ext-0123456789abcdef0123456789abcdef",
			EventBusARN:  "arn:aws:events:ap-south-1:999999999999:event-bus/nhi-central-bus",
		},
		accounts: map[string]AWSAccountRecord{},
		emails:   map[int64]string{},
	}
}

func (f *fakeAWSStore) SaveCheckStart(_ context.Context, _, _ string, rec AWSAccountRecord) (*AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.claimed {
		return nil, ErrAWSAccountClaimedByTenant
	}
	if prev, ok := f.accounts[rec.AccountID]; ok {
		prev.RoleARN, prev.Regions, prev.Checks, prev.LastVerifiedAt = rec.RoleARN, rec.Regions, rec.Checks, rec.LastVerifiedAt
		f.accounts[rec.AccountID] = prev
		return &prev, nil
	}
	rec.Status = AWSStatusPending
	f.accounts[rec.AccountID] = rec
	return &rec, nil
}

func (f *fakeAWSStore) SaveChecks(_ context.Context, _, accountID string, checks []AWSCheck) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec := f.accounts[accountID]
	rec.Checks = append([]AWSCheck(nil), checks...)
	f.accounts[accountID] = rec
	return nil
}

func (f *fakeAWSStore) RequestApproval(_ context.Context, req ApprovalRequest) (int64, *AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec := f.accounts[req.Account.AccountID]
	rec.Checks = req.Account.Checks
	rec.Status, rec.IsConnected = AWSStatusPendingApproval, false
	rec.Approval = AWSApproval{Status: ApprovalPending, RequestedBy: req.RequestedBy}
	f.accounts[rec.AccountID] = rec
	f.approvals = append(f.approvals, req)
	return int64(len(f.approvals)), &rec, nil
}

func (f *fakeAWSStore) SetApprovalEmail(_ context.Context, id int64, status, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.emails[id] = status
	return nil
}

func (f *fakeAWSStore) WithdrawApprovals(_ context.Context, _, accountID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.withdrawn = append(f.withdrawn, accountID)
	return nil
}

// CreateApprovalLinks hands out a distinct token per address, as the real one does.
func (f *fakeAWSStore) CreateApprovalLinks(_ context.Context, id int64, emails []string, _ time.Duration) (map[string]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.linkErr != nil {
		return nil, f.linkErr
	}
	if f.links == nil {
		f.links = map[int64]map[string]string{}
	}
	out := map[string]string{}
	for _, e := range emails {
		out[e] = fmt.Sprintf("tok-%d-%s", id, strings.ToLower(e))
	}
	f.links[id] = out
	return out, nil
}

func (f *fakeAWSStore) account(id string) AWSAccountRecord {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.accounts[id]
}

func (f *fakeAWSStore) TenantSettings(context.Context, string) (*AWSTenantSettings, error) {
	return f.settings, nil
}

func (f *fakeAWSStore) ListAccounts(context.Context, string) ([]AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []AWSAccountRecord{}
	for _, rec := range f.accounts {
		out = append(out, rec)
	}
	return out, nil
}

func (f *fakeAWSStore) GetAccount(_ context.Context, _, accountID string) (*AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.accounts[accountID]
	if !ok {
		return nil, nil
	}
	return &rec, nil
}

func (f *fakeAWSStore) AccountClaimedByOther(context.Context, string, string) (bool, error) {
	return f.claimed, nil
}

func (f *fakeAWSStore) SaveVerification(_ context.Context, _, _ string, rec AWSAccountRecord) (*AWSAccountRecord, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	prev, existed := f.accounts[rec.AccountID]
	passed := rec.Status == AWSStatusConnected
	queue := passed && (!existed || prev.ConnectedAt == nil)
	if existed {
		rec.ConnectedAt = prev.ConnectedAt
	}
	rec.IsConnected = passed
	switch {
	case passed:
		rec.Status = AWSStatusConnected
		if rec.ConnectedAt == nil {
			t := rec.LastVerifiedAt
			rec.ConnectedAt = &t
		}
	case rec.ConnectedAt != nil:
		rec.Status = AWSStatusActionNeeded
	default:
		rec.Status = AWSStatusPending
	}
	rec.SyncStatus = AWSSyncIdle
	if queue {
		rec.SyncStatus = AWSSyncQueued
	}
	f.accounts[rec.AccountID] = rec
	return &rec, queue, nil
}

func (f *fakeAWSStore) UpdateRegions(_ context.Context, _, _, accountID string, regions []string) (*AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.accounts[accountID]
	if !ok {
		return nil, ErrAWSAccountNotFound
	}
	rec.Regions = regions
	f.accounts[accountID] = rec
	return &rec, nil
}

func (f *fakeAWSStore) SaveExposure(_ context.Context, _, accountID string, u ExposureUpdate) (*AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.accounts[accountID]
	if !ok {
		return nil, ErrAWSAccountNotFound
	}
	f.saved = append(f.saved, u)
	if u.GitHub != nil {
		rec.GitHubConnected, rec.GitHubChecks, rec.GitHubSecretARN = u.GitHub.Connected, u.GitHub.Checks, u.GitHub.SecretARN
	}
	if u.CodeCommit != nil {
		rec.CodeCommitConnected, rec.CodeCommitChecks = u.CodeCommit.Connected, u.CodeCommit.Checks
	}
	f.accounts[accountID] = rec
	return &rec, nil
}

func (f *fakeAWSStore) CancelSync(_ context.Context, _, accountID string) (*AWSAccountRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.accounts[accountID]
	if !ok {
		return nil, ErrAWSAccountNotFound
	}
	switch rec.SyncStatus {
	case AWSSyncRunning:
		return &rec, ErrAWSSyncRunning
	case AWSSyncQueued:
		rec.SyncStatus = AWSSyncIdle
		f.accounts[accountID] = rec
		return &rec, nil
	}
	return &rec, ErrAWSSyncNotQueued
}

func (f *fakeAWSStore) RequestSync(_ context.Context, _, accountID, actor string, at time.Time) (*AWSAccountRecord, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.accounts[accountID]
	switch {
	case !ok:
		return nil, false, ErrAWSAccountNotFound
	case !rec.IsConnected:
		return &rec, false, ErrAWSAccountNotConnected
	case rec.SyncStatus == AWSSyncQueued || rec.SyncStatus == AWSSyncRunning:
		return &rec, true, nil
	}
	rec.SyncStatus, rec.SyncRequestedBy, rec.SyncRequestedAt = AWSSyncQueued, actor, &at
	f.accounts[accountID] = rec
	return &rec, false, nil
}

func (f *fakeAWSStore) DeleteAccount(_ context.Context, _, _, accountID string) (map[string]int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.accounts[accountID]; !ok {
		return nil, ErrAWSAccountNotFound
	}
	delete(f.accounts, accountID)
	return map[string]int64{}, nil
}

type fakeVerifier struct {
	mu          sync.Mutex
	assumeErr   error
	readErr     error
	busErr      error
	busCalls    int
	revoked     []string
	ccList      awsconnect.CodeCommitResult
	ccListErr   error
	ccReadErr   error
	ccRegions   []string
	secretToken string
	secretErr   error
	assumeGate  chan struct{} // when set, AssumeRole waits on it
}

func (v *fakeVerifier) AssumeRole(ctx context.Context, _ awsconnect.Platform, _ awsconnect.RoleARN, _ string) (*awsconnect.Session, error) {
	if v.assumeGate != nil {
		select {
		case <-v.assumeGate:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if v.assumeErr != nil {
		return nil, v.assumeErr
	}
	return &awsconnect.Session{}, nil
}
func (v *fakeVerifier) TestRead(context.Context, *awsconnect.Session) error { return v.readErr }
func (v *fakeVerifier) AllowAccountOnBus(context.Context, awsconnect.Platform, string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.busCalls++
	return v.busErr
}
func (v *fakeVerifier) RevokeAccountOnBus(_ context.Context, _ awsconnect.Platform, id string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.revoked = append(v.revoked, id)
	return nil
}
func (v *fakeVerifier) ListCodeCommit(_ context.Context, _ *awsconnect.Session, regions []string) (awsconnect.CodeCommitResult, error) {
	v.ccRegions = regions
	return v.ccList, v.ccListErr
}
func (v *fakeVerifier) ProbeCodeCommit(_ context.Context, _ *awsconnect.Session, region, repo string) awsconnect.RepoProbe {
	p := awsconnect.RepoProbe{Region: region, Repository: repo, Branch: "main", Files: 2}
	if v.ccReadErr != nil {
		p.Denied = []string{"codecommit:GetBlob"}
	}
	return p
}
func (v *fakeVerifier) ReadSecretToken(context.Context, *awsconnect.Session, awsconnect.SecretARN) (string, error) {
	return v.secretToken, v.secretErr
}

// fakeEvents: found delivers an event from every region asked about in
// `regions` (default: the usual test regions) on each poll.
type fakeEvents struct {
	found   bool
	regions []string
	err     error
}

func (e fakeEvents) PollEvents(context.Context, awsconnect.Platform, string) (awsconnect.EventPoll, error) {
	out := awsconnect.EventPoll{Regions: map[string]int{}, Seen: 10}
	if e.err != nil {
		return out, e.err
	}
	if e.found {
		regions := e.regions
		if regions == nil {
			regions = []string{"us-east-1", "ap-south-1", "eu-west-1"}
		}
		for _, r := range regions {
			out.Regions[r]++
		}
	}
	return out, nil
}

type fakeMailer struct {
	mu         sync.Mutex
	sent       []string          // subject of every message
	err        error             // Send / SendTo fail with it
	recipients []string          // default: one approver
	bodies     map[string]string // address -> html + text of what it was sent (SendTo)
	failFor    map[string]bool   // SendTo fails for these addresses
}

func (m *fakeMailer) Configured() bool { return true }
func (m *fakeMailer) To() []string {
	if len(m.recipients) > 0 {
		return m.recipients
	}
	return []string{"approver@platform.test"}
}

func (m *fakeMailer) SendTo(_ context.Context, to, subject, html, text string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failFor[to] {
		return errors.New("rejected by the mail service")
	}
	if m.err != nil {
		return m.err
	}
	if m.bodies == nil {
		m.bodies = map[string]string{}
	}
	m.bodies[to] = subject + "\n" + html + "\n" + text
	m.sent = append(m.sent, subject)
	return nil
}
func (m *fakeMailer) Send(_ context.Context, subject, _, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, subject)
	return m.err
}

type fakeGitHub struct {
	res   githubcheck.Result
	err   error
	token string
}

func (g *fakeGitHub) Check(_ context.Context, token string) (githubcheck.Result, error) {
	g.token = token
	return g.res, g.err
}

func newTestService(store *fakeAWSStore, v *fakeVerifier, gh *fakeGitHub, events AWSEventSource) *AWSIntegrationService {
	var verifier AWSVerifier
	if v != nil {
		verifier = v
	}
	var github GitHubChecker
	if gh != nil {
		github = gh
	}
	svc := NewAWSIntegrationService(store, verifier, github, events, AWSIntegrationOptions{EventWaitLimit: 400 * time.Millisecond})
	svc.testPoll = 20 * time.Millisecond
	return svc
}

// settle waits for the events check of an account to finish (its state is no
// longer running and no watcher is left).
func settle(t *testing.T, svc *AWSIntegrationService, store *fakeAWSStore, accountID string) AWSAccountRecord {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if !svc.watching(awsTestTenant, accountID) {
			return store.account(accountID)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the events check never finished")
	return AWSAccountRecord{}
}

func states(checks []AWSCheck) string {
	out := make([]string, len(checks))
	for i, c := range checks {
		out[i] = c.State
	}
	return strings.Join(out, ",")
}

// connectedAccount puts a connected account in the store.
func connectedAccount(store *fakeAWSStore) {
	at := time.Now().UTC()
	store.accounts["222222222222"] = AWSAccountRecord{
		AccountID: "222222222222", RoleARN: awsTestRoleARN, Regions: []string{"us-east-1", "eu-west-1"},
		Status: AWSStatusConnected, IsConnected: true, ConnectedAt: &at,
	}
}

// approvedAccount: an admin approved it; its events check has not run.
func approvedAccount(store *fakeAWSStore) {
	at := time.Now().UTC()
	store.accounts["222222222222"] = AWSAccountRecord{
		AccountID: "222222222222", RoleARN: awsTestRoleARN, Regions: []string{"us-east-1", "eu-west-1"},
		Status:   AWSStatusPending,
		Approval: AWSApproval{Status: ApprovalApproved, DecidedBy: "super admin test", DecidedAt: &at},
		Checks: []AWSCheck{
			{Key: AWSCheckAssumeRole, State: AWSCheckPass}, {Key: AWSCheckReadAccess, State: AWSCheckPass},
			{Key: AWSCheckEvents, State: AWSCheckSkipped},
		},
	}
}

// approve is what the tenant-onboarding tool does to the account's row.
func (f *fakeAWSStore) approve(id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec := f.accounts[id]
	at := time.Now().UTC()
	rec.Approval = AWSApproval{Status: ApprovalApproved, DecidedBy: "super admin test", DecidedAt: &at}
	rec.Status = AWSStatusPending
	f.accounts[id] = rec
}

// mailArrives waits for the approvers' e-mail, which is sent in the background.
func mailArrives(t *testing.T, m *fakeMailer, store *fakeAWSStore) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		m.mu.Lock()
		n := len(m.sent)
		m.mu.Unlock()
		store.mu.Lock()
		status := store.emails[1]
		store.mu.Unlock()
		// The outcome is recorded last, whether or not anyone could be reached.
		if status != "" {
			_ = n
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the approvers were never e-mailed")
}

// ── verify ───────────────────────────────────────────────────────────────

// The order is role, read access, approval, then events. A first connection
// whose role can read the account is put in front of the platform admins at
// once: it is not connected, nothing is let onto the bus, no events are watched
// and no sync is queued until an admin approves; the approvers are e-mailed.
func TestVerifyFirstConnectionAsksForApprovalBeforeEvents(t *testing.T) {
	store := newFakeAWSStore()
	v := &fakeVerifier{}
	svc := newTestService(store, v, nil, fakeEvents{found: true})
	mail := &fakeMailer{}
	svc.mailer = mail
	res, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"ap-south-1", "us-east-1"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Watching || res.Status != AWSStatusPendingApproval || !res.Saved || states(res.Checks) != "pass,pass,skipped" {
		t.Fatalf("verify returned %+v", res)
	}
	if !strings.Contains(res.Checks[2].Message, "after adapID approves") {
		t.Fatalf("the events check does not say why it waits: %q", res.Checks[2].Message)
	}
	if got := strings.Join(res.Regions, ","); got != "us-east-1,ap-south-1" {
		t.Fatalf("regions in catalogue order: %s", got)
	}
	if v.busCalls != 0 || svc.watching(awsTestTenant, "222222222222") {
		t.Fatalf("the account was let onto the bus (%d calls) or watched before approval", v.busCalls)
	}
	rec := store.account("222222222222")
	if rec.Status != AWSStatusPendingApproval || rec.IsConnected || rec.Approval.Status != ApprovalPending || rec.SyncStatus == AWSSyncQueued || len(store.approvals) != 1 {
		t.Fatalf("after the request: %+v (%d requests)", rec, len(store.approvals))
	}
	mailArrives(t, mail, store)
	if store.emails[1] != "sent" {
		t.Fatalf("e-mail outcome: %v", store.emails)
	}

	// Verifying again while it waits changes nothing and e-mails nobody twice.
	if res, err = svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil || res.Status != AWSStatusPendingApproval {
		t.Fatalf("second verify: %+v %v", res, err)
	}
	if len(store.approvals) != 1 || len(mail.sent) != 1 {
		t.Fatalf("asked again: %d requests, %d e-mails", len(store.approvals), len(mail.sent))
	}
}

// Once an admin approves, the next read of the account lets it onto the bus
// and starts the events check; the first event connects it and queues its sync.
func TestApprovalStartsTheEventsCheckThenConnects(t *testing.T) {
	store := newFakeAWSStore()
	v := &fakeVerifier{}
	svc := newTestService(store, v, nil, fakeEvents{found: true})
	svc.mailer = &fakeMailer{}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	// Reading while it waits starts nothing.
	if _, err := svc.Get(context.Background(), awsTestCaller, true); err != nil {
		t.Fatal(err)
	}
	if v.busCalls != 0 || svc.watching(awsTestTenant, "222222222222") {
		t.Fatal("read before approval started the events check")
	}

	store.approve("222222222222")
	out, err := svc.Get(context.Background(), awsTestCaller, true)
	if err != nil {
		t.Fatal(err)
	}
	if v.busCalls != 1 {
		t.Fatalf("bus allowed %d times, want 1", v.busCalls)
	}
	if got := states(out.Accounts[0].Checks); got != "pass,pass,running" {
		t.Fatalf("right after the approval the page sees %s", got)
	}
	// Reading again meanwhile must not start a second watch.
	if _, err := svc.Get(context.Background(), awsTestCaller, true); err != nil {
		t.Fatal(err)
	}
	rec := settle(t, svc, store, "222222222222")
	if v.busCalls != 1 {
		t.Fatalf("a second read started another check: %d bus calls", v.busCalls)
	}
	if rec.Status != AWSStatusConnected || !rec.IsConnected || rec.SyncStatus != AWSSyncQueued || states(rec.Checks) != "pass,pass,pass" {
		t.Fatalf("after the first event: %+v", rec)
	}
}

// Approved, but no event arrives in time: not connected, the check says what
// to look at and can be run again, which goes straight to events (no second
// approval).
func TestApprovedButNoEventsCanBeRetried(t *testing.T) {
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{})
	svc.mailer = &fakeMailer{}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	store.approve("222222222222")
	if _, err := svc.Get(context.Background(), awsTestCaller, true); err != nil {
		t.Fatal(err)
	}
	rec := settle(t, svc, store, "222222222222")
	if rec.Checks[2].State != AWSCheckFail || rec.IsConnected || rec.Approval.Status != ApprovalApproved {
		t.Fatalf("no events: %+v", rec)
	}
	// Later reads leave a failed check alone: only "Check again" re-runs it.
	if _, err := svc.Get(context.Background(), awsTestCaller, true); err != nil {
		t.Fatal(err)
	}
	if svc.watching(awsTestTenant, "222222222222") {
		t.Fatal("a failed events check was restarted by a read")
	}
	svc2 := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	res, err := svc2.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"})
	if err != nil || !res.Watching {
		t.Fatalf("re-check of an approved account: %+v %v", res, err)
	}
	if rec := settle(t, svc2, store, "222222222222"); rec.Status != AWSStatusConnected || len(store.approvals) != 1 {
		t.Fatalf("got %s with %d approval requests", rec.Status, len(store.approvals))
	}
}

// Our own bus failing is an error on our side, for an approved account both
// when it is re-checked and when its approval is picked up.
func TestBusErrorOnAnApprovedAccount(t *testing.T) {
	store := newFakeAWSStore()
	approvedAccount(store)
	svc := newTestService(store, &fakeVerifier{busErr: errors.New("throttled")}, nil, fakeEvents{found: true})
	res, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"})
	if err != nil || states(res.Checks) != "pass,pass,error" || !res.Saved || res.Watching {
		t.Fatalf("re-check: %+v %v", res, err)
	}

	store = newFakeAWSStore()
	svc = newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	svc.mailer = &fakeMailer{}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	store.approve("222222222222")
	svc.verifier = &fakeVerifier{busErr: errors.New("throttled")}
	out, err := svc.Get(context.Background(), awsTestCaller, true)
	if err != nil {
		t.Fatal(err)
	}
	if got := states(out.Accounts[0].Checks); got != "pass,pass,error" || svc.watching(awsTestTenant, "222222222222") {
		t.Fatalf("approval pickup with a failing bus: %s", got)
	}
}

// A rejected connection that is fixed and verified again is asked again.
func TestRejectedConnectionIsAskedAgain(t *testing.T) {
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	svc.mailer = &fakeMailer{}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	rec := store.accounts["222222222222"]
	rec.Approval = AWSApproval{Status: "rejected", Note: "wrong account"}
	rec.Status = AWSStatusRejected
	store.accounts["222222222222"] = rec
	store.mu.Unlock()
	if res, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil || res.Status != AWSStatusPendingApproval {
		t.Fatalf("verify after rejection: %+v %v", res, err)
	}
	if len(store.approvals) != 2 {
		t.Fatalf("%d approval requests, want a new one", len(store.approvals))
	}
}

// An account already approved (or connected before approvals existed) is
// re-checked without asking again: it stays connected.
func TestRecheckOfApprovedAccountNeedsNoApproval(t *testing.T) {
	store := newFakeAWSStore()
	connectedAccount(store)
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	if rec := store.account("222222222222"); !rec.IsConnected {
		t.Fatal("a re-check took a working connection down while it ran")
	}
	rec := settle(t, svc, store, "222222222222")
	if rec.Status != AWSStatusConnected || len(store.approvals) != 0 {
		t.Fatalf("got %s with %d approvals", rec.Status, len(store.approvals))
	}
}

// The events check passes on the first region that delivers; the regions not
// heard from (here us-east-1, for IAM's global events) are named. None by the
// time limit is a failure.
func TestEventsCheckRegions(t *testing.T) {
	store := newFakeAWSStore()
	approvedAccount(store)
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true, regions: []string{"ap-south-1"}})
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"ap-south-1"}); err != nil {
		t.Fatal(err)
	}
	rec := settle(t, svc, store, "222222222222")
	ev := rec.Checks[2]
	if ev.State != AWSCheckPass || !strings.Contains(ev.Message, "us-east-1") || len(ev.Regions) != 2 {
		t.Fatalf("partial events: %+v", ev)
	}
	if rec.Status != AWSStatusConnected {
		t.Fatalf("one region is enough to connect, with the missing regions shown: %s", rec.Status)
	}

	store = newFakeAWSStore()
	approvedAccount(store)
	svc = newTestService(store, &fakeVerifier{}, nil, fakeEvents{})
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	rec = settle(t, svc, store, "222222222222")
	if rec.Checks[2].State != AWSCheckFail || rec.Status != AWSStatusPending || len(store.approvals) != 0 {
		t.Fatalf("no events: %+v", rec)
	}
}

// Our own credentials refused: an error on our side, never a fix for them.
func TestPlatformCredentialErrorsAreOurs(t *testing.T) {
	store := newFakeAWSStore()
	res, err := newTestService(store, &fakeVerifier{assumeErr: awsconnect.ErrPlatformCredentials}, nil, fakeEvents{found: true}).
		Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Checks[0].State != AWSCheckError || res.Checks[0].Fix != "" || !strings.Contains(res.Checks[0].Message, "on our side") {
		t.Fatalf("got %+v", res.Checks[0])
	}
	store = newFakeAWSStore()
	approvedAccount(store)
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{err: awsconnect.ErrPlatformCredentials})
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	rec := settle(t, svc, store, "222222222222")
	if rec.Checks[2].State != AWSCheckError || !strings.Contains(rec.Checks[2].Message, "on our side") {
		t.Fatalf("queue read with refused credentials: %+v", rec.Checks[2])
	}
}

func TestVerifyOutcomes(t *testing.T) {
	cases := []struct {
		name   string
		v      *fakeVerifier
		events fakeEvents
		want   string
		saved  bool
		fix    string
	}{
		{"assume denied", &fakeVerifier{assumeErr: awsconnect.ErrAccessDenied}, fakeEvents{found: true}, "fail,skipped,skipped", false, "Check the trust policy names our role and your External ID exactly"},
		{"assume unavailable", &fakeVerifier{assumeErr: errors.New("dial")}, fakeEvents{found: true}, "error,skipped,skipped", false, ""},
		{"no read", &fakeVerifier{readErr: awsconnect.ErrAccessDenied}, fakeEvents{found: true}, "pass,fail,skipped", true, "Attach SecurityAudit and ViewOnlyAccess to NHIPlatformCollector"},
		{"approval first", &fakeVerifier{}, fakeEvents{found: true}, "pass,pass,skipped", true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeAWSStore()
			res, err := newTestService(store, tc.v, nil, tc.events).Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"})
			if err != nil {
				t.Fatal(err)
			}
			if states(res.Checks) != tc.want || res.Saved != tc.saved || res.Status == AWSStatusConnected {
				t.Fatalf("got %s saved=%v status=%s", states(res.Checks), res.Saved, res.Status)
			}
			if tc.saved && res.Status != AWSStatusPending && res.Status != AWSStatusPendingApproval {
				t.Fatalf("never connected should be pending, got %s", res.Status)
			}
			if tc.fix != "" && !strings.Contains(fmtChecks(res.Checks), tc.fix) {
				t.Fatalf("missing fix %q in %+v", tc.fix, res.Checks)
			}
			if !tc.saved && len(store.accounts) != 0 {
				t.Fatal("saved an account whose role could not be assumed")
			}
		})
	}
}

func fmtChecks(c []AWSCheck) string {
	var b strings.Builder
	for _, x := range c {
		b.WriteString(x.Fix + "|")
	}
	return b.String()
}

func TestVerifyFailingAfterConnectIsActionNeeded(t *testing.T) {
	store := newFakeAWSStore()
	connectedAccount(store)
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{})
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	if rec := settle(t, svc, store, "222222222222"); rec.Status != AWSStatusActionNeeded {
		t.Fatalf("got %s", rec.Status)
	}
}

func TestVerifyRejectsBadInput(t *testing.T) {
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	var arnErr *awsconnect.ErrInvalidRoleARN
	if _, err := svc.Verify(context.Background(), awsTestCaller, "arn:aws:iam::999999999999:role/X", []string{"us-east-1"}); !errors.As(err, &arnErr) {
		t.Fatalf("our own account: %v", err)
	}
	var regErr *awsconnect.ErrInvalidRegions
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, nil); !errors.As(err, &regErr) {
		t.Fatalf("no regions: %v", err)
	}
	store.settings.Regions = []string{"us-east-1"}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"eu-west-1"}); !errors.As(err, &regErr) {
		t.Fatalf("region outside collector_regions: %v", err)
	}
	store.claimed = true
	store.settings.Regions = nil
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); !errors.Is(err, ErrAWSAccountClaimed) {
		t.Fatalf("claimed: %v", err)
	}
}

func TestVerifyNeedsTenantValuesAndAWS(t *testing.T) {
	store := newFakeAWSStore()
	store.settings.EventBusARN = ""
	if _, err := newTestService(store, &fakeVerifier{}, nil, nil).Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); !errors.Is(err, ErrAWSTenantNotConfigured) {
		t.Fatalf("got %v", err)
	}
	if _, err := newTestService(newFakeAWSStore(), nil, nil, nil).Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); !errors.Is(err, ErrAWSUnavailable) {
		t.Fatalf("got %v", err)
	}
}

func TestOneCheckPerTenantAtATime(t *testing.T) {
	gate := make(chan struct{})
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{assumeGate: gate}, nil, fakeEvents{found: true})
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"})
	}()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, busy := svc.running.Load(awsTestTenant); busy {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("first check never started")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); !errors.Is(err, ErrAWSVerifyInProgress) {
		t.Fatalf("second check: %v", err)
	}
	close(gate)
	<-done
}

// ── get ──────────────────────────────────────────────────────────────────

func TestGetFlagsAndSetup(t *testing.T) {
	store := newFakeAWSStore()
	connectedAccount(store)
	store.settings.Regions = []string{"us-east-1", "eu-west-1"}
	svc := newTestService(store, &fakeVerifier{}, nil, nil)
	res, err := svc.Get(context.Background(), awsTestCaller, true)
	if err != nil {
		t.Fatal(err)
	}
	if !res.HasConnectedAccount || res.ExposureEnabled || res.Status != AWSStatusConnected || res.Workspace.Domain != "acme.com" {
		t.Fatalf("got %+v", res)
	}
	if res.Setup == nil || len(res.Setup.Regions) != 2 || len(res.Setup.Exposure.CodeCommit.Actions) != 4 || res.Setup.Exposure.GitHub.SecretPrefix != "nhi/github" {
		t.Fatalf("setup %+v", res.Setup)
	}
	rec := store.accounts["222222222222"]
	rec.CodeCommitConnected = true
	store.accounts["222222222222"] = rec
	res, _ = svc.Get(context.Background(), awsTestCaller, false)
	if !res.ExposureEnabled || res.Setup != nil {
		t.Fatalf("non-admin: %+v", res)
	}
}

// ── exposure ─────────────────────────────────────────────────────────────

func TestExposureCodeCommit(t *testing.T) {
	cases := []struct {
		name      string
		v         *fakeVerifier
		connected bool
		want      string
		fix       string
	}{
		{"enabled", &fakeVerifier{ccList: awsconnect.CodeCommitResult{Repositories: 3, Regions: []string{"us-east-1"}, SampleRepository: "api", SampleRegion: "us-east-1", Repos: []awsconnect.RepoRef{{Region: "us-east-1", Name: "api"}}}}, true, "pass,pass", ""},
		{"no repositories yet", &fakeVerifier{ccList: awsconnect.CodeCommitResult{Regions: []string{"us-east-1"}}}, true, "pass,skipped", ""},
		{"cannot list", &fakeVerifier{ccListErr: awsconnect.ErrAccessDenied}, false, "fail,skipped", "Keep ViewOnlyAccess attached to the role: it allows codecommit:ListRepositories"},
		{"list only", &fakeVerifier{ccList: awsconnect.CodeCommitResult{Repositories: 1, Regions: []string{"us-east-1"}, SampleRepository: "api", SampleRegion: "us-east-1", Repos: []awsconnect.RepoRef{{Region: "us-east-1", Name: "api"}}}, ccReadErr: awsconnect.ErrAccessDenied}, false, "pass,fail", "Add codecommit:GetBlob for those repositories (the policy is on the setup page)"},
		{"role gone", &fakeVerifier{assumeErr: awsconnect.ErrAccessDenied}, false, "fail,skipped", "Re-check the account connection"},
		{"aws error", &fakeVerifier{ccListErr: errors.New("timeout")}, false, "error,skipped", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeAWSStore()
			connectedAccount(store)
			res, err := newTestService(store, tc.v, nil, nil).SetExposure(context.Background(), awsTestCaller, "222222222222", AWSExposureRequest{CodeCommit: true})
			if err != nil {
				t.Fatal(err)
			}
			cc := res.Account.Exposure.CodeCommit
			if cc.Connected != tc.connected || states(cc.Checks) != tc.want || res.ExposureEnabled != tc.connected {
				t.Fatalf("got connected=%v %s enabled=%v", cc.Connected, states(cc.Checks), res.ExposureEnabled)
			}
			if tc.fix != "" && !strings.Contains(fmtChecks(cc.Checks), tc.fix) {
				t.Fatalf("missing fix %q: %+v", tc.fix, cc.Checks)
			}
			if tc.name == "enabled" && strings.Join(tc.v.ccRegions, ",") != "us-east-1,eu-west-1" {
				t.Fatalf("checked regions %v, want the account's", tc.v.ccRegions)
			}
		})
	}
}

func TestExposureGitHub(t *testing.T) {
	cases := []struct {
		name      string
		v         *fakeVerifier
		gh        *fakeGitHub
		connected bool
		want      string
		fix       string
	}{
		{"enabled", &fakeVerifier{secretToken: "ghp_T0kenValue9f8e"}, &fakeGitHub{res: githubcheck.Result{Login: "bot", Repositories: 4}}, true, "pass,pass", ""},
		{"secret missing", &fakeVerifier{secretErr: awsconnect.ErrSecretNotFound}, &fakeGitHub{}, false, "fail,skipped", "Check the secret ARN"},
		{"secret denied", &fakeVerifier{secretErr: awsconnect.ErrAccessDenied}, &fakeGitHub{}, false, "fail,skipped", "Add the secret read policy to the role"},
		{"kms denied", &fakeVerifier{secretErr: awsconnect.ErrKMSDenied}, &fakeGitHub{}, false, "fail,skipped", "Allow kms:Decrypt on the secret's key"},
		{"empty secret", &fakeVerifier{secretErr: awsconnect.ErrSecretEmpty}, &fakeGitHub{}, false, "fail,skipped", "Store the GitHub token as the secret value"},
		{"token rejected", &fakeVerifier{secretToken: "ghp_T0kenValue9f8e"}, &fakeGitHub{err: githubcheck.ErrTokenRejected}, false, "pass,fail", "Create a new token and update the secret"},
		{"no repositories", &fakeVerifier{secretToken: "ghp_T0kenValue9f8e"}, &fakeGitHub{err: githubcheck.ErrNoRepositories}, false, "pass,fail", "Give the token access to your repositories"},
		{"no contents", &fakeVerifier{secretToken: "ghp_T0kenValue9f8e"}, &fakeGitHub{err: githubcheck.ErrNoContents}, false, "pass,fail", "Give the token Contents: Read-only"},
		{"github down", &fakeVerifier{secretToken: "ghp_T0kenValue9f8e"}, &fakeGitHub{err: githubcheck.ErrUnavailable}, false, "pass,error", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeAWSStore()
			connectedAccount(store)
			res, err := newTestService(store, tc.v, tc.gh, nil).SetExposure(context.Background(), awsTestCaller, "222222222222",
				AWSExposureRequest{GitHub: true, GitHubSecretARN: awsTestSecret})
			if err != nil {
				t.Fatal(err)
			}
			gh := res.Account.Exposure.GitHub
			if gh.Connected != tc.connected || states(gh.Checks) != tc.want || gh.SecretARN != awsTestSecret {
				t.Fatalf("got connected=%v %s arn=%q", gh.Connected, states(gh.Checks), gh.SecretARN)
			}
			if tc.fix != "" && !strings.Contains(fmtChecks(gh.Checks), tc.fix) {
				t.Fatalf("missing fix %q: %+v", tc.fix, gh.Checks)
			}
			for _, c := range gh.Checks {
				if strings.Contains(c.Message, tc.v.secretToken) && tc.v.secretToken != "" {
					t.Fatalf("token leaked into a message: %q", c.Message)
				}
			}
		})
	}
}

func TestExposurePreconditionsAndTurningOff(t *testing.T) {
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{}, &fakeGitHub{}, nil)
	if _, err := svc.SetExposure(context.Background(), awsTestCaller, "222222222222", AWSExposureRequest{CodeCommit: true}); !errors.Is(err, ErrAWSAccountNotFound) {
		t.Fatalf("unknown account: %v", err)
	}
	store.accounts["222222222222"] = AWSAccountRecord{AccountID: "222222222222", RoleARN: awsTestRoleARN, Status: AWSStatusPending}
	if _, err := svc.SetExposure(context.Background(), awsTestCaller, "222222222222", AWSExposureRequest{CodeCommit: true}); !errors.Is(err, ErrAWSAccountNotConnected) {
		t.Fatalf("never connected: %v", err)
	}
	connectedAccount(store)
	var secretErr *awsconnect.ErrInvalidSecretARN
	for _, arn := range []string{"", "nope", "arn:aws:secretsmanager:us-east-1:333333333333:secret:nhi/github-x", "arn:aws:secretsmanager:us-east-1:222222222222:secret:other-x"} {
		if _, err := svc.SetExposure(context.Background(), awsTestCaller, "222222222222", AWSExposureRequest{GitHub: true, GitHubSecretARN: arn}); !errors.As(err, &secretErr) {
			t.Fatalf("secret %q: %v", arn, err)
		}
	}
	// Turning everything off needs no AWS call and clears both platforms.
	rec := store.accounts["222222222222"]
	rec.GitHubConnected, rec.CodeCommitConnected = true, true
	store.accounts["222222222222"] = rec
	off := newTestService(store, nil, nil, nil)
	res, err := off.SetExposure(context.Background(), awsTestCaller, "222222222222", AWSExposureRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if res.ExposureEnabled || res.Account.Exposure.GitHub.Connected || res.Account.Exposure.CodeCommit.Connected {
		t.Fatalf("got %+v", res)
	}
}

// ── regions, sync, remove ────────────────────────────────────────────────

func TestUpdateRegionsSyncRemove(t *testing.T) {
	store := newFakeAWSStore()
	connectedAccount(store)
	v := &fakeVerifier{}
	svc := newTestService(store, v, nil, nil)
	acc, err := svc.UpdateRegions(context.Background(), awsTestCaller, "222222222222", []string{"eu-west-1", "us-east-1", "us-east-1"})
	if err != nil || strings.Join(acc.Regions, ",") != "us-east-1,eu-west-1" {
		t.Fatalf("regions: %v %v", acc, err)
	}
	res, err := svc.RequestSync(context.Background(), awsTestCaller, "222222222222")
	if err != nil || res.AlreadyQueued || res.Account.Sync.Status != AWSSyncQueued || res.Account.Sync.RequestedBy != "alice@acme.test" {
		t.Fatalf("sync: %+v %v", res, err)
	}
	if res, _ := svc.RequestSync(context.Background(), awsTestCaller, "222222222222"); !res.AlreadyQueued {
		t.Fatal("second sync should report already queued")
	}
	if err := svc.RemoveAccount(context.Background(), awsTestCaller, "222222222222"); err != nil {
		t.Fatal(err)
	}
	if len(v.revoked) != 1 || v.revoked[0] != "222222222222" {
		t.Fatalf("bus permission not revoked: %v", v.revoked)
	}
	if err := svc.RemoveAccount(context.Background(), awsTestCaller, "222222222222"); !errors.Is(err, ErrAWSAccountNotFound) {
		t.Fatalf("remove twice: %v", err)
	}
}
