package catalog

import (
	"encoding/json"
	"strings"
	"testing"

	"nhi-backend-api/internal/remediation/domain"
)

func TestManualTarget(t *testing.T) {
	for _, c := range []struct {
		name string
		f    domain.Finding
		want Target
	}{
		{"role ARN", domain.Finding{AccountID: "1", CredentialARN: "arn:aws:iam::1:role/team/app"},
			Target{Kind: "role", ARN: "arn:aws:iam::1:role/team/app", Name: "app", Account: "1"}},
		{"ARN in the evidence", domain.Finding{AccountID: "1", Evidence: json.RawMessage(`{"privileged":false,"bucket_arn":"arn:aws:s3:::logs"}`)},
			Target{Kind: "bucket", ARN: "arn:aws:s3:::logs", Name: "logs", Account: "1"}},
		{"secret", domain.Finding{AccountID: "1", CredentialARN: "arn:aws:secretsmanager:ap-south-1:1:secret:db-AbC123"},
			Target{Kind: "secret", ARN: "arn:aws:secretsmanager:ap-south-1:1:secret:db-AbC123", Name: "db-AbC123", Region: "ap-south-1", Account: "1"}},
		{"path parameter", domain.Finding{AccountID: "1", CredentialARN: "arn:aws:ssm:ap-south-1:1:parameter/app/db"},
			Target{Kind: "parameter", ARN: "arn:aws:ssm:ap-south-1:1:parameter/app/db", Name: "/app/db", Region: "ap-south-1", Account: "1"}},
		{"plain parameter", domain.Finding{AccountID: "1", CredentialARN: "arn:aws:ssm:ap-south-1:1:parameter/token"},
			Target{Kind: "parameter", ARN: "arn:aws:ssm:ap-south-1:1:parameter/token", Name: "token", Region: "ap-south-1", Account: "1"}},
		{"identity only (a service-account user is a user, not the account)",
			domain.Finding{AccountID: "1", IdentityName: "svc", IdentityType: "IAM_USER_SERVICE_ACCOUNT"},
			Target{Kind: "user", Name: "svc", Account: "1"}},
		{"account rule", domain.Finding{AccountID: "1", IdentityType: "AWS_ACCOUNT"},
			Target{Kind: "account", Account: "1"}},
	} {
		if got := ManualTarget(c.f); got != c.want {
			t.Errorf("%s: got %+v, want %+v", c.name, got, c.want)
		}
	}
}

func TestGuideVars(t *testing.T) {
	v := GuideVars(domain.Finding{RuleID: "OG-ID-005", AccountID: "1", IdentityName: "ispm-test-user",
		IdentityType: "IAM_USER_SERVICE_ACCOUNT", Remediation: "Add a purpose tag or description."})
	for k, want := range map[string]string{
		"target_name":  "ispm-test-user",
		"user_name":    "ispm-test-user",
		"open_console": "IAM > Users > ispm-test-user",
		"tag_purpose":  "aws iam tag-user --user-name ispm-test-user --tags Key=purpose,Value=<what this identity is used for>",
		"how_to_fix":   "Add a purpose tag or description.",
		"region_flag":  "",
	} {
		if v[k] != want {
			t.Errorf("%s = %q, want %q", k, v[k], want)
		}
	}
	v = GuideVars(domain.Finding{AccountID: "1", CredentialARN: "arn:aws:kms:ap-south-1:1:key/abc"})
	if v["region_flag"] != " --region ap-south-1" || v["key_id"] != "arn:aws:kms:ap-south-1:1:key/abc" ||
		v["tag_owner"] != "aws kms tag-resource --key-id arn:aws:kms:ap-south-1:1:key/abc --tags TagKey=owner,TagValue=<owner team or e-mail> --region ap-south-1" {
		t.Fatalf("kms vars: %+v", v)
	}
}

// GuideSteps fills a remediation_guides row: a known placeholder may be empty ({region_flag}),
// an unknown one is shown as <name>, a step without a title is dropped.
func TestGuideSteps(t *testing.T) {
	g := &domain.Guide{RuleID: "OG-ID-005", Steps: json.RawMessage(`[
		{"title":"{open_title}","console":"{open_console}","cli":"{open_cli}{region_flag}"},
		{"title":"Add the purpose tag","cli":"{tag_purpose}"},
		{"title":"Ask {owner_team}"},
		{"title":"","cli":"dropped"}]`)}
	st := GuideSteps(g, domain.Finding{RuleID: "OG-ID-005", AccountID: "1", IdentityName: "svc", IdentityType: "IAM_USER"})
	if len(st) != 3 {
		t.Fatalf("steps: %+v", st)
	}
	if st[0].Title != "Open the user svc" || st[0].Console != "IAM > Users > svc" || strings.Contains(st[0].CLI, "<") {
		t.Fatalf("open step: %+v", st[0])
	}
	if st[1].CLI != "aws iam tag-user --user-name svc --tags Key=purpose,Value=<what this identity is used for>" {
		t.Fatalf("tag step: %+v", st[1])
	}
	if st[2].Title != "Ask <owner_team>" {
		t.Fatalf("unknown placeholder: %+v", st[2])
	}
	if GuideSteps(nil, domain.Finding{}) != nil {
		t.Fatal("no guide row: no steps")
	}
}

// No rule maps to the by-hand fix: it is only used when the rule has no automatic fix.
func TestManualFixNotMapped(t *testing.T) {
	for _, r := range RuleActions() {
		if r.ActionType == ManualFix {
			t.Fatalf("rule %s must not map to %s", r.RuleID, ManualFix)
		}
	}
	for _, a := range Defaults() {
		if a.ActionType == ManualFix {
			t.Fatal("the by-hand fix comes from remediation_guides, not from the action catalog")
		}
	}
}
