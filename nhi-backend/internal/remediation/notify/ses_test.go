package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

// testSES is an SES sender whose client talks to a local fake of the SES v2 API.
func testSES(srv *httptest.Server) *SES {
	return &SES{client: sesv2.New(sesv2.Options{
		Region:           "ap-south-1",
		Credentials:      credentials.NewStaticCredentialsProvider("AKIATEST", "secret", ""),
		BaseEndpoint:     aws.String(srv.URL),
		HTTPClient:       srv.Client(),
		RetryMaxAttempts: 1,
	})}
}

func TestSESSendsTheMail(t *testing.T) {
	var path string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		_, _ = w.Write([]byte(`{"MessageId":"0000-test"}`))
	}))
	defer srv.Close()

	err := testSES(srv).Send(context.Background(), "alerts@example.com", []string{"a@example.com", "b@example.com"},
		"[ISPM] Approval needed", "<p>hi</p>", "hi")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if path != "/v2/email/outbound-emails" {
		t.Fatalf("path %q", path)
	}
	if body["FromEmailAddress"] != "alerts@example.com" {
		t.Fatalf("from: %v", body["FromEmailAddress"])
	}
	to, _ := body["Destination"].(map[string]any)["ToAddresses"].([]any)
	if len(to) != 2 || to[0] != "a@example.com" || to[1] != "b@example.com" {
		t.Fatalf("to: %v", to)
	}
	simple := body["Content"].(map[string]any)["Simple"].(map[string]any)
	if simple["Subject"].(map[string]any)["Data"] != "[ISPM] Approval needed" ||
		simple["Body"].(map[string]any)["Html"].(map[string]any)["Data"] != "<p>hi</p>" ||
		simple["Body"].(map[string]any)["Text"].(map[string]any)["Data"] != "hi" {
		t.Fatalf("content: %v", simple)
	}
}

// SES refuses an address that is not verified (sandbox, or the From address): the worker gets
// the error and keeps it in remediation_notifications.last_error.
func TestSESErrorReachesTheCaller(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Amzn-Errortype", "MessageRejected")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"Email address is not verified."}`))
	}))
	defer srv.Close()

	err := testSES(srv).Send(context.Background(), "alerts@example.com", []string{"a@example.com"}, "s", "<p>x</p>", "x")
	if err == nil || !strings.Contains(err.Error(), "not verified") {
		t.Fatalf("want the SES error, got %v", err)
	}
}

func TestSESIsTheOnlyProvider(t *testing.T) {
	if len(Providers) != 1 || Providers[0] != "SES" {
		t.Fatalf("providers %v, want only SES", Providers)
	}
}
