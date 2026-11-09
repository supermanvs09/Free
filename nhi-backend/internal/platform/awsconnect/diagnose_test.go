package awsconnect

import (
	"context"
	"strings"
	"testing"
)

func TestDiagnoseAssumeRole(t *testing.T) {
	role, err := ParseRoleARN("arn:aws:iam::548593215839:role/NHIPlatformCollectorNew")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	cases := []struct {
		name               string
		setup              func(*fakeAWS)
		fault, clear       bool
		problem, unchecked string
	}{
		{"our side fine: the customer's role refused", func(*fakeAWS) {}, false, true, "", ""},
		{"we are not the role customers trust", func(f *fakeAWS) {
			f.callerARN = "arn:aws:sts::999999999999:assumed-role/nhi-dashboard-task-role/abc"
		}, true, false, "NHI_AWS_ASSUME_ASSUMER_ROLE", ""},
		{"we run in another account", func(f *fakeAWS) {
			f.callerARN = "arn:aws:sts::111111111111:assumed-role/NHIPlatformAssumer/s"
		}, true, false, "collector_aws_account_id", ""},
		{"our policy does not allow the role", func(f *fakeAWS) { f.simDecision = "implicitDeny" }, true, false, "no policy of our role allows it", ""},
		{"our organization's SCP denies it", func(f *fakeAWS) { f.simDecision = "explicitDeny"; f.simOrgDenied = true }, true, false, "service control policy of OUR AWS organization", ""},
		{"simulation not permitted: unknown, not a fault", func(f *fakeAWS) { f.simDenied = true }, false, false, "", "iam:SimulatePrincipalPolicy"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeAWS{}
			tc.setup(f)
			c, p := newTestClient(t, f, "")
			d := c.DiagnoseAssumeRole(ctx, p, role)
			if d.OurFault() != tc.fault || d.OurSideClear() != tc.clear {
				t.Fatalf("fault=%v clear=%v, want %v %v: %s", d.OurFault(), d.OurSideClear(), tc.fault, tc.clear, d.Summary())
			}
			if tc.problem != "" && !strings.Contains(strings.Join(d.Problems, " "), tc.problem) {
				t.Errorf("problems %q lack %q", d.Problems, tc.problem)
			}
			if tc.unchecked != "" && !strings.Contains(strings.Join(d.NotChecked, " "), tc.unchecked) {
				t.Errorf("not-checked %q lacks %q", d.NotChecked, tc.unchecked)
			}
		})
	}
	// The simulation asks exactly the right question.
	f := &fakeAWS{}
	c, p := newTestClient(t, f, "")
	c.DiagnoseAssumeRole(ctx, p, role)
	if f.simForm.Get("PolicySourceArn") != "arn:aws:iam::999999999999:role/NHIPlatformAssumer" ||
		f.simForm.Get("ActionNames.member.1") != "sts:AssumeRole" || f.simForm.Get("ResourceArns.member.1") != role.ARN {
		t.Fatalf("simulation asked %v", f.simForm)
	}
}

func TestAssumedRoleName(t *testing.T) {
	for in, want := range map[string]string{
		"arn:aws:sts::1:assumed-role/NHIPlatformAssumer/s": "NHIPlatformAssumer",
		"arn:aws:iam::1:user/bob":                          "",
		"":                                                 "",
	} {
		if got := assumedRoleName(in); got != want {
			t.Errorf("%q -> %q, want %q", in, got, want)
		}
	}
}
