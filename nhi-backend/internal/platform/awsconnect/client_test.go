package awsconnect

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
)

// fakeAWS answers the five calls the client makes, in each service's own wire
// protocol, and records what it was asked.
type fakeAWS struct {
	mu sync.Mutex

	assumeDenied bool
	rolesXML     string
	stsOffIn     string   // region whose STS answers RegionDisabledException
	deniedIn     string   // region whose STS answers AccessDenied (opt-in region not enabled)
	stsRegions   []string // region each AssumeRole was signed for
	assumeKey    string   // access key that signed the last AssumeRole

	// diagnosis: who GetCallerIdentity says we are, what the simulation decides
	callerARN    string
	simDecision  string
	simDenied    bool // iam:SimulatePrincipalPolicy itself refused
	simOrgDenied bool
	simForm      url.Values
	readDenied   bool
	busPolicy    string
	putErrCode   string
	events       bool

	assumeForm    url.Values
	listRolesKey  string // access key that signed ListRoles
	putBody       map[string]any
	putCalls      int
	removeCalls   int
	removeBody    map[string]any
	removeErrCode string
	filterBody    map[string]any
}

const oneRole = `<member><Path>/</Path><RoleName>r</RoleName><RoleId>AROAEXAMPLE</RoleId><Arn>arn:aws:iam::222222222222:role/r</Arn><CreateDate>2020-01-01T00:00:00Z</CreateDate></member>`

func (f *fakeAWS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	body, _ := io.ReadAll(r.Body)
	target := r.Header.Get("X-Amz-Target")
	switch {
	case strings.HasPrefix(target, "AWSEvents."):
		var in map[string]any
		_ = json.Unmarshal(body, &in)
		w.Header().Set("Content-Type", "application/x-amz-json-1.1")
		switch strings.TrimPrefix(target, "AWSEvents.") {
		case "DescribeEventBus":
			out := map[string]any{"Name": in["Name"], "Arn": "arn:aws:events:ap-south-1:999999999999:event-bus/nhi-central-bus"}
			if f.busPolicy != "" {
				out["Policy"] = f.busPolicy
			}
			_ = json.NewEncoder(w).Encode(out)
		case "RemovePermission":
			f.removeCalls++
			f.removeBody = in
			if f.removeErrCode != "" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"__type":"`+f.removeErrCode+`","message":"x"}`)
				return
			}
			_, _ = io.WriteString(w, `{}`)
		case "PutPermission":
			f.putCalls++
			f.putBody = in
			if f.putErrCode != "" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"__type":"`+f.putErrCode+`","message":"x"}`)
				return
			}
			_, _ = io.WriteString(w, `{}`)
		}
	case target == "Logs_20140328.FilterLogEvents":
		_ = json.Unmarshal(body, &f.filterBody)
		w.Header().Set("Content-Type", "application/x-amz-json-1.1")
		if f.events {
			_, _ = io.WriteString(w, `{"events":[{"message":"{}","timestamp":1}]}`)
		} else {
			_, _ = io.WriteString(w, `{"events":[]}`)
		}
	default:
		form, _ := url.ParseQuery(string(body))
		w.Header().Set("Content-Type", "text/xml")
		switch form.Get("Action") {
		case "AssumeRole":
			f.assumeForm = form
			region := ""
			if parts := strings.Split(r.Header.Get("Authorization"), "/"); len(parts) > 2 {
				region = parts[2]
			}
			f.stsRegions = append(f.stsRegions, region)
			if i := strings.Index(r.Header.Get("Authorization"), "Credential="); i >= 0 {
				f.assumeKey = strings.SplitN(r.Header.Get("Authorization")[i+len("Credential="):], "/", 2)[0]
			}
			if region == f.deniedIn {
				w.WriteHeader(http.StatusForbidden)
				_, _ = io.WriteString(w, `<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>not authorized</Message></Error><RequestId>1</RequestId></ErrorResponse>`)
				return
			}
			if region == f.stsOffIn {
				w.WriteHeader(http.StatusForbidden)
				_, _ = io.WriteString(w, `<ErrorResponse><Error><Type>Sender</Type><Code>RegionDisabledException</Code><Message>STS is not activated in this region</Message></Error><RequestId>1</RequestId></ErrorResponse>`)
				return
			}
			if f.assumeDenied {
				w.WriteHeader(http.StatusForbidden)
				_, _ = io.WriteString(w, `<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>not authorized</Message></Error><RequestId>1</RequestId></ErrorResponse>`)
				return
			}
			_, _ = io.WriteString(w, `<AssumeRoleResponse><AssumeRoleResult><Credentials><AccessKeyId>ASIACLIENT</AccessKeyId><SecretAccessKey>secret</SecretAccessKey><SessionToken>token</SessionToken><Expiration>2099-01-01T00:00:00Z</Expiration></Credentials><AssumedRoleUser><Arn>arn:aws:sts::222222222222:assumed-role/r/s</Arn><AssumedRoleId>AROA:s</AssumedRoleId></AssumedRoleUser></AssumeRoleResult></AssumeRoleResponse>`)
		case "GetCallerIdentity":
			arn := f.callerARN
			if arn == "" {
				arn = "arn:aws:sts::999999999999:assumed-role/NHIPlatformAssumer/s"
			}
			account := strings.Split(arn, ":")[4]
			_, _ = io.WriteString(w, `<GetCallerIdentityResponse><GetCallerIdentityResult><Arn>`+arn+`</Arn><UserId>AROA:s</UserId><Account>`+account+`</Account></GetCallerIdentityResult></GetCallerIdentityResponse>`)
		case "SimulatePrincipalPolicy":
			f.simForm = form
			if f.simDenied {
				w.WriteHeader(http.StatusForbidden)
				_, _ = io.WriteString(w, `<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>not authorized to perform: iam:SimulatePrincipalPolicy</Message></Error><RequestId>2</RequestId></ErrorResponse>`)
				return
			}
			decision := f.simDecision
			if decision == "" {
				decision = "allowed"
			}
			org := "true"
			if f.simOrgDenied {
				org = "false"
			}
			_, _ = io.WriteString(w, `<SimulatePrincipalPolicyResponse><SimulatePrincipalPolicyResult><IsTruncated>false</IsTruncated><EvaluationResults><member><EvalActionName>sts:AssumeRole</EvalActionName><EvalResourceName>`+form.Get("ResourceArns.member.1")+`</EvalResourceName><EvalDecision>`+decision+`</EvalDecision><OrganizationsDecisionDetail><AllowedByOrganizations>`+org+`</AllowedByOrganizations></OrganizationsDecisionDetail></member></EvaluationResults></SimulatePrincipalPolicyResult></SimulatePrincipalPolicyResponse>`)
		case "ListRoles":
			auth := r.Header.Get("Authorization")
			if i := strings.Index(auth, "Credential="); i >= 0 {
				f.listRolesKey = strings.SplitN(auth[i+len("Credential="):], "/", 2)[0]
			}
			if f.readDenied {
				w.WriteHeader(http.StatusForbidden)
				_, _ = io.WriteString(w, `<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>no</Message></Error><RequestId>1</RequestId></ErrorResponse>`)
				return
			}
			_, _ = io.WriteString(w, `<ListRolesResponse><ListRolesResult><IsTruncated>false</IsTruncated><Roles>`+f.rolesXML+`</Roles></ListRolesResult></ListRolesResponse>`)
		default:
			w.WriteHeader(http.StatusBadRequest)
		}
	}
}

func newTestClient(t *testing.T, f *fakeAWS, _ string) (*Client, Platform) {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	base := aws.Config{
		Region:           "us-east-1",
		Credentials:      credentials.NewStaticCredentialsProvider("AKIAPLATFORM", "s", ""),
		BaseEndpoint:     aws.String(srv.URL),
		HTTPClient:       srv.Client(),
		RetryMaxAttempts: 1,
	}
	p, err := NewPlatform("999999999999", "ap-south-1",
		"arn:aws:events:ap-south-1:999999999999:event-bus/nhi-central-bus",
		"arn:aws:iam::999999999999:role/NHIPlatformAssumer")
	if err != nil {
		t.Fatal(err)
	}
	return NewClient(base, false), p
}

func TestClientAssumeRoleAndRead(t *testing.T) {
	f := &fakeAWS{rolesXML: oneRole}
	c, p := newTestClient(t, f, "")
	role, _ := ParseRoleARN("arn:aws:iam::222222222222:role/NHIPlatformCollector")
	ctx := context.Background()

	session, err := c.AssumeRole(ctx, p, role, "ext-abc")
	if err != nil {
		t.Fatalf("AssumeRole: %v", err)
	}
	if f.assumeForm.Get("RoleArn") != role.ARN || f.assumeForm.Get("ExternalId") != "ext-abc" || f.assumeForm.Get("DurationSeconds") != "900" {
		t.Fatalf("AssumeRole sent %v", f.assumeForm)
	}
	if err := c.TestRead(ctx, session); err != nil {
		t.Fatalf("TestRead: %v", err)
	}
	if f.listRolesKey != "ASIACLIENT" {
		t.Fatalf("ListRoles was signed with %q, want the assumed role's key", f.listRolesKey)
	}

	f.rolesXML = ""
	if err := c.TestRead(ctx, session); !errors.Is(err, ErrNothingRead) {
		t.Fatalf("empty ListRoles = %v, want ErrNothingRead", err)
	}
	f.readDenied = true
	if err := c.TestRead(ctx, session); !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("denied ListRoles = %v, want ErrAccessDenied", err)
	}

	f.assumeDenied = true
	_, err = c.AssumeRole(ctx, p, role, "wrong")
	if !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("denied AssumeRole = %v, want ErrAccessDenied", err)
	}
	// What AWS said is kept for the log: its code, its message and the request id.
	for _, want := range []string{"AccessDenied", "not authorized", "aws request id 1", "http 403"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("denied AssumeRole error %q lacks %q", err, want)
		}
	}
}

func TestClientAllowAccountOnBus(t *testing.T) {
	f := &fakeAWS{}
	c, p := newTestClient(t, f, "")
	ctx := context.Background()

	if err := c.AllowAccountOnBus(ctx, p, "222222222222"); err != nil {
		t.Fatalf("AllowAccountOnBus: %v", err)
	}
	if f.putCalls != 1 || f.putBody["Principal"] != "222222222222" || f.putBody["Action"] != "events:PutEvents" ||
		f.putBody["StatementId"] != "nhi-client-222222222222" || f.putBody["EventBusName"] != "nhi-central-bus" {
		t.Fatalf("PutPermission sent %v", f.putBody)
	}

	// Already allowed: no second statement.
	f.busPolicy = `{"Version":"2012-10-17","Statement":[{"Sid":"nhi-client-222222222222","Effect":"Allow"}]}`
	if err := c.AllowAccountOnBus(ctx, p, "222222222222"); err != nil || f.putCalls != 1 {
		t.Fatalf("existing statement: err %v, PutPermission calls %d", err, f.putCalls)
	}

	// Lost a race to a concurrent check: still fine.
	f.busPolicy = ""
	f.putErrCode = "ResourceAlreadyExistsException"
	if err := c.AllowAccountOnBus(ctx, p, "333333333333"); err != nil {
		t.Fatalf("ResourceAlreadyExists should be success, got %v", err)
	}
	f.putErrCode = "PolicyLengthExceededException"
	if err := c.AllowAccountOnBus(ctx, p, "444444444444"); err == nil {
		t.Fatal("policy too large should be an error")
	}
	if err := c.AllowAccountOnBus(ctx, p, "12"); err == nil {
		t.Fatal("malformed account id accepted")
	}
}

func TestClientRevokeAccountOnBus(t *testing.T) {
	f := &fakeAWS{}
	c, p := newTestClient(t, f, "")
	ctx := context.Background()
	if err := c.RevokeAccountOnBus(ctx, p, "222222222222"); err != nil {
		t.Fatalf("RevokeAccountOnBus: %v", err)
	}
	if f.removeCalls != 1 || f.removeBody["StatementId"] != "nhi-client-222222222222" || f.removeBody["EventBusName"] != "nhi-central-bus" {
		t.Fatalf("RemovePermission sent %v", f.removeBody)
	}
	f.removeErrCode = "ResourceNotFoundException"
	if err := c.RevokeAccountOnBus(ctx, p, "222222222222"); err != nil {
		t.Fatalf("already removed should be success, got %v", err)
	}
	f.removeErrCode = "AccessDeniedException"
	if err := c.RevokeAccountOnBus(ctx, p, "222222222222"); err == nil {
		t.Fatal("access denied should be an error")
	}
	if err := c.RevokeAccountOnBus(ctx, p, "12"); err == nil {
		t.Fatal("malformed account id accepted")
	}
}

// STS runs in the platform region; when the customer's account has STS turned
// off there, the call is made again in us-east-1 and succeeds.
func TestAssumeRoleUsesPlatformRegionThenUSEast1(t *testing.T) {
	f := &fakeAWS{rolesXML: oneRole}
	c, p := newTestClient(t, f, "")
	role, _ := ParseRoleARN("arn:aws:iam::222222222222:role/NHIPlatformCollector")
	if _, err := c.AssumeRole(context.Background(), p, role, "ext"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(f.stsRegions, ",") != "ap-south-1" {
		t.Fatalf("sts regions = %v", f.stsRegions)
	}
	f.stsRegions, f.stsOffIn = nil, "ap-south-1"
	if _, err := c.AssumeRole(context.Background(), p, role, "ext"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(f.stsRegions, ",") != "ap-south-1,us-east-1" {
		t.Fatalf("sts regions = %v", f.stsRegions)
	}
}

// Without NHI_AWS_ASSUME_ASSUMER_ROLE the customer's role is assumed with the
// process's own credentials: the configured assumer role name is never used
// for the call (only for page text and the self-check), and nothing but the
// role ARN, External ID, session name and duration is sent.
func TestAssumeRoleUsesProcessIdentityNotTheConfiguredName(t *testing.T) {
	f := &fakeAWS{rolesXML: oneRole}
	c, p := newTestClient(t, f, "")
	p.AssumerRoleARN = "arn:aws:iam::999999999999:role/SomeNameThatDoesNotExist"
	role, _ := ParseRoleARN("arn:aws:iam::222222222222:role/NHIPlatformCollector")
	if _, err := c.AssumeRole(context.Background(), p, role, "ext"); err != nil {
		t.Fatal(err)
	}
	if f.assumeKey != "AKIAPLATFORM" {
		t.Fatalf("AssumeRole signed with %q, want the process's own key", f.assumeKey)
	}
	for k := range f.assumeForm {
		switch k {
		case "Action", "Version", "RoleArn", "RoleSessionName", "ExternalId", "DurationSeconds":
		default:
			t.Errorf("AssumeRole sent unexpected field %s", k)
		}
	}
}

// The platform region is an opt-in region the customer never enabled: STS
// there refuses, and the same call in us-east-1 succeeds.
func TestAssumeRoleRetriesInUSEast1WhenRefusedInPlatformRegion(t *testing.T) {
	f := &fakeAWS{rolesXML: oneRole, deniedIn: "ap-south-1"}
	c, p := newTestClient(t, f, "")
	role, _ := ParseRoleARN("arn:aws:iam::222222222222:role/NHIPlatformCollector")
	if _, err := c.AssumeRole(context.Background(), p, role, "ext"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(f.stsRegions, ",") != "ap-south-1,us-east-1" {
		t.Fatalf("sts regions = %v", f.stsRegions)
	}
}
