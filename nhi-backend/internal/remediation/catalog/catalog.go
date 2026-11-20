// Package catalog holds the default action catalog (design 10.1), the
// rule -> action mapping (10.2), the guided step templates and the helpers
// that fill action parameters from finding evidence.
package catalog

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

// Action type names.
const (
	ScopePolicy          = "scope_policy"
	ReplaceManagedPolicy = "replace_managed_policy"
	RemoveStatement      = "remove_statement"
	DeactivateKey        = "deactivate_key"
	DeleteKey            = "delete_key"
	ReplaceKeyWithRole   = "replace_key_with_role" // guided only
	RewriteTrust         = "rewrite_trust"
	UpdateKeyPolicy      = "update_key_policy"
	RevokeGrant          = "revoke_grant"
	UpdateSecretPolicy   = "update_secret_policy"
	ReviewKeyAccess      = "review_key_access" // guided only
	RotateAccessKey      = "rotate_access_key"
	RotateSecret         = "rotate_secret"
	SetSessionDuration   = "set_session_duration"
	EnableKeyRotation    = "enable_key_rotation"

	// Reme4 / Reme10: public and cross-account exposure of resources
	BlockS3PublicAccess = "block_s3_public_access"
	UpdateBucketPolicy  = "update_bucket_policy"
	UpdateQueuePolicy   = "update_queue_policy"
	UpdateTopicPolicy   = "update_topic_policy"
	UnshareAMI          = "unshare_ami"
	UnshareSnapshot     = "unshare_snapshot"
	UnshareRDSSnapshot  = "unshare_rds_snapshot"
	// Reme5: workload configuration
	EnforceIMDS = "enforce_imds"
	// Reme11 / Reme12 / Reme14: unused roles, privilege escalation, policy versions
	QuarantineRole       = "quarantine_role"
	DenyIAMEscalation    = "deny_iam_escalation"
	DenyEscalation       = "deny_escalation"
	RestorePolicyVersion = "restore_policy_version"
)

type step struct {
	Title   string `json:"title"`
	Console string `json:"console,omitempty"`
	CLI     string `json:"cli,omitempty"`
	IaC     string `json:"iac,omitempty"`
}

func steps(s ...step) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

// Defaults returns the seeded catalog.
func Defaults() []domain.Action {
	a := func(t, group string, risk domain.Risk, reversible, oneClick bool, grace int, title, desc string, perms []string, st json.RawMessage) domain.Action {
		return domain.Action{ActionType: t, Group: group, Platform: "aws", Title: title, Description: desc, RiskLevel: risk,
			Reversible: reversible, OneClickSupported: oneClick, DefaultGraceDays: grace, RequiredPermissions: perms, StepsTemplate: st, Enabled: true}
	}
	return []domain.Action{
		a(ScopePolicy, "R1", domain.RiskHigh, true, true, 0, "Scope down a role policy",
			"Replace wildcard / unused permissions of an inline or customer-managed policy with the permissions actually used.",
			[]string{"iam:PutRolePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"},
			steps(step{"Review the policy {policy_ref} on role {role_arn}",
				"IAM > Roles > {role_name} > Permissions > {policy_ref} > Edit policy (JSON)",
				"aws iam get-role-policy --role-name {role_name} --policy-name {policy_name}", ""},
				step{"Replace it with the scoped document shown in the diff",
					"Paste the proposed JSON and save",
					"aws iam put-role-policy --role-name {role_name} --policy-name {policy_name} --policy-document file://scoped-policy.json",
					"resource \"aws_iam_role_policy\" \"{policy_name}\" {\n  role   = \"{role_name}\"\n  policy = file(\"scoped-policy.json\")\n}"})),
		a(ReplaceManagedPolicy, "R1", domain.RiskHigh, true, true, 0, "Replace an AWS managed policy with a scoped customer policy",
			"Create a scoped customer-managed policy, attach it, detach the AWS managed policy. AWS managed policies are never edited.",
			[]string{"iam:CreatePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:DeletePolicy"},
			steps(step{"Create the scoped policy {new_policy_name}", "IAM > Policies > Create policy > JSON",
				"aws iam create-policy --policy-name {new_policy_name} --policy-document file://scoped-policy.json", ""},
				step{"Attach it to {role_name}", "IAM > Roles > {role_name} > Add permissions",
					"aws iam attach-role-policy --role-name {role_name} --policy-arn {new_policy_arn}", ""},
				step{"Detach {policy_arn}", "IAM > Roles > {role_name} > Permissions > Remove",
					"aws iam detach-role-policy --role-name {role_name} --policy-arn {policy_arn}", ""})),
		a(RemoveStatement, "R1", domain.RiskHigh, true, true, 0, "Remove a policy statement",
			"Remove one over-broad statement from an inline or customer-managed policy.",
			[]string{"iam:PutRolePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"},
			steps(step{"Remove the statement from {policy_ref} on {role_name}", "IAM > Roles > {role_name} > {policy_ref} > Edit policy",
				"aws iam get-role-policy --role-name {role_name} --policy-name {policy_name}", ""})),

		a(DeactivateKey, "R2", domain.RiskLow, true, true, 0, "Deactivate an IAM access key",
			"Set the access key to Inactive. Reversible until the key is deleted.",
			[]string{"iam:UpdateAccessKey"},
			steps(step{"Deactivate access key {access_key_id} of user {user_name}", "IAM > Users > {user_name} > Security credentials > Make inactive",
				"aws iam update-access-key --user-name {user_name} --access-key-id {access_key_id} --status Inactive", ""})),
		a(DeleteKey, "R2", domain.RiskHigh, false, true, 30, "Delete an IAM access key",
			"Delete an inactive access key after the grace period. Irreversible.",
			[]string{"iam:DeleteAccessKey"},
			steps(step{"Delete access key {access_key_id} of user {user_name}", "IAM > Users > {user_name} > Security credentials > Delete",
				"aws iam delete-access-key --user-name {user_name} --access-key-id {access_key_id}", ""})),
		a(ReplaceKeyWithRole, "R2", domain.RiskMedium, true, false, 0, "Replace the static key with an IAM role",
			"Guided only: the workload must be changed to use a role (instance profile, task role, IRSA, OIDC).",
			nil,
			steps(step{"Create or choose an IAM role for the workload that uses key {access_key_id} (user {user_name})",
				"IAM > Roles > Create role", "", "resource \"aws_iam_role\" \"workload\" { ... }"},
				step{"Switch the workload to the role, then deactivate the key", "",
					"aws iam update-access-key --user-name {user_name} --access-key-id {access_key_id} --status Inactive", ""})),

		a(RewriteTrust, "R3", domain.RiskHigh, true, true, 0, "Restrict a role trust policy",
			"Restrict principals and add conditions (ExternalId, PrincipalOrgID, OIDC sub/aud, MFA) to the role's trust policy.",
			[]string{"iam:UpdateAssumeRolePolicy"},
			steps(step{"Edit the trust policy of {role_name}", "IAM > Roles > {role_name} > Trust relationships > Edit trust policy",
				"aws iam update-assume-role-policy --role-name {role_name} --policy-document file://trust.json", ""})),

		a(UpdateKeyPolicy, "R4", domain.RiskHigh, true, true, 0, "Restrict a KMS key policy",
			"Remove principals or add source conditions in the key policy. Key administrators and the account root statement are never touched.",
			[]string{"kms:PutKeyPolicy"},
			steps(step{"Edit the key policy of {key_id}", "KMS > Customer managed keys > {key_id} > Key policy > Edit",
				"aws kms put-key-policy --key-id {key_id} --policy-name default --policy file://key-policy.json", ""})),
		a(RevokeGrant, "R4", domain.RiskHigh, true, true, 0, "Revoke a KMS grant",
			"Revoke grants to external or unneeded principals. Rollback re-creates the grant with a new grant id.",
			[]string{"kms:RevokeGrant", "kms:CreateGrant"},
			steps(step{"Revoke grant {grant_id} on {key_id}", "",
				"aws kms revoke-grant --key-id {key_id} --grant-id {grant_id}", ""})),
		a(UpdateSecretPolicy, "R4", domain.RiskHigh, true, true, 0, "Restrict a secret resource policy",
			"Block public / cross-account access in the secret's resource policy, or delete the policy.",
			[]string{"secretsmanager:PutResourcePolicy", "secretsmanager:DeleteResourcePolicy"},
			steps(step{"Update the resource policy of {secret_id}", "Secrets Manager > {secret_id} > Resource permissions > Edit",
				"aws secretsmanager put-resource-policy --secret-id {secret_id} --resource-policy file://policy.json --block-public-policy", ""})),
		a(ReviewKeyAccess, "R4", domain.RiskMedium, true, false, 0, "Review key access (guided)",
			"Guided only: review who can use the key and remove access that is not needed.", nil,
			steps(step{"Review the key policy and grants of {key_id}", "KMS > Customer managed keys > {key_id}",
				"aws kms list-grants --key-id {key_id}", ""})),

		a(RotateAccessKey, "R5", domain.RiskHigh, true, true, 0, "Rotate an IAM access key",
			"Create a new key, deliver it to a Secrets Manager secret, wait until the new key is used, then deactivate the old one.",
			[]string{"iam:CreateAccessKey", "iam:UpdateAccessKey", "secretsmanager:PutSecretValue"},
			steps(step{"Create a new access key for {user_name}", "IAM > Users > {user_name} > Create access key",
				"aws iam create-access-key --user-name {user_name}", ""},
				step{"Update the workload to use the new key", "", "", ""},
				step{"Deactivate the old key {access_key_id}", "",
					"aws iam update-access-key --user-name {user_name} --access-key-id {access_key_id} --status Inactive", ""})),
		a(RotateSecret, "R5", domain.RiskMedium, true, true, 0, "Rotate a Secrets Manager secret",
			"Trigger an immediate rotation (needs a rotation Lambda).",
			[]string{"secretsmanager:RotateSecret", "secretsmanager:UpdateSecretVersionStage"},
			steps(step{"Rotate {secret_id}", "Secrets Manager > {secret_id} > Rotation > Rotate secret immediately",
				"aws secretsmanager rotate-secret --secret-id {secret_id}", ""})),
		a(SetSessionDuration, "R5", domain.RiskLow, true, true, 0, "Lower the role's maximum session duration",
			"Set MaxSessionDuration of the role.", []string{"iam:UpdateRole"},
			steps(step{"Set MaxSessionDuration of {role_name} to {new_max_session} seconds", "IAM > Roles > {role_name} > Maximum session duration",
				"aws iam update-role --role-name {role_name} --max-session-duration {new_max_session}",
				"resource \"aws_iam_role\" \"r\" { max_session_duration = {new_max_session} }"})),
		a(EnableKeyRotation, "R5", domain.RiskLow, true, true, 0, "Enable automatic KMS key rotation",
			"Enable annual rotation of the key material.", []string{"kms:EnableKeyRotation", "kms:DisableKeyRotation"},
			steps(step{"Enable rotation for {key_id}", "KMS > Customer managed keys > {key_id} > Key rotation",
				"aws kms enable-key-rotation --key-id {key_id}", "resource \"aws_kms_key\" \"k\" { enable_key_rotation = true }"})),

		// ---- Reme4 / Reme10: public and cross-account exposure ----
		a(BlockS3PublicAccess, "R6", domain.RiskMedium, true, true, 0, "Turn on S3 Block Public Access for the bucket",
			"Turns on the four Block Public Access settings of the bucket, so public ACLs and public bucket policies stop working.",
			[]string{"s3:PutBucketPublicAccessBlock"},
			steps(step{"Read the Block Public Access settings of the bucket", "S3 > Buckets > {bucket} > Permissions > Block public access",
				"aws s3api get-public-access-block --bucket {bucket}", ""},
				step{"Check the bucket is not a public website or a public download location that must stay public", "S3 > Buckets > {bucket} > Properties > Static website hosting",
					"aws s3api get-bucket-website --bucket {bucket}", ""},
				step{"Turn on all four settings", "S3 > Buckets > {bucket} > Permissions > Block public access > Edit > Block all public access",
					"aws s3api put-public-access-block --bucket {bucket} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true", ""},
				step{"Check the settings", "", "aws s3api get-public-access-block --bucket {bucket}", ""})),
		a(UpdateBucketPolicy, "R6", domain.RiskHigh, true, true, 0, "Remove public and external principals from a bucket policy",
			"Removes \"*\" (without a limiting condition) and the named external accounts from the bucket policy; deletes the policy when nothing is left.",
			[]string{"s3:PutBucketPolicy", "s3:DeleteBucketPolicy"},
			steps(step{"Read the bucket policy", "S3 > Buckets > {bucket} > Permissions > Bucket policy",
				"aws s3api get-bucket-policy --bucket {bucket} --query Policy --output text", ""},
				step{"Keep a policy: save it without the public / external statements shown in the diff", "S3 > Buckets > {bucket} > Permissions > Bucket policy > Edit",
					"aws s3api put-bucket-policy --bucket {bucket} --policy file://bucket-policy.json", ""},
				step{"Or, when no statement is left: delete the policy", "", "aws s3api delete-bucket-policy --bucket {bucket}", ""})),
		a(UpdateQueuePolicy, "R6", domain.RiskHigh, true, true, 0, "Remove public and external principals from an SQS queue policy",
			"Removes \"*\" (without a limiting condition) and the named external accounts from the queue policy.",
			[]string{"sqs:SetQueueAttributes"},
			steps(step{"Read the queue policy", "SQS > Queues > {queue_name} > Access policy",
				"aws sqs get-queue-attributes --queue-url {queue_url} --attribute-names Policy{region_flag}", ""},
				step{"Save the policy without the public / external statements shown in the diff (file: {\"Policy\":\"<policy JSON as a string>\"})", "SQS > Queues > {queue_name} > Edit > Access policy",
					"aws sqs set-queue-attributes --queue-url {queue_url} --attributes file://queue-policy-attribute.json{region_flag}", ""})),
		a(UpdateTopicPolicy, "R6", domain.RiskHigh, true, true, 0, "Remove public and external principals from an SNS topic policy",
			"Removes \"*\" (without a limiting condition such as AWS:SourceOwner) and the named external accounts from the topic policy.",
			[]string{"sns:SetTopicAttributes"},
			steps(step{"Read the topic policy", "SNS > Topics > {topic_name} > Access policy",
				"aws sns get-topic-attributes --topic-arn {topic_arn} --query Attributes.Policy --output text{region_flag}", ""},
				step{"Save the policy without the public / external statements shown in the diff", "SNS > Topics > {topic_name} > Edit > Access policy",
					"aws sns set-topic-attributes --topic-arn {topic_arn} --attribute-name Policy --attribute-value file://topic-policy.json{region_flag}", ""})),
		a(UnshareAMI, "R6", domain.RiskMedium, true, true, 0, "Remove public / external sharing of an AMI",
			"Removes the public launch permission and the named external accounts from the AMI. Organization / OU shares are kept.",
			[]string{"ec2:ModifyImageAttribute"},
			steps(step{"Read who can launch the AMI", "EC2 > AMIs > {image_id} > Permissions",
				"aws ec2 describe-image-attribute --image-id {image_id} --attribute launchPermission{region_flag}", ""},
				step{"Remove public sharing", "EC2 > AMIs > {image_id} > Actions > Edit AMI permissions > Private",
					"aws ec2 modify-image-attribute --image-id {image_id} --launch-permission \"Remove=[{Group=all}]\"{region_flag}", ""},
				step{"Remove each external account", "EC2 > AMIs > {image_id} > Actions > Edit AMI permissions > Remove account",
					"aws ec2 modify-image-attribute --image-id {image_id} --launch-permission \"Remove=[{UserId=<other_account_id>}]\"{region_flag}", ""})),
		a(UnshareSnapshot, "R6", domain.RiskMedium, true, true, 0, "Remove public / external sharing of an EBS snapshot",
			"Removes the public create-volume permission and the named external accounts from the snapshot.",
			[]string{"ec2:ModifySnapshotAttribute"},
			steps(step{"Read who can create volumes from the snapshot", "EC2 > Snapshots > {snapshot_id} > Permissions",
				"aws ec2 describe-snapshot-attribute --snapshot-id {snapshot_id} --attribute createVolumePermission{region_flag}", ""},
				step{"Remove public sharing", "EC2 > Snapshots > {snapshot_id} > Actions > Snapshot settings > Modify permissions > Private",
					"aws ec2 modify-snapshot-attribute --snapshot-id {snapshot_id} --attribute createVolumePermission --operation-type remove --group-names all{region_flag}", ""},
				step{"Remove each external account", "EC2 > Snapshots > {snapshot_id} > Actions > Snapshot settings > Modify permissions",
					"aws ec2 modify-snapshot-attribute --snapshot-id {snapshot_id} --attribute createVolumePermission --operation-type remove --user-ids <other_account_id>{region_flag}", ""})),
		a(UnshareRDSSnapshot, "R6", domain.RiskMedium, true, true, 0, "Remove public / external sharing of an RDS snapshot",
			"Removes \"all\" and the named external accounts from the restore attribute of a DB or Aurora cluster snapshot.",
			[]string{"rds:ModifyDBSnapshotAttribute", "rds:ModifyDBClusterSnapshotAttribute"},
			steps(step{"Read who can restore the snapshot", "RDS > Snapshots > {snapshot_id} > Actions > Share snapshot",
				"aws rds describe-db-snapshot-attributes --db-snapshot-identifier {snapshot_id}{region_flag}", ""},
				step{"Remove public and external sharing (Aurora: modify-db-cluster-snapshot-attribute --db-cluster-snapshot-identifier)", "RDS > Snapshots > {snapshot_id} > Actions > Share snapshot > Private",
					"aws rds modify-db-snapshot-attribute --db-snapshot-identifier {snapshot_id} --attribute-name restore --values-to-remove all <other_account_id>{region_flag}", ""})),

		// ---- Reme5: workload configuration ----
		a(EnforceIMDS, "R7", domain.RiskMedium, true, true, 0, "Require IMDSv2 and limit the metadata hop count",
			"Sets HttpTokens=required and the IMDS response hop limit (default 1) on the instance. Software that still uses IMDSv1 stops getting credentials.",
			[]string{"ec2:ModifyInstanceMetadataOptions"},
			steps(step{"Read the instance metadata options", "EC2 > Instances > {instance_id} > Details > Instance metadata",
				"aws ec2 describe-instances --instance-ids {instance_id} --query \"Reservations[].Instances[].MetadataOptions\"{region_flag}", ""},
				step{"Require IMDSv2 and set the hop limit (2 only for containers that need the instance role)", "EC2 > Instances > {instance_id} > Actions > Instance settings > Modify instance metadata options",
					"aws ec2 modify-instance-metadata-options --instance-id {instance_id} --http-tokens required --http-put-response-hop-limit {hop_limit} --http-endpoint enabled{region_flag}", ""},
				step{"Change the launch template / Auto Scaling group too, so new instances get the same setting", "EC2 > Launch templates > <template> > Modify template (Create new version) > Metadata", "", ""})),

		// ---- Reme11 / Reme12 / Reme14 ----
		a(QuarantineRole, "R8", domain.RiskHigh, true, true, 0, "Quarantine an unused role (inline Deny-all)",
			"Adds the inline policy ISPMQuarantine that denies every action to the role. Nothing is deleted; rollback removes the policy.",
			[]string{"iam:PutRolePolicy", "iam:DeleteRolePolicy"},
			steps(step{"Confirm the role is not used", "IAM > Roles > {role_name} > Last activity",
				"aws iam get-role --role-name {role_name} --query Role.RoleLastUsed", ""},
				step{"Add a Deny-all inline policy (undo: delete the inline policy ISPMQuarantine)", "IAM > Roles > {role_name} > Add permissions > Create inline policy",
					"aws iam put-role-policy --role-name {role_name} --policy-name ISPMQuarantine --policy-document file://deny-all.json", ""},
				step{"Later, when nobody needed the role: delete it", "IAM > Roles > {role_name} > Delete", "", ""})),
		a(DenyIAMEscalation, "R8", domain.RiskHigh, true, true, 0, "Deny IAM privilege-escalation actions to the role",
			"Adds the inline policy ISPMDenyIAMEscalation that denies the IAM write actions a role can use to grant itself more permissions.",
			[]string{"iam:PutRolePolicy", "iam:DeleteRolePolicy"},
			steps(step{"Check the role is not an approved IAM administration or pipeline role", "IAM > Roles > {role_name} > Permissions",
				"aws iam list-attached-role-policies --role-name {role_name}", ""},
				step{"Add the inline Deny of the IAM escalation actions shown in the diff (undo: delete the inline policy ISPMDenyIAMEscalation)", "IAM > Roles > {role_name} > Add permissions > Create inline policy",
					"aws iam put-role-policy --role-name {role_name} --policy-name ISPMDenyIAMEscalation --policy-document file://deny-iam-escalation.json", ""})),
		a(DenyEscalation, "R8", domain.RiskHigh, true, true, 0, "Deny the escalation actions named by the finding",
			"Adds the inline policy ISPMDenyEscalation that denies only the escalation actions the finding names (params.actions).",
			[]string{"iam:PutRolePolicy", "iam:DeleteRolePolicy"},
			steps(step{"Add the inline Deny of the actions shown in the diff (undo: delete the inline policy ISPMDenyEscalation)", "IAM > Roles > {role_name} > Add permissions > Create inline policy",
				"aws iam put-role-policy --role-name {role_name} --policy-name ISPMDenyEscalation --policy-document file://deny-escalation.json", ""})),
		a(RestorePolicyVersion, "R8", domain.RiskHigh, true, true, 0, "Set a managed policy back to an approved version",
			"Makes the approved (or previous) version of a customer-managed policy the default again. No version is deleted.",
			[]string{"iam:SetDefaultPolicyVersion"},
			steps(step{"List the versions of the policy", "IAM > Policies > {policy_name} > Policy versions",
				"aws iam list-policy-versions --policy-arn {policy_arn}", ""},
				step{"Set the approved version as default", "IAM > Policies > {policy_name} > Policy versions > {version_id} > Set as default",
					"aws iam set-default-policy-version --policy-arn {policy_arn} --version-id {version_id}", ""})),
	}
}

// RuleActions returns the default rule -> action mapping (design section 6).
func RuleActions() []domain.RuleAction {
	var out []domain.RuleAction
	add := func(rule, action string, def bool, params string) {
		out = append(out, domain.RuleAction{RuleID: rule, ActionType: action, IsDefault: def, ParamsTemplate: json.RawMessage(params)})
	}
	role := `{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn"}`
	// ECS-04 and ACM-02 are not mapped: ECS-04 is disabled as a duplicate of IAM-05/06/07,
	// and ACM-02's target is a Private CA, not a role policy.
	for _, r := range []string{"IAM-05", "IAM-06", "IAM-07", "IAM-09", "K-I04", "NHI-010", "CICD-02", "RS-01"} {
		def := ScopePolicy
		if r == "IAM-05" {
			def = ReplaceManagedPolicy
		}
		for _, act := range []string{ScopePolicy, ReplaceManagedPolicy, RemoveStatement} {
			add(r, act, act == def, role)
		}
	}
	// Key IDs: a single id, or a list (IAM-03 active_keys, O10 access_keys, M09 keys "AKIA...@region",
	// IAM-04 access_key_ids, CICD-03 keys). The AWS provider picks one key from a list and finds the
	// user from the key id when the evidence has no user (GetAccessKeyLastUsed returns it).
	keyIDs := "$.evidence.access_key_id|$.evidence.active_keys|$.evidence.access_keys|$.evidence.access_key_ids|$.evidence.keys"
	key := `{"user_name":"$.evidence.user_name","access_key_id":"` + keyIDs + `"}`
	// O10 and M09 are identity rules on the IAM user itself: the identity name is the user name.
	userKey := `{"user_name":"$.evidence.user_name|$.finding.identity_name","access_key_id":"` + keyIDs + `"}`
	add("IAM-01", DeactivateKey, true, key)
	add("IAM-01", RotateAccessKey, false, key)
	for _, r := range []string{"IAM-02", "IAM-03"} {
		add(r, DeactivateKey, true, key)
	}
	for _, r := range []string{"O10", "M09"} {
		add(r, DeactivateKey, true, userKey)
	}
	add("CR-009", DeactivateKey, true, `{"user_name":"$.evidence.user_name","access_key_id":"`+keyIDs+`","skip_usage_check":true}`)
	add("IAM-04", ReplaceKeyWithRole, true, key)
	add("CICD-03", ReplaceKeyWithRole, true, key)

	for _, r := range []string{"IAM-14", "IAM-16", "IAM-17", "O03", "O04", "K-I05"} {
		add(r, RewriteTrust, true, role)
	}
	add("IAM-15", RewriteTrust, true, `{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","add_external_id":true}`)
	// IAM-29 is disabled in the engine (human MFA; its root-principal case is IAM-16).
	for _, r := range []string{"STS-01", "STS-04", "EKS-04"} {
		add(r, RewriteTrust, true, `{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","oidc_pin":true}`)
	}

	// M02 / M03 (multi-region key drift) are not mapped: the finding names an alias / key id
	// across regions, not one key ARN, so there is no single target to change.
	for _, r := range []string{"KMS-01", "EI-C04", "EI-C08"} {
		add(r, UpdateKeyPolicy, true, `{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}`)
	}
	// KMS-02 evidence lists the external accounts; the first one is revoked, the next scan reports any other.
	add("KMS-02", RevokeGrant, true, `{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn","grantee_principal":"$.evidence.grantee_principal|$.evidence.external_accounts[0]"}`)
	add("K-C08", ReviewKeyAccess, true, `{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}`)
	for _, r := range []string{"SEC-02", "SEC-03"} {
		add(r, UpdateSecretPolicy, true, `{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}`)
	}

	add("SEC-01", RotateSecret, true, `{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}`)
	add("CR-006", RotateSecret, true, `{"secret_id":"$.evidence.secret_arn|$.evidence.secret|$.finding.credential_arn"}`)
	// S-C01 is not mapped: its target is an Identity Center permission set or a Roles Anywhere
	// profile, not a role (UpdateRole would fail).
	for _, r := range []string{"IAM-19", "I10", "O08"} {
		add(r, SetSessionDuration, true, `{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","new_max_session":3600}`)
	}
	add("KMS-03", EnableKeyRotation, true, `{"key_id":"$.evidence.key_arn|$.evidence.key_id|$.evidence.key|$.finding.credential_arn"}`)

	// ---- Reme4 / Reme5 / Reme10 / Reme11 / Reme12 / Reme14 ----
	// The finding names the resource in different evidence keys depending on the scanner table, so
	// each template lists the usual ones; the AWS provider also searches the finding for an id of the
	// right shape (ami-, snap-, i-, an S3 / SQS / SNS / RDS ARN) when the template finds none.
	region := `"region":"$.evidence.region|$.evidence.aws_region"`
	external := `"remove_principals":"$.evidence.external_accounts|$.evidence.external_principals|$.evidence.shared_with|$.evidence.shared_accounts|$.evidence.user_ids"`
	add("S3-01", BlockS3PublicAccess, true, `{"target_arn":"$.evidence.bucket_arn|$.evidence.resource_arn|$.finding.credential_arn","bucket":"$.evidence.bucket|$.evidence.bucket_name|$.evidence.resource_name",`+external+`}`)
	add("S3-01", UpdateBucketPolicy, false, `{"target_arn":"$.evidence.bucket_arn|$.evidence.resource_arn|$.finding.credential_arn","bucket":"$.evidence.bucket|$.evidence.bucket_name|$.evidence.resource_name",`+external+`}`)
	add("EC2-07", UnshareAMI, true, `{"image_id":"$.evidence.image_id|$.evidence.ami_id|$.evidence.ami|$.evidence.resource_id|$.finding.credential_arn",`+region+`,`+external+`}`)
	add("EC2-08", UnshareSnapshot, true, `{"snapshot_id":"$.evidence.snapshot_id|$.evidence.snapshot|$.evidence.resource_id|$.finding.credential_arn",`+region+`,`+external+`}`)
	add("RDS-02", UnshareRDSSnapshot, true, `{"snapshot_id":"$.evidence.snapshot_arn|$.evidence.snapshot_id|$.evidence.snapshot|$.evidence.resource_arn|$.finding.credential_arn",`+region+`,`+external+`}`)
	for _, r := range []string{"EC2-01", "EC2-02"} {
		add(r, EnforceIMDS, true, `{"instance_id":"$.evidence.instance_id|$.evidence.instance_arn|$.evidence.resource_id|$.finding.identity_name|$.finding.identity_id",`+region+`,"hop_limit":1}`)
	}
	add("SQS-01", UpdateQueuePolicy, true, `{"target_arn":"$.evidence.queue_arn|$.evidence.resource_arn|$.finding.credential_arn","queue_url":"$.evidence.queue_url",`+external+`}`)
	add("SNS-01", UpdateTopicPolicy, true, `{"target_arn":"$.evidence.topic_arn|$.evidence.resource_arn|$.finding.credential_arn",`+external+`}`)
	for _, r := range []string{"IAM-22", "IAM-23"} {
		add(r, QuarantineRole, true, role)
	}
	// IAM-11 keeps scope_policy as its default fix (the existing mapping); the Deny is an alternative.
	add("IAM-11", DenyIAMEscalation, false, role)
	escalation := `{"target_arn":"$.evidence.role_arn|$.evidence.execution_role_arn|$.finding.credential_arn","actions":"$.evidence.escalation_actions|$.evidence.dangerous_actions|$.evidence.actions"}`
	for _, r := range []string{"IAM-12", "IAM-13"} {
		add(r, DenyIAMEscalation, true, role)
		add(r, DenyEscalation, false, escalation)
	}
	// BEH-09 is not one of the posture rules today; the mapping is here for when it is added.
	add("BEH-09", RestorePolicyVersion, true, `{"policy_arn":"$.evidence.policy_arn|$.finding.credential_arn","version_id":"$.evidence.approved_version|$.evidence.previous_version"}`)
	return out
}

// Seed writes the defaults for rows that do not exist yet; edits made in the
// database are kept.
func Seed(ctx context.Context, s *store.Store) error {
	for _, a := range Defaults() {
		if err := s.SeedAction(ctx, a); err != nil {
			return err
		}
	}
	// The rule -> action mapping is not seeded here: it lives in ispm_rule_weights
	// (tenant migration 009, same as engine migration 012); RuleActions() above is the
	// reference it was built from.
	return nil
}

// TargetType returns the kind of resource an action changes.
func TargetType(actionType string) string {
	switch actionType {
	case ScopePolicy, ReplaceManagedPolicy, RemoveStatement, RewriteTrust, SetSessionDuration:
		return "iam_role"
	case DeactivateKey, DeleteKey, RotateAccessKey, ReplaceKeyWithRole:
		return "iam_user"
	case UpdateKeyPolicy, RevokeGrant, EnableKeyRotation, ReviewKeyAccess:
		return "kms_key"
	case UpdateSecretPolicy, RotateSecret:
		return "secret"
	case QuarantineRole, DenyIAMEscalation, DenyEscalation:
		return "iam_role"
	case RestorePolicyVersion:
		return "iam_policy"
	case BlockS3PublicAccess, UpdateBucketPolicy:
		return "s3_bucket"
	case UpdateQueuePolicy:
		return "sqs_queue"
	case UpdateTopicPolicy:
		return "sns_topic"
	case UnshareAMI:
		return "ami"
	case UnshareSnapshot:
		return "ebs_snapshot"
	case UnshareRDSSnapshot:
		return "rds_snapshot"
	case EnforceIMDS:
		return "ec2_instance"
	}
	return "unknown"
}

// ---- parameter templates ----

// Resolve fills params from a template. A string value starting with "$." is a
// path into the finding (alternatives separated by "|", first non-empty wins):
//
//	$.evidence.<key>   key of the finding evidence (case/underscore insensitive)
//	$.finding.<field>  credential_arn | identity_name | identity_id | account_id
//
// Other values are copied as they are. Values in `explicit` always win.
func Resolve(template json.RawMessage, f domain.Finding, explicit map[string]any) map[string]any {
	out := map[string]any{}
	var tpl map[string]any
	_ = json.Unmarshal(template, &tpl)
	var ev map[string]any
	_ = json.Unmarshal(f.Evidence, &ev)
	for k, v := range tpl {
		s, ok := v.(string)
		if !ok || !strings.HasPrefix(s, "$.") {
			out[k] = v
			continue
		}
		for _, alt := range strings.Split(s, "|") {
			if val := lookup(strings.TrimSpace(alt), f, ev); val != nil {
				out[k] = val
				break
			}
		}
	}
	for k, v := range explicit {
		out[k] = v
	}
	normalizeKeyIDs(out)
	return out
}

// normalizeKeyIDs turns access_key_id into one string. A list (several keys in the
// finding) becomes access_key_candidates; access_key_id then holds them comma-separated
// (readable in guided steps) and the provider picks the key to change.
// "AKIA...@region" (M09) is reduced to the key id.
func normalizeKeyIDs(out map[string]any) {
	var ids []string
	switch t := out["access_key_id"].(type) {
	case []any:
		for _, x := range t {
			if s, ok := x.(string); ok && s != "" {
				ids = append(ids, s)
			}
		}
	case []string:
		ids = append(ids, t...)
	case string:
		if t != "" {
			ids = []string{t}
		}
	default:
		return
	}
	for i, id := range ids {
		if j := strings.Index(id, "@"); j > 0 {
			ids[i] = id[:j]
		}
	}
	switch len(ids) {
	case 0:
		delete(out, "access_key_id")
	case 1:
		out["access_key_id"] = ids[0]
	default:
		cand := make([]any, len(ids))
		for i, id := range ids {
			cand[i] = id
		}
		out["access_key_candidates"] = cand
		out["access_key_id"] = strings.Join(ids, ", ")
	}
}

func lookup(path string, f domain.Finding, ev map[string]any) any {
	switch {
	case strings.HasPrefix(path, "$.evidence.") && strings.HasSuffix(path, "[0]"):
		// first element of a list (e.g. KMS-02 external_accounts)
		v := evidenceValue(ev, strings.TrimSuffix(strings.TrimPrefix(path, "$.evidence."), "[0]"))
		if l, ok := v.([]any); ok && len(l) > 0 {
			return l[0]
		}
		return nil
	case strings.HasPrefix(path, "$.evidence."):
		return evidenceValue(ev, strings.TrimPrefix(path, "$.evidence."))
	case path == "$.finding.credential_arn":
		return nilIfEmpty(f.CredentialARN)
	case path == "$.finding.identity_name":
		return nilIfEmpty(f.IdentityName)
	case path == "$.finding.identity_id":
		return nilIfEmpty(f.IdentityID)
	case path == "$.finding.account_id":
		return nilIfEmpty(f.AccountID)
	}
	return nil
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

var normKey = regexp.MustCompile(`[_\-\s]`)

func norm(s string) string { return strings.ToLower(normKey.ReplaceAllString(s, "")) }

func evidenceValue(ev map[string]any, key string) any {
	want := norm(key)
	for k, v := range ev {
		if norm(k) != want {
			continue
		}
		switch t := v.(type) {
		case nil:
			return nil
		case string:
			if t == "" {
				return nil
			}
		case []any:
			if len(t) == 0 {
				return nil
			}
		}
		return v
	}
	return nil
}

// RenderSteps fills {placeholders} of the catalog step template. Unknown
// placeholders become <name>.
func RenderSteps(template json.RawMessage, vars map[string]string) []domain.GuidedStep {
	var tpl []domain.GuidedStep
	if err := json.Unmarshal(template, &tpl); err != nil {
		return nil
	}
	fill := func(s string) string {
		return placeholder.ReplaceAllStringFunc(s, func(m string) string {
			name := m[1 : len(m)-1]
			if v, ok := vars[name]; ok && v != "" {
				return v
			}
			return "<" + name + ">"
		})
	}
	for i := range tpl {
		tpl[i].Title, tpl[i].Console, tpl[i].CLI, tpl[i].IaC = fill(tpl[i].Title), fill(tpl[i].Console), fill(tpl[i].CLI), fill(tpl[i].IaC)
	}
	return tpl
}

var placeholder = regexp.MustCompile(`\{[a-z_]+\}`)
