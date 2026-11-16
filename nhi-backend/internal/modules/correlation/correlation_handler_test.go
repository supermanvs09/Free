package correlation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/correlation/engine"
	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
)

const (
	arnDev = "arn:aws:iam::111111111111:role/DevRole"
	arnBkt = "arn:aws:s3:::reports"
)

type errBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
	} `json:"error"`
}

// request builds a request carrying a tenant's claims, as the auth middleware leaves it.
func request(method, target, body string, tenant string) *http.Request {
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	if tenant != "" {
		claims := &jwt.CustomClaims{TenantID: "id-" + tenant, DBName: tenant}
		r = r.WithContext(context.WithValue(r.Context(), middleware.UserClaimsKey, claims))
	}
	return r
}

func serve(fn http.HandlerFunc, r *http.Request) (int, errBody, string) {
	w := httptest.NewRecorder()
	fn(w, r)
	var e errBody
	_ = json.Unmarshal(w.Body.Bytes(), &e)
	return w.Code, e, w.Body.String()
}

// Every case below is refused before the service is reached, so the handlers
// run without a database or an engine.
func TestHandlersRefuseBadRequests(t *testing.T) {
	h := NewHandler(&Service{})
	long := strings.Repeat("x", maxCategory+1)
	uuid := "0b7a1f4e-1c1f-4c55-9d52-2f1d5a1f9a10"

	cases := []struct {
		name   string
		fn     http.HandlerFunc
		method string
		url    string
		body   string
		field  string
	}{
		{"catalog unknown section", h.Catalog, "GET", "/correlation/catalog?section=bogus", "", "section"},
		{"catalog unknown parameter", h.Catalog, "GET", "/correlation/catalog?x=1", "", "x"},
		{"catalog repeated parameter", h.Catalog, "GET", "/correlation/catalog?section=rules&section=families", "", "section"},
		{"catalog long category", h.Catalog, "GET", "/correlation/catalog?category=" + long, "", "category"},

		{"blast radius without arn", h.BlastRadius, "GET", "/correlation/blast-radius", "", "arn"},
		{"blast radius junk arn", h.BlastRadius, "GET", "/correlation/blast-radius?arn=junk", "", "arn"},
		{"blast radius bad summary", h.BlastRadius, "GET", "/correlation/blast-radius?arn=" + arnDev + "&summary=maybe", "", "summary"},
		{"blast radius bad refresh", h.BlastRadius, "GET", "/correlation/blast-radius?arn=" + arnDev + "&refresh=2", "", "refresh"},

		{"graph without arn", h.Graph, "GET", "/correlation/graph", "", "arn"},
		{"graph bad direction", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&direction=sideways", "", "direction"},
		{"graph limit 0", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&limit=0", "", "limit"},
		{"graph limit 500", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&limit=500", "", "limit"},
		{"graph negative offset", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&offset=-1", "", "offset"},
		{"graph depth 9", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&depth=9", "", "depth"},
		{"graph depth 0", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&depth=0", "", "depth"},
		{"graph depth needs inbound", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&direction=out&depth=2", "", "depth"},
		{"graph bad service", h.Graph, "GET", "/correlation/graph?arn=" + arnDev + "&service=S3!x", "", "service"},

		{"paths without to", h.Paths, "GET", "/correlation/paths?from=" + arnDev, "", "to"},
		{"paths reverse needs an ARN", h.Paths, "GET", "/correlation/paths?to=*", "", "to"},
		{"paths reverse junk", h.Paths, "GET", "/correlation/paths?to=junk", "", "to"},
		{"paths junk from", h.Paths, "GET", "/correlation/paths?from=junk&to=" + arnBkt, "", "from"},
		{"paths junk to", h.Paths, "GET", "/correlation/paths?from=" + arnDev + "&to=junk", "", "to"},

		{"run with a query parameter", h.CreateRun, "POST", "/correlation/runs?arn=" + arnDev, "", "arn"},
		{"run without a body", h.CreateRun, "POST", "/correlation/runs", "", "body"},
		{"run with broken JSON", h.CreateRun, "POST", "/correlation/runs", "{", "body"},
		{"run with an unknown field", h.CreateRun, "POST", "/correlation/runs", `{"arn":"` + arnDev + `","force":true}`, "body"},
		{"run with a junk arn", h.CreateRun, "POST", "/correlation/runs", `{"arn":"junk"}`, "arn"},

		{"runs bad id", h.Runs, "GET", "/correlation/runs?id=nope", "", "id"},
		{"runs id with status", h.Runs, "GET", "/correlation/runs?id=" + uuid + "&status=failed", "", "id"},
		{"runs bad status", h.Runs, "GET", "/correlation/runs?status=weird", "", "status"},
		{"runs limit 0", h.Runs, "GET", "/correlation/runs?limit=0", "", "limit"},
		{"runs limit 201", h.Runs, "GET", "/correlation/runs?limit=201", "", "limit"},
	}
	for _, c := range cases {
		code, e, raw := serve(c.fn, request(c.method, c.url, c.body, "acme"))
		if code != http.StatusBadRequest || e.Error.Code != codeInvalid || e.Error.Field != c.field {
			t.Errorf("%s: got %d %s, want 400 %s on field %q", c.name, code, raw, codeInvalid, c.field)
		}
	}
}

func TestHandlersRequireClaims(t *testing.T) {
	h := NewHandler(&Service{})
	for name, fn := range map[string]http.HandlerFunc{
		"catalog": h.Catalog, "blast-radius": h.BlastRadius, "graph": h.Graph,
		"paths": h.Paths, "create run": h.CreateRun, "runs": h.Runs,
	} {
		code, e, raw := serve(fn, request("GET", "/correlation/x", "", ""))
		if code != http.StatusUnauthorized || e.Error.Code != codeUnauthorized {
			t.Errorf("%s without claims: %d %s", name, code, raw)
		}
	}
}

func TestPerTenantRateLimit(t *testing.T) {
	h := NewHandler(&Service{})
	limited := 0
	for i := 0; i < int(rateLimitBurst)+10; i++ {
		w := httptest.NewRecorder()
		h.Runs(w, request("GET", "/correlation/runs?limit=0", "", "ratelimited"))
		if w.Code == http.StatusTooManyRequests {
			limited++
			if w.Header().Get("Retry-After") == "" {
				t.Error("a 429 must say when to retry")
			}
		}
	}
	if limited == 0 {
		t.Error("a tenant that exceeds its burst must be limited")
	}
	// Another tenant has its own bucket.
	if code, _, raw := serve(h.Runs, request("GET", "/correlation/runs?limit=0", "", "other")); code != http.StatusBadRequest {
		t.Errorf("a different tenant must not be limited: %d %s", code, raw)
	}
}

func TestFailMapsErrorsToStatuses(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		status   int
		code     string
		notInMsg string
	}{
		{"identity unknown", fmt.Errorf("load credential: %w", engine.ErrCredentialNotFound), 404, codeNotFound, ""},
		{"run unknown", engine.ErrRunNotFound, 404, codeNotFound, ""},
		{"out of time", errTimeout, 504, codeTimeout, ""},
		{"engine table missing", fmt.Errorf("x: %w", engine.ErrTableMissing), 503, "TENANT_NOT_PROVISIONED", ""},
		{"postgres undefined_table", fmt.Errorf("x: %w", &pq.Error{Code: "42P01"}), 503, "TENANT_NOT_PROVISIONED", ""},
		{"bad parameter", &paramError{Field: "arn", Message: "nope"}, 400, codeInvalid, ""},
		{"anything else", errors.New("pq: password=hunter2 refused"), 500, codeInternal, "hunter2"},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		fail(w, httptest.NewRequest("GET", "/correlation/x", nil), "do the thing", c.err)
		var e errBody
		_ = json.Unmarshal(w.Body.Bytes(), &e)
		if w.Code != c.status || e.Error.Code != c.code {
			t.Errorf("%s: got %d %s, want %d %s", c.name, w.Code, w.Body.String(), c.status, c.code)
		}
		if c.notInMsg != "" && strings.Contains(w.Body.String(), c.notInMsg) {
			t.Errorf("%s: the response leaks the internal error: %s", c.name, w.Body.String())
		}
	}
}

func TestWithBudget(t *testing.T) {
	old := computeBudget
	computeBudget = 20 * time.Millisecond
	defer func() { computeBudget = old }()

	t.Run("fn gives up when the budget ends", func(t *testing.T) {
		_, err := withBudget(context.Background(), func(ctx context.Context) (int, error) {
			<-ctx.Done()
			return 0, ctx.Err()
		})
		if !errors.Is(err, errTimeout) {
			t.Errorf("got %v, want errTimeout", err)
		}
	})
	t.Run("a result that arrives after the budget is discarded", func(t *testing.T) {
		// The engine treats a failed source as "no evidence" and carries on, so
		// what it returns under an expired context may be incomplete.
		v, err := withBudget(context.Background(), func(ctx context.Context) (int, error) {
			time.Sleep(60 * time.Millisecond)
			return 7, nil
		})
		if !errors.Is(err, errTimeout) || v != 0 {
			t.Errorf("got %d, %v; want 0, errTimeout", v, err)
		}
	})
	t.Run("a client that went away is not a timeout", func(t *testing.T) {
		parent, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := withBudget(parent, func(ctx context.Context) (int, error) { return 0, ctx.Err() })
		if errors.Is(err, errTimeout) || !errors.Is(err, context.Canceled) {
			t.Errorf("got %v, want context.Canceled", err)
		}
	})
	t.Run("a fast call passes through", func(t *testing.T) {
		v, err := withBudget(context.Background(), func(ctx context.Context) (int, error) { return 7, nil })
		if v != 7 || err != nil {
			t.Errorf("got %d, %v", v, err)
		}
	})
}

func TestGraphResponseIsFlat(t *testing.T) {
	resp := GraphResponse{
		NavView: &engine.NavView{Node: engine.NavNode{ARN: arnDev, Name: "DevRole", Kind: "role"}},
		Inbound: &engine.InboundResult{RoleARN: arnDev},
	}
	raw, err := json.Marshal(resp)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"node", "data_as_of", "inbound"} {
		if _, ok := m[k]; !ok {
			t.Errorf("missing top-level %q in %s", k, raw)
		}
	}
	if _, ok := m["NavView"]; ok {
		t.Errorf("the nav view must be flattened: %s", raw)
	}

	resp.Inbound = nil
	raw, _ = json.Marshal(resp)
	if strings.Contains(string(raw), "inbound") {
		t.Errorf("inbound is left out when depth was not asked: %s", raw)
	}
}

func TestParseSections(t *testing.T) {
	w := httptest.NewRecorder()
	all, ok := parseSections(w, "")
	if !ok || len(all) != len(catalogSections) {
		t.Errorf("no section means all of them: %v %v", all, ok)
	}
	some, ok := parseSections(w, "rules, families")
	if !ok || len(some) != 2 || !some[sectionRules] || !some[sectionFamilies] {
		t.Errorf("a list picks its sections: %v %v", some, ok)
	}
}

func TestNonNilGivesEmptyArray(t *testing.T) {
	raw, _ := json.Marshal(nonNil[int](nil))
	if string(raw) != "[]" {
		t.Errorf("got %s, want []", raw)
	}
}
