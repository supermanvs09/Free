package globalschema

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Against a real database: a schema with none of the tables gets them, a
// second call changes nothing, and a table that already exists is left alone.
func TestEnsureCreatesOnlyWhatIsMissing(t *testing.T) {
	dsn := os.Getenv("NHI_TEST_DSN")
	if dsn == "" {
		t.Skip("NHI_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	const schema = "gs_test_global"
	for _, q := range []string{`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`, `CREATE SCHEMA ` + schema} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	defer db.ExecContext(ctx, `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)

	// One table exists already, with a row that must survive.
	if _, err := db.ExecContext(ctx, `CREATE TABLE `+schema+`.connection_approvals (marker text); INSERT INTO `+schema+`.connection_approvals VALUES ('keep')`); err != nil {
		t.Fatal(err)
	}
	created, err := Ensure(ctx, db, schema)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(created, ",") != "audit_logs,connection_requests" {
		t.Fatalf("created %v", created)
	}
	var marker string
	if err := db.QueryRowContext(ctx, `SELECT marker FROM `+schema+`.connection_approvals`).Scan(&marker); err != nil || marker != "keep" {
		t.Fatalf("the existing table was touched: %q %v", marker, err)
	}
	for _, tbl := range []string{"audit_logs", "connection_requests"} {
		var n int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM `+schema+`.`+tbl).Scan(&n); err != nil {
			t.Fatalf("%s: %v", tbl, err)
		}
	}
	// The connection is usable afterwards and a second call has nothing to do.
	if again, err := Ensure(ctx, db, schema); err != nil || len(again) != 0 {
		t.Fatalf("second call: %v %v", again, err)
	}
	if _, err := Ensure(ctx, db, `bad"; DROP`); err == nil {
		t.Fatal("a bad schema name must be refused")
	}
}
