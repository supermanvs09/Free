package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/policydoc"
	"nhi-backend-api/internal/remediation/provider"
	"nhi-backend-api/internal/remediation/scoring"
	"nhi-backend-api/internal/remediation/store"
)

const systemActor = "system"

type CreatePlanReq struct {
	FindingIDs []string       `json:"finding_ids"`
	ActionType string         `json:"action_type"` // optional: the default of the rule
	Params     map[string]any `json:"params"`
	Mode       domain.Mode    `json:"mode"` // optional
	BatchID    string         `json:"batch_id,omitempty"`
}

// AccountFor loads the account settings (a default, disabled account if none).
func AccountFor(ctx context.Context, st *store.Store, accountID string) (*domain.Account, error) {
	a, err := st.GetAccount(ctx, accountID)
	if isStoreNotFound(err) {
		return &domain.Account{TenantID: st.TenantID, AccountID: accountID, AccessStatus: "UNKNOWN",
			ApprovalPolicy: json.RawMessage(`{"low":1,"medium":1,"high":1}`), GraceDays: json.RawMessage(`{}`)}, nil
	}
	return a, err
}

// approvalSeverity is the finding severity whose One-click plans always need approval.
const approvalSeverity = "critical"

// autoActions are the safe fixes (the rule engine's AUTO list): easy to undo and unlikely to
// break anything. Only these may run without approval, and only for a finding below Critical.
// Every other fix changes who can reach something or what an app depends on, and always needs
// approval, whatever the severity.
var autoActions = map[string]bool{
	catalog.DeactivateKey:      true,
	catalog.EnableKeyRotation:  true,
	catalog.SetSessionDuration: true,
}

// NeedsApproval says whether a finding of this severity needs approval for any fix.
func NeedsApproval(severity string) bool {
	return strings.EqualFold(strings.TrimSpace(severity), approvalSeverity)
}

// ApprovalRequired says whether a One-click plan for this fix on a finding of this severity
// needs approval: always for a risky fix, for a safe fix only when the finding is Critical.
func ApprovalRequired(severity, actionType string) bool {
	return !autoActions[actionType] || NeedsApproval(severity)
}

func hasCritical(fs []domain.Finding) bool {
	for _, f := range fs {
		if NeedsApproval(f.Severity) {
			return true
		}
	}
	return false
}

func graceDays(a *domain.Account, act *domain.Action) int {
	m := map[string]int{}
	_ = json.Unmarshal(a.GraceDays, &m)
	if d, ok := m[act.ActionType]; ok {
		return d
	}
	return act.DefaultGraceDays
}

func contains(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

// oneClickEligible reports whether an action may run in this account, and why not.
func (s *Service) oneClickEligible(acct *domain.Account, act *domain.Action, p provider.Provider, region string) (bool, string) {
	switch {
	case !act.OneClickSupported || p == nil || !p.Supports(act.ActionType):
		return false, "this action is guided only"
	case !acct.Enabled:
		return false, "One-click remediation is not enabled for account " + acct.AccountID
	case acct.RoleARN == "":
		return false, "the account has no remediation role"
	case acct.AccessStatus == "CANNOT_ASSUME" || acct.AccessStatus == "MISSING_PERMISSIONS":
		return false, "the remediation role is not usable (" + acct.AccessStatus + "): " + acct.AccessDetail
	case !contains(acct.AllowedActionTypes, act.ActionType):
		return false, "the account does not allow action type " + act.ActionType
	case region != "" && len(acct.EnabledRegions) > 0 && !contains(acct.EnabledRegions, region) && act.ActionType != "":
		return false, "region " + region + " is not enabled for remediation in this account"
	}
	return true, ""
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func paramString(m map[string]any, k string) string {
	if v, ok := m[k].(string); ok {
		return v
	}
	return ""
}

func stringVars(vars map[string]string, params map[string]any) map[string]string {
	out := map[string]string{}
	for k, v := range params {
		switch t := v.(type) {
		case string:
			out[k] = t
		case float64, int, bool:
			out[k] = fmt.Sprint(t)
		}
	}
	for k, v := range vars {
		out[k] = v
	}
	return out
}

func mustJSON(v any, empty string) json.RawMessage {
	if v == nil {
		return json.RawMessage(empty)
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return json.RawMessage(empty)
	}
	return b
}

// CreatePlan builds a plan for findings: it reads live state (read only),
// computes before / after, diff, pre-checks, risk and score impact, and stores
// it. Older open plans for the same target and action are superseded.
//
// A READY One-click plan is submitted at once: a safe fix on a finding below Critical is
// approved and queued to run (no approval e-mail); a risky fix, or a Critical finding, sends
// the approval e-mail and the plan runs once approved.
func (s *Service) CreatePlan(ctx context.Context, actor domain.Actor, req CreatePlanReq) (*domain.Plan, error) {
	p, _, err := s.CreateOrPendingPlan(ctx, actor, req)
	return p, err
}

// CreateOrPendingPlan is CreatePlan, except that a One-click request for findings that already
// have a plan waiting for approval or about to run (created by the engine's automatic
// remediation after a scan, or earlier in the dashboard) returns that plan (pending = true):
// no second plan, no second approval e-mail. A Guided request always gets its own plan.
func (s *Service) CreateOrPendingPlan(ctx context.Context, actor domain.Actor, req CreatePlanReq) (*domain.Plan, bool, error) {
	if err := requireRole(actor, domain.PermPlan); err != nil {
		return nil, false, err
	}
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, false, err
	}
	if req.Mode != domain.ModeGuided && len(req.FindingIDs) > 0 {
		ids := dedupe(req.FindingIDs)
		pending, err := st.PendingPlanFor(ctx, ids)
		if err != nil {
			return nil, false, err
		}
		if pending != nil {
			if !coversAll(pending.FindingIDs, ids) {
				return nil, false, conflict("some of these findings already have a plan waiting for approval or about to run (plan %s): "+
					"send only the findings without one", pending.ID)
			}
			return pending, true, nil
		}
	}
	p, err := s.createPlan(ctx, st, actor, req)
	if err != nil || p.Mode != domain.ModeOneClick || p.Status != domain.PlanReady || p.BatchID != nil {
		return p, false, err
	}
	sub, err := s.Submit(ctx, actor, p.ID)
	if err == nil {
		return sub, false, nil
	}
	s.log.Warn("remediation: the new One-click plan could not be submitted; submit it again", "plan", p.ID, "err", err)
	p, err = st.GetPlan(ctx, p.ID)
	return p, false, err
}

func (s *Service) createPlan(ctx context.Context, st *store.Store, actor domain.Actor, req CreatePlanReq) (*domain.Plan, error) {
	if len(req.FindingIDs) == 0 {
		return nil, badRequest("finding_ids is required")
	}
	findings, err := st.GetFindings(ctx, req.FindingIDs)
	if err != nil {
		return nil, err
	}
	if len(findings) != len(dedupe(req.FindingIDs)) {
		return nil, notFoundErr("one or more findings")
	}
	sort.Slice(findings, func(i, j int) bool { return findings[i].ID < findings[j].ID })
	first := findings[0]
	for _, f := range findings {
		if f.AccountID != first.AccountID {
			return nil, badRequest("findings of different accounts cannot share a plan; use a batch")
		}
		if f.Status != "OPEN" && actor.UserID != systemActor {
			return nil, conflict("finding %s is %s, only OPEN findings need a plan", f.ID, f.Status)
		}
	}

	// ---- action ----
	ras, err := st.RuleActions(ctx, first.RuleID)
	if err != nil {
		return nil, err
	}
	if len(ras) == 0 {
		return nil, &Error{http.StatusUnprocessableEntity, "no_remediation", "no remediation is defined for rule " + first.RuleID}
	}
	ra := ras[0]
	if req.ActionType != "" {
		found := false
		for _, r := range ras {
			if r.ActionType == req.ActionType {
				ra, found = r, true
			}
		}
		if !found && actor.UserID != systemActor {
			return nil, badRequest("action %q does not fix rule %s", req.ActionType, first.RuleID)
		}
		if !found {
			ra = domain.RuleAction{RuleID: first.RuleID, ActionType: req.ActionType, ParamsTemplate: json.RawMessage(`{}`)}
		}
	}
	act, err := st.GetAction(ctx, ra.ActionType)
	if err != nil {
		return nil, fmt.Errorf("catalog: %w", err)
	}
	if !act.Enabled {
		return nil, conflict("action %s is turned off in the catalog", act.ActionType)
	}

	// ---- parameters ----
	params := catalog.Resolve(ra.ParamsTemplate, first, req.Params)
	targetARN := paramString(params, "target_arn")
	delete(params, "target_arn")
	params["rule_id"] = first.RuleID
	if h, ok := firstEvidenceString(first, "admin_policies", "granting_policies", "policy_name", "policy"); ok && params["policy_hint"] == nil {
		params["policy_hint"] = h
	}
	if act.ActionType == catalog.RewriteTrust && params["add_external_id"] == true {
		if paramString(params, "external_id") == "" {
			params["external_id"] = randomHex(16)
			params["external_id_status"] = "PENDING_VENDOR"
		} else if paramString(params, "external_id_status") == "" {
			params["external_id_status"] = "CONFIRMED"
		}
	}

	// ---- account, provider, mode ----
	acct, err := AccountFor(ctx, st, first.AccountID)
	if err != nil {
		return nil, err
	}
	prov, _ := s.prov.Get(act.Platform)
	region := regionFromARN(targetARN)
	eligible, why := s.oneClickEligible(acct, act, prov, region)
	mode := req.Mode
	switch {
	case mode == "":
		mode = domain.ModeGuided
		if eligible {
			mode = domain.ModeOneClick
		}
	case mode == domain.ModeOneClick && !eligible:
		return nil, conflict("One-click is not possible: %s", why)
	}

	target := provider.Target{TenantID: st.TenantID, Account: *acct, Region: region, ActionType: act.ActionType,
		TargetARN: targetARN, TargetType: catalog.TargetType(act.ActionType), Params: params}

	plan := &domain.Plan{
		ID: newID(), TenantID: st.TenantID, ActionType: act.ActionType, Platform: act.Platform, AccountID: first.AccountID,
		Region: region, TargetARN: targetARN, TargetType: target.TargetType, Mode: mode, CreatedBy: actor.UserID,
		RuleIDs: []string{}, FindingIDs: []string{}, IdentityIDs: []string{},
	}
	if req.BatchID != "" {
		plan.BatchID = &req.BatchID
	}
	idSet := map[string]bool{}
	ruleSet := map[string]bool{}
	for _, f := range findings {
		plan.FindingIDs = append(plan.FindingIDs, f.ID)
		if !ruleSet[f.RuleID] {
			ruleSet[f.RuleID] = true
			plan.RuleIDs = append(plan.RuleIDs, f.RuleID)
		}
		if f.IdentityID != "" && !idSet[f.IdentityID] {
			idSet[f.IdentityID] = true
			plan.IdentityIDs = append(plan.IdentityIDs, f.IdentityID)
		}
	}

	// ---- provider plan (live state, read only) ----
	var out *provider.PlanOutput
	var prechecks []domain.Precheck
	if prov != nil && prov.Supports(act.ActionType) && acct.RoleARN != "" {
		out, err = prov.Plan(ctx, provider.PlanInput{Target: target, Findings: findings,
			UsageWindowDays: s.cfg.Worker.UsageWindowDays, MinKeyIdleDays: s.cfg.Worker.MinKeyIdleDays})
		if err != nil {
			if mode == domain.ModeOneClick {
				return nil, &Error{http.StatusBadGateway, "provider_error", "cannot read the live state: " + err.Error()}
			}
			prechecks = append(prechecks, domain.Precheck{Name: "live state", Result: domain.CheckWarn,
				Detail: "the live state could not be read, so this plan uses the scanner data only: " + err.Error()})
			out = nil
		}
	} else {
		prechecks = append(prechecks, domain.Precheck{Name: "live state", Result: domain.CheckWarn,
			Detail: "the account is not connected for planning: this plan uses the scanner data only"})
	}
	vars := map[string]string{}
	if out != nil {
		if out.TargetARN != "" {
			plan.TargetARN = out.TargetARN
		}
		if out.TargetType != "" {
			plan.TargetType = out.TargetType
		}
		params = out.Params
		prechecks = append(prechecks, out.Prechecks...)
		vars = out.Vars
		plan.Params = mustJSON(params, "{}")
		plan.BeforeState, plan.AfterState = mustJSON(out.Before, "{}"), mustJSON(out.After, "{}")
		plan.Diff, plan.UsageBasis = mustJSON(out.Diff, "[]"), mustJSON(out.UsageBasis, "{}")
		plan.LiveStateHash = policydoc.Hash(out.Before)
	} else {
		plan.Params = mustJSON(params, "{}")
		plan.BeforeState, plan.AfterState, plan.Diff, plan.UsageBasis = json.RawMessage(`{}`), json.RawMessage(`{}`), json.RawMessage(`[]`), json.RawMessage(`{}`)
		if plan.TargetARN == "" {
			plan.TargetARN = paramString(params, "user_name")
			if plan.TargetARN == "" {
				plan.TargetARN = first.CredentialARN
			}
			if plan.TargetARN == "" {
				plan.TargetARN = findingTargetARN(first)
			}
		}
		if mode == domain.ModeOneClick {
			return nil, conflict("One-click needs the live state of the target")
		}
	}
	if plan.TargetARN == "" {
		return nil, badRequest("the target could not be derived from the finding: send params.target_arn")
	}

	// ---- workloads sharing the target, score impact ----
	if plan.TargetType == "iam_role" {
		if ws, err := st.Workloads(ctx, plan.TargetARN); err == nil && len(ws) > 0 {
			for _, w := range ws {
				if !idSet[w.ID] {
					idSet[w.ID] = true
					plan.IdentityIDs = append(plan.IdentityIDs, w.ID)
				}
			}
			if len(ws) > 1 {
				prechecks = append(prechecks, domain.Precheck{Name: "shared role", Result: domain.CheckWarn,
					Detail: fmt.Sprintf("the role is used by %d workloads: the change affects all of them", len(ws))})
			}
		}
	}
	if imp, err := scoring.Compute(ctx, st, plan.FindingIDs, first.IdentityID); err == nil {
		plan.ScoreCurrent, plan.ScoreGain, plan.ScoreProjected, plan.FleetGain = imp.Current, imp.Gain, imp.Projected, imp.FleetGain
	}

	// ---- risk, approvals, guided steps ----
	plan.RiskLevel = act.RiskLevel
	if out != nil && out.Risk != "" {
		plan.RiskLevel = out.Risk
	}
	// One-click: a risky fix always needs approval; a safe fix only for a Critical finding.
	// One approval is always enough: accounts.approval_policy and the "two approvers" flags
	// of the providers no longer raise it.
	if mode == domain.ModeOneClick && (!autoActions[act.ActionType] || hasCritical(findings)) {
		plan.RequiredApprovals = 1
	}
	plan.Steps = mustJSON(catalog.RenderSteps(act.StepsTemplate, stringVars(vars, params)), "[]")
	plan.Prechecks = mustJSON(prechecks, "[]")

	// ---- status ----
	plan.Status = domain.PlanReady
	for _, pc := range prechecks {
		if pc.Result == domain.CheckBlock {
			plan.Status, plan.StatusReason = domain.PlanDraft, "blocked by pre-check: "+pc.Name
			break
		}
	}
	if plan.Status == domain.PlanReady && paramString(params, "external_id_status") == "PENDING_VENDOR" {
		plan.Status, plan.StatusReason = domain.PlanWaitingExternal, "agree the ExternalId with the vendor, then confirm it"
	}
	plan.PlanHash = policydoc.Hash(map[string]any{"live": plan.LiveStateHash, "after": json.RawMessage(plan.AfterState),
		"action": plan.ActionType, "target": plan.TargetARN, "params": json.RawMessage(plan.Params)})

	if err := st.InsertPlan(ctx, plan); err != nil {
		return nil, err
	}
	old, _ := st.SupersedePlans(ctx, plan.ID, plan.TargetARN, plan.ActionType)
	for _, id := range old {
		st.Audit(ctx, id, "", "", domain.EvPlanSuperseded, actor.UserID, map[string]any{"superseded_by": plan.ID})
	}
	st.Audit(ctx, plan.ID, "", derefStr(plan.BatchID), domain.EvPlanCreated, actor.UserID, map[string]any{
		"action_type": plan.ActionType, "mode": plan.Mode, "status": plan.Status, "finding_ids": plan.FindingIDs})
	return plan, nil
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// coversAll says whether every id in want is in have.
func coversAll(have, want []string) bool {
	set := map[string]bool{}
	for _, id := range have {
		set[strings.ToLower(id)] = true
	}
	for _, id := range want {
		if !set[strings.ToLower(id)] {
			return false
		}
	}
	return true
}

func dedupe(ss []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range ss {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func firstEvidenceString(f domain.Finding, keys ...string) (string, bool) {
	var ev map[string]any
	_ = json.Unmarshal(f.Evidence, &ev)
	for _, k := range keys {
		if v, ok := ev[k].(string); ok && v != "" {
			return v, true
		}
	}
	return "", false
}

// regionFromARN returns the region of a regional ARN ("" for IAM / unknown).
func regionFromARN(a string) string {
	parts := strings.Split(a, ":")
	if len(parts) > 3 && strings.HasPrefix(a, "arn:") {
		return parts[3]
	}
	return ""
}

var _ = time.Second

// findingTargetARN is the ARN a finding is about when it names no credential:
// an ARN in its evidence (target_arn, role_arn, resource_arn, arn), or the
// identity name when that is an ARN. Without it a guided plan for a role
// finding could not be made unless the person pasted the ARN.
func findingTargetARN(f domain.Finding) string {
	var ev map[string]any
	if len(f.Evidence) > 0 && json.Unmarshal(f.Evidence, &ev) == nil {
		for _, k := range []string{"target_arn", "role_arn", "resource_arn", "arn"} {
			if v, ok := ev[k].(string); ok && strings.HasPrefix(strings.TrimSpace(v), "arn:") {
				return strings.TrimSpace(v)
			}
		}
	}
	if name := strings.TrimSpace(f.IdentityName); strings.HasPrefix(name, "arn:") {
		return name
	}
	return ""
}
