package registry

import "testing"

func TestMatch(t *testing.T) {
	fleet := []Candidate{
		{SourceType: "EC2", Keys: []string{"arn:aws:iam::1:role/web"}, DiscoveryID: "d-1", ResourceARN: "arn:aws:ec2:r:1:instance/i-abc", RoleARN: "arn:aws:iam::1:role/web"},
		{SourceType: "LAMBDA", Keys: []string{"arn:aws:lambda:r:1:function:f"}, ResourceARN: "arn:aws:lambda:r:1:function:f", RoleARN: "arn:aws:iam::1:role/shared"},
		{SourceType: "LAMBDA", Keys: []string{"arn:aws:lambda:r:1:function:g"}, ResourceARN: "arn:aws:lambda:r:1:function:g", RoleARN: "arn:aws:iam::1:role/shared"},
	}
	rows := []Row{
		{NHIType: "EC2", IdentityName: "3084894e-e849-5cfd-a54b-867dabac0866", InstanceID: "i-abc"}, // by instance id
		{NHIType: "EC2", IdentityName: "u-2", ARN: "arn:aws:ec2:r:1:instance/i-abc"},                // by ARN
		{NHIType: "EC2", IdentityName: "d-1"},                                                       // the discovery id itself
		{NHIType: "ec2_instance", IdentityName: "u-3", RoleARN: "arn:aws:iam::1:role/web"},          // family + unique role
		{NHIType: "LAMBDA", IdentityName: "u-4", RoleARN: "arn:aws:iam::1:role/shared"},             // shared role: ambiguous, no alias
		{NHIType: "EC2", IdentityName: "arn:aws:iam::1:role/web"},                                   // already a fleet key
	}
	got := map[string]int{}
	for _, a := range Match(rows, fleet) {
		if a.SourceType == "" {
			t.Fatalf("alias without source type: %+v", a)
		}
		got[a.IdentityName] = a.Index
	}
	want := map[string]int{"3084894e-e849-5cfd-a54b-867dabac0866": 0, "u-2": 0, "d-1": 0, "u-3": 0}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, i := range want {
		if g, ok := got[k]; !ok || g != i {
			t.Fatalf("%s: got %v, want fleet[%d]", k, got, i)
		}
	}
}
