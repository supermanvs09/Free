// Package tenants resolves a tenant UUID to the schema that holds its data,
// for the remediation engine and its background worker. The registry is the
// backend's own <global schema>.tenants table; every tenant lives in one
// schema (tenants.db_name) of the shared nhi_db database, which holds the
// scanner tables, the ispm_* tables and, next to them, the remediation_* tables.
package tenants

import (
	"context"
	"fmt"
	"strings"

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
	only          []string // REMEDIATION_TENANTS: schema names (db_name) or tenant ids; empty = every tenant
}

// NewResolver reads tenants from <globalSchema>.tenants.
func NewResolver(pool *pgxpool.Pool, globalSchema string) *Resolver {
	return &Resolver{pool: pool, globalSchema: globalSchema, registryTable: "tenants"}
}

// WithOnly limits the resolver to the listed tenants (schema name or tenant id, any case).
// An empty list means every tenant.
func (r *Resolver) WithOnly(only []string) *Resolver {
	r.only = only
	return r
}

// Restricted reports whether only some tenants are used.
func (r *Resolver) Restricted() bool { return len(r.only) > 0 }

// Only returns the tenants of list that are named in only (all of them when only is empty).
func Only(list []Tenant, only []string) []Tenant {
	if len(only) == 0 {
		return list
	}
	want := map[string]bool{}
	for _, o := range only {
		want[strings.ToLower(strings.TrimSpace(o))] = true
	}
	var out []Tenant
	for _, t := range list {
		if want[strings.ToLower(t.DBName)] || want[strings.ToLower(t.ID)] {
			out = append(out, t)
		}
	}
	return out
}

func (r *Resolver) Main() *pgxpool.Pool { return r.pool }

func (r *Resolver) List(ctx context.Context) ([]Tenant, error) {
	list, err := List(ctx, r.pool, r.globalSchema, r.registryTable)
	if err != nil {
		return nil, err
	}
	return Only(list, r.only), nil
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
