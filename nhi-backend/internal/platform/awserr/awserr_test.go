package awserr

import (
	"strings"
	"testing"
)

func TestScrubCallerHidesOurAccount(t *testing.T) {
	in := "An error occurred (AccessDenied) when calling the AssumeRole operation: User: arn:aws:sts::906335841271:assumed-role/nhi-scanner/abc123 is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::111111111111:role/DaRead"
	out := ScrubCaller(in)
	if strings.Contains(out, "906335841271") || strings.Contains(out, "nhi-scanner") {
		t.Fatalf("our side still visible: %s", out)
	}
	if !strings.Contains(out, "arn:aws:iam::111111111111:role/DaRead") {
		t.Fatalf("customer role lost: %s", out)
	}
}
