package codesources

import "testing"

func TestInstalledOn(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		org  string
		want bool
	}{
		{`[{"id":1,"account":"Acme-Corp"}]`, "acme-corp", true},
		{`{"installations":[{"id":1,"account":{"login":"acme"}}]}`, "acme", true},
		{`{"installations":[{"account_login":"other"}]}`, "acme", false},
		{`not json`, "acme", false},
		{`[]`, "acme", false},
	} {
		if got := installedOn([]byte(tc.raw), tc.org); got != tc.want {
			t.Errorf("installedOn(%s, %s) = %v", tc.raw, tc.org, got)
		}
	}
}
