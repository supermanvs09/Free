package identitygraph

import (
	"strings"
	"testing"
)

func TestHumanSignalsFromFlags(t *testing.T) {
	flags := func(keys ...string) []bool {
		out := make([]bool, len(HumanRiskRules))
		for i, r := range HumanRiskRules {
			for _, k := range keys {
				if r.Key == k {
					out[i] = true
				}
			}
		}
		return out
	}
	labels := func(s []HumanRiskSignal) string {
		var b []string
		for _, x := range s {
			b = append(b, x.Label)
		}
		return strings.Join(b, ";")
	}
	// Root without MFA is reported once, not again as console access.
	if got := labels(humanSignalsFromFlags(flags("root_no_mfa", "console_no_mfa", "mfa_disabled"))); got != "Root account without MFA;MFA disabled" {
		t.Fatalf("root: %q", got)
	}
	// Count-only rules never become signals.
	if got := labels(humanSignalsFromFlags(flags("admin_policy", "active_access_key"))); got != "" {
		t.Fatalf("count-only rules: %q", got)
	}
}

// Dates from the IAM credential report can be "N/A"; they must not be cast.
func TestHiTSGuardsTheCast(t *testing.T) {
	got := hiTS("x")
	if !strings.Contains(got, "~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'") || !strings.Contains(got, "(x)::timestamptz") {
		t.Fatalf("hiTS: %s", got)
	}
}
