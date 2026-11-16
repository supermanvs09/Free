package integration

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/lib/pq"

	"nhi-backend-api/internal/modules/correlation"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/jwt"
	"nhi-backend-api/internal/platform/middleware"
)

const (
	corrAlice = "arn:aws:iam::111111111111:user/alice"
	corrDev   = "arn:aws:iam::111111111111:role/DevRole"
	corrOps   = "arn:aws:iam::111111111111:role/OpsRole"
	corrAdmin = "arn:aws:iam::111111111111:role/AdminRole"
	corrBkt   = "arn:aws:s3:::reports"
	corrFn    = "arn:aws:lambda:us-east-1:111111111111:function:builder"
)

// TestCorrelationAPI drives the six correlation endpoints, the run queue and its
// poller against a real PostgreSQL, over the demo estate of the engine's
// dev_fixture.sql: alice > DevRole > OpsRole > AdminRole, and a Lambda function
// that runs as DevRole.
//
// It WRITES (blast-radius cache, run queue): use a throwaway database only.
//
//	NHI_TEST_DSN                     postgres://... of that database
//	NHI_TEST_CORRELATION_TENANT      a tenant schema holding the fixture and migrations 011-016
//	NHI_TEST_CORRELATION_OTHER       a second tenant schema with the same tables, empty
//
// Both schemas must be listed in nhi_global.tenants (the poller reads that list).
func TestCorrelationAPI(t *testing.T) {
	dsn := os.Getenv("NHI_TEST_DSN")
	tenant := os.Getenv("NHI_TEST_CORRELATION_TENANT")
	other := os.Getenv("NHI_TEST_CORRELATION_OTHER")
	if dsn == "" || tenant == "" || other == "" {
		t.Skip("NHI_TEST_DSN, NHI_TEST_CORRELATION_TENANT and NHI_TEST_CORRELATION_OTHER are not all set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() }) // registered first, so it runs after the reset below
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}

	// Start from, and leave, a clean state: the test reads its own writes (the
	// result cache, the run queue) and must be repeatable.
	reset := func() {
		fixtures := pq.Array([]string{corrAlice, corrDev, corrOps, corrAdmin, corrFn})
		for _, s := range []string{tenant, other} {
			for _, table := range []string{"nhi_blast_radius", "correlation_engine_runs"} {
				if _, err := db.Exec(`DELETE FROM "`+s+`".`+table+` WHERE source_arn = ANY($1::text[])`, fixtures); err != nil {
					t.Fatalf("reset %s.%s: %v", s, table, err)
				}
			}
		}
	}
	reset()
	t.Cleanup(reset)

	handler, poller := correlation.New(db, "nhi_global", nil, config.CorrelationConfig{Enabled: true, PollInterval: 100 * time.Millisecond})

	// The same six routes as routes.registerCorrelation, with the claims the auth
	// middleware would set taken from a test header.
	router := mux.NewRouter()
	base := router.PathPrefix("/api/v1/correlation").Subrouter()
	base.HandleFunc("/catalog", handler.Catalog).Methods(http.MethodGet)
	base.HandleFunc("/blast-radius", handler.BlastRadius).Methods(http.MethodGet)
	base.HandleFunc("/graph", handler.Graph).Methods(http.MethodGet)
	base.HandleFunc("/paths", handler.Paths).Methods(http.MethodGet)
	base.HandleFunc("/runs", handler.CreateRun).Methods(http.MethodPost)
	base.HandleFunc("/runs", handler.Runs).Methods(http.MethodGet)

	call := func(method, target, who, body string) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest(method, target, strings.NewReader(body))
		if who != "" {
			claims := &jwt.CustomClaims{TenantID: "id-" + who, DBName: who}
			r = r.WithContext(context.WithValue(r.Context(), middleware.UserClaimsKey, claims))
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		var out map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s %s: not JSON (%d): %s", method, target, w.Code, w.Body.String())
		}
		return w.Code, out
	}
	data := func(m map[string]any) map[string]any {
		t.Helper()
		d, ok := m["data"].(map[string]any)
		if !ok {
			t.Fatalf("no data object in %v", m)
		}
		return d
	}
	list := func(v any) []map[string]any {
		var out []map[string]any
		arr, _ := v.([]any)
		for _, e := range arr {
			if m, ok := e.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	has := func(items []map[string]any, key, want string) bool {
		for _, it := range items {
			if s, _ := it[key].(string); s == want {
				return true
			}
		}
		return false
	}
	q := func(path string, kv ...string) string {
		u := "/api/v1/correlation" + path
		for i := 0; i+1 < len(kv); i += 2 {
			sep := "?"
			if strings.Contains(u, "?") {
				sep = "&"
			}
			u += sep + kv[i] + "=" + corrURLEscape(kv[i+1])
		}
		return u
	}

	t.Run("catalog", func(t *testing.T) {
		code, m := call("GET", q("/catalog"), tenant, "")
		d := data(m)
		if code != 200 || len(list(d["rules"])) < 200 || len(list(d["composition_rules"])) == 0 || len(list(d["path_types"])) != 10 {
			t.Fatalf("catalog: %d rules=%d comp=%d types=%d", code, len(list(d["rules"])), len(list(d["composition_rules"])), len(list(d["path_types"])))
		}
		fam, _ := d["families"].(map[string]any)
		if fam == nil || fam["total"] != float64(15) {
			t.Errorf("15 composition families expected: %v", d["families"])
		}
		_, m = call("GET", q("/catalog", "section", "path_types"), tenant, "")
		d = data(m)
		if _, has := d["rules"]; has || len(list(d["path_types"])) != 10 {
			t.Errorf("section= must trim the response: %v", corrKeys(d))
		}
	})

	t.Run("blast radius is computed, then served from the cache", func(t *testing.T) {
		code, m := call("GET", q("/blast-radius", "arn", corrAlice), tenant, "")
		if code != 200 {
			t.Fatalf("%d %v", code, m)
		}
		d := data(m)
		if d["source_arn"] != corrAlice || d["from_cache"] == true {
			t.Errorf("first call must compute: %v %v", d["source_arn"], d["from_cache"])
		}
		if n, _ := d["total_paths"].(float64); n == 0 {
			t.Error("alice reaches things")
		}
		ids := list(d["reachable_identities"])
		if !has(ids, "arn", corrOps) || !has(ids, "arn", corrAdmin) {
			t.Errorf("the role chain must reach OpsRole and AdminRole: %v", ids)
		}

		_, m = call("GET", q("/blast-radius", "arn", corrAlice), tenant, "")
		if data(m)["from_cache"] != true {
			t.Error("second call must come from the cache")
		}
		var cached int
		if err := db.QueryRow(`SELECT count(*) FROM "`+tenant+`".nhi_blast_radius WHERE source_arn = $1`, corrAlice).Scan(&cached); err != nil || cached != 1 {
			t.Errorf("one cache row in the tenant's schema: %d %v", cached, err)
		}

		_, m = call("GET", q("/blast-radius", "arn", corrAlice, "summary", "true"), tenant, "")
		s := data(m)
		if s["summary"] != true || len(list(s["paths"])) != 0 {
			t.Errorf("summary drops the paths: %v", s["summary"])
		}

		// A workload inherits the reach of the role it runs as.
		code, m = call("GET", q("/blast-radius", "arn", corrFn), tenant, "")
		if code != 200 || data(m)["source_arn"] != corrFn {
			t.Errorf("workload: %d %v", code, m)
		}
	})

	t.Run("graph", func(t *testing.T) {
		code, m := call("GET", q("/graph", "arn", corrAdmin, "direction", "in", "depth", "3"), tenant, "")
		if code != 200 {
			t.Fatalf("%d %v", code, m)
		}
		d := data(m)
		if d["node"] == nil || d["inward"] == nil || d["outward"] != nil {
			t.Errorf("flat nav view, inward only: %v", corrKeys(d))
		}
		inbound, _ := d["inbound"].(map[string]any)
		callers := list(inbound["callers"])
		if !has(callers, "arn", corrOps) || !has(callers, "arn", corrAlice) {
			t.Errorf("depth 3 reaches OpsRole and alice: %v", callers)
		}

		// Following an expand link keeps walking; the link is a URL on this API.
		_, m = call("GET", q("/graph", "arn", corrAlice, "direction", "out"), tenant, "")
		assumes := list(data(m)["outward"].(map[string]any)["assumes"])
		if len(assumes) == 0 {
			t.Fatal("alice assumes DevRole")
		}
		link, _ := assumes[0]["expand"].(string)
		if !strings.HasPrefix(link, "/api/v1/correlation/graph?arn=") {
			t.Fatalf("expand link: %q", link)
		}
		if code, _ := call("GET", link, tenant, ""); code != 200 {
			t.Errorf("following %s → %d", link, code)
		}

		code, m = call("GET", q("/graph", "arn", "arn:aws:iam::111111111111:role/Nope"), tenant, "")
		if code != 404 || m["error"].(map[string]any)["code"] != "not_found" {
			t.Errorf("unknown identity: %d %v", code, m)
		}
	})

	t.Run("paths", func(t *testing.T) {
		code, m := call("GET", q("/paths", "from", corrAlice, "to", corrAdmin), tenant, "")
		d := data(m)
		if code != 200 || d["mode"] != "forward" || len(list(d["paths"])) == 0 {
			t.Errorf("alice to AdminRole: %d %v", code, m)
		}
		code, m = call("GET", q("/paths", "to", corrBkt), tenant, "")
		d = data(m)
		if code != 200 || d["mode"] != "reverse" || !has(list(d["paths"]), "source_arn", corrAlice) {
			t.Errorf("who can reach the bucket: %d %v", code, m)
		}
	})

	t.Run("runs are queued, de-duplicated and processed", func(t *testing.T) {
		body := `{"arn":"` + corrDev + `"}`
		code, m := call("POST", q("/runs"), tenant, body)
		if code != 202 {
			t.Fatalf("%d %v", code, m)
		}
		run := data(m)["run"].(map[string]any)
		id, _ := run["id"].(string)
		if id == "" || run["status"] != "pending" || run["refresh"] != true {
			t.Fatalf("a pending run that refreshes: %v", run)
		}
		_, m = call("POST", q("/runs"), tenant, body)
		if data(m)["run"].(map[string]any)["id"] != id {
			t.Error("a second request for the same ARN must reuse the pending run")
		}

		// Another tenant cannot see it.
		if code, _ := call("GET", q("/runs", "id", id), other, ""); code != 404 {
			t.Errorf("a run of another tenant: %d", code)
		}

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go poller.Run(ctx)

		deadline := time.Now().Add(15 * time.Second)
		var final map[string]any
		for time.Now().Before(deadline) {
			_, m = call("GET", q("/runs", "id", id), tenant, "")
			final = data(m)
			if s := final["status"]; s == "completed" || s == "failed" {
				break
			}
			time.Sleep(150 * time.Millisecond)
		}
		if final["status"] != "completed" {
			t.Fatalf("the poller must complete the run: %v", final)
		}
		if n, _ := final["total_paths"].(float64); n == 0 {
			t.Errorf("the run computed DevRole's paths: %v", final)
		}

		_, m = call("GET", q("/runs", "status", "completed", "limit", "5"), tenant, "")
		if !has(list(data(m)["runs"]), "id", id) {
			t.Errorf("the run is listed: %v", m)
		}
	})

	t.Run("tenants are isolated", func(t *testing.T) {
		code, m := call("GET", q("/blast-radius", "arn", corrAlice), other, "")
		if code != 404 {
			t.Errorf("another tenant has no alice: %d %v", code, m)
		}
		if code, _ := call("GET", q("/paths", "to", corrBkt), other, ""); code != 200 {
			t.Errorf("an empty tenant answers with no paths: %d", code)
		}
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM "` + other + `".nhi_blast_radius`).Scan(&n); err != nil || n != 0 {
			t.Errorf("nothing was cached in the other tenant: %d %v", n, err)
		}
	})

	t.Run("a tenant without the tables is not provisioned", func(t *testing.T) {
		code, m := call("GET", q("/catalog"), "ghost_tenant", "")
		if code != 503 || m["error"].(map[string]any)["code"] != "TENANT_NOT_PROVISIONED" {
			t.Errorf("catalog: %d %v", code, m)
		}
		for _, c := range []struct{ method, target, body string }{
			{"GET", q("/blast-radius", "arn", corrAlice), ""},
			{"GET", q("/graph", "arn", corrAlice), ""},
			{"GET", q("/paths", "to", corrBkt), ""},
			{"POST", q("/runs"), `{"arn":"` + corrAlice + `"}`},
			{"GET", q("/runs"), ""},
		} {
			code, m = call(c.method, c.target, "ghost_tenant", c.body)
			if code != 503 || m["error"].(map[string]any)["code"] != "TENANT_NOT_PROVISIONED" {
				t.Errorf("%s %s: %d %v", c.method, c.target, code, m)
			}
		}
	})

	t.Run("no token", func(t *testing.T) {
		if code, _ := call("GET", q("/catalog"), "", ""); code != 401 {
			t.Errorf("got %d", code)
		}
	})
}

func corrKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// urlEscape escapes a query value; ARNs hold ':' and '/'.
func corrURLEscape(s string) string {
	r := strings.NewReplacer("%", "%25", "&", "%26", "+", "%2B", "#", "%23", " ", "%20")
	return r.Replace(s)
}
