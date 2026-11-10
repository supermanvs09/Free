package findingfix

import (
	"context"
	"fmt"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type FindingFixService struct {
	repo *FindingFixRepository
}

func NewFindingFixService(r *FindingFixRepository) *FindingFixService {
	return &FindingFixService{repo: r}
}

func (s *FindingFixService) Get(ctx context.Context, c common.Caller, findingID string) (*FindingFix, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	d, err := s.repo.Get(ctx, c.TenantID, findingID)
	if err != nil {
		return nil, err
	}
	return build(d), nil
}

// build turns the finding and its mapped fix into the answer.
func build(d *fixData) *FindingFix {
	f := d.finding
	out := &FindingFix{FindingID: f.ID, RuleID: f.RuleID, RuleName: f.RuleName, Severity: f.Severity, Status: f.Status,
		Identity: identity(f), IdentityID: f.IdentityID, IdentityName: f.IdentityName, IdentityType: f.IdentityType,
		AccountID: f.AccountID, Resource: f.CredentialARN, Title: f.Title, Description: f.Description,
		HowToFix: f.Remediation, OtherFixes: []FixRef{}}
	if d.dashboard != "" {
		out.DashboardURL = strings.TrimRight(d.dashboard, "/") + "/findings/" + f.ID
	}
	for i, ra := range d.ruleActs {
		act := d.actions[ra.ActionType]
		if act == nil {
			continue
		}
		if out.Fix == nil && (ra.IsDefault || i == 0) {
			params := catalog.Resolve(ra.ParamsTemplate, f, nil)
			vars := stepVars(params, f)
			if out.Resource == "" {
				out.Resource = vars["role_arn"]
			}
			out.Fix = &FixAction{ActionType: act.ActionType, Title: act.Title, Description: act.Description,
				RiskLevel: act.RiskLevel, Reversible: act.Reversible, OneClickSupported: act.OneClickSupported,
				Steps: catalog.RenderSteps(act.StepsTemplate, vars)}
			continue
		}
		out.OtherFixes = append(out.OtherFixes, FixRef{ActionType: act.ActionType, Title: act.Title})
	}
	out.Modes = modes(d, out)
	out.SummaryText = summary(out)
	return out
}

const (
	flowGuided   = "Apply the steps by hand in AWS, then mark the plan done. The backend changes nothing."
	flowDirect   = "The backend applies the fix in AWS right after the plan is created. No approval is needed."
	flowApproval = "Critical finding: an approval e-mail goes to the approvers, and the backend applies the fix in AWS once it is approved."
	flowRisky    = "This fix changes who can reach something or what an app depends on, so it always needs approval: an approval e-mail goes to the approvers, and the backend applies the fix in AWS once it is approved."
)

// modes: Guided is always offered; One-click when the fix is mapped, the finding is OPEN
// and the account is set up for this fix (the same checks as POST /plans).
func modes(d *fixData, x *FindingFix) Modes {
	m := Modes{Guided: GuidedMode{Available: true, Flow: flowGuided}}
	oc := &m.OneClick
	oc.ApprovalRequired = engine.NeedsApproval(x.Severity)
	if x.Fix != nil {
		oc.ApprovalRequired = engine.ApprovalRequired(x.Severity, x.Fix.ActionType)
	}
	switch {
	case engine.NeedsApproval(x.Severity):
		oc.Flow = flowApproval
	case oc.ApprovalRequired:
		oc.Flow = flowRisky
	default:
		oc.Flow = flowDirect
	}
	switch {
	case x.Fix == nil:
		oc.Reason = "no fix is mapped for rule " + x.RuleID + ": follow the how-to-fix by hand"
	case !strings.EqualFold(x.Status, "OPEN"):
		oc.Reason = "the finding is " + x.Status + ": only an OPEN finding gets a plan"
	default:
		c := d.oneClick[x.Fix.ActionType]
		oc.Available, oc.Reason = c.ok, c.why
	}
	if p := d.pending; p != nil {
		oc.PendingPlan = &PendingPlan{PlanID: p.ID, Status: string(p.Status), CreatedBy: p.CreatedBy, ByEngine: p.PolicyID != nil}
	}
	return m
}

func identity(f domain.Finding) string {
	switch {
	case f.IdentityName != "" && f.IdentityType != "":
		return f.IdentityName + " (" + f.IdentityType + ")"
	case f.IdentityName != "":
		return f.IdentityName
	}
	return f.IdentityID
}

// stepVars fills the placeholders of the guided steps from the finding only (no AWS call):
// a placeholder that cannot be derived stays "<name>" for the person to fill in.
func stepVars(params map[string]any, f domain.Finding) map[string]string {
	v := map[string]string{}
	for k, val := range params {
		switch t := val.(type) {
		case string:
			v[k] = t
		case float64, int, bool:
			v[k] = fmt.Sprint(t)
		}
	}
	target := v["target_arn"]
	if target == "" {
		target = f.CredentialARN
	}
	if name := arnName(target, ":role/"); name != "" {
		v["role_arn"], v["role_name"] = target, name
	}
	if v["user_name"] == "" {
		if name := arnName(target, ":user/"); name != "" {
			v["user_name"] = name
		}
	}
	if h := v["policy_hint"]; h != "" {
		if v["policy_name"] == "" {
			v["policy_name"] = h
		}
		if v["policy_ref"] == "" {
			v["policy_ref"] = h
		}
	}
	return v
}

// arnName returns the last path element after kind (":role/" or ":user/") in an ARN.
func arnName(arn, kind string) string {
	i := strings.Index(arn, kind)
	if i < 0 {
		return ""
	}
	rest := arn[i+len(kind):]
	if j := strings.LastIndex(rest, "/"); j >= 0 {
		rest = rest[j+1:]
	}
	return rest
}

// summary is the answer as plain text.
func summary(x *FindingFix) string {
	var b strings.Builder
	line := func(label, val string) {
		if val != "" {
			fmt.Fprintf(&b, "%s: %s\n", label, val)
		}
	}
	line("Rule", strings.TrimSpace(x.RuleID+" "+x.RuleName))
	line("Severity", x.Severity)
	line("Identity", x.Identity)
	line("AWS account", x.AccountID)
	line("Resource", x.Resource)
	if x.Description != "" {
		b.WriteString(x.Description + "\n")
	}
	line("How to fix", x.HowToFix)
	if x.Fix != nil {
		fmt.Fprintf(&b, "Fix: %s (risk %s)\n", x.Fix.Title, x.Fix.RiskLevel)
		for i, st := range x.Fix.Steps {
			fmt.Fprintf(&b, "  %d. %s\n", i+1, st.Title)
			if st.Console != "" {
				fmt.Fprintf(&b, "     Console: %s\n", st.Console)
			}
			if st.CLI != "" {
				fmt.Fprintf(&b, "     CLI: %s\n", st.CLI)
			}
		}
	}
	line("ISPM finding id", x.FindingID)
	line("Dashboard", x.DashboardURL)
	return b.String()
}
