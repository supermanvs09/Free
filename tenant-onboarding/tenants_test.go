package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func sp(s string) *string      { return &s }
func lp(l ...string) *[]string { return &l }

func onboarded(t *testing.T, db *sql.DB, name, ext string) Tenant {
	t.Helper()
	r := valid()
	r.CompanyName, r.ExternalID = name, ext
	res, err := mustService(t, db).Onboard(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	return res.Tenant
}

func TestUpdateTenantChangesOnlyWhatWasEdited(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	acme := onboarded(t, db, "Acme Corp", "ext-0123456789abcdef")
	other := onboarded(t, db, "Globex", "ext-aaaaaaaaaaaaaaaa")

	res, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{
		Expected: Patch{DomainName: sp(acme.DomainName), Regions: lp("ap-south-1")},
		Changes:  Patch{DomainName: sp(" ACME.example.com "), Regions: lp("US-east-1", "ap-south-1", "us-east-1")},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := res.Tenant
	if got.DomainName != "acme.example.com" || strings.Join(got.Regions, ",") != "us-east-1,ap-south-1" || strings.Join(res.Changed, ",") != "domain_name,collector_regions" {
		t.Fatalf("result = %+v", res)
	}
	// Everything else, including the identifying columns, is as it was.
	if got.TenantID != acme.TenantID || got.DBName != "acme_corp" || got.ExternalID != acme.ExternalID || got.AWSAccountID != acme.AWSAccountID ||
		got.EventBridgeARN != acme.EventBridgeARN || got.CreatedAt == nil || !got.CreatedAt.Equal(*acme.CreatedAt) {
		t.Fatalf("an untouched column changed: %+v", got)
	}
	// The other company, the users and the workspace are untouched.
	var d string
	_ = db.QueryRow(`SELECT domain_name FROM nhi_global.tenants WHERE tenant_id = $1`, other.TenantID).Scan(&d)
	if d != other.DomainName || tablesIn(t, db, "acme_corp") != 65 {
		t.Error("something outside the edited row changed")
	}

	// Saving the same values again is a no-op, not an error.
	again, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{
		Expected: Patch{DomainName: sp("acme.example.com")}, Changes: Patch{DomainName: sp("acme.example.com")},
	})
	if err != nil || len(again.Changed) != 0 {
		t.Fatalf("no-op: %+v %v", again, err)
	}
}

func TestUpdateTenantRefusesWhatIsWrong(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	acme := onboarded(t, db, "Acme Corp", "ext-0123456789abcdef")
	globex := onboarded(t, db, "Globex", "ext-aaaaaaaaaaaaaaaa")

	invalid := map[string]Patch{
		"domain_name":                {DomainName: sp("nodot")},
		"collector_aws_account_id":   {AWSAccountID: sp("123")},
		"collector_external_id":      {ExternalID: sp("short")},
		"collector_event_bridge_arn": {EventBridgeARN: sp("arn:aws:s3:::x")},
		"collector_regions":          {Regions: lp("mars-1")},
	}
	for field, p := range invalid {
		var verr *ValidationError
		if _, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Changes: p}); !errors.As(err, &verr) || verr.Fields[field] == "" {
			t.Errorf("%s: err = %v", field, err)
		}
	}
	for _, p := range []Patch{{DomainName: sp(" ")}, {AWSAccountID: sp("")}, {Regions: lp()}, {Regions: lp(" ", "")}} {
		var verr *ValidationError
		if _, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Changes: p}); !errors.As(err, &verr) {
			t.Errorf("a saved detail must not be emptied: %v", err)
		}
	}
	var verr *ValidationError
	if _, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{}); !errors.As(err, &verr) {
		t.Errorf("an empty edit: %v", err)
	}

	// Someone else's domain or External ID.
	var cerr *ConflictError
	_, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Expected: Patch{DomainName: sp(acme.DomainName)}, Changes: Patch{DomainName: sp(strings.ToUpper(globex.DomainName))}})
	if !errors.As(err, &cerr) || cerr.Fields["domain_name"] == "" {
		t.Errorf("shared domain: %v", err)
	}
	_, err = svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Expected: Patch{ExternalID: sp(acme.ExternalID)}, Changes: Patch{ExternalID: sp(globex.ExternalID)}})
	if !errors.As(err, &cerr) || cerr.Fields["collector_external_id"] == "" {
		t.Errorf("shared external id: %v", err)
	}

	// Unknown company.
	_, err = svc.UpdateTenant(ctx, "11111111-1111-4111-8111-111111111111", UpdateRequest{Changes: Patch{AWSAccountID: sp("123456789012")}})
	if !errors.Is(err, NotFoundError{}) {
		t.Errorf("unknown company: %v", err)
	}

	// None of the above wrote anything.
	var d, e string
	_ = db.QueryRow(`SELECT domain_name, collector_external_id FROM nhi_global.tenants WHERE tenant_id = $1`, acme.TenantID).Scan(&d, &e)
	if d != acme.DomainName || e != acme.ExternalID {
		t.Fatalf("a refused edit changed the row: %s %s", d, e)
	}
}

func TestUpdateTenantRefusesToOverwriteSomeoneElsesEdit(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	acme := onboarded(t, db, "Acme Corp", "ext-0123456789abcdef")

	// Someone else saves first.
	if _, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Expected: Patch{AWSAccountID: sp(acme.AWSAccountID)}, Changes: Patch{AWSAccountID: sp("222222222222")}}); err != nil {
		t.Fatal(err)
	}
	// This person still has the old value on screen.
	_, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Expected: Patch{AWSAccountID: sp(acme.AWSAccountID)}, Changes: Patch{AWSAccountID: sp("333333333333")}})
	if !errors.Is(err, StaleError{}) {
		t.Fatalf("err = %v, want StaleError", err)
	}
	var a string
	_ = db.QueryRow(`SELECT collector_aws_account_id FROM nhi_global.tenants`).Scan(&a)
	if a != "222222222222" {
		t.Errorf("account = %s; the first edit must stand", a)
	}
	// An edit that sends no "expected" for a changed field is refused too.
	if _, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Changes: Patch{AWSAccountID: sp("444444444444")}}); !errors.Is(err, StaleError{}) {
		t.Errorf("missing expected: %v", err)
	}

	// Two people saving at once: exactly one wins.
	var wg sync.WaitGroup
	var mu sync.Mutex
	won, stale := 0, 0
	for _, v := range []string{"555555555555", "666666666666"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.UpdateTenant(ctx, acme.TenantID, UpdateRequest{Expected: Patch{AWSAccountID: sp("222222222222")}, Changes: Patch{AWSAccountID: sp(v)}})
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				won++
			case errors.Is(err, StaleError{}):
				stale++
			default:
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if won != 1 || stale != 1 {
		t.Errorf("won = %d, stale = %d, want 1 and 1", won, stale)
	}
}

// A row saved long ago in an old format makes the database reject any update of
// it. The service must say which detail, and let a fix of that detail through.
func TestUpdateTenantWithOldFormatRow(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	if _, err := db.Exec(`
		ALTER TABLE nhi_global.tenants DROP CONSTRAINT tenants_domain_name_format, DROP CONSTRAINT tenants_collector_external_id_format;
		INSERT INTO nhi_global.tenants (tenant_id, db_name, domain_name, collector_aws_account_id, collector_external_id, collector_event_bridge_arn, collector_regions)
			VALUES ('3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d', 'oldco', 'oldco', '189160505560', 'a1b2c3', 'arn:aws:events:ap-south-1:189160505560:event-bus/default', '{ap-south-1}');
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_domain_name_format CHECK (domain_name IS NULL OR domain_name ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') NOT VALID;
		ALTER TABLE nhi_global.tenants ADD CONSTRAINT tenants_collector_external_id_format CHECK (length(collector_external_id) BETWEEN 16 AND 1224 AND collector_external_id ~ '^[A-Za-z0-9+=,.@:/_-]+$') NOT VALID;`); err != nil {
		t.Fatal(err)
	}
	id := "3f7b2c14-8e9a-4d2b-b6c8-5e9f1a2b3c4d"

	var verr *ValidationError
	_, err := svc.UpdateTenant(ctx, id, UpdateRequest{Expected: Patch{Regions: lp("ap-south-1")}, Changes: Patch{Regions: lp("ap-south-1", "us-east-1")}})
	if !errors.As(err, &verr) || verr.Fields["domain_name"] == "" || verr.Fields["collector_external_id"] == "" {
		t.Fatalf("err = %v, want a message on both old-format details", err)
	}
	res, err := svc.UpdateTenant(ctx, id, UpdateRequest{
		Expected: Patch{DomainName: sp("oldco"), ExternalID: sp("a1b2c3"), Regions: lp("ap-south-1")},
		Changes:  Patch{DomainName: sp("oldco.nhi.local"), ExternalID: sp("fixed-ext-0123456789"), Regions: lp("ap-south-1", "us-east-1")},
	})
	if err != nil || res.Tenant.DomainName != "oldco.nhi.local" || len(res.Tenant.Regions) != 2 {
		t.Fatalf("fixing both: %+v %v", res, err)
	}
}

func TestTenantsHTTP(t *testing.T) {
	db := scratchDB(t)
	h := NewHandler(mustService(t, db), testAuth(t, db), db)
	acme := onboarded(t, db, "Acme Corp", "ext-0123456789abcdef")
	c := &client{t: t, h: h}
	if w := c.do("GET", "/api/tenants", nil); w.Code != 401 {
		t.Errorf("list without a session = %d", w.Code)
	}
	if w := c.do("PATCH", "/api/tenants/"+acme.TenantID, map[string]any{}); w.Code != 401 {
		t.Errorf("patch without a session = %d", w.Code)
	}
	c.signIn("superadmin", testPassword)
	do := c.do

	w := do("GET", "/api/tenants", nil)
	var list struct{ Tenants []Tenant }
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if w.Code != 200 || len(list.Tenants) != 1 || list.Tenants[0].TenantID != acme.TenantID {
		t.Fatalf("list = %d %s", w.Code, w.Body)
	}

	path := "/api/tenants/" + acme.TenantID
	good := map[string]any{"expected": map[string]any{"collector_aws_account_id": acme.AWSAccountID}, "changes": map[string]any{"collector_aws_account_id": "999999999999"}}
	if w := do("PATCH", path, good); w.Code != 200 || !strings.Contains(w.Body.String(), `"999999999999"`) {
		t.Errorf("patch = %d %s", w.Code, w.Body)
	}
	// db_name and tenant_id can't be edited: the request is refused, not ignored.
	for _, field := range []string{"db_name", "tenant_id", "created_at"} {
		evil := map[string]any{"changes": map[string]any{field: "x"}}
		if w := do("PATCH", path, evil); w.Code != 400 {
			t.Errorf("changing %s = %d, want 400", field, w.Code)
		}
	}
	if n := count(t, db, `SELECT count(*) FROM nhi_global.tenants WHERE db_name = 'acme_corp' AND tenant_id = $1`, acme.TenantID); n != 1 {
		t.Error("identifying columns changed")
	}
	stale := map[string]any{"expected": map[string]any{"collector_aws_account_id": acme.AWSAccountID}, "changes": map[string]any{"collector_aws_account_id": "888888888888"}}
	if w := do("PATCH", path, stale); w.Code != 409 || !strings.Contains(w.Body.String(), `"stale"`) {
		t.Errorf("stale = %d %s", w.Code, w.Body)
	}
	if w := do("PATCH", path, map[string]any{"changes": map[string]any{"collector_external_id": "x"}}); w.Code != 422 {
		t.Errorf("invalid = %d", w.Code)
	}
	if w := do("PATCH", "/api/tenants/not-a-uuid", good); w.Code != 404 {
		t.Errorf("bad id = %d", w.Code)
	}
	if w := do("PATCH", "/api/tenants/11111111-1111-4111-8111-111111111111", good); w.Code != 404 {
		t.Errorf("unknown = %d", w.Code)
	}
}

func schemaExists(t *testing.T, db *sql.DB, name string) bool {
	return count(t, db, `SELECT count(*) FROM pg_namespace WHERE nspname = $1`, name) == 1
}

func TestDeleteTenantRemovesEverythingOfThatCompanyOnly(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()

	mk := func(name, ext, user string) Tenant {
		r := valid()
		r.CompanyName, r.ExternalID, r.CustomerAccountID = name, ext, ""
		if user != "" {
			r.User = &UserInput{Username: user, FullName: "Some Person", Password: "correct-horse-1"}
			r.CustomerAccountID = "210987654321"
		}
		res, err := svc.Onboard(ctx, r)
		if err != nil {
			t.Fatal(err)
		}
		return res.Tenant
	}
	acme := mk("Acme Corp", "ext-0123456789abcdef", "priya")
	globex := mk("Globex", "ext-aaaaaaaaaaaaaaaa", "")
	if _, err := db.Exec(`INSERT INTO nhi_global.nhi_users (id, email, tenant_id) VALUES (500, 'neo@globex', $1)`, globex.TenantID); err != nil {
		t.Fatal(err)
	}
	// A sign-in token of each company's user.
	if _, err := db.Exec(`INSERT INTO nhi_global.refresh_tokens (user_id) SELECT id FROM nhi_global.nhi_users`); err != nil {
		t.Fatal(err)
	}

	p, err := svc.PreviewDelete(ctx, acme.TenantID)
	if err != nil || p.Users != 1 || p.Tables != 65 || p.Accounts != 1 || !p.SchemaExists || p.DBName != "acme_corp" {
		t.Fatalf("preview = %+v %v", p, err)
	}
	if count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 2 {
		t.Fatal("a preview must change nothing")
	}

	// Wrong or missing confirmation: nothing is touched.
	for _, c := range []string{"", "acme", "ACME_CORP", "globex"} {
		var verr *ValidationError
		if _, err := svc.DeleteTenant(ctx, acme.TenantID, c); !errors.As(err, &verr) {
			t.Errorf("confirm %q: err = %v", c, err)
		}
	}
	if !schemaExists(t, db, "acme_corp") || count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 2 {
		t.Fatal("a refused delete removed something")
	}

	res, err := svc.DeleteTenant(ctx, acme.TenantID, " acme_corp ")
	if err != nil || res.UsersDeleted != 1 || !res.WorkspaceGone {
		t.Fatalf("delete = %+v %v", res, err)
	}
	if schemaExists(t, db, "acme_corp") ||
		count(t, db, `SELECT count(*) FROM nhi_global.tenants WHERE tenant_id = $1`, acme.TenantID) != 0 ||
		count(t, db, `SELECT count(*) FROM nhi_global.nhi_users WHERE tenant_id = $1`, acme.TenantID) != 0 {
		t.Fatal("the company is still there")
	}
	// Its sign-in tokens went with its users; the other company's are intact.
	if n := count(t, db, `SELECT count(*) FROM nhi_global.refresh_tokens`); n != 1 {
		t.Errorf("tokens left = %d, want only the other company's", n)
	}
	// The other company is untouched.
	if !schemaExists(t, db, "globex") || tablesIn(t, db, "globex") != 65 ||
		count(t, db, `SELECT count(*) FROM nhi_global.tenants WHERE tenant_id = $1`, globex.TenantID) != 1 ||
		count(t, db, `SELECT count(*) FROM nhi_global.nhi_users WHERE tenant_id = $1`, globex.TenantID) != 1 {
		t.Fatal("deleting one company changed another")
	}
	// Gone is gone.
	if _, err := svc.DeleteTenant(ctx, acme.TenantID, "acme_corp"); !errors.Is(err, NotFoundError{}) {
		t.Errorf("second delete = %v", err)
	}
	if _, err := svc.PreviewDelete(ctx, acme.TenantID); !errors.Is(err, NotFoundError{}) {
		t.Errorf("preview of a deleted company = %v", err)
	}
}

func TestDeleteTenantNeverDropsAProtectedSchema(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	for i, name := range []string{"public", "nhi_global", "pg_catalog", "information_schema", "NHI_GLOBAL"} {
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i+1)
		if _, err := db.Exec(`INSERT INTO nhi_global.tenants (tenant_id, db_name) VALUES ($1, $2)`, id, name); err != nil {
			t.Fatal(err)
		}
		var cerr *ConflictError
		if _, err := svc.DeleteTenant(ctx, id, name); !errors.As(err, &cerr) {
			t.Errorf("%s: err = %v, want a refusal", name, err)
		}
	}
	for _, s := range []string{"public", "nhi_global"} {
		if !schemaExists(t, db, s) {
			t.Fatalf("schema %s was dropped", s)
		}
	}
	if count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 5 {
		t.Error("a protected company's row was removed")
	}
}

func TestDeleteTenantWithOddNamesAndNoWorkspace(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	// An older company with capitals and a space in its schema name.
	if _, err := db.Exec(`CREATE SCHEMA "Legacy Co"; CREATE TABLE "Legacy Co".t (a int);
		INSERT INTO nhi_global.tenants (tenant_id, db_name) VALUES ('11111111-1111-4111-8111-111111111111', 'Legacy Co'),
		('22222222-2222-4222-8222-222222222222', 'registered_only')`); err != nil {
		t.Fatal(err)
	}
	if res, err := svc.DeleteTenant(ctx, "11111111-1111-4111-8111-111111111111", "Legacy Co"); err != nil || !res.WorkspaceGone || schemaExists(t, db, "Legacy Co") {
		t.Fatalf("legacy = %+v %v", res, err)
	}
	// A row whose workspace was never built (or was removed by hand) still deletes.
	p, err := svc.PreviewDelete(ctx, "22222222-2222-4222-8222-222222222222")
	if err != nil || p.SchemaExists || p.Tables != 0 {
		t.Fatalf("preview = %+v %v", p, err)
	}
	if res, err := svc.DeleteTenant(ctx, "22222222-2222-4222-8222-222222222222", "registered_only"); err != nil || res.WorkspaceGone {
		t.Fatalf("no workspace = %+v %v", res, err)
	}
	if count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 0 {
		t.Error("rows left")
	}
}

func TestDeleteTenantIsAllOrNothing(t *testing.T) {
	db := scratchDB(t)
	svc := mustService(t, db)
	ctx := context.Background()
	r := valid()
	r.User = &UserInput{Username: "priya", FullName: "Priya Rao", Password: "correct-horse-1"}
	res, err := svc.Onboard(ctx, r)
	if err != nil {
		t.Fatal(err)
	}
	// Make the last step fail: a trigger that refuses to delete the tenants row.
	if _, err := db.Exec(`CREATE FUNCTION nhi_global.no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'no'; END $$;
		CREATE TRIGGER no_delete BEFORE DELETE ON nhi_global.tenants FOR EACH ROW EXECUTE FUNCTION nhi_global.no_delete();`); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteTenant(ctx, res.Tenant.TenantID, "acme_corp"); err == nil {
		t.Fatal("the delete should have failed")
	}
	if !schemaExists(t, db, "acme_corp") || tablesIn(t, db, "acme_corp") != 65 ||
		count(t, db, `SELECT count(*) FROM nhi_global.nhi_users`) != 1 || count(t, db, `SELECT count(*) FROM nhi_global.tenants`) != 1 {
		t.Fatal("a failed delete left things half removed")
	}
}

func TestDeleteTenantHTTP(t *testing.T) {
	db := scratchDB(t)
	h := NewHandler(mustService(t, db), testAuth(t, db), db)
	acme := onboarded(t, db, "Acme Corp", "ext-0123456789abcdef")
	c := &client{t: t, h: h}
	path := "/api/tenants/" + acme.TenantID
	if w := c.do("DELETE", path, map[string]string{"confirm": "acme_corp"}); w.Code != 401 {
		t.Errorf("delete without a session = %d", w.Code)
	}
	if w := c.do("GET", path+"/delete-preview", nil); w.Code != 401 {
		t.Errorf("preview without a session = %d", w.Code)
	}
	c.signIn("superadmin", testPassword)
	w := c.do("GET", path+"/delete-preview", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"tables":65`) {
		t.Errorf("preview = %d %s", w.Code, w.Body)
	}
	if w := c.do("DELETE", path, map[string]string{"confirm": "nope"}); w.Code != 422 {
		t.Errorf("wrong confirmation = %d %s", w.Code, w.Body)
	}
	if w := c.do("DELETE", path, map[string]any{"confirm": "acme_corp", "force": true}); w.Code != 400 {
		t.Errorf("unknown field = %d", w.Code)
	}
	if !schemaExists(t, db, "acme_corp") {
		t.Fatal("refused requests deleted the workspace")
	}
	if w := c.do("DELETE", path, map[string]string{"confirm": "acme_corp"}); w.Code != 200 || !strings.Contains(w.Body.String(), `"workspace_dropped":true`) {
		t.Errorf("delete = %d %s", w.Code, w.Body)
	}
	if w := c.do("DELETE", path, map[string]string{"confirm": "acme_corp"}); w.Code != 404 {
		t.Errorf("delete again = %d", w.Code)
	}
	if w := c.do("DELETE", "/api/tenants/not-a-uuid", map[string]string{"confirm": "x"}); w.Code != 404 {
		t.Errorf("bad id = %d", w.Code)
	}
}
