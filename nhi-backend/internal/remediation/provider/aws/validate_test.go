package awsprov

import (
	"context"

	"errors"

	"strings"

	"testing"

	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"

	"github.com/aws/aws-sdk-go-v2/service/iam"

	"github.com/aws/aws-sdk-go-v2/service/kms"

	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"

	"github.com/aws/smithy-go"

	"nhi-backend-api/internal/remediation/domain"
)

// The probes ask about resources that do not exist. The fakes embed the AWS interfaces without

// implementing them, so a call the check should not make (ListRoles, ListKeys, ListSecrets) panics.

type probeIAM struct {
	IAMAPI

	getRole, listKeys error
}

func (f *probeIAM) GetRole(context.Context, *iam.GetRoleInput, ...func(*iam.Options)) (*iam.GetRoleOutput, error) {

	return nil, f.getRole

}

func (f *probeIAM) ListAccessKeys(context.Context, *iam.ListAccessKeysInput, ...func(*iam.Options)) (*iam.ListAccessKeysOutput, error) {

	return nil, f.listKeys

}

type probeSecrets struct {
	SecretsAPI

	err error
}

func (f *probeSecrets) GetResourcePolicy(context.Context, *secretsmanager.GetResourcePolicyInput, ...func(*secretsmanager.Options)) (*secretsmanager.GetResourcePolicyOutput, error) {

	return nil, f.err

}

type probeKMS struct {
	KMSAPI

	err error
}

func (f *probeKMS) DescribeKey(context.Context, *kms.DescribeKeyInput, ...func(*kms.Options)) (*kms.DescribeKeyOutput, error) {

	return nil, f.err

}

type probeAnalyzer struct{ err error }

func (f *probeAnalyzer) ValidatePolicy(context.Context, *accessanalyzer.ValidatePolicyInput, ...func(*accessanalyzer.Options)) (*accessanalyzer.ValidatePolicyOutput, error) {

	return &accessanalyzer.ValidatePolicyOutput{}, f.err

}

func apiErr(code string) error { return &smithy.GenericAPIError{Code: code, Message: code} }

var (
	notFound = apiErr("NoSuchEntity")

	denied = apiErr("AccessDenied")
)

func validateWith(cl *Clients, assumeErr error) (status, detail string) {

	p := NewWithFactory(func(context.Context, domain.Account, string, string, string) (*Clients, error) {

		return cl, assumeErr

	}, "ap-south-1", Options{})

	rep := p.ValidateAccess(context.Background(), domain.Account{AccountID: "884264984984",

		RoleARN: "arn:aws:iam::884264984984:role/NHIPlatformRemediator", EnabledRegions: []string{"ap-south-1"}})

	return rep.Status, rep.Detail

}

// A role with exactly the reads the plans use passes, although it cannot list roles, keys or secrets

// and cannot use Access Analyzer; the missing analyzer is only mentioned.

func TestValidateAccessPassesForARoleWithTheReadsPlansUse(t *testing.T) {

	status, detail := validateWith(&Clients{

		IAM: &probeIAM{getRole: notFound, listKeys: notFound},

		Secrets: &probeSecrets{err: apiErr("ResourceNotFoundException")},

		KMS: &probeKMS{err: apiErr("NotFoundException")},

		Analyzer: &probeAnalyzer{err: denied},
	}, nil)

	if status != "OK" {

		t.Fatalf("status %s: %s", status, detail)

	}

	if !strings.Contains(detail, "access-analyzer:ValidatePolicy is denied") {

		t.Fatalf("the missing analyzer should be mentioned: %q", detail)

	}

}

func TestValidateAccessNamesTheDeniedReads(t *testing.T) {

	status, detail := validateWith(&Clients{

		IAM: &probeIAM{getRole: denied, listKeys: notFound},

		Secrets: &probeSecrets{err: denied},

		KMS: &probeKMS{err: apiErr("NotFoundException")},
	}, nil)

	if status != "MISSING_PERMISSIONS" || !strings.Contains(detail, "iam:GetRole") ||

		!strings.Contains(detail, "secretsmanager:GetResourcePolicy") || strings.Contains(detail, "kms") ||

		strings.Contains(detail, "iam:ListAccessKeys") {

		t.Fatalf("status %s: %s", status, detail)

	}

}

// Only "access denied" counts: any other error (throttling, a bad request) is not a missing permission.

func TestValidateAccessIgnoresOtherErrors(t *testing.T) {

	status, detail := validateWith(&Clients{

		IAM: &probeIAM{getRole: errors.New("timeout"), listKeys: apiErr("Throttling")},

		Secrets: &probeSecrets{err: apiErr("ResourceNotFoundException")},

		KMS: &probeKMS{err: apiErr("NotFoundException")},
	}, nil)

	if status != "OK" {

		t.Fatalf("status %s: %s", status, detail)

	}

}

func TestValidateAccessCannotAssume(t *testing.T) {

	// the reason from AWS is passed through as it is (the AWS layer adds its own wording)

	status, detail := validateWith(nil, denied)

	if status != "CANNOT_ASSUME" || !strings.Contains(detail, "AccessDenied") {

		t.Fatalf("status %s: %s", status, detail)

	}

}
