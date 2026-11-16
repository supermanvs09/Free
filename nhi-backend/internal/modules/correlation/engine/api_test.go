package engine

import "testing"

func TestValidARN(t *testing.T) {
	good := []string{arnUser, arnBkt, arnSec, "arn:aws-cn:iam::1:role/x"}
	bad := []string{"", "role/x", "arn:aws:iam::1:role/x y", "arn:aws:iam::1:role/x\n", "'; drop table x;--"}
	for _, s := range good {
		if !ValidARN(s) {
			t.Errorf("%q should be valid", s)
		}
	}
	for _, s := range bad {
		if ValidARN(s) {
			t.Errorf("%q should be invalid", s)
		}
	}
}

func TestIsAllResourcesTarget(t *testing.T) {
	for _, s := range []string{"*", "*:s3"} {
		if !IsAllResourcesTarget(s) {
			t.Errorf("%q stands for every resource", s)
		}
	}
	if IsAllResourcesTarget(arnBkt) {
		t.Error("a concrete ARN is not a wildcard target")
	}
}

func TestExpandLinkEscapesTheARN(t *testing.T) {
	const plus = "arn:aws:iam::111111111111:role/a+b=c,d@e"
	if got, want := expandLink(plus), graphBase+"arn%3Aaws%3Aiam%3A%3A111111111111%3Arole%2Fa%2Bb%3Dc%2Cd%40e"; got != want {
		t.Errorf("expandLink = %q, want %q", got, want)
	}
}
