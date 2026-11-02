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
	_, err = c.IAM.ListRoles(ctx, &iam.ListRolesInput{MaxItems: aws.Int32(1)})
	probe("iam:ListRoles", err)
	_, err = c.KMS.ListKeys(ctx, &kms.ListKeysInput{Limit: aws.Int32(1)})
	probe("kms:ListKeys", err)
	_, err = c.Secrets.ListSecrets(ctx, &secretsmanager.ListSecretsInput{MaxResults: aws.Int32(1)})
	probe("secretsmanager:ListSecrets", err)
	if c.Analyzer != nil {
		_, err = c.Analyzer.ValidatePolicy(ctx, &accessanalyzer.ValidatePolicyInput{
			PolicyDocument: aws.String(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"*"}]}`),
			PolicyType:     aatypes.PolicyTypeIdentityPolicy})
		probe("access-analyzer:ValidatePolicy", err)
	}
	if len(missing) > 0 {
		rep.Status = "MISSING_PERMISSIONS"
		rep.Detail = fmt.Sprintf("the role was assumed but is denied: %s", strings.Join(missing, ", "))
		return rep
	}
	rep.Status, rep.Detail = "OK", "role assumed; read access for planning works"
	return rep
}
