package awsprov

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	iamtypes "github.com/aws/aws-sdk-go-v2/service/iam/types"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/provider"
)

// multiKeyIAM: user bob with two active keys; key 1 used yesterday, key 2 never used.
type multiKeyIAM struct {
	IAMAPI
	used map[string]*time.Time
}

func (f *multiKeyIAM) ListAccessKeys(context.Context, *iam.ListAccessKeysInput, ...func(*iam.Options)) (*iam.ListAccessKeysOutput, error) {
	var out []iamtypes.AccessKeyMetadata
	for id := range f.used {
		out = append(out, iamtypes.AccessKeyMetadata{UserName: aws.String("bob"), AccessKeyId: aws.String(id),
			Status: iamtypes.StatusTypeActive, CreateDate: aws.Time(time.Now().AddDate(-1, 0, 0))})
	}
	return &iam.ListAccessKeysOutput{AccessKeyMetadata: out}, nil
}

func (f *multiKeyIAM) GetAccessKeyLastUsed(_ context.Context, in *iam.GetAccessKeyLastUsedInput, _ ...func(*iam.Options)) (*iam.GetAccessKeyLastUsedOutput, error) {
	return &iam.GetAccessKeyLastUsedOutput{UserName: aws.String("bob"),
		AccessKeyLastUsed: &iamtypes.AccessKeyLastUsed{LastUsedDate: f.used[aws.ToString(in.AccessKeyId)]}}, nil
}

func multiProvider(f *multiKeyIAM) *Provider {
	return NewWithFactory(func(_ context.Context, _ domain.Account, region, _, _ string) (*Clients, error) {
		return &Clients{IAM: f, Region: region}, nil
	}, "us-east-1", Options{MinKeyIdleDays: 7})
}

func target(params map[string]any) provider.Target {
	return provider.Target{TenantID: "11111111-1111-1111-1111-111111111111", ActionType: catalog.DeactivateKey,
		TargetType: "IAM_USER", Account: domain.Account{AccountID: "123456789012", RoleARN: "arn:aws:iam::123456789012:role/ISPMRemediation"},
		Params: params}
}

func TestPlanLooksUpUserFromKey(t *testing.T) {
	old := time.Now().AddDate(0, -4, 0)
	p := multiProvider(&multiKeyIAM{used: map[string]*time.Time{"AKIAKEY0000000000001": &old}})
	out, err := p.Plan(context.Background(), provider.PlanInput{MinKeyIdleDays: 7,
		Target: target(map[string]any{"access_key_id": "AKIAKEY0000000000001"})}) // CR-009: no user in the evidence
	if err != nil {
		t.Fatal(err)
	}
	if blocked(out) {
		t.Fatalf("user must be found from the key id: %+v", out.Prechecks)
	}
	if out.Params["user_name"] != "bob" {
		t.Fatalf("user_name: got %v", out.Params["user_name"])
	}
}

func TestPlanPicksLeastRecentlyUsedCandidate(t *testing.T) {
	yesterday := time.Now().AddDate(0, 0, -1)
	p := multiProvider(&multiKeyIAM{used: map[string]*time.Time{
		"AKIAKEY0000000000001": &yesterday, "AKIAKEY0000000000002": nil}})
	out, err := p.Plan(context.Background(), provider.PlanInput{MinKeyIdleDays: 7,
		Target: target(map[string]any{"user_name": "bob", "access_key_id": "AKIAKEY0000000000001, AKIAKEY0000000000002",
			"access_key_candidates": []any{"AKIAKEY0000000000001", "AKIAKEY0000000000002"}})}) // IAM-03
	if err != nil {
		t.Fatal(err)
	}
	if out.Params["access_key_id"] != "AKIAKEY0000000000002" {
		t.Fatalf("the never-used key must be chosen: got %v", out.Params["access_key_id"])
	}
	found := false
	for _, c := range out.Prechecks {
		if c.Name == "key chosen" && strings.Contains(c.Detail, "AKIAKEY0000000000001") {
			found = true
		}
	}
	if !found {
		t.Fatalf("a pre-check must name the other key: %+v", out.Prechecks)
	}
	if blocked(out) {
		t.Fatalf("a never-used key must not block: %+v", out.Prechecks)
	}
}
