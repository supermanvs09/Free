// Package migrate creates / upgrades the remediation_* tables inside a tenant
// schema. Applied versions are recorded in <schema>.remediation_schema_migrations
// (separate from the engine's ispm_schema_migrations).
package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/migrations"
)

// schemaVar is how the .sql files name the tenant schema: the psql variable
// :"schema" (scripts/migrate.sh passes -v schema=<name>). The Go migrator
// substitutes it the same way, as a quoted identifier.
const schemaVar = `:"schema"`

var validSchema = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,62}$`)

func ValidSchema(name string) bool { return validSchema.MatchString(name) }

// Ensure brings the remediation tables of `schema` up to date. Safe to call at
// every start and from several replicas (advisory lock per schema).
func Ensure(ctx context.Context, pool *pgxpool.Pool, schema string, log *slog.Logger) error {
	if !ValidSchema(schema) {
		return fmt.Errorf("invalid schema name %q", schema)
	}
	files, err := fs.Glob(migrations.FS, "tenant/*_remediation_*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "remediator-migrate:"+schema); err != nil {
		return err
	}
	q := pgx.Identifier{schema}.Sanitize()
	if _, err := tx.Exec(ctx, fmt.Sprintf(`CREATE SCHEMA IF NOT EXISTS %[1]s;
		CREATE TABLE IF NOT EXISTS %[1]s.remediation_schema_migrations (
			version VARCHAR(16) PRIMARY KEY, file TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`, q)); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}
	rows, err := tx.Query(ctx, fmt.Sprintf(`SELECT version FROM %s.remediation_schema_migrations`, q))
	if err != nil {
		return err
	}
	vs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	applied := map[string]bool{}
	for _, v := range vs {
		applied[v] = true
	}
	for _, f := range files {
		v := version(path.Base(f))
		if applied[v] {
			continue
		}
		raw, err := migrations.FS.ReadFile(f)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, forSchema(string(raw), schema)); err != nil {
			return fmt.Errorf("migration %s on schema %s: %w", f, schema, err)
		}
		if _, err := tx.Exec(ctx, fmt.Sprintf(`INSERT INTO %s.remediation_schema_migrations (version, file) VALUES ($1, $2)`, q), v, path.Base(f)); err != nil {
			return err
		}
		log.Info("migration applied", "schema", schema, "file", f)
	}
	return tx.Commit(ctx)
}

func version(file string) string {
	if i := strings.Index(file, "_"); i > 0 {
		return file[:i]
	}
	return file
}

// forSchema replaces the psql schema variable with the quoted tenant schema.
func forSchema(sql, schema string) string {
	return strings.ReplaceAll(sql, schemaVar, pgx.Identifier{schema}.Sanitize())
}
