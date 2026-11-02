package updateaccount

import "encoding/json"

// PUT /remediation/accounts/{account_id} (admin)
//
// Opts an AWS account in to One-click remediation and stores its settings;
// the remediation role is then validated (access_status).

// UpdateAccountRequest is the body.
type UpdateAccountRequest struct {
	Enabled            bool            `json:"remediation_enabled"`
	RoleARN            string          `json:"remediation_role_arn"`
	ExternalID         *string         `json:"remediation_external_id"` // null / absent = keep or generate
	AllowedActionTypes []string        `json:"allowed_action_types"`
	EnabledRegions     []string        `json:"enabled_regions"`
	ApprovalPolicy     json.RawMessage `json:"approval_policy"` // e.g. {"low":1,"medium":1,"high":2}
	GraceDays          json.RawMessage `json:"grace_days"`      // e.g. {"delete_key":30}
}
