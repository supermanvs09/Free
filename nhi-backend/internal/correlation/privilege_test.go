package correlation

import (
	"context"
	"testing"
	"time"
)

func TestPrivilegeLevelLadder(t *testing.T) {
	cases := []struct {
		name   string
		grants []ResourceGrant
		want   int
	}{
		{"no grants", nil, 0},
		{"administrator", []ResourceGrant{{ResourceARN: AllResourcesARN, Actions: []string{"*"}}}, 10},
		{"everything except IAM", []ResourceGrant{{ResourceARN: AllResourcesARN, Actions: []string{"*"}, Except: []string{"iam:*"}}}, 9},
		{"PassRole on all resources", []ResourceGrant{{ResourceARN: "*:iam", Actions: []string{"iam:PassRole"}}}, 9},
		{"PassRole on one role", []ResourceGrant{{ResourceARN: "arn:aws:iam::1:role/x", Actions: []string{"iam:PassRole"}}}, 8},
		{"all S3 write", []ResourceGrant{{ResourceARN: "*:s3", Actions: []string{"s3:*"}}}, 7},
		{"all EC2 write", []ResourceGrant{{ResourceARN: "*:ec2", Actions: []string{"ec2:RunInstances"}}}, 6},
		{"write on one bucket", []ResourceGrant{{ResourceARN: "arn:aws:s3:::b", Actions: []string{"s3:PutObject"}}}, 5},
		{"read on all of a service", []ResourceGrant{{ResourceARN: "*:ec2", Actions: []string{"ec2:DescribeInstances"}}}, 4},
		{"read on one bucket", []ResourceGrant{{ResourceARN: "arn:aws:s3:::b", Actions: []string{"s3:GetObject"}}}, 2},
		{"the highest grant wins", []ResourceGrant{
			{ResourceARN: "arn:aws:s3:::b", Actions: []string{"s3:GetObject"}},
			{ResourceARN: "*:s3", Actions: []string{"s3:*"}}}, 7},
	}
	for _, c := range cases {
		if got := PrivilegeLevel(c.grants); got != c.want {
			t.Errorf("%s: level %d, want %d", c.name, got, c.want)
		}
	}
}

func TestPrivilegeLevelsAndHigherPrivilegeFlagThroughTheEngine(t *testing.T) {
	repo := fixture() // alice reads one bucket; AdminRole is *:*
	repo.perms[arnOps] = []ResourcePermission{perm("iam:PassRole", "Allow", arnAdmin)}
	repo.perms[arnDev] = []ResourcePermission{perm("s3:GetObject", "Allow", "arn:aws:s3:::reports")}
	res := compute(t, repo)

	if res.PrivilegeLevel != 2 {
		t.Errorf("alice only reads one bucket: level %d", res.PrivilegeLevel)
	}
	levels := map[string]int{}
	for _, id := range res.ReachableIdentities {
		levels[id.ARN] = id.PrivilegeLevel
	}
	if levels[arnAdmin] != 10 || levels[arnOps] != 8 {
		t.Errorf("identity levels = %v", levels)
	}
	flagged := 0
	for _, p := range res.Paths {
		if isIdentityPath(p) && p.TargetARN == arnAdmin {
			if !containsString(p.Limitations, "target_has_higher_privilege") {
				t.Errorf("assuming a more powerful role must be flagged: %+v", p.Limitations)
			}
			flagged++
		}
	}
	if flagged != 1 {
		t.Errorf("want one flagged identity path to AdminRole, got %d", flagged)
	}
}

func TestDataFreshnessAndStaleFlag(t *testing.T) {
	old := time.Now().Add(-10 * 24 * time.Hour)
	recent := time.Now().Add(-2 * time.Hour)
	event := time.Now().Add(-30 * time.Minute)

	stale := fixture()
	stale.freshness = DataFreshness{CredentialLastSeenAt: &old, PermissionsUpdatedAt: &old}
	res := compute(t, stale)
	if !res.DataAsOf.Stale {
		t.Error("an identity not seen for 10 days must be flagged stale")
	}

	fresh := fixture()
	fresh.freshness = DataFreshness{CredentialLastSeenAt: &recent}
	fresh.observed = []ObservedEvent{
		{EventName: "GetObject", ResourceARN: arnBkt, EventTime: event.Add(-time.Hour)},
		{EventName: "GetObject", ResourceARN: arnBkt, EventTime: event},
	}
	res = compute(t, fresh)
	if res.DataAsOf.Stale {
		t.Error("an identity seen 2 hours ago is not stale")
	}
	if res.DataAsOf.LastObservedEventAt == nil || !res.DataAsOf.LastObservedEventAt.Equal(event) {
		t.Errorf("the newest observed event must be reported: %+v", res.DataAsOf.LastObservedEventAt)
	}
	if res.DataAsOf.CredentialLastSeenAt == nil {
		t.Error("last-seen time must be passed through")
	}

	unknown := compute(t, fixture()) // the repository knows nothing about freshness
	if unknown.DataAsOf.Stale {
		t.Error("unknown freshness must not be reported as stale")
	}
	_ = context.Background
}
