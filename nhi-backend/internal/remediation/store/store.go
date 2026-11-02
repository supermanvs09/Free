// Package store persists the remediation_* tables and reads the engine's
// (read-only) ispm_* tables and the scanner tables.
package store

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/remediation/tenants"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

// Store is bound to one tenant.
type Store struct {
	pool     *pgxpool.Pool
	TenantID string
	eng      string
	src      string
}

func New(t tenants.Target) *Store {
	return &Store{pool: t.Pool, TenantID: t.TenantID, eng: t.EngineSchema, src: t.SourceSchema}
}

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

func (s *Store) tbl(name string) string    { return pgx.Identifier{s.eng, name}.Sanitize() }
func (s *Store) srcTbl(name string) string { return pgx.Identifier{s.src, name}.Sanitize() }

// jsonOrEmpty makes sure a jsonb parameter is never SQL NULL.
func jsonOrEmpty(b json.RawMessage, empty string) string {
	if len(b) == 0 || string(b) == "null" {
		return empty
	}
	return string(b)
}

func rawFrom(s string) json.RawMessage {
	if s == "" {
		return json.RawMessage("null")
	}
	return json.RawMessage(s)
}

func marshal(v any, empty string) string {
	if v == nil {
		return empty
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return empty
	}
	return string(b)
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func (s *Store) errf(op string, err error) error { return fmt.Errorf("%s: %w", op, err) }
