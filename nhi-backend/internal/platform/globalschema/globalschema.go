// Package globalschema creates the global tables the API writes to when a
// deployment has not had its migrations applied: the audit log, the approval
// requests and the connection requests. A missing audit_logs table used to
// lose every audit entry (and a missing approvals table failed a first
// connection) until somebody ran scripts/migrate.sh.
//
// Only a missing table is created. The files are the same idempotent ones
// scripts/migrate.sh applies; nothing existing is altered.
package globalschema

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/migrations"
)

// step is one table and the migration file that creates it.
type step struct{ table, file string }

var steps = []step{
	{"audit_logs", "global/005_audit_logs.sql"},
	{"connection_approvals", "global/007_connection_approvals.sql"},
	{"connection_requests", "global/009_connection_requests.sql"},
}

// The migration files name the default global schema; another one is swapped in.
const fileSchema = "nhi_global"

// Ensure creates the tables that are missing in schema and returns their names.
// Safe to call from every replica at once (an advisory lock serialises them).
// When the database role may not create tables there, it says so and what to run.
func Ensure(ctx context.Context, db *sql.DB, schema string) (created []string, err error) {
	schema = strings.TrimSpace(schema)
	if err := config.ValidateSchemaName(schema); err != nil {
		return nil, fmt.Errorf("global schema %q: %w", schema, err)
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock(hashtext('nhi-global-schema'))`); err != nil {
		return nil, err
	}
	defer func() {
		_, _ = conn.ExecContext(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock(hashtext('nhi-global-schema'))`)
	}()

	for _, st := range steps {
		var exists bool
		if err := conn.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, `"`+schema+`"."`+st.table+`"`).Scan(&exists); err != nil {
			return created, err
		}
		if exists {
			continue
		}
		raw, err := migrations.FS.ReadFile(st.file)
		if err != nil {
			return created, err
		}
		sqlText := strings.ReplaceAll(string(raw), fileSchema+".", `"`+schema+`".`)
		if _, err := conn.ExecContext(ctx, sqlText); err != nil {
			// The file opens its own transaction; leave the session clean.
			_, _ = conn.ExecContext(context.WithoutCancel(ctx), `ROLLBACK`)
			return created, fmt.Errorf("create %s.%s: %w (apply migrations/%s with a role that can create tables in %s)", schema, st.table, err, st.file, schema)
		}
		created = append(created, st.table)
		slog.Info("global table created", "schema", schema, "table", st.table)
	}
	return created, nil
}
