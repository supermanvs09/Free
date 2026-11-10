package awsprov

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
)

const secretARN = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:ispm-test-secret-AbCdEf"

// fakeSecrets records how the resource policy is written; calls it does not implement panic.
type fakeSecrets struct {
	SecretsAPI
	puts    []*bool // BlockPublicPolicy of every PutResourcePolicy
	deletes int
}

func (f *fakeSecrets) PutResourcePolicy(_ context.Context, in *secretsmanager.PutResourcePolicyInput, _ ...func(*secretsmanager.Options)) (*secretsmanager.PutResourcePolicyOutput, error) {
	f.puts = append(f.puts, in.BlockPublicPolicy)
	return &secretsmanager.PutResourcePolicyOutput{ARN: aws.String(secretARN)}, nil
}

func (f *fakeSecrets) DeleteResourcePolicy(context.Context, *secretsmanager.DeleteResourcePolicyInput, ...func(*secretsmanager.Options)) (*secretsmanager.DeleteResourcePolicyOutput, error) {
	f.deletes++
	return &secretsmanager.DeleteResourcePolicyOutput{ARN: aws.String(secretARN)}, nil
}

func secretProvider(f *fakeSecrets) *Provider {
	return NewWithFactory(func(_ context.Context, _ domain.Account, region, _, _ string) (*Clients, error) {
		return &Clients{Secrets: f, Region: region}, nil
	}, "ap-south-1", Options{MinKeyIdleDays: 7})
}

func policyMap(t *testing.T, doc string) map[string]any {
	t.Helper()
	d, err := policydoc.Parse(doc)
	if err != nil {
		t.Fatal(err)
	}
	return d.Map()
}

// The fix writes its new policy with BlockPublicPolicy=true. The rollback puts the previous
// policy back with BlockPublicPolicy=false: that policy was public (the reason it was fixed), and
// Secrets Manager would refuse to restore it otherwise.
func TestSecretPolicyRollbackMayRestoreAPublicPolicy(t *testing.T) {
	public := policyMap(t, `{"Version":"2012-10-17","Statement":[{"Sid":"public","Effect":"Allow","Principal":{"AWS":"*"},"Action":"secretsmanager:GetSecretValue","Resource":"*"}]}`)
	restricted := policyMap(t, `{"Version":"2012-10-17","Statement":[{"Sid":"own","Effect":"Allow","Principal":{"AWS":"arn:aws:iam::123456789012:root"},"Action":"secretsmanager:GetSecretValue","Resource":"*"}]}`)

	for _, c := range []struct {
		name  string
		after any // the new policy; nil = the policy is deleted
	}{
		{"the policy is replaced by a smaller one", restricted},
		{"the policy is deleted", nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			fake := &fakeSecrets{}
			p := secretProvider(fake)
			in := provider.RunInput{
				Target: provider.Target{TenantID: "11111111-1111-1111-1111-111111111111", ActionType: catalog.UpdateSecretPolicy,
					TargetARN: secretARN, TargetType: "secret",
					Account: domain.Account{AccountID: "123456789012", RoleARN: "arn:aws:iam::123456789012:role/ISPMRemediation"},
					Params:  map[string]any{"secret_id": secretARN}},
				ExecutionID: "e1", SessionName: "e1",
				Before: map[string]any{"secret_arn": secretARN, "policy": public},
				After:  map[string]any{"secret_arn": secretARN, "policy": c.after},
			}
			res, err := p.Execute(context.Background(), in)
			if err != nil {
				t.Fatal(err)
			}
			if c.after == nil {
				if fake.deletes != 1 || len(fake.puts) != 0 {
					t.Fatalf("expected one delete and no put, got %d deletes, %d puts", fake.deletes, len(fake.puts))
				}
			} else if len(fake.puts) != 1 || fake.puts[0] == nil || !*fake.puts[0] {
				t.Fatalf("the remediation must write with BlockPublicPolicy=true: %v", fake.puts)
			}

			puts := len(fake.puts)
			if _, err := p.Rollback(context.Background(), provider.RollbackInput{RunInput: in, RollbackState: res.RollbackState}); err != nil {
				t.Fatal(err)
			}
			if len(fake.puts) != puts+1 {
				t.Fatalf("the rollback must put the old policy back: %d puts", len(fake.puts))
			}
			if last := fake.puts[len(fake.puts)-1]; last == nil || *last {
				t.Fatalf("the rollback must write with BlockPublicPolicy=false, got %v", last)
			}
		})
	}
}
