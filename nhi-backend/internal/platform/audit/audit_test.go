package audit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gorilla/mux"
)

func TestActionNameIsStableAndReadable(t *testing.T) {
	for _, c := range []struct{ method, route, want string }{
		{http.MethodPost, "/api/v1/users", "users.create"},
		{http.MethodPatch, "/api/v1/users/{id}", "users.update"},
		{http.MethodDelete, "/api/v1/users/{id}", "users.delete"},
		{http.MethodPost, "/api/v1/integrations/aws/verify", "integrations.aws.verify"},
		{http.MethodPost, "/api/v1/integrations/aws/accounts/{account_id}/sync", "integrations.aws.accounts.sync"},
		{http.MethodDelete, "/api/v1/integrations/aws/accounts/{account_id}", "integrations.aws.accounts.delete"},
		{http.MethodPatch, "/api/v1/ispm/findings/{finding_id}", "ispm.findings.update"},
		{http.MethodPost, "/api/auth/login", "login"},
		{http.MethodPost, "/api/v1/logout", "logout"},
		{http.MethodPost, "/api/v1/remediation/plans/{id}/approve", "remediation.plans.approve"},
		{http.MethodGet, "/api/v1/ispm/posture/export", "ispm.posture.export"},
		{http.MethodPut, "/api/v1/settings", "settings.update"},
	} {
		if got := ActionName(c.method, c.route); got != c.want {
			t.Errorf("ActionName(%s %s) = %q, want %q", c.method, c.route, got, c.want)
		}
	}
}

// The ids in a URL must not change the name, or the log cannot be grouped.
func TestActionNameIgnoresIDs(t *testing.T) {
	a := ActionName(http.MethodDelete, "/api/v1/users/{id}")
	b := ActionName(http.MethodDelete, "/api/v1/users/{user_id}")
	if a != b {
		t.Errorf("%q != %q: the variable's name changed the action", a, b)
	}
}

func TestRedactRemovesAnythingSecretShaped(t *testing.T) {
	body := []byte(`{
		"email": "priya@acme", "role": "analyst",
		"password": "hunter2-the-real-one",
		"api_key": "AKIA...", "refresh_token": "abc", "client_secret": "s",
		"nested": {"private_key": "-----BEGIN", "keep": "visible"},
		"regions": ["ap-south-1", "us-east-1"]
	}`)
	got := Body(body)
	raw, _ := json.Marshal(got)
	for _, secret := range []string{"hunter2-the-real-one", "AKIA...", "-----BEGIN"} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("a secret reached the audit entry: %q in %s", secret, raw)
		}
	}
	// What is safe is kept, or the log would not answer "changed it to what".
	if got["email"] != "priya@acme" || got["role"] != "analyst" {
		t.Errorf("ordinary values were lost: %v", got)
	}
	if nested, ok := got["nested"].(map[string]any); !ok || nested["keep"] != "visible" {
		t.Errorf("nested ordinary value was lost: %v", got["nested"])
	}
}

func TestBodyOfSomethingThatIsNotJSON(t *testing.T) {
	got := Body([]byte("not json at all"))
	if got["body_bytes"] != 15 {
		t.Errorf("a body that is not JSON should be recorded by size only: %v", got)
	}
}

func TestOutcomeFor(t *testing.T) {
	for status, want := range map[int]string{
		200: OutcomeSuccess, 201: OutcomeSuccess, 304: OutcomeSuccess,
		401: OutcomeDenied, 403: OutcomeDenied,
		400: OutcomeInvalid, 404: OutcomeInvalid, 422: OutcomeInvalid, 429: OutcomeInvalid,
		500: OutcomeFailed, 503: OutcomeFailed,
	} {
		if got := OutcomeFor(status); got != want {
			t.Errorf("OutcomeFor(%d) = %q, want %q", status, got, want)
		}
	}
}

// collector is a Sink that keeps what it was given.
type collector struct {
	mu      sync.Mutex
	entries []Entry
}

func (c *collector) Record(_ context.Context, e Entry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, e)
}

func (c *collector) all() []Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]Entry(nil), c.entries...)
}

// serve runs one request through a router carrying the middleware, with an
// "authenticator" that names the caller the way the real one does.
func serve(t *testing.T, sink Sink, method, pattern, url string, body string, handler http.HandlerFunc) {
	t.Helper()
	r := mux.NewRouter()
	r.Use(Middleware(sink, nil, DefaultConfig()))
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			SetCaller(req.Context(), Caller{Actor: "priya@acme", Role: "analyst", TenantID: "3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d"})
			next.ServeHTTP(w, req)
		})
	})
	r.HandleFunc(pattern, handler).Methods(method)
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.Header.Set("X-Console-Screen", "Integrations")
	r.ServeHTTP(httptest.NewRecorder(), req)
}

func TestMiddlewareRecordsAChange(t *testing.T) {
	c := &collector{}
	serve(t, c, http.MethodPost, "/api/v1/integrations/aws/accounts/{account_id}/sync",
		"/api/v1/integrations/aws/accounts/123456789012/sync", `{"regions":["ap-south-1"]}`,
		func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) })

	got := c.all()
	if len(got) != 1 {
		t.Fatalf("entries = %d, want 1", len(got))
	}
	e := got[0]
	if e.Action != "integrations.aws.accounts.sync" {
		t.Errorf("action = %q", e.Action)
	}
	if e.Actor != "priya@acme" || e.ActorRole != "analyst" {
		t.Errorf("caller = %q/%q", e.Actor, e.ActorRole)
	}
	if e.Target != "123456789012" {
		t.Errorf("target = %q, want the account id", e.Target)
	}
	if e.Route != "/api/v1/integrations/aws/accounts/{account_id}/sync" || e.Path != "/api/v1/integrations/aws/accounts/123456789012/sync" {
		t.Errorf("route/path = %q / %q", e.Route, e.Path)
	}
	if e.Status != http.StatusAccepted || e.Outcome != OutcomeSuccess {
		t.Errorf("status/outcome = %d/%q", e.Status, e.Outcome)
	}
	if e.Screen != "Integrations" {
		t.Errorf("screen = %q, want the console screen the action came from", e.Screen)
	}
	if e.Details == nil {
		t.Error("the request body should be recorded, redacted")
	}
}

// The handler must still be able to read a body the middleware has read.
func TestMiddlewareLeavesTheBodyReadable(t *testing.T) {
	c := &collector{}
	var seen string
	serve(t, c, http.MethodPost, "/api/v1/users", "/api/v1/users", `{"email":"new@acme"}`,
		func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("handler could not read the body: %v", err)
			}
			seen, _ = body["email"].(string)
			w.WriteHeader(http.StatusCreated)
		})
	if seen != "new@acme" {
		t.Errorf("handler saw %q, want the body it was sent", seen)
	}
}

// A refusal is the entry an audit log is read for.
func TestMiddlewareRecordsARefusal(t *testing.T) {
	c := &collector{}
	serve(t, c, http.MethodDelete, "/api/v1/users/{id}", "/api/v1/users/7", "",
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"success":false,"message":"no","error":"FORBIDDEN"}`))
		})
	got := c.all()
	if len(got) != 1 {
		t.Fatalf("entries = %d, want 1", len(got))
	}
	if got[0].Outcome != OutcomeDenied || got[0].ErrorCode != "FORBIDDEN" {
		t.Errorf("outcome/code = %q/%q, want denied/FORBIDDEN", got[0].Outcome, got[0].ErrorCode)
	}
}

// Reads are noise unless they were refused, or they took data out.
func TestMiddlewareSkipsOrdinaryReads(t *testing.T) {
	c := &collector{}
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
	serve(t, c, http.MethodGet, "/api/v1/identities", "/api/v1/identities?page=1", "", ok)
	if n := len(c.all()); n != 0 {
		t.Errorf("an ordinary read was recorded (%d entries)", n)
	}

	// An export is an action: data left the console.
	serve(t, c, http.MethodGet, "/api/v1/ispm/posture/export", "/api/v1/ispm/posture/export?format=csv", "", ok)
	// A refused read is an action: somebody reached for something.
	serve(t, c, http.MethodGet, "/api/v1/credential-exposure/findings", "/api/v1/credential-exposure/findings", "",
		func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) })

	got := c.all()
	if len(got) != 2 {
		t.Fatalf("entries = %d, want the export and the refusal", len(got))
	}
	if got[0].Action != "ispm.posture.export" {
		t.Errorf("first entry = %q, want the export", got[0].Action)
	}
	if got[1].Outcome != OutcomeDenied {
		t.Errorf("second entry = %q, want the refusal", got[1].Outcome)
	}
}

// The health probe a load balancer calls every few seconds is not an action.
func TestMiddlewareSkipsHealthAndPreflight(t *testing.T) {
	c := &collector{}
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
	serve(t, c, http.MethodGet, "/api/v1/health", "/api/v1/health", "", ok)
	serve(t, c, http.MethodOptions, "/api/v1/users", "/api/v1/users", "", ok)
	if n := len(c.all()); n != 0 {
		t.Errorf("health or preflight was recorded (%d entries)", n)
	}
}

// A query says what a refused read was reaching for, and which filter an
// export was taken with - but not a token passed as one.
func TestMiddlewareRecordsQueryWithoutSecrets(t *testing.T) {
	c := &collector{}
	serve(t, c, http.MethodGet, "/api/v1/ispm/posture/export", "/api/v1/ispm/posture/export?window=30d&api_key=SECRETVALUE", "",
		func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	got := c.all()
	if len(got) != 1 {
		t.Fatalf("entries = %d", len(got))
	}
	raw, _ := json.Marshal(got[0].Details)
	if strings.Contains(string(raw), "SECRETVALUE") {
		t.Errorf("a secret in the query reached the entry: %s", raw)
	}
	if !strings.Contains(string(raw), "30d") {
		t.Errorf("the filter the export was taken with was lost: %s", raw)
	}
}
