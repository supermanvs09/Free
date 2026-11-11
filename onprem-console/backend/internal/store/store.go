// Package store is the console's Postgres access: schema at start, then one
// small function per read or write the API needs.
package store

import (
	"context"
	"embed"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct{ DB *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: %w", err)
	}
	return &Store{DB: pool}, nil
}

// Migrate applies every migration in order. Each is idempotent.
func (s *Store) Migrate(ctx context.Context) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		sql, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		if _, err := s.DB.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
	}
	return nil
}

func (s *Store) Audit(ctx context.Context, actor, action, target, detail string) {
	_, _ = s.DB.Exec(ctx, `INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, $2, $3, $4)`, actor, action, target, detail)
}
