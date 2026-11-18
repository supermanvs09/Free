package humanidentities

import (
	"testing"
	"time"

	"nhi-backend-api/internal/identitygraph"
)

func TestBuildHumanRiskSignals(t *testing.T) {
	now := time.Date(2026, 11, 18, 0, 0, 0, 0, time.UTC)
	f, tr := false, true
	old := now.Add(-100 * 24 * time.Hour)
	labels := func(d identitygraph.HumanIdentityDetail) string {
		s := ""
		for _, x := range buildHumanRiskSignals(&d, now) {
			s += x.Label + "/" + x.Severity + ";"
		}
		return s
	}
	cases := []struct {
		name string
		d    identitygraph.HumanIdentityDetail
		want string
	}{
		{"root without MFA is critical, not console-without-MFA", identitygraph.HumanIdentityDetail{HumanType: "ROOT_USER", Source: "iam", MFAActive: &f, ConsoleAccess: &tr, LastActivityAt: &now},
			"Root account without MFA/critical;MFA disabled/high;"},
		{"console without MFA, inactive", identitygraph.HumanIdentityDetail{HumanType: "IAM_CONSOLE_HUMAN", Source: "iam", MFAActive: &f, ConsoleAccess: &tr, LastActivityAt: &old},
			"Console access without MFA/critical;MFA disabled/high;Inactive over 90 days/high;"},
		{"SSO gets no activity signals", identitygraph.HumanIdentityDetail{HumanType: "SSO_HUMAN", Source: "identity_center"}, ""},
		{"IAM never used", identitygraph.HumanIdentityDetail{HumanType: "IAM_USER_HUMAN", Source: "iam", MFAActive: &tr}, "Never used/medium;"},
	}
	for _, c := range cases {
		if got := labels(c.d); got != c.want {
			t.Errorf("%s: got %q want %q", c.name, got, c.want)
		}
	}
}
