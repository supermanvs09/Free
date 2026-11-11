package findingfix

import (
	"encoding/json"
	"strings"
	"testing"

	"nhi-backend-api/internal/remediation/domain"
)

func TestBuildMappedRule(t *testing.T) {
	d := &fixData{
		finding: domain.Finding{ID: "f1", RuleID: "I10", RuleName: "Long role sessions", Severity: "Medium", Status: "OPEN",
			IdentityName: "AS-Testing", IdentityType: "EC2", AccountID: "884264984984",
			CredentialARN: "arn:aws:iam::884264984984:role/team/AS-Testing-IAM-Role",
			Description:   "MaxSessionDuration is 12 hours.", Remediation: "Lower the session duration.",
			Evidence: json.RawMessage(`{"role_arn":"arn:aws:iam::884264984984:role/team/AS-Testing-IAM-Role"}`)},
		ruleActs: []domain.RuleAction{{RuleID: "I10", ActionType: "set_session_duration", IsDefault: true,
			ParamsTemplate: json.RawMessage(`{"target_arn":"$.evidence.role_arn|$.finding.credential_arn","new_max_session":3600}`)}},
		actions: map[string]*domain.Action{"set_session_duration": {ActionType: "set_session_duration", Title: "Lower the role's maximum session duration",
			RiskLevel: domain.RiskLow, Reversible: true, OneClickSupported: true,
			StepsTemplate: json.RawMessage(`[{"title":"Set MaxSessionDuration of {role_name} to {new_max_session} seconds","cli":"aws iam update-role --role-name {role_name} --max-session-duration {new_max_session}"}]`)}},
		dashboard: "http://localhost:3000/",
	}
	x := build(d)
	if x.Fix == nil || len(x.Fix.Steps) != 1 {
		t.Fatalf("fix: %+v", x.Fix)
	}
	if got := x.Fix.Steps[0].CLI; got != "aws iam update-role --role-name AS-Testing-IAM-Role --max-session-duration 3600" {
		t.Fatalf("step not filled from the finding: %q", got)
	}
	if x.Identity != "AS-Testing (EC2)" || x.DashboardURL != "http://localhost:3000/findings/f1" {
		t.Fatalf("identity / url: %q %q", x.Identity, x.DashboardURL)
	}
	for _, want := range []string{"Rule: I10 Long role sessions", "Severity: Medium", "Identity: AS-Testing (EC2)",
		"AWS account: 884264984984", "How to fix: Lower the session duration.", "Fix: Lower the role's maximum session duration (risk LOW)",
		"ISPM finding id: f1", "Dashboard: http://localhost:3000/findings/f1"} {
		if !strings.Contains(x.SummaryText, want) {
			t.Fatalf("summary misses %q:\n%s", want, x.SummaryText)
		}
	}
}

// modes: a safe fix needs approval only for a Critical finding; a risky fix always does.
func TestModesApproval(t *testing.T) {
	mapped := func(severity, action string) *FindingFix {
		return build(&fixData{
			finding:  domain.Finding{ID: "f", RuleID: "R", Severity: severity, Status: "OPEN", AccountID: "1", CredentialARN: "arn:aws:iam::1:role/r"},
			ruleActs: []domain.RuleAction{{RuleID: "R", ActionType: action, IsDefault: true, ParamsTemplate: json.RawMessage(`{}`)}},
			actions:  map[string]*domain.Action{action: {ActionType: action, Title: action, RiskLevel: domain.RiskLow, StepsTemplate: json.RawMessage(`[]`)}},
			oneClick: map[string]oneClickCheck{action: {ok: true}},
		})
	}
	for _, c := range []struct {
		severity, action string
		approval         bool
		flowStart        string
	}{
		{"High", "set_session_duration", false, "The backend applies the fix"},
		{"Critical", "set_session_duration", true, "Critical finding"},
		{"High", "rewrite_trust", true, "This fix changes who can reach"},
		{"Low", "rotate_access_key", true, "This fix changes who can reach"},
		{"Critical", "rewrite_trust", true, "Critical finding"},
	} {
		oc := mapped(c.severity, c.action).Modes.OneClick
		if oc.ApprovalRequired != c.approval || !oc.Available || !strings.HasPrefix(oc.Flow, c.flowStart) {
			t.Errorf("%s fix on a %s finding: approval=%v available=%v flow=%q", c.action, c.severity, oc.ApprovalRequired, oc.Available, oc.Flow)
		}
	}
}

// a DEFAULT row of remediation_guides (shortened)
var defaultGuide = &domain.Guide{RuleID: "DEFAULT", Title: "Fix by hand", RiskLevel: domain.RiskMedium,
	Description: "There is no automatic fix for this rule.", Steps: json.RawMessage(`[
	{"title":"{open_title} and look at the current setting","console":"{open_console}","cli":"{open_cli}"},
	{"title":"Make the change: {how_to_fix}","console":"{open_console}"},
	{"title":"Check that the change is in place","console":"{open_console}","cli":"{open_cli}"},
	{"title":"Mark the plan done in the dashboard"}]`)}

// A rule without a mapped fix gets its by-hand fix from remediation_guides, filled from the finding.
func TestBuildRuleWithoutMappedFix(t *testing.T) {
	x := build(&fixData{finding: domain.Finding{ID: "f2", RuleID: "PATH-01", RuleName: "End-to-end exfiltration path",
		Severity: "Critical", Status: "OPEN", AccountID: "884264984984",
		CredentialARN:   "arn:aws:iam::884264984984:role/app-role",
		Remediation:     "Remove internet exposure or the data permissions.",
		RiskExplanation: "An attacker on the internet can reach the data."}, actions: map[string]*domain.Action{},
		guide: defaultGuide})
	if x.Fix == nil || !x.Fix.Manual || x.Fix.ActionType != "manual_fix" || x.Fix.OneClickSupported ||
		x.Fix.Title != "Fix by hand" || x.Fix.Description != "There is no automatic fix for this rule." || x.Fix.RiskLevel != domain.RiskMedium {
		t.Fatalf("the by-hand fix comes from the table row: %+v", x.Fix)
	}
	if len(x.Fix.Steps) != 4 || x.Fix.Steps[0].Console != "IAM > Roles > app-role" ||
		!strings.Contains(x.Fix.Steps[1].Title, "Remove internet exposure") {
		t.Fatalf("steps: %+v", x.Fix.Steps)
	}
	if !x.Modes.Guided.Available || x.Modes.OneClick.Available || !strings.Contains(x.Modes.OneClick.Reason, "no automatic fix") {
		t.Fatalf("modes: %+v", x.Modes)
	}
	for _, want := range []string{"How to fix: Remove internet exposure", "Why it matters: An attacker",
		"Fix: Fix by hand (no automatic fix for this rule)"} {
		if !strings.Contains(x.SummaryText, want) {
			t.Fatalf("summary misses %q:\n%s", want, x.SummaryText)
		}
	}
}

// No mapped fix and no row in remediation_guides: fix is null and Guided says what is missing.
func TestBuildRuleWithoutFixOrGuide(t *testing.T) {
	x := build(&fixData{finding: domain.Finding{ID: "f5", RuleID: "PATH-01", Status: "OPEN", AccountID: "1"},
		actions: map[string]*domain.Action{}})
	if x.Fix != nil || x.Modes.Guided.Available || !strings.Contains(x.Modes.Guided.Reason, "remediation_guides") {
		t.Fatalf("fix %+v guided %+v", x.Fix, x.Modes.Guided)
	}
}

// A finding that is not OPEN cannot get a plan, so Guided says why.
func TestGuidedNotOpen(t *testing.T) {
	x := build(&fixData{finding: domain.Finding{ID: "f3", RuleID: "OG-ID-005", Status: "RESOLVED", AccountID: "1",
		IdentityName: "svc", IdentityType: "IAM_USER"}, actions: map[string]*domain.Action{}, guide: defaultGuide})
	if x.Modes.Guided.Available || !strings.Contains(x.Modes.Guided.Reason, "RESOLVED") {
		t.Fatalf("guided: %+v", x.Modes.Guided)
	}
}
