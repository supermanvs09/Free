package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"onprem-console/internal/auth"
	"onprem-console/internal/config"
	"onprem-console/internal/secretbox"
	"onprem-console/internal/store"
)

func TestValidSignature(t *testing.T) {
	body := []byte(`{"a":1}`)
	m := hmac.New(sha256.New, []byte("s3cret"))
	m.Write(body)
	good := "sha256=" + hex.EncodeToString(m.Sum(nil))
	if !ValidSignature([]byte("s3cret"), body, good) {
		t.Fatal("refused a good signature")
	}
	for _, bad := range []string{"", "sha1=" + good[7:], good[:len(good)-2] + "00", "sha256=zz"} {
		if ValidSignature([]byte("s3cret"), body, bad) {
			t.Fatalf("accepted %q", bad)
		}
	}
	if ValidSignature([]byte("other"), body, good) {
		t.Fatal("accepted a signature made with another secret")
	}
}

// fakeSources serves just enough of GitHub, Bitbucket DC and Jenkins.
type fakeSources struct {
	mu    sync.Mutex
	files map[string]string // "repo@ref:path" -> content
	pub   *rsa.PublicKey
}

func (f *fakeSources) file(repo, ref, path string) (string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	v, ok := f.files[repo+"@"+ref+":"+path]
	return v, ok
}

func (f *fakeSources) set(repo, ref, path, content string) {
	f.mu.Lock()
	f.files[repo+"@"+ref+":"+path] = content
	f.mu.Unlock()
}

func (f *fakeSources) github() http.Handler {
	mux := http.NewServeMux()
	appAuth := func(r *http.Request) bool {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		tok, err := jwt.Parse(raw, func(*jwt.Token) (any, error) { return f.pub, nil }, jwt.WithValidMethods([]string{"RS256"}))
		iss, _ := tok.Claims.GetIssuer()
		return err == nil && iss == "4242"
	}
	inst := func(r *http.Request) bool { return r.Header.Get("Authorization") == "Bearer ghs_install" }
	mux.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) {
		if !appAuth(r) {
			w.WriteHeader(401)
			return
		}
		fmt.Fprint(w, `{"name":"adapID AI CIRM Code Scanner","slug":"adapid"}`)
	})
	mux.HandleFunc("POST /app/installations/{id}/access_tokens", func(w http.ResponseWriter, r *http.Request) {
		if !appAuth(r) {
			w.WriteHeader(401)
			return
		}
		if r.PathValue("id") != "99" {
			w.WriteHeader(404)
			return
		}
		fmt.Fprintf(w, `{"token":"ghs_install","expires_at":"%s"}`, time.Now().Add(time.Hour).Format(time.RFC3339))
	})
	mux.HandleFunc("GET /installation/repositories", func(w http.ResponseWriter, r *http.Request) {
		if !inst(r) {
			w.WriteHeader(401)
			return
		}
		fmt.Fprint(w, `{"total_count":1,"repositories":[{"full_name":"acme/api","default_branch":"main","html_url":"https://github.example/acme/api"}]}`)
	})
	mux.HandleFunc("GET /repos/acme/api/git/trees/main", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"tree":[{"path":"config/app.env","type":"blob"},{"path":"README.md","type":"blob"},{"path":"logo.png","type":"blob"},{"path":"src","type":"tree"}]}`)
	})
	mux.HandleFunc("GET /repos/acme/api/contents/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if !inst(r) || r.Header.Get("Accept") != "application/vnd.github.raw" {
			w.WriteHeader(401)
			return
		}
		v, ok := f.file("acme/api", r.URL.Query().Get("ref"), r.PathValue("path"))
		if !ok {
			w.WriteHeader(404)
			return
		}
		fmt.Fprint(w, v)
	})
	return mux
}

func (f *fakeSources) bitbucket() http.Handler {
	mux := http.NewServeMux()
	ok := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Header.Get("Authorization") != "Bearer bbtoken" {
			w.WriteHeader(401)
			return false
		}
		return true
	}
	mux.HandleFunc("GET /rest/api/1.0/application-properties", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"version":"9.4.1","displayName":"Bitbucket"}`)
	})
	mux.HandleFunc("GET /rest/api/1.0/repos", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) {
			fmt.Fprint(w, `{"isLastPage":true,"values":[{"slug":"payments","project":{"key":"PAY"},"links":{"self":[{"href":"https://bb.example/projects/PAY/repos/payments/browse"}]}}]}`)
		}
	})
	mux.HandleFunc("GET /rest/api/1.0/projects/PAY/repos/payments/files", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) {
			fmt.Fprint(w, `{"isLastPage":true,"values":["deploy.yml"]}`)
		}
	})
	mux.HandleFunc("GET /rest/api/1.0/projects/PAY/repos/payments/raw/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if !ok(w, r) {
			return
		}
		v, found := f.file("PAY/payments", r.URL.Query().Get("at"), r.PathValue("path"))
		if !found {
			w.WriteHeader(404)
			return
		}
		fmt.Fprint(w, v)
	})
	mux.HandleFunc("GET /rest/api/1.0/projects/PAY/repos/payments/compare/changes", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) && r.URL.Query().Get("from") == "bbnew" && r.URL.Query().Get("to") == "bbold" {
			fmt.Fprint(w, `{"values":[{"type":"MODIFY","path":{"toString":"deploy.yml"}},{"type":"DELETE","path":{"toString":"gone.txt"}}]}`)
		}
	})
	return mux
}

func (f *fakeSources) jenkins() http.Handler {
	mux := http.NewServeMux()
	ok := func(w http.ResponseWriter, r *http.Request) bool {
		u, p, _ := r.BasicAuth()
		if u != "adapid-reader" || p != "jtoken" {
			w.WriteHeader(401)
			return false
		}
		w.Header().Set("X-Jenkins", "2.452.1")
		return true
	}
	mux.HandleFunc("GET /api/json", func(w http.ResponseWriter, r *http.Request) {
		if !ok(w, r) {
			return
		}
		if strings.Contains(r.URL.RawQuery, "jobs") {
			fmt.Fprint(w, `{"jobs":[{"name":"deploy-prod","_class":"org.jenkinsci.plugins.workflow.job.WorkflowJob"},{"name":"team","_class":"com.cloudbees.hudson.plugins.folder.Folder","jobs":[{"name":"nightly","_class":"hudson.model.FreeStyleProject"}]}]}`)
			return
		}
		fmt.Fprint(w, `{"mode":"NORMAL"}`)
	})
	mux.HandleFunc("GET /credentials/store/system/domain/_/api/json", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) {
			fmt.Fprint(w, `{"credentials":[{"id":"aws-prod","typeName":"Username with password","displayName":"deploy/****"},{"id":"old-token","typeName":"Secret text","displayName":"old"}]}`)
		}
	})
	mux.HandleFunc("GET /job/deploy-prod/config.xml", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) {
			fmt.Fprint(w, `<flow-definition><script>withCredentials([usernamePassword(credentialsId: 'aws-prod')])</script></flow-definition>`)
		}
	})
	mux.HandleFunc("GET /job/team/job/nightly/config.xml", func(w http.ResponseWriter, r *http.Request) {
		if ok(w, r) {
			fmt.Fprint(w, `<project></project>`)
		}
	})
	return mux
}

type tc struct {
	t     *testing.T
	base  string
	token string
}

func (c tc) do(method, path string, body any, want int) map[string]any {
	c.t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != want {
		c.t.Fatalf("%s %s: got %d want %d: %v", method, path, resp.StatusCode, want, out)
	}
	return out
}

func signed(t *testing.T, url, secret string, hdr map[string]string, sigHeader string, body string, want int) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	if secret != "" {
		m := hmac.New(sha256.New, []byte(secret))
		m.Write([]byte(body))
		req.Header.Set(sigHeader, "sha256="+hex.EncodeToString(m.Sum(nil)))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != want {
		t.Fatalf("webhook %s: got %d want %d", url, resp.StatusCode, want)
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	for i := 0; i < 100; i++ {
		if cond() {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// TestEndToEnd runs the whole console against fake sources and a real
// Postgres: ONPREM_TEST_DATABASE_URL=postgres://... (the schema is wiped).
func TestEndToEnd(t *testing.T) {
	dbURL := os.Getenv("ONPREM_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("set ONPREM_TEST_DATABASE_URL to run against Postgres")
	}
	ctx := context.Background()
	st, err := store.Open(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = st.DB.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public`)
	if err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := st.Migrate(ctx); err != nil { // idempotent
		t.Fatal(err)
	}
	key := make([]byte, 32)
	_, _ = rand.Read(key)
	box, _ := secretbox.New(key)
	cfg := &config.Config{MaxFileBytes: 1 << 20, MaxRepoFiles: 100, BusinessStart: 8, BusinessEnd: 19, BusinessTZ: time.UTC, PublicURL: "https://console.example"}
	a := auth.NewService(st, []byte(strings.Repeat("k", 32)), time.Hour)
	if ok, err := a.Bootstrap(ctx, "admin@acme.test", "StrongPass123!"); !ok || err != nil {
		t.Fatal("bootstrap", ok, err)
	}
	if ok, _ := a.Bootstrap(ctx, "other@acme.test", "StrongPass123!"); ok {
		t.Fatal("bootstrap ran twice")
	}
	srv := httptest.NewServer(New(cfg, st, box, a).Router())
	defer srv.Close()

	rsaKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(rsaKey)}))
	fake := &fakeSources{files: map[string]string{}, pub: &rsaKey.PublicKey}
	fake.set("acme/api", "main", "config/app.env", "AWS_SECRET_ACCESS_KEY=\"wJalrXUtnFEMI/K7MD"+"ENG/bPxRfiCYzQ8vT3uLp2\"\n")
	fake.set("acme/api", "main", "README.md", "nothing here\n")
	fake.set("PAY/payments", "", "deploy.yml", "db_password: \"Sup3rS3cretValue\"\n")
	gh := httptest.NewServer(fake.github())
	bb := httptest.NewServer(fake.bitbucket())
	jk := httptest.NewServer(fake.jenkins())
	defer gh.Close()
	defer bb.Close()
	defer jk.Close()

	anon := tc{t: t, base: srv.URL}
	anon.do("GET", "/api/v1/overview", nil, 401)
	anon.do("POST", "/api/v1/auth/login", map[string]string{"email": "admin@acme.test", "password": "wrong"}, 401)
	admin := tc{t: t, base: srv.URL, token: anon.do("POST", "/api/v1/auth/login", map[string]string{"email": "ADMIN@acme.test", "password": "StrongPass123!"}, 200)["token"].(string)}

	// People: weak password refused; analyst and viewer created.
	admin.do("POST", "/api/v1/users", map[string]string{"email": "ana@acme.test", "role": "analyst", "password": "weak"}, 400)
	admin.do("POST", "/api/v1/users", map[string]string{"email": "ana@acme.test", "name": "Ana", "role": "analyst", "password": "StrongPass123!"}, 201)
	admin.do("POST", "/api/v1/users", map[string]string{"email": "ana@acme.test", "role": "viewer", "password": "StrongPass123!"}, 409)
	v := admin.do("POST", "/api/v1/users", map[string]string{"email": "val@acme.test", "role": "viewer", "password": "StrongPass123!"}, 201)
	login := func(email string) tc {
		return tc{t: t, base: srv.URL, token: anon.do("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": "StrongPass123!"}, 200)["token"].(string)}
	}
	analyst, viewer := login("ana@acme.test"), login("val@acme.test")
	me := admin.do("GET", "/api/v1/auth/me", nil, 200)
	adminID := me["user"].(map[string]any)["id"].(float64)
	admin.do("PATCH", fmt.Sprintf("/api/v1/users/%d", int(adminID)), map[string]any{"role": "viewer"}, 400)

	// Roles: viewer reads, cannot manage; analyst manages, cannot run users.
	viewer.do("GET", "/api/v1/connections", nil, 200)
	viewer.do("PUT", "/api/v1/connections/github", map[string]string{"app_id": "1"}, 403)
	viewer.do("GET", "/api/v1/users", nil, 403)
	analyst.do("GET", "/api/v1/users", nil, 403)
	analyst.do("GET", "/api/v1/audit", nil, 403)

	// GitHub: bad inputs refused with a reason, a wrong installation fails its check, then it connects and scans.
	analyst.do("PUT", "/api/v1/connections/github", map[string]string{"app_id": "x", "installation_id": "99", "secret": pemKey, "api_url": gh.URL}, 400)
	analyst.do("PUT", "/api/v1/connections/github", map[string]string{"app_id": "4242", "installation_id": "99", "secret": "not a key", "api_url": gh.URL}, 400)
	res := analyst.do("PUT", "/api/v1/connections/github", map[string]string{"app_id": "4242", "installation_id": "1", "secret": pemKey, "api_url": gh.URL}, 200)
	if c := res["connection"].(map[string]any); c["status"] != "failing" {
		t.Fatalf("wrong installation should fail: %v", c)
	}
	res = analyst.do("PUT", "/api/v1/connections/github", map[string]string{"app_id": "4242", "installation_id": "99", "api_url": gh.URL}, 200) // secret kept
	c := res["connection"].(map[string]any)
	if c["status"] != "connected" || c["webhook"] == nil {
		t.Fatalf("github not connected: %v", c)
	}
	hook := c["webhook"].(map[string]any)
	if hook["url"] != "https://console.example/webhooks/github" || len(hook["secret"].(string)) != 48 {
		t.Fatalf("webhook: %v", hook)
	}
	ghSecret := hook["secret"].(string)
	if vc := viewer.do("GET", "/api/v1/connections/github", nil, 200)["connection"].(map[string]any); vc["webhook"] != nil {
		t.Fatal("a viewer saw the webhook secret")
	}
	if b, _ := json.Marshal(res); strings.Contains(string(b), "PRIVATE KEY") {
		t.Fatal("the private key came back")
	}
	waitFor(t, "github scan", func() bool {
		return analyst.do("GET", "/api/v1/connections/github", nil, 200)["connection"].(map[string]any)["sync_status"] == "done"
	})
	f := viewer.do("GET", "/api/v1/findings?source=github", nil, 200)
	if f["total"].(float64) != 1 {
		t.Fatalf("github findings: %v", f)
	}
	first := f["findings"].([]any)[0].(map[string]any)
	if first["detector"] != "aws_secret_access_key" || strings.Contains(first["redacted"].(string), "K7MDENG") {
		t.Fatalf("finding: %v", first)
	}

	// GitHub push: unsigned and wrongly signed rejected; signed push scans the changed file at the commit.
	push := `{"ref":"refs/heads/feature","after":"abc1234567","repository":{"full_name":"acme/api"},"pusher":{"name":"dev1"},"commits":[{"added":["new.py"],"modified":[]}]}`
	signed(t, srv.URL+"/webhooks/github", "", map[string]string{"X-GitHub-Event": "push"}, "X-Hub-Signature-256", push, 401)
	signed(t, srv.URL+"/webhooks/github", "wrong", map[string]string{"X-GitHub-Event": "push"}, "X-Hub-Signature-256", push, 401)
	fake.set("acme/api", "abc1234567", "new.py", "token = \"ghp_"+"abcdefghijklmnopqrstuvwxyz0123456789\"\n")
	signed(t, srv.URL+"/webhooks/github", ghSecret, map[string]string{"X-GitHub-Event": "push", "X-GitHub-Delivery": "d1"}, "X-Hub-Signature-256", push, 202)
	waitFor(t, "push finding", func() bool {
		return viewer.do("GET", "/api/v1/findings?source=github", nil, 200)["total"].(float64) == 2
	})
	// The secret is removed in a later push: its finding closes on its own.
	fake.set("acme/api", "def7654321", "new.py", "token = os.environ['T']\n")
	push2 := strings.ReplaceAll(strings.ReplaceAll(push, "abc1234567", "def7654321"), `"added":["new.py"],"modified":[]`, `"added":[],"modified":["new.py"]`)
	signed(t, srv.URL+"/webhooks/github", ghSecret, map[string]string{"X-GitHub-Event": "push"}, "X-Hub-Signature-256", push2, 202)
	waitFor(t, "push resolves", func() bool {
		return viewer.do("GET", "/api/v1/findings?source=github", nil, 200)["total"].(float64) == 1
	})

	// Bitbucket: wrong token fails its check; right token connects; push between two commits is scanned.
	res = analyst.do("PUT", "/api/v1/connections/bitbucket", map[string]string{"url": bb.URL, "secret": "nope"}, 200)
	if res["connection"].(map[string]any)["status"] != "failing" {
		t.Fatal("bad bitbucket token connected")
	}
	res = analyst.do("PUT", "/api/v1/connections/bitbucket", map[string]string{"url": bb.URL + "/", "secret": "bbtoken"}, 200)
	c = res["connection"].(map[string]any)
	if c["status"] != "connected" {
		t.Fatalf("bitbucket: %v", c)
	}
	bbSecret := c["webhook"].(map[string]any)["secret"].(string)
	waitFor(t, "bitbucket scan", func() bool {
		return viewer.do("GET", "/api/v1/findings?source=bitbucket", nil, 200)["total"].(float64) == 1
	})
	signed(t, srv.URL+"/webhooks/bitbucket", bbSecret, map[string]string{"X-Event-Key": "diagnostics:ping"}, "X-Hub-Signature", `{}`, 200)
	fake.set("PAY/payments", "bbnew", "deploy.yml", "db_password: \"Sup3rS3cretValue\"\nslack: \"https://hooks.slack.com/services/T0000/"+"B0000/XXXXXXXXXXXXXXXXXXXXXXXX\"\n")
	bbPush := `{"actor":{"name":"dev2"},"repository":{"slug":"payments","project":{"key":"PAY"}},"changes":[{"ref":{"displayId":"main","type":"BRANCH"},"fromHash":"bbold","toHash":"bbnew","type":"UPDATE"}]}`
	signed(t, srv.URL+"/webhooks/bitbucket", bbSecret, map[string]string{"X-Event-Key": "repo:refs_changed"}, "X-Hub-Signature", bbPush, 202)
	waitFor(t, "bitbucket push finding", func() bool {
		return viewer.do("GET", "/api/v1/findings?source=bitbucket", nil, 200)["total"].(float64) == 2
	})

	// Triage: viewer cannot, analyst can; a false positive stays closed after rescans.
	id := int(first["id"].(float64))
	viewer.do("PATCH", fmt.Sprintf("/api/v1/findings/%d", id), map[string]string{"status": "false_positive"}, 403)
	analyst.do("PATCH", fmt.Sprintf("/api/v1/findings/%d", id), map[string]string{"status": "bogus"}, 400)
	analyst.do("PATCH", fmt.Sprintf("/api/v1/findings/%d", id), map[string]string{"status": "false_positive"}, 200)
	analyst.do("POST", "/api/v1/connections/github/scan", nil, 200)
	waitFor(t, "rescan", func() bool {
		return analyst.do("GET", "/api/v1/connections/github", nil, 200)["connection"].(map[string]any)["sync_status"] == "done"
	})
	if n := viewer.do("GET", "/api/v1/findings?source=github&status=false_positive", nil, 200)["total"].(float64); n != 1 {
		t.Fatalf("false positive reopened: %v", n)
	}
	if n := viewer.do("GET", "/api/v1/findings?q=app.env&status=all", nil, 200)["total"].(float64); n != 1 {
		t.Fatalf("search: %v", n)
	}

	// Jenkins: credentials and which jobs use them; builds flagged outside hours.
	res = admin.do("PUT", "/api/v1/connections/jenkins", map[string]string{"url": jk.URL, "username": "adapid-reader", "secret": "jtoken"}, 200)
	c = res["connection"].(map[string]any)
	if c["status"] != "connected" {
		t.Fatalf("jenkins: %v", c)
	}
	jurl := c["webhook"].(map[string]any)["url"].(string)
	waitFor(t, "jenkins sync", func() bool {
		return len(viewer.do("GET", "/api/v1/jenkins/credentials", nil, 200)["credentials"].([]any)) == 2
	})
	creds := viewer.do("GET", "/api/v1/jenkins/credentials", nil, 200)["credentials"].([]any)
	for _, raw := range creds {
		cr := raw.(map[string]any)
		used, _ := cr["used_by"].([]any)
		if (cr["credential_id"] == "aws-prod") != (len(used) == 1) {
			t.Fatalf("used_by wrong: %v", cr)
		}
	}
	hookPath := strings.TrimPrefix(jurl, "https://console.example")
	night := time.Date(2026, 11, 7, 2, 14, 0, 0, time.UTC).UnixMilli() // a Saturday, 02:14
	build := fmt.Sprintf(`{"name":"deploy-prod","build":{"number":7,"phase":"COMPLETED","status":"SUCCESS","full_url":"x","timestamp":%d}}`, night)
	if resp, _ := http.Post(srv.URL+"/webhooks/jenkins/nottheone", "application/json", strings.NewReader(build)); resp.StatusCode != 404 {
		t.Fatal("jenkins webhook accepted a wrong address")
	}
	if resp, _ := http.Post(srv.URL+hookPath, "application/json", strings.NewReader(build)); resp.StatusCode != 200 {
		t.Fatal("jenkins webhook refused")
	}
	builds := viewer.do("GET", "/api/v1/jenkins/builds?unusual=true", nil, 200)["builds"].([]any)
	if len(builds) != 1 || !strings.Contains(builds[0].(map[string]any)["unusual"].(string), "outside business hours") ||
		!strings.Contains(builds[0].(map[string]any)["unusual"].(string), "aws-prod") {
		t.Fatalf("unusual build: %v", builds)
	}

	// Overview, deliveries, audit.
	o := viewer.do("GET", "/api/v1/overview", nil, 200)
	if o["findings"].(map[string]any)["open"].(float64) != 2 || o["jenkins"].(map[string]any)["unused"].(float64) != 1 {
		t.Fatalf("overview: %v", o)
	}
	if d := viewer.do("GET", "/api/v1/deliveries", nil, 200)["deliveries"].([]any); len(d) < 6 {
		t.Fatalf("deliveries: %d", len(d))
	}
	if a := admin.do("GET", "/api/v1/audit", nil, 200)["entries"].([]any); len(a) < 10 {
		t.Fatalf("audit: %d", len(a))
	}

	// Rotating the secret makes the old one fail; switching a user off ends their access at once.
	analyst.do("POST", "/api/v1/connections/github/webhook-secret", nil, 200)
	signed(t, srv.URL+"/webhooks/github", ghSecret, map[string]string{"X-GitHub-Event": "push"}, "X-Hub-Signature-256", push, 401)
	admin.do("PATCH", fmt.Sprintf("/api/v1/users/%d", int(v["user"].(map[string]any)["id"].(float64))), map[string]any{"active": false}, 200)
	viewer.do("GET", "/api/v1/overview", nil, 401)

	// Secrets at rest are sealed.
	var raw []byte
	_ = st.DB.QueryRow(ctx, `SELECT secret FROM connections WHERE kind = 'bitbucket'`).Scan(&raw)
	if bytes.Contains(raw, []byte("bbtoken")) || base64.StdEncoding.EncodeToString(raw) == "" {
		t.Fatal("token stored in the clear")
	}
	// Lockout after five failures.
	for i := 0; i < 5; i++ {
		anon.do("POST", "/api/v1/auth/login", map[string]string{"email": "ana@acme.test", "password": "nope"}, 401)
	}
	anon.do("POST", "/api/v1/auth/login", map[string]string{"email": "ana@acme.test", "password": "StrongPass123!"}, 429)
}

func TestScheduleScansDue(t *testing.T) {
	dbURL := os.Getenv("ONPREM_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("set ONPREM_TEST_DATABASE_URL to run against Postgres")
	}
	ctx := context.Background()
	st, err := store.Open(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, _ = st.DB.Exec(ctx, `DELETE FROM connections`)
	// A Jenkins connection whose secret cannot be opened: the scheduled run must start (and then fail cleanly).
	_, _ = st.DB.Exec(ctx, `INSERT INTO connections (kind, status, secret, sync_status, sync_started_at) VALUES ('jenkins', 'connected', '\x00', 'done', now() - interval '2 days')`)
	key := make([]byte, 32)
	box, _ := secretbox.New(key)
	s := New(&config.Config{ScanEvery: 24 * time.Hour}, st, box, nil)
	cctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go s.ScheduleScans(cctx)
	waitFor(t, "scheduled run", func() bool {
		var status string
		_ = st.DB.QueryRow(ctx, `SELECT sync_status FROM connections WHERE kind = 'jenkins'`).Scan(&status)
		return status == "failed"
	})
}
