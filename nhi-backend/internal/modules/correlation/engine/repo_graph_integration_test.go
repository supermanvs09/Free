//go:build integration

// Run against a throwaway PostgreSQL only. NHIGRAPH_MIGRATION points at the PG
// collector's migrations/007_nhi_graph_tables.sql:
//
//	NHIGRAPH_TEST_DSN=postgres://... NHIGRAPH_MIGRATION=/path/007_nhi_graph_tables.sql \
//	  go test -tags integration -run TestLoadGraphData ./internal/modules/correlation/engine/
package engine

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "github.com/lib/pq"
)

func TestLoadGraphDataAgainstPostgres(t *testing.T) {
	dsn, migPath := os.Getenv("NHIGRAPH_TEST_DSN"), os.Getenv("NHIGRAPH_MIGRATION")
	if dsn == "" || migPath == "" {
		t.Skip("NHIGRAPH_TEST_DSN / NHIGRAPH_MIGRATION not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	const tenant = "graphit"
	mustExec := func(q string) {
		t.Helper()
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
	}
	mustExec(`DROP SCHEMA IF EXISTS graphold_nhigraph CASCADE; DROP SCHEMA IF EXISTS graphold CASCADE; DROP SCHEMA IF EXISTS graphit CASCADE; CREATE SCHEMA graphit`)
	defer db.Exec(`DROP SCHEMA IF EXISTS graphold_nhigraph CASCADE; DROP SCHEMA IF EXISTS graphold CASCADE; DROP SCHEMA IF EXISTS graphit CASCADE`)

	ds := BuildScope(db, tenant, nil, nil)
	repo := NewPGRepo(nil)

	// Before the migration: no error, just "not available".
	d, err := repo.LoadGraphData(ctx, ds)
	if err != nil || d.Available {
		t.Fatalf("missing schema: %+v %v", d, err)
	}

	mig, err := os.ReadFile(migPath)
	if err != nil {
		t.Fatal(err)
	}
	mustExec(strings.ReplaceAll(string(mig), "{SCHEMA}", tenant))
	mustExec(`
	INSERT INTO graphit.nhi_resource_policies (account_id, source, fetch_unit, scan_id, region, resource_arn, policy_type, policy_name, document) VALUES
	 ('111','s3','global','s','us-east-1','arn:aws:s3:::b','resource_policy','bucket_policy','{"Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject"}]}'),
	 ('111','kms','us-east-1','s','us-east-1','arn:aws:kms:us-east-1:111:key/k','key_policy','default','{"Statement":{"Effect":"Allow","Principal":{"AWS":"arn:aws:iam::111:root"},"Action":"kms:*"}}'),
	 ('111','kms','us-east-1','s','us-east-1','arn:aws:kms:us-east-1:111:key/k','kms_grant','g1','{"grantee_principal":"arn:aws:iam::111:role/app","operations":["Decrypt"]}'),
	 ('222','s3','global','s','us-east-1','arn:aws:s3:::other','resource_policy','bucket_policy','{"Statement":[]}');
	INSERT INTO graphit.nhi_resources (account_id, source, fetch_unit, scan_id, region, service, resource_type, resource_arn, name, attributes) VALUES
	 ('111','kms','us-east-1','s','us-east-1','kms','key','arn:aws:kms:us-east-1:111:key/k','k','{"key_manager":"CUSTOMER"}');
	INSERT INTO graphit.nhi_resource_links (account_id, source, fetch_unit, scan_id, region, link_type, from_arn, to_arn) VALUES
	 ('111','s3','global','s','us-east-1','encrypted_by','arn:aws:s3:::b','arn:aws:kms:us-east-1:111:key/k');
	INSERT INTO graphit.nhi_org_policies (account_id, source, fetch_unit, scan_id, policy_id, name, policy_type, document, targets) VALUES
	 ('999','organizations','global','s','p-1','DenyS3','SERVICE_CONTROL_POLICY','{"Statement":[{"Effect":"Deny","Action":"s3:*","Resource":"*"}]}','[{"id":"111","type":"ACCOUNT"}]');
	INSERT INTO graphit.nhi_service_last_accessed (account_id, source, fetch_unit, scan_id, role_arn, service_namespace, last_authenticated) VALUES
	 ('111','access_advisor','global','s','arn:aws:iam::111:role/app','s3', NOW()),
	 ('111','access_advisor','global','s','arn:aws:iam::111:role/app','ec2', NULL);
	INSERT INTO graphit.nhi_fetch_status (scan_id, account_id, region, source, status, message, started_at, finished_at) VALUES
	 ('s1','111','us-east-1','kms','error','old', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
	 ('s2','111','us-east-1','kms','ok','', NOW(), NOW());`)

	d, err = repo.LoadGraphData(ctx, BuildScope(db, tenant, []string{"111"}, nil))
	if err != nil || !d.Available {
		t.Fatalf("load: %+v %v", d, err)
	}
	if len(d.Policies["arn:aws:s3:::b"]) != 1 || len(d.Policies["arn:aws:kms:us-east-1:111:key/k"]) != 1 {
		t.Errorf("policies %+v", d.Policies)
	}
	if _, other := d.Policies["arn:aws:s3:::other"]; other {
		t.Error("account 222 is out of scope")
	}
	if g := d.KMSGrants["arn:aws:kms:us-east-1:111:key/k"]; len(g) != 1 || g[0].Grantee != "arn:aws:iam::111:role/app" {
		t.Errorf("grants %+v", g)
	}
	if d.KeyManagers["arn:aws:kms:us-east-1:111:key/k"] != "CUSTOMER" || len(d.LinksFrom["arn:aws:s3:::b"]) != 1 {
		t.Errorf("keys %+v links %+v", d.KeyManagers, d.LinksFrom)
	}
	if len(d.SCPs) != 1 || d.SCPs[0].FromAccount != "999" || len(d.SCPs[0].Targets) != 1 {
		t.Errorf("scps %+v", d.SCPs)
	}
	if m := d.LastUsed["arn:aws:iam::111:role/app"]; m["s3"] == nil || m["ec2"] != nil {
		t.Errorf("last used %+v", m)
	}
	if len(d.Status) != 1 || d.Status[0].Status != "ok" {
		t.Errorf("only the latest status per unit: %+v", d.Status)
	}

	// Older layout: the tables in <tenant>_nhigraph are still read.
	mustExec(`CREATE SCHEMA graphold; CREATE SCHEMA graphold_nhigraph`)
	mustExec(strings.ReplaceAll(string(mig), "{SCHEMA}", "graphold_nhigraph"))
	mustExec(`INSERT INTO graphold_nhigraph.nhi_resource_links (account_id, source, fetch_unit, scan_id, region, link_type, from_arn, to_arn) VALUES
	 ('111','s3','global','s','us-east-1','encrypted_by','arn:aws:s3:::old','arn:aws:kms:us-east-1:111:key/k')`)
	d, err = repo.LoadGraphData(ctx, BuildScope(db, "graphold", nil, nil))
	if err != nil || !d.Available || len(d.LinksFrom["arn:aws:s3:::old"]) != 1 {
		t.Fatalf("legacy schema: %+v %v", d, err)
	}
}
