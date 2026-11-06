package awsintegration

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/database"
)

// ── the e-mail: one link per approver ───────────────────────────────────────

func linkService(t *testing.T, base string, mail *fakeMailer) (*AWSIntegrationService, *fakeAWSStore) {
	t.Helper()
	store := newFakeAWSStore()
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	svc.mailer = mail
	svc.opts.ApprovalLinkBaseURL = base
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	return svc, store
}

func TestApprovalEmailCarriesEachApproversOwnLink(t *testing.T) {
	mail := &fakeMailer{recipients: []string{"a@platform.test", "b@platform.test"}}
	_, store := linkService(t, "https://api.example.com/", mail) // a trailing slash is tolerated
	mailArrives(t, mail, store)

	a, b := mail.bodies["a@platform.test"], mail.bodies["b@platform.test"]
	linkA := "https://api.example.com/api/v1/approvals/email#t=tok-1-a@platform.test"
	linkB := "https://api.example.com/api/v1/approvals/email#t=tok-1-b@platform.test"
	if !strings.Contains(a, linkA) || strings.Contains(a, "tok-1-b@") {
		t.Fatalf("a's e-mail must hold only a's link:\n%s", a)
	}
	if !strings.Contains(b, linkB) || strings.Contains(b, "tok-1-a@") {
		t.Fatalf("b's e-mail must hold only b's link:\n%s", b)
	}
	// The link is an HTML button and plain text, and the subject holds no token.
	if !strings.Contains(a, `href="`+linkA+`"`) || !strings.Contains(a, "Review and decide") {
		t.Fatalf("no button in the HTML part:\n%s", a)
	}
	if subject := strings.SplitN(a, "\n", 2)[0]; strings.Contains(subject, "tok-") || !strings.HasPrefix(subject, "Approval needed") {
		t.Fatalf("subject = %q", subject)
	}
	if !strings.Contains(a, "works once and expires in 72 hours") || !strings.Contains(a, "decides nothing") {
		t.Fatal("the e-mail does not say what the link does")
	}
	if store.emails[1] != "sent" {
		t.Fatalf("outcome = %q", store.emails[1])
	}
}

// Without a configured public address there are no links: the e-mail goes out as
// before, to everyone at once. (The address is never taken from a request.)
func TestApprovalEmailHasNoLinksWithoutAPublicAddress(t *testing.T) {
	mail := &fakeMailer{}
	_, store := linkService(t, "", mail)
	mailArrives(t, mail, store)
	if len(mail.bodies) != 0 || len(store.links) != 0 {
		t.Fatalf("links were made without an address: %v %v", mail.bodies, store.links)
	}
}

func TestApprovalEmailFallsBackWhenLinksCannotBeMade(t *testing.T) {
	store := newFakeAWSStore()
	store.linkErr = errors.New("table is missing")
	mail := &fakeMailer{}
	svc := newTestService(store, &fakeVerifier{}, nil, fakeEvents{found: true})
	svc.mailer = mail
	svc.opts.ApprovalLinkBaseURL = "https://api.example.com"
	if _, err := svc.Verify(context.Background(), awsTestCaller, awsTestRoleARN, []string{"us-east-1"}); err != nil {
		t.Fatal(err)
	}
	mailArrives(t, mail, store)
	if len(mail.bodies) != 0 || store.emails[1] != "sent" {
		t.Fatalf("expected the plain e-mail: %v %v", mail.bodies, store.emails)
	}
}

func TestApprovalEmailOutcomeWithAFailingApprover(t *testing.T) {
	mail := &fakeMailer{recipients: []string{"a@platform.test", "b@platform.test"}, failFor: map[string]bool{"a@platform.test": true}}
	_, store := linkService(t, "https://api.example.com", mail)
	mailArrives(t, mail, store)
	if store.emails[1] != "sent" || mail.bodies["b@platform.test"] == "" {
		t.Fatalf("one reachable approver is enough: %v", store.emails)
	}

	mail = &fakeMailer{recipients: []string{"a@platform.test", "b@platform.test"}, err: errors.New("SES down")}
	_, store = linkService(t, "https://api.example.com", mail)
	mailArrives(t, mail, store)
	if store.emails[1] != "failed" {
		t.Fatalf("no approver reached: %v", store.emails)
	}
}

func TestNormalizeApprovalLinkBase(t *testing.T) {
	good := map[string]string{
		"": "", "https://nhi.example.com": "https://nhi.example.com", "https://nhi.example.com/": "https://nhi.example.com",
		"  https://nhi.example.com:8443  ": "https://nhi.example.com:8443", "http://localhost:8080": "http://localhost:8080",
		"http://127.0.0.1:8080/": "http://127.0.0.1:8080",
	}
	for in, want := range good {
		got, err := config.NormalizeApprovalLinkBase(in)
		if err != nil || got != want {
			t.Errorf("%q -> %q, %v; want %q", in, got, err, want)
		}
	}
	for _, in := range []string{"http://nhi.example.com", "ftp://x.example.com", "https://nhi.example.com/app", "https://nhi.example.com?x=1",
		"https://nhi.example.com#a", "https://user:pw@nhi.example.com", "nhi.example.com", "https://", "javascript:alert(1)"} {
		if got, err := config.NormalizeApprovalLinkBase(in); err == nil {
			t.Errorf("%q was accepted as %q", in, got)
		}
	}
}

// ── the page and its two calls ──────────────────────────────────────────────

type fakeLinkStore struct {
	mu      sync.Mutex
	info    *ApprovalLinkView
	infoErr error
	decided *ApprovalLinkView
	decErr  error
	calls   []string // "approve:<note>" / "reject:<note>"
}

func (f *fakeLinkStore) ApprovalLinkInfo(_ context.Context, token string) (*ApprovalLinkView, error) {
	return f.info, f.infoErr
}

func (f *fakeLinkStore) DecideByLink(_ context.Context, token string, approve bool, note string) (*ApprovalLinkView, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	d := "reject"
	if approve {
		d = "approve"
	}
	f.calls = append(f.calls, d+":"+note)
	return f.decided, f.decErr
}

func openView() *ApprovalLinkView {
	return &ApprovalLinkView{ApprovalID: 7, Email: "a@platform.test", ExpiresAt: time.Now().Add(time.Hour), Status: "pending",
		Domain: "acme.example.com", Workspace: "acme", AccountID: "222222222222", RoleARN: awsTestRoleARN,
		Regions: []string{"global", "ap-south-1"}, RequestedBy: "alice@acme.test", RequestedAt: time.Now()}
}

func post(h http.HandlerFunc, body, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.RemoteAddr = "203.0.113.9:4000"
	w := httptest.NewRecorder()
	h(w, req)
	return w
}

func TestApprovalPageHoldsNoSecretAndIsLockedDown(t *testing.T) {
	h := NewApprovalLinkHandler(&fakeLinkStore{})
	nonces := map[string]bool{}
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/approvals/email", nil)
		req.RemoteAddr = "203.0.113.9:4000"
		w := httptest.NewRecorder()
		h.Page(w, req)
		if w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("page = %d %s", w.Code, w.Header().Get("Content-Type"))
		}
		csp := w.Header().Get("Content-Security-Policy")
		m := regexp.MustCompile(`script-src 'nonce-([A-Za-z0-9_-]+)'`).FindStringSubmatch(csp)
		if m == nil || !strings.Contains(csp, "default-src 'none'") || !strings.Contains(csp, "frame-ancestors 'none'") || !strings.Contains(csp, "form-action 'none'") {
			t.Fatalf("csp = %q", csp)
		}
		body := w.Body.String()
		if strings.Count(body, `nonce="`+m[1]+`"`) != 2 || strings.Contains(body, "__NONCE__") {
			t.Fatal("the script and style must carry this response's nonce, and nothing else")
		}
		nonces[m[1]] = true
		for header, want := range map[string]string{"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff"} {
			if w.Header().Get(header) != want {
				t.Errorf("%s = %q", header, w.Header().Get(header))
			}
		}
		// What the page does with the token: read it from the fragment, drop it
		// from the address bar, never write markup from data.
		for _, must := range []string{"location.hash", "history.replaceState", "textContent", "referrerPolicy"} {
			if !strings.Contains(body, must) {
				t.Errorf("the page does not use %s", must)
			}
		}
		for _, never := range []string{"innerHTML", "outerHTML", "document.write", "eval(", "location.search", "localStorage", "sessionStorage", "src=\"http", "<link"} {
			if strings.Contains(body, never) {
				t.Errorf("the page uses %s", never)
			}
		}
	}
	if len(nonces) != 2 {
		t.Fatal("the nonce must differ on every response")
	}
}

func TestLookupStates(t *testing.T) {
	cases := []struct {
		name  string
		view  func() *ApprovalLinkView
		err   error
		code  int
		state string
		errc  string
	}{
		{"open", openView, nil, 200, "open", ""},
		{"decided", func() *ApprovalLinkView {
			v := openView()
			v.Status = "approved"
			v.DecidedBy = "x@platform.test (e-mail link)"
			return v
		}, nil, 200, "decided", ""},
		{"used", func() *ApprovalLinkView { v := openView(); v.Used = true; return v }, nil, 200, "used", ""},
		{"expired", func() *ApprovalLinkView { v := openView(); v.Expired = true; return v }, nil, 200, "expired", ""},
		{"unknown", nil, ErrApprovalLinkInvalid, 404, "", "LINK_INVALID"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			store := &fakeLinkStore{infoErr: c.err}
			if c.view != nil {
				store.info = c.view()
			}
			w := post(NewApprovalLinkHandler(store).Lookup, `{"token":"abc"}`, "application/json")
			if w.Code != c.code || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("code %d, cache %q, body %s", w.Code, w.Header().Get("Cache-Control"), w.Body)
			}
			body := w.Body.String()
			if c.state != "" && !strings.Contains(body, `"state":"`+c.state+`"`) {
				t.Fatalf("body %s", body)
			}
			if c.errc != "" && !strings.Contains(body, c.errc) {
				t.Fatalf("body %s", body)
			}
			if c.state == "open" && (strings.Contains(body, `"global"`) || !strings.Contains(body, "ap-south-1") || !strings.Contains(body, "acme.example.com")) {
				t.Fatalf("the request is shown without the synthetic global region: %s", body)
			}
			if len(store.calls) != 0 {
				t.Fatal("looking changed something")
			}
		})
	}
}

func TestDecideValidatesBeforeTouchingAnything(t *testing.T) {
	store := &fakeLinkStore{decided: &ApprovalLinkView{Email: "a@platform.test", Status: "approved"}}
	h := NewApprovalLinkHandler(store)
	long := strings.Repeat("x", 1001)
	cases := []struct {
		name, body, ct string
		code           int
		errc           string
	}{
		{"not json", `token=1`, "application/x-www-form-urlencoded", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"no content type", `{"token":"t","decision":"approve"}`, "", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"text/plain is what a cross-site form sends", `{"token":"t","decision":"approve"}`, "text/plain", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"garbage", `{`, "application/json", 400, "INVALID_REQUEST"},
		{"unknown field", `{"token":"t","decision":"approve","admin":true}`, "application/json", 400, "INVALID_REQUEST"},
		{"two objects", `{"token":"t","decision":"approve"}{}`, "application/json", 400, "INVALID_REQUEST"},
		{"no decision", `{"token":"t"}`, "application/json", 400, "INVALID_DECISION"},
		{"other decision", `{"token":"t","decision":"maybe"}`, "application/json", 400, "INVALID_DECISION"},
		{"reject needs a reason", `{"token":"t","decision":"reject"}`, "application/json", 400, "NOTE_REQUIRED"},
		{"blank reason", `{"token":"t","decision":"reject","note":"   "}`, "application/json", 400, "NOTE_REQUIRED"},
		{"note too long", `{"token":"t","decision":"approve","note":"` + long + `"}`, "application/json", 400, "NOTE_TOO_LONG"},
	}
	for _, c := range cases {
		w := post(h.Decide, c.body, c.ct)
		if w.Code != c.code || !strings.Contains(w.Body.String(), c.errc) {
			t.Errorf("%s: %d %s", c.name, w.Code, w.Body)
		}
	}
	if len(store.calls) != 0 {
		t.Fatalf("a refused request still reached the store: %v", store.calls)
	}

	if w := post(h.Decide, `{"token":"t","decision":"approve","note":"  looks right  "}`, "application/json; charset=utf-8"); w.Code != 200 || !strings.Contains(w.Body.String(), `"decision":"approved"`) {
		t.Fatalf("approve: %d %s", w.Code, w.Body)
	}
	if w := post(h.Decide, `{"token":"t","decision":"reject","note":"wrong account"}`, "application/json"); w.Code != 200 {
		t.Fatalf("reject: %d %s", w.Code, w.Body)
	}
	if strings.Join(store.calls, "|") != "approve:looks right|reject:wrong account" {
		t.Fatalf("calls = %v", store.calls)
	}
}

func TestDecideAnswersEachFailureOnItsOwn(t *testing.T) {
	cases := []struct {
		err  error
		code int
		errc string
	}{
		{ErrApprovalLinkInvalid, 404, "LINK_INVALID"},
		{ErrApprovalLinkExpired, 410, "LINK_EXPIRED"},
		{ErrApprovalLinkUsed, 410, "LINK_USED"},
		{&ApprovalDecidedError{Status: "approved", By: "x@platform.test (e-mail link)"}, 409, "ALREADY_DECIDED"},
		{errors.New("pq: password authentication failed for user nhi"), 500, "LINK_FAILED"},
	}
	for _, c := range cases {
		w := post(NewApprovalLinkHandler(&fakeLinkStore{decErr: c.err}).Decide, `{"token":"t","decision":"approve"}`, "application/json")
		if w.Code != c.code || !strings.Contains(w.Body.String(), c.errc) {
			t.Errorf("%v: %d %s", c.err, w.Code, w.Body)
		}
		if strings.Contains(w.Body.String(), "password") {
			t.Errorf("an internal error leaked to the page: %s", w.Body)
		}
	}
}

func TestLinkEndpointsAreRateLimitedPerAddress(t *testing.T) {
	h := NewApprovalLinkHandler(&fakeLinkStore{infoErr: ErrApprovalLinkInvalid})
	limited := 0
	for i := 0; i < 40; i++ {
		if w := post(h.Lookup, `{"token":"guess"}`, "application/json"); w.Code == http.StatusTooManyRequests {
			limited++
			if w.Header().Get("Retry-After") == "" {
				t.Fatal("no Retry-After")
			}
		}
	}
	if limited < 15 {
		t.Fatalf("only %d of 40 guesses were limited", limited)
	}
	// Another address is not affected.
	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(`{"token":"t"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.7:1"
	w := httptest.NewRecorder()
	h.Lookup(w, req)
	if w.Code == http.StatusTooManyRequests {
		t.Fatal("one address's guesses limited another")
	}
}

// ── against Postgres: the real thing ────────────────────────────────────────

type linkEnv struct {
	repo       *AWSIntegrationRepository
	db         *sql.DB
	schema     string
	account    string
	approvalID int64
}

func newLinkEnv(t *testing.T) *linkEnv {
	t.Helper()
	dsn := os.Getenv("NHI_TEST_DSN")
	if dsn == "" {
		t.Skip("NHI_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, f := range []string{"007_connection_approvals.sql", "008_approval_email_links.sql"} {
		raw, err := os.ReadFile("../../../migrations/global/" + f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(raw)); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
	}
	tag := randomHex(t, 5)
	e := &linkEnv{db: db, schema: "nhi_test_l_" + tag, account: randomAccountID(t)}
	tenant := randomUUID(t)
	applyTenantMigration(t, db, e.schema)
	approvalMigration, err := os.ReadFile("../../../migrations/tenant/009_account_approval.sql")
	if err != nil {
		t.Fatal(err)
	}
	mustExec(t, db, strings.ReplaceAll(string(approvalMigration), `:"schema"`, `"`+e.schema+`"`))
	mustExec(t, db, `INSERT INTO `+database.Table(e.schema, "accounts")+`
		(tenant_id, account_id, client_aws_account_id, client_role_arn, regions, is_connected, account_status, approval_status)
		VALUES ($1::uuid, $2::text, $2::text, 'arn:aws:iam::'||$2::text||':role/NHIPlatformCollector', '{global,ap-south-1}', false, 'pending_approval', 'pending')`, tenant, e.account)
	if err := db.QueryRow(`INSERT INTO nhi_global.connection_approvals
		(tenant_id, db_name, tenant_domain, account_id, role_arn, regions, requested_by)
		VALUES ($1::uuid, $2::text, 'acme.example.com', $3::text, 'arn:aws:iam::'||$3::text||':role/NHIPlatformCollector', '{global,ap-south-1}', 'alice@acme.test')
		RETURNING id`, tenant, e.schema, e.account).Scan(&e.approvalID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DROP SCHEMA IF EXISTS "` + e.schema + `" CASCADE`)
		_, _ = db.Exec(`DELETE FROM nhi_global.connection_approvals WHERE id = $1`, e.approvalID)
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	pass, _ := u.User.Password()
	pg, err := database.NewPostgresDB(&config.Config{Database: config.DatabaseConfig{
		Host: u.Hostname(), DatabaseName: strings.TrimPrefix(u.Path, "/"), User: u.User.Username(), Password: pass,
		Schema: config.DefaultGlobalSchema,
	}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.DB.Close() })
	e.repo = NewAWSIntegrationRepository(pg)
	return e
}

func (e *linkEnv) links(t *testing.T, emails ...string) map[string]string {
	t.Helper()
	tokens, err := e.repo.CreateApprovalLinks(context.Background(), e.approvalID, emails, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return tokens
}

func (e *linkEnv) account_(t *testing.T) (status string, connected bool, approval, by, note string, hasConnectedAt bool) {
	t.Helper()
	if err := e.db.QueryRow(`SELECT account_status, is_connected, COALESCE(approval_status,''), COALESCE(approved_by,''), COALESCE(approval_note,''), connected_at IS NOT NULL
		FROM `+database.Table(e.schema, "accounts")+` WHERE account_id = $1`, e.account).Scan(&status, &connected, &approval, &by, &note, &hasConnectedAt); err != nil {
		t.Fatal(err)
	}
	return
}

func (e *linkEnv) request(t *testing.T) (status, by, note string) {
	t.Helper()
	if err := e.db.QueryRow(`SELECT status, COALESCE(decided_by,''), decision_note FROM nhi_global.connection_approvals WHERE id = $1`, e.approvalID).Scan(&status, &by, &note); err != nil {
		t.Fatal(err)
	}
	return
}

func TestApprovalLinkApproveAgainstPostgres(t *testing.T) {
	e := newLinkEnv(t)
	ctx := context.Background()
	tokens := e.links(t, "a@platform.test", "B@platform.test", "a@PLATFORM.test")
	if len(tokens) != 3 || tokens["a@platform.test"] != tokens["a@PLATFORM.test"] || tokens["a@platform.test"] == tokens["B@platform.test"] {
		t.Fatalf("tokens = %v", tokens)
	}
	if n := countRows(t, e.db, `SELECT count(*) FROM nhi_global.connection_approval_links WHERE approval_id = $1`, e.approvalID); n != 2 {
		t.Fatalf("%d link rows, want one per distinct address", n)
	}
	a, b := tokens["a@platform.test"], tokens["B@platform.test"]
	if len(a) != linkTokenLen {
		t.Fatalf("token length %d", len(a))
	}
	// The token itself is never stored: only its hash.
	if n := countRows(t, e.db, `SELECT count(*) FROM nhi_global.connection_approval_links WHERE token_hash = $1 OR email = $1`, a); n != 0 {
		t.Fatal("the token is stored in the clear")
	}
	if n := countRows(t, e.db, `SELECT count(*) FROM nhi_global.connection_approval_links WHERE token_hash = $1`, hashLinkToken(a)); n != 1 {
		t.Fatal("its hash is not stored")
	}

	// Looking changes nothing.
	v, err := e.repo.ApprovalLinkInfo(ctx, a)
	if err != nil || v.Status != "pending" || v.Email != "a@platform.test" || v.AccountID != e.account || v.Used || v.Expired || v.Domain != "acme.example.com" {
		t.Fatalf("info = %+v, %v", v, err)
	}
	if _, err := e.repo.ApprovalLinkInfo(ctx, "not-a-token"); !errors.Is(err, ErrApprovalLinkInvalid) {
		t.Fatalf("garbage: %v", err)
	}
	if _, err := e.repo.ApprovalLinkInfo(ctx, strings.Repeat("A", linkTokenLen)); !errors.Is(err, ErrApprovalLinkInvalid) {
		t.Fatalf("a well-formed unknown token: %v", err)
	}
	if status, _, _ := e.request(t); status != "pending" {
		t.Fatal("looking decided the request")
	}

	// Approving: recorded, but the account is not connected - events come next.
	got, err := e.repo.DecideByLink(ctx, a, true, "looks right")
	if err != nil || got.Status != "approved" || got.DecidedBy != "a@platform.test (e-mail link)" {
		t.Fatalf("decide = %+v, %v", got, err)
	}
	status, connected, approval, by, note, hasConnectedAt := e.account_(t)
	if status != "pending" || connected || approval != "approved" || by != "approver a@platform.test" || note != "looks right" || hasConnectedAt {
		t.Fatalf("account = %s %v %s %q %q %v", status, connected, approval, by, note, hasConnectedAt)
	}
	if rs, rby, rnote := e.request(t); rs != "approved" || rby != "a@platform.test (e-mail link)" || rnote != "looks right" {
		t.Fatalf("request = %s %q %q", rs, rby, rnote)
	}

	// Neither link works again: the request is decided.
	var decided *ApprovalDecidedError
	for _, token := range []string{a, b} {
		if _, err := e.repo.DecideByLink(ctx, token, false, "no"); !errors.As(err, &decided) || decided.Status != "approved" {
			t.Fatalf("second decision = %v", err)
		}
	}
	if view, err := e.repo.ApprovalLinkInfo(ctx, b); err != nil || view.Status != "approved" || view.DecidedBy == "" {
		t.Fatalf("the other approver's link should show the decision: %+v %v", view, err)
	}
	if _, _, approval, _, _, _ := e.account_(t); approval != "approved" {
		t.Fatal("a second decision changed the account")
	}
}

func TestApprovalLinkRejectAgainstPostgres(t *testing.T) {
	e := newLinkEnv(t)
	tokens := e.links(t, "a@platform.test")
	if _, err := e.repo.DecideByLink(context.Background(), tokens["a@platform.test"], false, "Trail is not multi-region"); err != nil {
		t.Fatal(err)
	}
	status, connected, approval, _, note, _ := e.account_(t)
	if status != "rejected" || connected || approval != "rejected" || note != "Trail is not multi-region" {
		t.Fatalf("account = %s %v %s %q", status, connected, approval, note)
	}
}

func TestApprovalLinkExpiryUseAndRemovalAgainstPostgres(t *testing.T) {
	ctx := context.Background()

	e := newLinkEnv(t)
	tok := e.links(t, "a@platform.test")["a@platform.test"]
	mustExec(t, e.db, `UPDATE nhi_global.connection_approval_links SET expires_at = now() - interval '1 minute' WHERE approval_id = $1`, e.approvalID)
	if v, err := e.repo.ApprovalLinkInfo(ctx, tok); err != nil || !v.Expired {
		t.Fatalf("an old link must read as expired: %+v %v", v, err)
	}
	if _, err := e.repo.DecideByLink(ctx, tok, true, ""); !errors.Is(err, ErrApprovalLinkExpired) {
		t.Fatalf("expired link decided: %v", err)
	}
	if status, _, _ := e.request(t); status != "pending" {
		t.Fatal("an expired link changed the request")
	}
	if _, _, approval, _, _, _ := e.account_(t); approval != "pending" {
		t.Fatal("an expired link changed the account")
	}

	e = newLinkEnv(t)
	tok = e.links(t, "a@platform.test")["a@platform.test"]
	mustExec(t, e.db, `UPDATE nhi_global.connection_approval_links SET used_at = now() WHERE approval_id = $1`, e.approvalID)
	if _, err := e.repo.DecideByLink(ctx, tok, true, ""); !errors.Is(err, ErrApprovalLinkUsed) {
		t.Fatalf("used link decided: %v", err)
	}

	// The company removed the account after asking: nothing to decide.
	e = newLinkEnv(t)
	tok = e.links(t, "a@platform.test")["a@platform.test"]
	mustExec(t, e.db, `DELETE FROM `+database.Table(e.schema, "accounts")+` WHERE account_id = $1`, e.account)
	var decided *ApprovalDecidedError
	if _, err := e.repo.DecideByLink(ctx, tok, true, ""); !errors.As(err, &decided) || decided.Status != "withdrawn" {
		t.Fatalf("removed account: %v", err)
	}
	if status, _, _ := e.request(t); status != "withdrawn" {
		t.Fatalf("request = %s", status)
	}
}

// However many approvers click at once, exactly one decision is made.
func TestApprovalLinksDecideOnceUnderRaceAgainstPostgres(t *testing.T) {
	e := newLinkEnv(t)
	tokens := e.links(t, "a@platform.test", "b@platform.test", "c@platform.test")
	var wg sync.WaitGroup
	var mu sync.Mutex
	won := 0
	for addr, token := range tokens {
		for _, approve := range []bool{true, false} {
			wg.Add(1)
			go func(token string, approve bool) {
				defer wg.Done()
				if _, err := e.repo.DecideByLink(context.Background(), token, approve, "because"); err == nil {
					mu.Lock()
					won++
					mu.Unlock()
				}
			}(token, approve)
		}
		_ = addr
	}
	wg.Wait()
	if won != 1 {
		t.Fatalf("%d decisions were made, want exactly one", won)
	}
	if status, _, _ := e.request(t); status != "approved" && status != "rejected" {
		t.Fatalf("request = %s", status)
	}
}

// The whole way over HTTP: page, lookup, decide.
func TestApprovalLinkOverHTTPAgainstPostgres(t *testing.T) {
	e := newLinkEnv(t)
	tok := e.links(t, "a@platform.test")["a@platform.test"]
	h := NewApprovalLinkHandler(e.repo)
	look := post(h.Lookup, `{"token":"`+tok+`"}`, "application/json")
	if look.Code != 200 || !strings.Contains(look.Body.String(), `"state":"open"`) || strings.Contains(look.Body.String(), tok) {
		t.Fatalf("lookup = %d %s", look.Code, look.Body)
	}
	if status, _, _ := e.request(t); status != "pending" {
		t.Fatal("opening the link decided the request")
	}
	dec := post(h.Decide, `{"token":"`+tok+`","decision":"approve"}`, "application/json")
	if dec.Code != 200 || strings.Contains(dec.Body.String(), tok) {
		t.Fatalf("decide = %d %s", dec.Code, dec.Body)
	}
	if status, by, _ := e.request(t); status != "approved" || by != "a@platform.test (e-mail link)" {
		t.Fatalf("request = %s %q", status, by)
	}
	again := post(h.Decide, `{"token":"`+tok+`","decision":"approve"}`, "application/json")
	if again.Code != http.StatusConflict {
		t.Fatalf("replay = %d %s", again.Code, again.Body)
	}
}

func countRows(t *testing.T, db *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
