package database

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/platform/config"
)

// NewPgxPool opens a native pgx pool on the same database (nhi_db) as the
// Manager. The remediation engine needs pgx directly (row locks with
// FOR UPDATE SKIP LOCKED, session advisory locks on one connection), so it
// gets its own small pool next to the database/sql one.
func NewPgxPool(ctx context.Context, cfg config.DatabaseConfig, maxConns int32, appName string) (*pgxpool.Pool, error) {
	connStr := strings.TrimSpace(cfg.GetConnectionString())
	if cfg.DBName() == "" || connStr == "" {
		return nil, errors.New("empty database name or connection string")
	}
	pc, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}
	if maxConns > 0 {
		pc.MaxConns = maxConns
	}
	pc.MaxConnLifetime = 30 * time.Minute
	pc.MaxConnIdleTime = 5 * time.Minute
	if appName != "" {
		pc.ConnConfig.RuntimeParams["application_name"] = appName
	}
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, fmt.Errorf("create pgx pool: %w", err)
	}
	pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}
