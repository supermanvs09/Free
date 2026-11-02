package accountsetup

// GET /remediation/accounts/{account_id}/setup (admin)
//
// The values the customer needs to deploy the remediation role
// (docs/remediation/remediation-role.yaml): the ExternalId to put in the
// role's trust policy, and the role ARN stored so far.

// AccountSetup is the answer's data.
type AccountSetup struct {
	AccountID  string `json:"account_id"`
	ExternalID string `json:"external_id"`
	RoleARN    string `json:"remediation_role_arn"`
}
