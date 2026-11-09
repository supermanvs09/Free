package awsconnect

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// Diagnosis is what can be established about OUR side of a refused
// AssumeRole. STS gives the same AccessDenied for every cause and the
// customer's trust policy cannot be read from here, but our own side can be
// checked completely:
//
//   - who we really call AWS as (sts:GetCallerIdentity),
//   - whether that is the account and the role customers are told to trust,
//   - whether our own policies allow sts:AssumeRole on the customer's role
//     (iam:SimulatePrincipalPolicy, which also reports our organization's SCPs
//     and a permissions boundary).
//
// When all of that holds, the refusal can only come from the customer's
// account. Each finding is nil when it could not be established.
type Diagnosis struct {
	CallerARN     string
	CallerAccount string
	RightAccount  *bool  // we run in the account customers are told to trust
	RightIdentity *bool  // we call as the role their trust policies name
	PolicyAllows  *bool  // our own policies allow sts:AssumeRole on the role
	Decision      string // the simulation's decision: allowed, implicitDeny, explicitDeny

	Problems   []string // wrong on our side, with the fix (for operators)
	NotChecked []string // what could not be checked, and why
}

// OurFault: something on our side is wrong; the customer can do nothing.
func (d Diagnosis) OurFault() bool { return len(d.Problems) > 0 }

// OurSideClear: every check of our side ran and passed.
func (d Diagnosis) OurSideClear() bool {
	return !d.OurFault() && isTrue(d.RightAccount) && isTrue(d.RightIdentity) && isTrue(d.PolicyAllows)
}

// Summary is one line for logs and the stored request.
func (d Diagnosis) Summary() string {
	parts := []string{}
	switch {
	case d.OurFault():
		parts = append(parts, "OUR SIDE: "+strings.Join(d.Problems, "; "))
	case d.OurSideClear():
		parts = append(parts, "our side checked and fine (caller "+d.CallerARN+", policy allows) - the refusal comes from the customer's role")
	default:
		parts = append(parts, "our side not fully checked")
	}
	if len(d.NotChecked) > 0 {
		parts = append(parts, "not checked: "+strings.Join(d.NotChecked, "; "))
	}
	return strings.Join(parts, " | ")
}

func isTrue(b *bool) bool { return b != nil && *b }

// CheckPlatformIdentity is the first half of the diagnosis: who we call AWS as
// and whether that is the account and role customers trust. It needs no
// permission (GetCallerIdentity is always allowed).
func (c *Client) CheckPlatformIdentity(ctx context.Context, p Platform) Diagnosis {
	var d Diagnosis
	out, err := sts.NewFromConfig(c.platformConfig(p)).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		err = classify(err)
		if errors.Is(err, ErrPlatformCredentials) {
			d.Problems = append(d.Problems, "our AWS credentials are refused ("+err.Error()+"): fix the API server's AWS identity")
		} else {
			d.NotChecked = append(d.NotChecked, "who we call AWS as: "+err.Error())
		}
		return d
	}
	d.CallerARN, d.CallerAccount = aws.ToString(out.Arn), aws.ToString(out.Account)

	rightAccount := d.CallerAccount == p.AccountID
	d.RightAccount = &rightAccount
	if !rightAccount {
		d.Problems = append(d.Problems, fmt.Sprintf(
			"we run in AWS account %s, but customers are told to trust %s (nhi_global.tenants.collector_aws_account_id): correct one of them",
			d.CallerAccount, p.AccountID))
	}

	wantRole := p.AssumerRoleARN[strings.LastIndex(p.AssumerRoleARN, "/")+1:]
	gotRole := assumedRoleName(d.CallerARN)
	rightIdentity := gotRole != "" && gotRole == wantRole
	d.RightIdentity = &rightIdentity
	if !rightIdentity {
		d.Problems = append(d.Problems, fmt.Sprintf(
			"we call AWS as %s, but customer trust policies name the role %s: run the API as that role, or set NHI_AWS_ASSUME_ASSUMER_ROLE=true so it assumes it first",
			d.CallerARN, p.AssumerRoleARN))
	}
	return d
}

// DiagnoseAssumeRole checks our whole side of a refused AssumeRole of role.
// Calling it costs two AWS requests; it is meant for the refusal path only.
// The simulation needs iam:SimulatePrincipalPolicy on our assumer role; without
// it that part is reported as not checked, never as a fault.
func (c *Client) DiagnoseAssumeRole(ctx context.Context, p Platform, role RoleARN) Diagnosis {
	d := c.CheckPlatformIdentity(ctx, p)
	if !isTrue(d.RightIdentity) || !isTrue(d.RightAccount) {
		// Simulating a role we are not calling as would answer the wrong question.
		return d
	}
	out, err := iam.NewFromConfig(c.platformConfig(p)).SimulatePrincipalPolicy(ctx, &iam.SimulatePrincipalPolicyInput{
		PolicySourceArn: aws.String(p.AssumerRoleARN),
		ActionNames:     []string{"sts:AssumeRole"},
		ResourceArns:    []string{role.ARN},
	})
	if err != nil {
		d.NotChecked = append(d.NotChecked, fmt.Sprintf(
			"our own policy (grant iam:SimulatePrincipalPolicy on %s to check it): %v", p.AssumerRoleARN, classify(err)))
		return d
	}
	if len(out.EvaluationResults) == 0 {
		d.NotChecked = append(d.NotChecked, "our own policy: the simulation returned no result")
		return d
	}
	r := out.EvaluationResults[0]
	d.Decision = string(r.EvalDecision)
	allows := d.Decision == "allowed"
	d.PolicyAllows = &allows
	if allows {
		return d
	}
	why := fmt.Sprintf("our role %s may not sts:AssumeRole on %s (policy simulation: %s)", p.AssumerRoleARN, role.ARN, d.Decision)
	switch {
	case r.OrganizationsDecisionDetail != nil && !r.OrganizationsDecisionDetail.AllowedByOrganizations:
		why += ": a service control policy of OUR AWS organization denies it"
	case r.PermissionsBoundaryDecisionDetail != nil && !r.PermissionsBoundaryDecisionDetail.AllowedByPermissionsBoundary:
		why += ": the permissions boundary on our role denies it"
	case d.Decision == "explicitDeny":
		why += ": a Deny statement in our role's policies matches it"
	default:
		why += ": no policy of our role allows it - allow sts:AssumeRole on arn:aws:iam::*:role/* (or at least this role's name)"
	}
	d.Problems = append(d.Problems, why)
	return d
}

// assumedRoleName is NAME in arn:aws:sts::ACCOUNT:assumed-role/NAME/SESSION
// ("" for any other kind of caller).
func assumedRoleName(callerARN string) string {
	const marker = ":assumed-role/"
	i := strings.Index(callerARN, marker)
	if i < 0 {
		return ""
	}
	rest := callerARN[i+len(marker):]
	if j := strings.IndexByte(rest, '/'); j >= 0 {
		return rest[:j]
	}
	return rest
}
