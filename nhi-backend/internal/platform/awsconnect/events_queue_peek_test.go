package awsconnect

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
)

// fakeSQS answers ReceiveMessage with the given bodies and records every call.
type fakeSQS struct {
	mu      sync.Mutex
	bodies  []string
	targets []string
	inputs  []map[string]any
}

func (f *fakeSQS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	raw, _ := io.ReadAll(r.Body)
	var in map[string]any
	_ = json.Unmarshal(raw, &in)
	f.targets = append(f.targets, r.Header.Get("X-Amz-Target"))
	f.inputs = append(f.inputs, in)
	msgs := make([]map[string]string, 0, len(f.bodies))
	for i, b := range f.bodies {
		msgs = append(msgs, map[string]string{"MessageId": string(rune('a' + i)), "ReceiptHandle": "rh", "Body": b})
	}
	w.Header().Set("Content-Type", "application/x-amz-json-1.0")
	_ = json.NewEncoder(w).Encode(map[string]any{"Messages": msgs})
}

func newQueueClient(t *testing.T, f *fakeSQS, queueURL string) (*Client, Platform) {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	base := aws.Config{
		Region:           "us-east-1",
		Credentials:      credentials.NewStaticCredentialsProvider("AKIAPLATFORM", "s", ""),
		BaseEndpoint:     aws.String(srv.URL),
		HTTPClient:       srv.Client(),
		RetryMaxAttempts: 1,
	}
	p, err := NewPlatform("999999999999", "ap-south-1",
		"arn:aws:events:ap-south-1:999999999999:event-bus/nhi-central-bus",
		"arn:aws:iam::999999999999:role/NHIPlatformAssumer")
	if err != nil {
		t.Fatal(err)
	}
	return NewClient(base, false, "").WithEventQueue(queueURL), p
}

const testQueueURL = "https://sqs.ap-south-1.amazonaws.com/999999999999/nhi-events"

func TestPeekEventsFromFindsTheAccount(t *testing.T) {
	f := &fakeSQS{bodies: []string{
		`{"account":"111111111111","detail-type":"AWS API Call via CloudTrail"}`,
		`{"account":"884264984984","detail-type":"AWS API Call via CloudTrail"}`,
	}}
	c, p := newQueueClient(t, f, testQueueURL)
	found, seen, err := c.PeekEventsFrom(context.Background(), p, "884264984984")
	if err != nil || !found || seen != 2 {
		t.Fatalf("found=%v seen=%d err=%v, want found with 2 seen", found, seen, err)
	}
	if len(f.targets) != 1 || !strings.HasSuffix(f.targets[0], "ReceiveMessage") {
		t.Fatalf("calls = %v, want a single ReceiveMessage", f.targets)
	}
	// Peek only: messages stay visible to the pipeline and are never deleted.
	if v, ok := f.inputs[0]["VisibilityTimeout"]; ok && v != float64(0) {
		t.Fatalf("VisibilityTimeout = %v, want 0", v)
	}
	if f.inputs[0]["QueueUrl"] != testQueueURL {
		t.Fatalf("QueueUrl = %v", f.inputs[0]["QueueUrl"])
	}
}

func TestPeekEventsFromOtherAccountsOnly(t *testing.T) {
	f := &fakeSQS{bodies: []string{`{"account":"111111111111"}`}}
	c, p := newQueueClient(t, f, testQueueURL)
	found, seen, err := c.PeekEventsFrom(context.Background(), p, "884264984984")
	if err != nil || found || seen != queuePeekRounds {
		t.Fatalf("found=%v seen=%d err=%v, want not found after %d rounds", found, seen, err, queuePeekRounds)
	}
	for _, target := range f.targets {
		if !strings.HasSuffix(target, "ReceiveMessage") {
			t.Fatalf("unexpected call %q: the peek must never delete", target)
		}
	}
}

func TestPeekEventsFromNotConfigured(t *testing.T) {
	c, p := newQueueClient(t, &fakeSQS{}, "")
	if _, _, err := c.PeekEventsFrom(context.Background(), p, "884264984984"); !errors.Is(err, ErrEventQueueNotConfigured) {
		t.Fatalf("err = %v, want ErrEventQueueNotConfigured", err)
	}
}
