package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"

	"nhi-backend-api/internal/remediation/domain"
)

type AccountReq struct {
	Enabled            bool            `json:"remediation_enabled"`
	RoleARN            string          `json:"remediation_role_arn"`
	ExternalID         *string         `json:"remediation_external_id"` // nil = keep / generate
	AllowedActionTypes []string        `json:"allowed_action_types"`
	EnabledRegions     []string        `json:"enabled_regions"`
	ApprovalPolicy     json.RawMessage `json:"approval_policy"`
	GraceDays          json.RawMessage `json:"grace_days"`
}

var roleARNRe = regexp.MustCompile(`^arn:aws[a-z-]*:iam::(\d{12}):role/.+$`)
var accountRe = regexp.MustCompile(`^\d{12}$`)

// PutAccount stores the opt-in and settings of an account and validates the role.
func (s *Service) PutAccount(ctx context.Context, actor domain.Actor, accountID string, req AccountReq) (*domain.Account, error) {
	if err := requireRole(actor, domain.PermSettings); err != nil {
		return nil, err
	}
	if !accountRe.MatchString(accountID) {
		return nil, badRequest("account_id must be a 12-digit AWS account id")
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	if req.RoleARN != "" {
		m := roleARNRe.FindStringSubmatch(req.RoleARN)
		if m == nil || m[1] != accountID {
			return nil, badRequest("remediation_role_arn must be a role ARN of account %s", accountID)
		}
	}
	actions, err := st.ListActions(ctx)
	if err != nil {
		return nil, err
	}
	known := map[string]domain.Action{}
	for _, a := range actions {
		known[a.ActionType] = a
	}
	for _, t := range req.AllowedActionTypes {
		a, ok := known[t]
		if !ok || !a.OneClickSupported {
			return nil, badRequest("%q is not a One-click action type", t)
		}
	}
	policy := req.ApprovalPolicy
	if len(policy) > 0 {
		var ap domain.ApprovalPolicy
		if err := json.Unmarshal(policy, &ap); err != nil || ap.Low < 1 || ap.Medium < 1 || ap.High < 1 || ap.High > 5 {
			return nil, badRequest(`approval_policy must look like {"low":1,"medium":1,"high":2} (1 to 5 approvers)`)
		}
	}
	if len(req.GraceDays) > 0 {
		var gd map[string]int
		if err := json.Unmarshal(req.GraceDays, &gd); err != nil {
			return nil, badRequest(`grace_days must look like {"delete_key":30}`)
		}
		for k, v := range gd {
			if _, ok := known[k]; !ok || v < 0 || v > 365 {
				return nil, badRequest("grace_days: %q must be a known action type with 0 to 365 days", k)
			}
		}
	}
	cur, err := AccountFor(ctx, st, accountID)
	if err != nil {
		return nil, err
	}
	a := &domain.Account{AccountID: accountID, Enabled: req.Enabled, RoleARN: req.RoleARN, ExternalID: cur.ExternalID,
		AllowedActionTypes: req.AllowedActionTypes, EnabledRegions: req.EnabledRegions, ApprovalPolicy: policy, GraceDays: req.GraceDays}
	if req.ExternalID != nil {
		a.ExternalID = *req.ExternalID
	}
	if req.Enabled {
		if a.RoleARN == "" {
			return nil, badRequest("remediation_role_arn is required to enable remediation")
		}
		if a.ExternalID == "" {
			a.ExternalID = randomHex(16)
		}
	}
	if err := st.UpsertAccount(ctx, a, actor.UserID); err != nil {
		return nil, err
	}
	st.Audit(ctx, "", "", "", domain.EvAccountUpdated, actor.UserID, map[string]any{"account_id": accountID, "enabled": req.Enabled,
		"allowed_action_types": req.AllowedActionTypes})
	if req.Enabled && a.RoleARN != "" {
		return s.ValidateAccount(ctx, actor, accountID)
	}
	return st.GetAccount(ctx, accountID)
}

// ValidateAccount assumes the remediation role and checks the planning reads (ValidateAccess).
func (s *Service) ValidateAccount(ctx context.Context, actor domain.Actor, accountID string) (*domain.Account, error) {
	if err := requireRole(actor, domain.PermSettings); err != nil {
		return nil, err
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	a, err := st.GetAccount(ctx, accountID)
	if isStoreNotFound(err) {
		return nil, notFoundErr("account settings")
	}
	if err != nil {
		return nil, err
	}
	if a.RoleARN == "" {
		return nil, conflict("the account has no remediation role")
	}
	prov, ok := s.prov.Get("aws")
	if !ok {
		return nil, fmt.Errorf("no aws provider")
	}
	rep := prov.ValidateAccess(ctx, *a)
	if err := st.SetAccessStatus(ctx, accountID, rep.Status, rep.Detail); err != nil {
		return nil, err
	}
	return st.GetAccount(ctx, accountID)
}

// ---- integrations ----

type IntegrationReq struct {
	Enabled   bool            `json:"enabled"`
	Config    json.RawMessage `json:"config"`
	SecretRef string          `json:"secret_ref"`
}

func (s *Service) PutIntegration(ctx context.Context, actor domain.Actor, typ string, req IntegrationReq) (*domain.Integration, error) {
	if err := requireRole(actor, domain.PermSettings); err != nil {
		return nil, err
	}
	switch typ {
	case "JIRA", "SES":
	default:
		return nil, badRequest("type must be JIRA or SES")
	}
	var cfg map[string]any
	if err := json.Unmarshal(req.Config, &cfg); err != nil {
		return nil, badRequest("config must be a JSON object")
	}
	if useEnv, _ := cfg["from_env"].(bool); useEnv {
		// go back to the platform defaults from .env (only the from_env marker is stored)
		st, err := s.Store(ctx, actor.TenantID)
		if err != nil {
			return nil, err
		}
		i := &domain.Integration{ID: newID(), TenantID: st.TenantID, Type: typ, Enabled: true, Config: json.RawMessage(`{"from_env": true}`)}
		if err := st.UpsertIntegration(ctx, i); err != nil {
			return nil, err
		}
		return st.GetIntegration(ctx, typ)
	}
	if typ == "JIRA" {
		for _, k := range []string{"base_url", "project_key", "email"} {
			if v, _ := cfg[k].(string); v == "" && req.Enabled {
				return nil, badRequest("Jira config needs %q", k)
			}
		}
	} else if v, _ := cfg["from"].(string); v == "" && req.Enabled {
		return nil, badRequest("e-mail config needs \"from\"")
	}
	if req.Enabled && req.SecretRef == "" && typ == "JIRA" {
		return nil, badRequest("secret_ref is required (env:NAME, file:/path or aws-sm:id): the secret itself is never stored")
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	i := &domain.Integration{ID: newID(), TenantID: st.TenantID, Type: typ, Enabled: req.Enabled, Config: req.Config, SecretRef: req.SecretRef}
	if err := st.UpsertIntegration(ctx, i); err != nil {
		return nil, err
	}
	return st.GetIntegration(ctx, typ)
}
