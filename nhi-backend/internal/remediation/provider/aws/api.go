package awsprov

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/service/accessanalyzer"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

// The interfaces list only the calls the provider uses, so tests can fake
// them (embed the interface in a struct and implement what a test needs).

type IAMAPI interface {
	GetRole(ctx context.Context, in *iam.GetRoleInput, opts ...func(*iam.Options)) (*iam.GetRoleOutput, error)
	GetRolePolicy(ctx context.Context, in *iam.GetRolePolicyInput, opts ...func(*iam.Options)) (*iam.GetRolePolicyOutput, error)
	PutRolePolicy(ctx context.Context, in *iam.PutRolePolicyInput, opts ...func(*iam.Options)) (*iam.PutRolePolicyOutput, error)
	ListRolePolicies(ctx context.Context, in *iam.ListRolePoliciesInput, opts ...func(*iam.Options)) (*iam.ListRolePoliciesOutput, error)
	ListAttachedRolePolicies(ctx context.Context, in *iam.ListAttachedRolePoliciesInput, opts ...func(*iam.Options)) (*iam.ListAttachedRolePoliciesOutput, error)
	AttachRolePolicy(ctx context.Context, in *iam.AttachRolePolicyInput, opts ...func(*iam.Options)) (*iam.AttachRolePolicyOutput, error)
	DetachRolePolicy(ctx context.Context, in *iam.DetachRolePolicyInput, opts ...func(*iam.Options)) (*iam.DetachRolePolicyOutput, error)
	GetPolicy(ctx context.Context, in *iam.GetPolicyInput, opts ...func(*iam.Options)) (*iam.GetPolicyOutput, error)
	GetPolicyVersion(ctx context.Context, in *iam.GetPolicyVersionInput, opts ...func(*iam.Options)) (*iam.GetPolicyVersionOutput, error)
	ListPolicyVersions(ctx context.Context, in *iam.ListPolicyVersionsInput, opts ...func(*iam.Options)) (*iam.ListPolicyVersionsOutput, error)
	CreatePolicy(ctx context.Context, in *iam.CreatePolicyInput, opts ...func(*iam.Options)) (*iam.CreatePolicyOutput, error)
	CreatePolicyVersion(ctx context.Context, in *iam.CreatePolicyVersionInput, opts ...func(*iam.Options)) (*iam.CreatePolicyVersionOutput, error)
	DeletePolicyVersion(ctx context.Context, in *iam.DeletePolicyVersionInput, opts ...func(*iam.Options)) (*iam.DeletePolicyVersionOutput, error)
	SetDefaultPolicyVersion(ctx context.Context, in *iam.SetDefaultPolicyVersionInput, opts ...func(*iam.Options)) (*iam.SetDefaultPolicyVersionOutput, error)
	DeletePolicy(ctx context.Context, in *iam.DeletePolicyInput, opts ...func(*iam.Options)) (*iam.DeletePolicyOutput, error)
	UpdateAssumeRolePolicy(ctx context.Context, in *iam.UpdateAssumeRolePolicyInput, opts ...func(*iam.Options)) (*iam.UpdateAssumeRolePolicyOutput, error)
	UpdateRole(ctx context.Context, in *iam.UpdateRoleInput, opts ...func(*iam.Options)) (*iam.UpdateRoleOutput, error)
	ListAccessKeys(ctx context.Context, in *iam.ListAccessKeysInput, opts ...func(*iam.Options)) (*iam.ListAccessKeysOutput, error)
	GetAccessKeyLastUsed(ctx context.Context, in *iam.GetAccessKeyLastUsedInput, opts ...func(*iam.Options)) (*iam.GetAccessKeyLastUsedOutput, error)
	UpdateAccessKey(ctx context.Context, in *iam.UpdateAccessKeyInput, opts ...func(*iam.Options)) (*iam.UpdateAccessKeyOutput, error)
	DeleteAccessKey(ctx context.Context, in *iam.DeleteAccessKeyInput, opts ...func(*iam.Options)) (*iam.DeleteAccessKeyOutput, error)
	CreateAccessKey(ctx context.Context, in *iam.CreateAccessKeyInput, opts ...func(*iam.Options)) (*iam.CreateAccessKeyOutput, error)
	GenerateServiceLastAccessedDetails(ctx context.Context, in *iam.GenerateServiceLastAccessedDetailsInput, opts ...func(*iam.Options)) (*iam.GenerateServiceLastAccessedDetailsOutput, error)
	GetServiceLastAccessedDetails(ctx context.Context, in *iam.GetServiceLastAccessedDetailsInput, opts ...func(*iam.Options)) (*iam.GetServiceLastAccessedDetailsOutput, error)
	ListRoles(ctx context.Context, in *iam.ListRolesInput, opts ...func(*iam.Options)) (*iam.ListRolesOutput, error)
}

type KMSAPI interface {
	DescribeKey(ctx context.Context, in *kms.DescribeKeyInput, opts ...func(*kms.Options)) (*kms.DescribeKeyOutput, error)
	GetKeyPolicy(ctx context.Context, in *kms.GetKeyPolicyInput, opts ...func(*kms.Options)) (*kms.GetKeyPolicyOutput, error)
	PutKeyPolicy(ctx context.Context, in *kms.PutKeyPolicyInput, opts ...func(*kms.Options)) (*kms.PutKeyPolicyOutput, error)
	ListGrants(ctx context.Context, in *kms.ListGrantsInput, opts ...func(*kms.Options)) (*kms.ListGrantsOutput, error)
	RevokeGrant(ctx context.Context, in *kms.RevokeGrantInput, opts ...func(*kms.Options)) (*kms.RevokeGrantOutput, error)
	CreateGrant(ctx context.Context, in *kms.CreateGrantInput, opts ...func(*kms.Options)) (*kms.CreateGrantOutput, error)
	EnableKeyRotation(ctx context.Context, in *kms.EnableKeyRotationInput, opts ...func(*kms.Options)) (*kms.EnableKeyRotationOutput, error)
	DisableKeyRotation(ctx context.Context, in *kms.DisableKeyRotationInput, opts ...func(*kms.Options)) (*kms.DisableKeyRotationOutput, error)
	GetKeyRotationStatus(ctx context.Context, in *kms.GetKeyRotationStatusInput, opts ...func(*kms.Options)) (*kms.GetKeyRotationStatusOutput, error)
	ListKeys(ctx context.Context, in *kms.ListKeysInput, opts ...func(*kms.Options)) (*kms.ListKeysOutput, error)
}

type SecretsAPI interface {
	DescribeSecret(ctx context.Context, in *secretsmanager.DescribeSecretInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.DescribeSecretOutput, error)
	GetResourcePolicy(ctx context.Context, in *secretsmanager.GetResourcePolicyInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.GetResourcePolicyOutput, error)
	PutResourcePolicy(ctx context.Context, in *secretsmanager.PutResourcePolicyInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.PutResourcePolicyOutput, error)
	DeleteResourcePolicy(ctx context.Context, in *secretsmanager.DeleteResourcePolicyInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.DeleteResourcePolicyOutput, error)
	RotateSecret(ctx context.Context, in *secretsmanager.RotateSecretInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.RotateSecretOutput, error)
	UpdateSecretVersionStage(ctx context.Context, in *secretsmanager.UpdateSecretVersionStageInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.UpdateSecretVersionStageOutput, error)
	PutSecretValue(ctx context.Context, in *secretsmanager.PutSecretValueInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.PutSecretValueOutput, error)
	ListSecrets(ctx context.Context, in *secretsmanager.ListSecretsInput, opts ...func(*secretsmanager.Options)) (*secretsmanager.ListSecretsOutput, error)
}

type AnalyzerAPI interface {
	ValidatePolicy(ctx context.Context, in *accessanalyzer.ValidatePolicyInput, opts ...func(*accessanalyzer.Options)) (*accessanalyzer.ValidatePolicyOutput, error)
}

// Clients groups the service clients of one session.
type Clients struct {
	IAM      IAMAPI
	KMS      KMSAPI
	Secrets  SecretsAPI
	Analyzer AnalyzerAPI
	Region   string
}
