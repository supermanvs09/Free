// Package tenants resolves a tenant UUID to the schema that holds its data,
// for the remediation engine and its background worker. The registry is the
// backend's own <global schema>.tenants table; every tenant lives in one
// schema (tenants.db_name) of the shared nhi_db database, which holds the
// scanner tables, the ispm_* tables and, next to them, the remediation_* tables.
package tenants

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Tenant struct {
	ID     string
	DBName string
}

// List reads every tenant row; rows with an invalid UUID or no schema are skipped.
func List(ctx context.Context, pool *pgxpool.Pool, schema, table string) ([]Tenant, error) {
	q := fmt.Sprintf(`SELECT tenant_id::text, COALESCE(db_name::text, '') FROM %s ORDER BY 1`,
		pgx.Identifier{schema, table}.Sanitize())
	rows, err := pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("read tenants from %s.%s: %w", schema, table, err)
	}
	defer rows.Close()
	var out []Tenant
	for rows.Next() {
		var id, db string
		if err := rows.Scan(&id, &db); err != nil {
			return nil, err
		}
		u, err := uuid.Parse(id)
		if err != nil || db == "" {
			continue
		}
		out = append(out, Tenant{ID: u.String(), DBName: db})
	}
	return out, rows.Err()
}

// Target is where a tenant's data lives.
type Target struct {
	TenantID     string
	Pool         *pgxpool.Pool
	SourceSchema string // scanner tables, read only
	EngineSchema string // ispm_* and remediation_* tables
	Where        string
}

// Resolver reads the tenant registry.
type Resolver struct {
	pool          *pgxpool.Pool
	globalSchema  string
	registryTable string
}

// NewResolver reads tenants from <globalSchema>.tenants.
func NewResolver(pool *pgxpool.Pool, globalSchema string) *Resolver {
	return &Resolver{pool: pool, globalSchema: globalSchema, registryTable: "tenants"}
}

func (r *Resolver) Main() *pgxpool.Pool { return r.pool }

func (r *Resolver) List(ctx context.Context) ([]Tenant, error) {
	return List(ctx, r.pool, r.globalSchema, r.registryTable)
}

// Find returns the tenant row for an id.
func (r *Resolver) Find(ctx context.Context, id string) (Tenant, bool, error) {
	list, err := r.List(ctx)
	if err != nil {
		return Tenant{}, false, err
	}
	for _, t := range list {
		if t.ID == id {
			return t, true, nil
		}
	}
	return Tenant{}, false, nil
}

// Target returns the pool and schema of a tenant: scanner, ispm_* and
// remediation_* tables are all in the tenant's own schema.
func (r *Resolver) Target(_ context.Context, t Tenant) (Target, error) {
	if t.DBName == "" {
		return Target{}, fmt.Errorf("tenant %s has no schema", t.ID)
	}
	return Target{TenantID: t.ID, Pool: r.pool, SourceSchema: t.DBName, EngineSchema: t.DBName, Where: "schema " + t.DBName}, nil
}
