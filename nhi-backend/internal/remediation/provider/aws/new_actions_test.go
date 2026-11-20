package awsprov

// Tests of the actions added for Reme4, Reme5, Reme10, Reme11, Reme12 and Reme14: plan, execute,
// verify and rollback against in-memory fakes (no AWS call).

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	iamtypes "github.com/aws/aws-sdk-go-v2/service/iam/types"
	"github.com/aws/aws-sdk-go-v2/service/rds"
	rdstypes "github.com/aws/aws-sdk-go-v2/service/rds/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/aws-sdk-go-v2/service/sns"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

const tAccount = "123456789012"

var tAcct = domain.Account{AccountID: tAccount, RoleARN: "arn:aws:iam::123456789012:role/ISPMRemediation"}

func fakeProvider(c *Clients) *Provider {
	return NewWithFactory(func(_ context.Context, _ domain.Account, region, _, _ string) (*Clients, error) {
		cc := *c
		cc.Region = region
		return &cc, nil
	}, "us-east-1", Options{PollInterval: time.Millisecond, PollTimeout: 10 * time.Millisecond})
}

// planExecRollback plans, executes, verifies and rolls back one action; it returns the plan.
func planExecRollback(t *testing.T, p *Provider, tg provider.Target, findings []domain.Finding) *provider.PlanOutput {
	t.Helper()
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: tg, Findings: findings})
	if err != nil {
		t.Fatal(err)
	}
	if blocked(out) {
		t.Fatalf("plan blocked: %+v", out.Prechecks)
	}
	// what the engine stores and passes back (JSON round trip, like the database)
	rt := func(m map[string]any) map[string]any {
		b, _ := json.Marshal(m)
		var o map[string]any
		_ = json.Unmarshal(b, &o)
		return o
	}
	run := provider.RunInput{Target: tg, ExecutionID: "e1", SessionName: "e1", Before: rt(out.Before), After: rt(out.After)}
	run.TargetARN, run.Params = out.TargetARN, rt(out.Params)
	live, err := p.LiveState(context.Background(), run.Target)
	if err != nil {
		t.Fatal(err)
	}
	if policydoc.Hash(live) != policydoc.Hash(out.Before) {
		t.Fatalf("live state must hash like the plan's before state:\n%v\n%v", live, out.Before)
	}
	res, err := p.Execute(context.Background(), run)
	if err != nil {
		t.Fatal(err)
	}
	v, err := p.Verify(context.Background(), run)
	if err != nil || v["verified"] != true {
		t.Fatalf("verify: %v %v", v, err)
	}
	snap := rt(res.RollbackState)
	if _, err := p.Rollback(context.Background(), provider.RollbackInput{RunInput: run, RollbackState: snap}); err != nil {
		t.Fatal(err)
	}
	return out
}

// ---- S3 ----

type fakeS3 struct {
	S3API
	pab     *s3types.PublicAccessBlockConfiguration
	policy  string
	deleted bool
}

func (f *fakeS3) GetBucketLocation(context.Context, *s3.GetBucketLocationInput, ...func(*s3.Options)) (*s3.GetBucketLocationOutput, error) {
	return &s3.GetBucketLocationOutput{LocationConstraint: "ap-south-1"}, nil
}
func (f *fakeS3) GetPublicAccessBlock(context.Context, *s3.GetPublicAccessBlockInput, ...func(*s3.Options)) (*s3.GetPublicAccessBlockOutput, error) {
	if f.pab == nil {
		return nil, apiErr("NoSuchPublicAccessBlockConfiguration")
	}
	return &s3.GetPublicAccessBlockOutput{PublicAccessBlockConfiguration: f.pab}, nil
}
func (f *fakeS3) PutPublicAccessBlock(_ context.Context, in *s3.PutPublicAccessBlockInput, _ ...func(*s3.Options)) (*s3.PutPublicAccessBlockOutput, error) {
	f.pab = in.PublicAccessBlockConfiguration
	return &s3.PutPublicAccessBlockOutput{}, nil
}
func (f *fakeS3) DeletePublicAccessBlock(context.Context, *s3.DeletePublicAccessBlockInput, ...func(*s3.Options)) (*s3.DeletePublicAccessBlockOutput, error) {
	f.pab, f.deleted = nil, true
	return &s3.DeletePublicAccessBlockOutput{}, nil
}
func (f *fakeS3) GetBucketWebsite(context.Context, *s3.GetBucketWebsiteInput, ...func(*s3.Options)) (*s3.GetBucketWebsiteOutput, error) {
	return nil, apiErr("NoSuchWebsiteConfiguration")
}
func (f *fakeS3) GetBucketPolicy(context.Context, *s3.GetBucketPolicyInput, ...func(*s3.Options)) (*s3.GetBucketPolicyOutput, error) {
	if f.policy == "" {
		return nil, apiErr("NoSuchBucketPolicy")
	}
	return &s3.GetBucketPolicyOutput{Policy: aws.String(f.policy)}, nil
}
func (f *fakeS3) PutBucketPolicy(_ context.Context, in *s3.PutBucketPolicyInput, _ ...func(*s3.Options)) (*s3.PutBucketPolicyOutput, error) {
	f.policy = aws.ToString(in.Policy)
	return &s3.PutBucketPolicyOutput{}, nil
}
func (f *fakeS3) DeleteBucketPolicy(context.Context, *s3.DeleteBucketPolicyInput, ...func(*s3.Options)) (*s3.DeleteBucketPolicyOutput, error) {
	f.policy = ""
	return &s3.DeleteBucketPolicyOutput{}, nil
}

func newTarget(action string, params map[string]any) provider.Target {
	return provider.Target{TenantID: "11111111-1111-1111-1111-111111111111", Account: tAcct, ActionType: action, Params: params}
}

func TestBlockS3PublicAccess(t *testing.T) {
	f := &fakeS3{}
	p := fakeProvider(&Clients{S3: f})
	out := planExecRollback(t, p, newTarget(catalog.BlockS3PublicAccess, map[string]any{"bucket": "public-bucket"}), nil)
	if out.TargetARN != "arn:aws:s3:::public-bucket" || out.Params["region"] != "ap-south-1" {
		t.Fatalf("target / region: %s %v", out.TargetARN, out.Params["region"])
	}
	if len(out.Diff) != 4 {
		t.Fatalf("four settings change: %+v", out.Diff)
	}
	if !f.deleted {
		t.Fatal("the bucket had no configuration: rollback must delete the one the fix created")
	}
}

func TestBlockS3PublicAccessAlreadyOnIsBlocked(t *testing.T) {
	on := aws.Bool(true)
	p := fakeProvider(&Clients{S3: &fakeS3{pab: &s3types.PublicAccessBlockConfiguration{BlockPublicAcls: on, IgnorePublicAcls: on, BlockPublicPolicy: on, RestrictPublicBuckets: on}}})
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: newTarget(catalog.BlockS3PublicAccess, map[string]any{"bucket": "b-ok"})})
	if err != nil || !blocked(out) {
		t.Fatalf("nothing to change must block: %v %+v", err, out)
	}
}

func TestBucketPolicyRemovesPublicAndNamedExternal(t *testing.T) {
	before := `{"Version":"2012-10-17","Statement":[
	 {"Sid":"public","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::bkt1/*"},
	 {"Sid":"partner","Effect":"Allow","Principal":{"AWS":["arn:aws:iam::999988887777:root","arn:aws:iam::123456789012:role/app"]},"Action":"s3:GetObject","Resource":"arn:aws:s3:::bkt1/*"},
	 {"Sid":"org","Effect":"Allow","Principal":{"AWS":"*"},"Action":"s3:GetObject","Resource":"arn:aws:s3:::bkt1/*","Condition":{"StringEquals":{"aws:PrincipalOrgID":"o-abc"}}}]}`
	f := &fakeS3{policy: before}
	p := fakeProvider(&Clients{S3: f})
	// the finding evidence names the external account; the owner account is never removed
	findings := []domain.Finding{{RuleID: "S3-01", Evidence: json.RawMessage(`{"bucket":"bkt1"}`)}}
	tg := newTarget(catalog.UpdateBucketPolicy, map[string]any{"bucket": "bkt1", "remove_principals": []any{"999988887777", "123456789012"}})
	out := planExecRollback(t, p, tg, findings)
	after, _ := policydoc.Parse(out.After["policy"])
	js := after.JSON()
	if strings.Contains(js, `"Sid":"public"`) || strings.Contains(js, "999988887777") {
		t.Fatalf("public statement and external account must go: %s", js)
	}
	if !strings.Contains(js, "role/app") || !strings.Contains(js, "o-abc") {
		t.Fatalf("own role and the org-limited statement must stay: %s", js)
	}
	if policydoc.Hash(policyMap(t, f.policy)) != policydoc.Hash(policyMap(t, before)) {
		t.Fatalf("rollback must put the old policy back: %s", f.policy)
	}
}

type fakeSNS struct {
	SNSAPI
	policy string
}

func (f *fakeSNS) GetTopicAttributes(context.Context, *sns.GetTopicAttributesInput, ...func(*sns.Options)) (*sns.GetTopicAttributesOutput, error) {
	return &sns.GetTopicAttributesOutput{Attributes: map[string]string{"Policy": f.policy}}, nil
}

// The default SNS topic policy allows "*" limited by AWS:SourceOwner: it is not public.
func TestTopicDefaultPolicyIsNotPublic(t *testing.T) {
	def := `{"Version":"2008-10-17","Statement":[{"Sid":"__default_statement_ID","Effect":"Allow","Principal":{"AWS":"*"},"Action":["SNS:Publish"],"Resource":"arn:aws:sns:us-east-1:123456789012:t1","Condition":{"StringEquals":{"AWS:SourceOwner":"123456789012"}}}]}`
	p := fakeProvider(&Clients{SNS: &fakeSNS{policy: def}})
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: newTarget(catalog.UpdateTopicPolicy, map[string]any{}),
		Findings: []domain.Finding{{CredentialARN: "arn:aws:sns:us-east-1:123456789012:t1"}}})
	if err != nil || !blocked(out) {
		t.Fatalf("the default policy has nothing to remove: %v %+v", err, out.Prechecks)
	}
}

// ---- EC2 / RDS sharing, IMDS ----

type fakeEC2 struct {
	EC2API
	shares  map[string]bool // "all" or account id
	tokens  ec2types.HttpTokensState
	hop     int32
	removed [][]string
}

func (f *fakeEC2) DescribeImageAttribute(context.Context, *ec2.DescribeImageAttributeInput, ...func(*ec2.Options)) (*ec2.DescribeImageAttributeOutput, error) {
	var out []ec2types.LaunchPermission
	for s := range f.shares {
		if s == "all" {
			out = append(out, ec2types.LaunchPermission{Group: ec2types.PermissionGroupAll})
		} else {
			out = append(out, ec2types.LaunchPermission{UserId: aws.String(s)})
		}
	}
	return &ec2.DescribeImageAttributeOutput{LaunchPermissions: out}, nil
}

func (f *fakeEC2) ModifyImageAttribute(_ context.Context, in *ec2.ModifyImageAttributeInput, _ ...func(*ec2.Options)) (*ec2.ModifyImageAttributeOutput, error) {
	var gone []string
	for _, p := range in.LaunchPermission.Remove {
		k := aws.ToString(p.UserId)
		if p.Group == ec2types.PermissionGroupAll {
			k = "all"
		}
		delete(f.shares, k)
		gone = append(gone, k)
	}
	for _, p := range in.LaunchPermission.Add {
		k := aws.ToString(p.UserId)
		if p.Group == ec2types.PermissionGroupAll {
			k = "all"
		}
		f.shares[k] = true
	}
	if len(gone) > 0 {
		f.removed = append(f.removed, gone)
	}
	return &ec2.ModifyImageAttributeOutput{}, nil
}

func (f *fakeEC2) DescribeInstances(context.Context, *ec2.DescribeInstancesInput, ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
	return &ec2.DescribeInstancesOutput{Reservations: []ec2types.Reservation{{Instances: []ec2types.Instance{{
		InstanceId: aws.String("i-0123456789abcdef0"), State: &ec2types.InstanceState{Name: ec2types.InstanceStateNameRunning},
		MetadataOptions: &ec2types.InstanceMetadataOptionsResponse{HttpTokens: f.tokens, HttpPutResponseHopLimit: aws.Int32(f.hop),
			HttpEndpoint: ec2types.InstanceMetadataEndpointStateEnabled}}}}}}, nil
}

func (f *fakeEC2) ModifyInstanceMetadataOptions(_ context.Context, in *ec2.ModifyInstanceMetadataOptionsInput, _ ...func(*ec2.Options)) (*ec2.ModifyInstanceMetadataOptionsOutput, error) {
	f.tokens, f.hop = in.HttpTokens, aws.ToInt32(in.HttpPutResponseHopLimit)
	return &ec2.ModifyInstanceMetadataOptionsOutput{}, nil
}

func TestUnshareAMIRemovesPublicAndNamedAccountOnly(t *testing.T) {
	f := &fakeEC2{shares: map[string]bool{"all": true, "111111111111": true, "222222222222": true}}
	p := fakeProvider(&Clients{EC2: f})
	findings := []domain.Finding{{RuleID: "EC2-07", Evidence: json.RawMessage(`{"ami":"ami-0abc1234def567890","region":"eu-west-1"}`)}}
	out := planExecRollback(t, p, newTarget(catalog.UnshareAMI, map[string]any{"region": "eu-west-1", "remove_principals": []any{"111111111111"}}), findings)
	if out.TargetARN != "arn:aws:ec2:eu-west-1::image/ami-0abc1234def567890" {
		t.Fatalf("target: %s", out.TargetARN)
	}
	if got := strings.Join(f.removed[0], ","); !strings.Contains(got, "all") || !strings.Contains(got, "111111111111") || strings.Contains(got, "222222222222") {
		t.Fatalf("removed %s", got)
	}
	if len(f.shares) != 3 {
		t.Fatalf("rollback must share again with the removed accounts: %v", f.shares)
	}
}

func TestEnforceIMDS(t *testing.T) {
	f := &fakeEC2{tokens: ec2types.HttpTokensStateOptional, hop: 2}
	p := fakeProvider(&Clients{EC2: f})
	findings := []domain.Finding{{RuleID: "EC2-01", IdentityName: "i-0123456789abcdef0"}}
	out := planExecRollback(t, p, newTarget(catalog.EnforceIMDS, map[string]any{"hop_limit": 1, "region": "us-east-1"}), findings)
	if len(out.Diff) != 2 {
		t.Fatalf("tokens and hop limit change: %+v", out.Diff)
	}
	if f.tokens != ec2types.HttpTokensStateOptional || f.hop != 2 {
		t.Fatalf("rollback must restore optional / 2, got %s / %d", f.tokens, f.hop)
	}
}

type fakeRDS struct {
	RDSAPI
	values map[string]bool
}

func (f *fakeRDS) DescribeDBClusterSnapshotAttributes(context.Context, *rds.DescribeDBClusterSnapshotAttributesInput, ...func(*rds.Options)) (*rds.DescribeDBClusterSnapshotAttributesOutput, error) {
	var vals []string
	for v := range f.values {
		vals = append(vals, v)
	}
	return &rds.DescribeDBClusterSnapshotAttributesOutput{DBClusterSnapshotAttributesResult: &rdstypes.DBClusterSnapshotAttributesResult{
		DBClusterSnapshotAttributes: []rdstypes.DBClusterSnapshotAttribute{{AttributeName: aws.String("restore"), AttributeValues: vals}}}}, nil
}

func (f *fakeRDS) ModifyDBClusterSnapshotAttribute(_ context.Context, in *rds.ModifyDBClusterSnapshotAttributeInput, _ ...func(*rds.Options)) (*rds.ModifyDBClusterSnapshotAttributeOutput, error) {
	for _, v := range in.ValuesToRemove {
		delete(f.values, v)
	}
	for _, v := range in.ValuesToAdd {
		f.values[v] = true
	}
	return &rds.ModifyDBClusterSnapshotAttributeOutput{}, nil
}

func TestUnshareAuroraClusterSnapshot(t *testing.T) {
	f := &fakeRDS{values: map[string]bool{"all": true}}
	p := fakeProvider(&Clients{RDS: f})
	snap := "arn:aws:rds:ap-south-1:123456789012:cluster-snapshot:nightly-1"
	planExecRollback(t, p, newTarget(catalog.UnshareRDSSnapshot, map[string]any{"snapshot_id": snap}), nil)
	if !f.values["all"] {
		t.Fatal("rollback must make the snapshot public again (it was)")
	}
}

// ---- roles ----

type fakeRoleIAM struct {
	IAMAPI
	inline   map[string]string
	versions []iamtypes.PolicyVersion
	def      string
}

func (f *fakeRoleIAM) GetRole(_ context.Context, in *iam.GetRoleInput, _ ...func(*iam.Options)) (*iam.GetRoleOutput, error) {
	return &iam.GetRoleOutput{Role: &iamtypes.Role{RoleName: in.RoleName, MaxSessionDuration: aws.Int32(3600)}}, nil
}
func (f *fakeRoleIAM) GetRolePolicy(_ context.Context, in *iam.GetRolePolicyInput, _ ...func(*iam.Options)) (*iam.GetRolePolicyOutput, error) {
	d, ok := f.inline[aws.ToString(in.PolicyName)]
	if !ok {
		return nil, apiErr("NoSuchEntity")
	}
	return &iam.GetRolePolicyOutput{PolicyDocument: aws.String(d)}, nil
}
func (f *fakeRoleIAM) PutRolePolicy(_ context.Context, in *iam.PutRolePolicyInput, _ ...func(*iam.Options)) (*iam.PutRolePolicyOutput, error) {
	f.inline[aws.ToString(in.PolicyName)] = aws.ToString(in.PolicyDocument)
	return &iam.PutRolePolicyOutput{}, nil
}
func (f *fakeRoleIAM) DeleteRolePolicy(_ context.Context, in *iam.DeleteRolePolicyInput, _ ...func(*iam.Options)) (*iam.DeleteRolePolicyOutput, error) {
	delete(f.inline, aws.ToString(in.PolicyName))
	return &iam.DeleteRolePolicyOutput{}, nil
}
func (f *fakeRoleIAM) GetPolicy(_ context.Context, in *iam.GetPolicyInput, _ ...func(*iam.Options)) (*iam.GetPolicyOutput, error) {
	return &iam.GetPolicyOutput{Policy: &iamtypes.Policy{Arn: in.PolicyArn, DefaultVersionId: aws.String(f.def)}}, nil
}
func (f *fakeRoleIAM) ListPolicyVersions(context.Context, *iam.ListPolicyVersionsInput, ...func(*iam.Options)) (*iam.ListPolicyVersionsOutput, error) {
	return &iam.ListPolicyVersionsOutput{Versions: f.versions}, nil
}
func (f *fakeRoleIAM) GetPolicyVersion(_ context.Context, in *iam.GetPolicyVersionInput, _ ...func(*iam.Options)) (*iam.GetPolicyVersionOutput, error) {
	return &iam.GetPolicyVersionOutput{PolicyVersion: &iamtypes.PolicyVersion{VersionId: in.VersionId,
		Document: aws.String(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"*"}]}`)}}, nil
}
func (f *fakeRoleIAM) SetDefaultPolicyVersion(_ context.Context, in *iam.SetDefaultPolicyVersionInput, _ ...func(*iam.Options)) (*iam.SetDefaultPolicyVersionOutput, error) {
	f.def = aws.ToString(in.VersionId)
	return &iam.SetDefaultPolicyVersionOutput{}, nil
}

const tRole = "arn:aws:iam::123456789012:role/old-batch-role"

func TestQuarantineAndDenyIAMEscalation(t *testing.T) {
	for _, action := range []string{catalog.QuarantineRole, catalog.DenyIAMEscalation} {
		f := &fakeRoleIAM{inline: map[string]string{}}
		p := fakeProvider(&Clients{IAM: f})
		tg := newTarget(action, map[string]any{})
		tg.TargetARN = tRole
		out := planExecRollback(t, p, tg, nil)
		if len(f.inline) != 0 {
			t.Fatalf("%s: rollback must delete the inline policy: %v", action, f.inline)
		}
		doc, _ := policydoc.Parse(out.After["policy"])
		if !strings.Contains(doc.JSON(), `"Deny"`) {
			t.Fatalf("%s: a Deny policy is added: %s", action, doc.JSON())
		}
	}
}

func TestDenyEscalationNeedsActions(t *testing.T) {
	p := fakeProvider(&Clients{IAM: &fakeRoleIAM{inline: map[string]string{}}})
	tg := newTarget(catalog.DenyEscalation, map[string]any{})
	tg.TargetARN = tRole
	out, err := p.Plan(context.Background(), provider.PlanInput{Target: tg})
	if err != nil || !blocked(out) {
		t.Fatalf("without actions the plan must block: %v %+v", err, out)
	}
	tg.Params = map[string]any{"actions": []any{"iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "not an action"}}
	out = planExecRollback(t, p, tg, nil)
	doc, _ := policydoc.Parse(out.After["policy"])
	if js := doc.JSON(); !strings.Contains(js, "iam:CreatePolicyVersion") || strings.Contains(js, "not an action") {
		t.Fatalf("only the valid named actions are denied: %s", js)
	}
}

func TestRestorePolicyVersionPicksPrevious(t *testing.T) {
	now := time.Now()
	f := &fakeRoleIAM{def: "v3", versions: []iamtypes.PolicyVersion{
		{VersionId: aws.String("v1"), CreateDate: aws.Time(now.Add(-72 * time.Hour))},
		{VersionId: aws.String("v2"), CreateDate: aws.Time(now.Add(-48 * time.Hour))},
		{VersionId: aws.String("v3"), CreateDate: aws.Time(now.Add(-1 * time.Hour)), IsDefaultVersion: true},
	}}
	p := fakeProvider(&Clients{IAM: f})
	out := planExecRollback(t, p, newTarget(catalog.RestorePolicyVersion, map[string]any{"policy_arn": "arn:aws:iam::123456789012:policy/app"}), nil)
	if out.Params["version_id"] != "v2" {
		t.Fatalf("the version before the default is chosen: %v", out.Params["version_id"])
	}
	if f.def != "v3" {
		t.Fatalf("rollback sets v3 back: %s", f.def)
	}
}

// Every One-click action of the catalog has an AWS handler, and every action has a target type.
func TestCatalogActionsHaveHandlers(t *testing.T) {
	p := fakeProvider(&Clients{})
	for _, a := range catalog.Defaults() {
		if a.OneClickSupported && !p.Supports(a.ActionType) {
			t.Errorf("%s is One-click in the catalog but has no handler", a.ActionType)
		}
		if catalog.TargetType(a.ActionType) == "unknown" {
			t.Errorf("%s has no target type", a.ActionType)
		}
	}
}
