package identitygraph

import (
	"testing"
)

func TestHighlightsOrderAndLabels(t *testing.T) {
	got := Highlights(map[changePair]int{
		{ChangeCreated, EntityIdentity}:    5,
		{ChangeDeleted, EntityCredential}:  3,
		{ChangeModified, EntityPermission}: 6,
		{ChangeCreated, EntityTrustEdge}:   1,
		{ChangeDeleted, EntityIdentity}:    0,
	})
	want := []string{
		"6 permission changes detected",
		"5 new identities discovered",
		"3 credentials removed",
		"1 trust relationship added",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d highlights, want %d: %+v", len(got), len(want), got)
	}
	for i, w := range want {
		if got[i].Label != w {
			t.Errorf("highlight %d = %q, want %q", i, got[i].Label, w)
		}
	}
	if one := highlightLabel(ChangeCreated, EntityIdentity, 1); one != "1 new identity discovered" {
		t.Errorf("singular label = %q", one)
	}
}

func TestDescribeChangeFallback(t *testing.T) {
	cases := map[string][4]string{
		"Identity deploy-bot was added":                 {ChangeCreated, EntityIdentity, "deploy-bot", ""},
		"Credential AKIA1 was removed":                  {ChangeDeleted, EntityCredential, "", "arn:aws:iam::1:user/x/accesskey/AKIA1"},
		"Permission of ci-deployer was changed":         {ChangeModified, EntityPermission, "ci-deployer", ""},
		"Trust relationship of deploy-role was removed": {ChangeDeleted, EntityTrustEdge, "deploy-role", ""},
	}
	for want, in := range cases {
		if got := DescribeChange(in[0], in[1], in[2], in[3]); got != want {
			t.Errorf("DescribeChange(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestUUIDLike(t *testing.T) {
	if !uuidLike("62676623-7294-50b9-9533-37b161ba75a4") || uuidLike("not-a-uuid") || uuidLike("62676623x7294-50b9-9533-37b161ba75a4") {
		t.Error("uuidLike misclassifies")
	}
}
