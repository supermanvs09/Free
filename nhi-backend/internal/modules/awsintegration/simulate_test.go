package awsintegration

import (
	"context"
	"errors"
	"testing"
	"time"

	"nhi-backend-api/internal/platform/awsconnect"
)

func TestSimulatedAWS(t *testing.T) {
	verifier, events := NewSimulatedVerifier(time.Second)
	ctx := context.Background()
	p := awsconnect.Platform{}
	if _, err := verifier.AssumeRole(ctx, p, awsconnect.RoleARN{AccountID: simDenyAssume}, "x"); !errors.Is(err, awsconnect.ErrAccessDenied) {
		t.Fatalf("deny-assume account: %v", err)
	}
	sess, err := verifier.AssumeRole(ctx, p, awsconnect.RoleARN{AccountID: simDenyRead}, "x")
	if err != nil || !errors.Is(verifier.TestRead(ctx, sess), awsconnect.ErrAccessDenied) {
		t.Fatalf("deny-read account: %v", err)
	}
	sess, _ = verifier.AssumeRole(ctx, p, awsconnect.RoleARN{AccountID: "123456789012"}, "x")
	if err := verifier.TestRead(ctx, sess); err != nil {
		t.Fatalf("read: %v", err)
	}

	sim := events.(*SimulatedAWS)
	now := time.Unix(1_700_000_000, 0)
	sim.now = func() time.Time { return now }
	if poll, _ := sim.PollEvents(ctx, p, "123456789012"); len(poll.Regions) != 0 {
		t.Fatalf("first poll = %v, want nothing yet", poll.Regions)
	}
	now = now.Add(2500 * time.Millisecond)
	poll, _ := sim.PollEvents(ctx, p, "123456789012")
	if poll.Regions["us-east-1"] == 0 || poll.Regions["ap-south-1"] == 0 || len(poll.Regions) != 2 {
		t.Fatalf("after 2.5s = %v, want us-east-1 and ap-south-1", poll.Regions)
	}
	now = now.Add(time.Minute) // a new watch starts from nothing
	if poll, _ := sim.PollEvents(ctx, p, "123456789012"); len(poll.Regions) != 0 {
		t.Fatalf("new watch = %v, want nothing yet", poll.Regions)
	}
	if poll, _ := sim.PollEvents(ctx, p, simNoEvents); len(poll.Regions) != 0 || poll.Seen == 0 {
		t.Fatalf("silent account = %+v", poll)
	}
}
