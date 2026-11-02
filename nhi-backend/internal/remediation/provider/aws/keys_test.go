package awsprov

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	iamtypes "github.com/aws/aws-sdk-go-v2/service/iam/types"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

const (
	tUser = "alice"
	tKey  = "AKIAEXAMPLE000000001"
	tARN  = "arn:aws:iam::123456789012:user/alice"
)

// fakeIAM is an in-memory access key; calls it does not implement panic (nil embedded interface).
type fakeIAM struct {
	IAMAPI
	status   iamtypes.StatusType
	lastUsed *time.Time
	failSet  bool
	updates  []iamtypes.StatusType
}

func (f *fakeIAM) ListAccessKeys(context.Context, *iam.ListAccessKeysInput, ...func(*iam.Options)) (*iam.ListAccessKeysOutput, error) {
	return &iam.ListAccessKeysOutput{AccessKeyMetadata: []iamtypes.AccessKeyMetadata{
		{UserName: aws.String(tUser), AccessKeyId: aws.String(tKey), Status: f.status, CreateDate: aws.Time(time.Now().AddDate(0, -6, 0))},
	}}, nil
}

func (f *fakeIAM) GetAccessKeyLastUsed(context.Context, *iam.GetAccessKeyLastUsedInput, ...func(*iam.Options)) (*iam.GetAccessKeyLastUsedOutput, error) {
	return &iam.GetAccessKeyLastUsedOutput{AccessKeyLastUsed: &iamtypes.AccessKeyLastUsed{LastUsedDate: f.lastUsed, Region: aws.String("us-east-1"), ServiceName: aws.String("s3")}}, nil
}

func (f *fakeIAM) UpdateAccessKey(_ context.Context, in *iam.UpdateAccessKeyInput, _ ...func(*iam.Options)) (*iam.UpdateAccessKeyOutput, error) {
	if f.failSet {
		return nil, context.DeadlineExceeded
	}
	f.status = in.Status
	f.updates = append(f.updates, in.Status)
	return &iam.UpdateAccessKeyOutput{}, nil
}

func newTestProvider(f *fakeIAM, sessionPolicies *[]string) *Provider {
	return NewWithFactory(func(_ context.Context, _ domain.Account, region, _, sessionPolicy string) (*Clients, error) {
		if sessionPolicies != nil {
			*sessionPolicies = append(*sessionPolicies, sessionPolicy)
		}
		return &Clients{IAM: f, Region: region}, nil
	}, "us-east-1", Options{MinKeyIdleDays: 7})
}

func keyTargetFor(action string) provider.Target {
	return provider.Target{
		TenantID: "11111111-1111-1111-1111-111111111111", ActionType: action, TargetARN: tARN, TargetType: "IAM_USER",
		Account: domain.Account{AccountID: "123456789012", RoleARN: "arn:aws:iam::123456789012:role/ISPMRemediation"},
		Params:  map[string]any{"user_name": tUser, "access_key_id": tKey},
	}
}

func TestDeactivateKeyPlanBlocksRecentlyUsedKey(t *testing.T) {
	recent := time.Now().Add(-2 * time.Hour)
	p := newTestProvider(&fakeIAM{status: iamtypes.StatusTypeActive, lastUsed: &recent}, nil)
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: keyTargetFor(catalog.DeactivateKey), MinKeyIdleDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if !blocked(out) {
		t.Fatalf("a key used 2 hours ago must block the plan: %+v", out.Prechecks)
	}
}

func TestDeactivateKeyPlanPassesForIdleKey(t *testing.T) {
	old := time.Now().AddDate(0, 0, -40)
	p := newTestProvider(&fakeIAM{status: iamtypes.StatusTypeActive, lastUsed: &old}, nil)
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: keyTargetFor(catalog.DeactivateKey), MinKeyIdleDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if blocked(out) {
		t.Fatalf("an idle key must not block: %+v", out.Prechecks)
	}
	if out.Before["status"] != "Active" || out.After["status"] != "Inactive" {
		t.Fatalf("before/after: %v / %v", out.Before, out.After)
	}
}

// The engine hashes Plan.Before at plan time and LiveState at execution time:
// both must describe the same thing or every execution reports drift.
func TestLiveStateMatchesPlanBefore(t *testing.T) {
	old := time.Now().AddDate(0, 0, -40)
	for _, action := range []string{catalog.DeactivateKey, catalog.RotateAccessKey} {
		p := newTestProvider(&fakeIAM{status: iamtypes.StatusTypeActive, lastUsed: &old}, nil)
		tg := keyTargetFor(action)
		out, err := p.Plan(context.Background(), provider.PlanInput{Target: tg, MinKeyIdleDays: 7})
		if err != nil {
			t.Fatalf("%s: %v", action, err)
		}
		live, err := p.LiveState(context.Background(), tg)
		if err != nil {
			t.Fatalf("%s: %v", action, err)
		}
		if policydoc.Hash(out.Before) != policydoc.Hash(live) {
			t.Errorf("%s: drift hash differs\n plan: %v\n live: %v", action, out.Before, live)
		}
	}
}

func TestExecuteVerifyRollback(t *testing.T) {
	old := time.Now().AddDate(0, 0, -40)
	fake := &fakeIAM{status: iamtypes.StatusTypeActive, lastUsed: &old}
	var policies []string
	p := newTestProvider(fake, &policies)
	in := provider.RunInput{Target: keyTargetFor(catalog.DeactivateKey), ExecutionID: "e1", SessionName: "e1",
		Before: map[string]any{"user_name": tUser, "access_key_id": tKey, "status": "Active"}}

	res, err := p.Execute(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if fake.status != iamtypes.StatusTypeInactive {
		t.Fatalf("key is %s", fake.status)
	}
	if res.RollbackState == nil {
		t.Fatal("no rollback snapshot")
	}
	v, err := p.Verify(context.Background(), in)
	if err != nil || v["verified"] != true {
		t.Fatalf("verify: %v %v", v, err)
	}

	if _, err := p.Rollback(context.Background(), provider.RollbackInput{RunInput: in, RollbackState: res.RollbackState}); err != nil {
		t.Fatal(err)
	}
	if fake.status != iamtypes.StatusTypeActive {
		t.Fatalf("rollback left the key %s", fake.status)
	}

	// the write session may only do what this action needs, on this target
	var write string
	for _, sp := range policies {
		if strings.Contains(sp, "UpdateAccessKey") {
			write = sp
		}
	}
	if write == "" {
		t.Fatalf("no session policy allowed iam:UpdateAccessKey: %q", policies)
	}
	var doc struct {
		Statement []struct {
			Action   []string
			Resource any
		}
	}
	if err := json.Unmarshal([]byte(write), &doc); err != nil {
		t.Fatal(err)
	}
	for _, s := range doc.Statement {
		for _, a := range s.Action {
			if a == "iam:UpdateAccessKey" {
				if len(s.Action) != 1 || !reflect.DeepEqual(s.Resource, []any{tARN}) {
					t.Errorf("the write statement must allow only iam:UpdateAccessKey on the target: %+v", s)
				}
				continue
			}
			if !strings.HasPrefix(a, "iam:Get") && !strings.HasPrefix(a, "iam:List") && !strings.HasPrefix(a, "iam:Generate") &&
				!strings.HasPrefix(a, "kms:") && !strings.HasPrefix(a, "secretsmanager:") && !strings.HasPrefix(a, "access-analyzer:") {
				t.Errorf("unexpected action in the session policy: %s", a)
			}
		}
	}
}

func TestFailedExecuteChangesNothing(t *testing.T) {
	fake := &fakeIAM{status: iamtypes.StatusTypeActive, failSet: true}
	p := newTestProvider(fake, nil)
	in := provider.RunInput{Target: keyTargetFor(catalog.DeactivateKey), ExecutionID: "e2", SessionName: "e2",
		Before: map[string]any{"user_name": tUser, "access_key_id": tKey, "status": "Active"}}
	if _, err := p.Execute(context.Background(), in); err == nil {
		t.Fatal("want an error")
	}
	if fake.status != iamtypes.StatusTypeActive {
		t.Fatalf("a failed call must leave the key Active, got %s", fake.status)
	}
}

func blocked(o *provider.PlanOutput) bool {
	for _, c := range o.Prechecks {
		if c.Result == domain.CheckBlock {
			return true
		}
	}
	return false
}
