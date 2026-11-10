package awsprov

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"
	aatypes "github.com/aws/aws-sdk-go-v2/service/accessanalyzer/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/provider"
)

// ValidateAccess checks that the remediation role can be assumed with the
// tenant ExternalId and that the planning reads work (IAM, KMS, Secrets
// Manager, Access Analyzer). Write permissions are not probed: a probe would
// have to write.
func (p *Provider) ValidateAccess(ctx context.Context, acct domain.Account) provider.AccessReport {
	rep := provider.AccessReport{At: time.Now().UTC()}
	region := p.defRegion
	if len(acct.EnabledRegions) > 0 {
		region = acct.EnabledRegions[0]
	}
	c, err := p.factory(ctx, acct, region, awsconnect.SessionName("validate"), readOnlyPolicy())
	if err != nil {
		rep.Status, rep.Detail = "CANNOT_ASSUME", err.Error()
		return rep
	}
	var missing []string
	probe := func(name string, err error) {
		if err != nil && isDenied(err) {
			missing = append(missing, name)
		}
	}
	// Each probe asks about something that does not exist. "Not found" (or any answer except
	// "access denied") proves the role may make the call; "access denied" proves it may not.
	// These are the reads the plans use (the keys, roles, secrets and KMS keys they look at), so the
	// check works for a role that has exactly those permissions and does not need list-everything ones.
	_, err = c.IAM.GetRole(ctx, &iam.GetRoleInput{RoleName: aws.String(probeName)})
	probe("iam:GetRole", err)
	_, err = c.IAM.ListAccessKeys(ctx, &iam.ListAccessKeysInput{UserName: aws.String(probeName)})
	probe("iam:ListAccessKeys", err)
	_, err = c.Secrets.GetResourcePolicy(ctx, &secretsmanager.GetResourcePolicyInput{SecretId: aws.String(probeName)})
	probe("secretsmanager:GetResourcePolicy", err)
	_, err = c.KMS.DescribeKey(ctx, &kms.DescribeKeyInput{KeyId: aws.String("alias/" + probeName)})
	probe("kms:DescribeKey", err)
	if len(missing) > 0 {
		rep.Status = "MISSING_PERMISSIONS"
		rep.Detail = fmt.Sprintf("the role was assumed but is denied: %s", strings.Join(missing, ", "))
		return rep
	}
	rep.Status, rep.Detail = "OK", "role assumed; the reads used by plans work"
	// Access Analyzer only adds a policy-validation pre-check to plans: without it a plan shows a
	// warning, so it never makes the status worse than OK.
	if c.Analyzer != nil {
		_, err = c.Analyzer.ValidatePolicy(ctx, &accessanalyzer.ValidatePolicyInput{
			PolicyDocument: aws.String(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"*"}]}`),
			PolicyType:     aatypes.PolicyTypeIdentityPolicy})
		if err != nil && isDenied(err) {
			rep.Detail += "; access-analyzer:ValidatePolicy is denied, so plans of policy changes show a warning instead of a policy check"
		}
	}
	return rep
}

// probeName is a name no real role, user, secret or KMS alias has.
const probeName = "ispm-validate-probe"
