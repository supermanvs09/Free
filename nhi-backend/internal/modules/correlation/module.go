package correlation

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"nhi-backend-api/internal/modules/correlation/engine"
	"nhi-backend-api/internal/platform/clickhouse"
	"nhi-backend-api/internal/platform/config"
)

// New builds the feature: the HTTP handler and the poller that drains every
// tenant's run queue. The caller registers the handler's routes and starts the
// poller (go poller.Run(ctx)); nothing else in the backend needs to know the
// engine exists.
//
// ch may be nil (ClickHouse not configured): the engine then runs without
// observed-activity evidence, exactly as it does when ClickHouse is down.
func New(db *sql.DB, globalSchema string, ch *clickhouse.Client, cfg config.CorrelationConfig) (*Handler, *engine.Poller) {
	eng := engine.NewEngine(engine.NewPGRepo(cloudTrail(ch)))
	runs := engine.NewRunStore(db)
	handler := NewHandler(NewService(db, eng, runs))
	poller := engine.NewPoller(db, runs, eng, tenantSchemas(db, globalSchema), cfg.PollInterval).
		WithTenantContext(clickhouse.WithTenant).
		WithCachePurge(func(ctx context.Context, schema string) (int64, error) {
			return engine.PurgeExpiredCache(ctx, db, schema)
		})
	return handler, poller
}

// tenantSchemas lists the schemas of the registered tenants. A name that is not
// a safe identifier is skipped (and logged), never used.
func tenantSchemas(db *sql.DB, globalSchema string) engine.TenantLister {
	query := fmt.Sprintf(`SELECT db_name FROM %s WHERE db_name IS NOT NULL ORDER BY db_name`,
		engine.QualifiedTable(globalSchema, "tenants"))
	return func(ctx context.Context) ([]string, error) {
		rows, err := db.QueryContext(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("list tenants: %w", err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				return nil, fmt.Errorf("scan tenant: %w", err)
			}
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			if err := config.ValidateSchemaName(name); err != nil {
				slog.Warn("correlation: skipping tenant with an unsafe schema name", "db_name", name)
				continue
			}
			out = append(out, name)
		}
		return out, rows.Err()
	}
}

// cloudTrail adapts the backend's ClickHouse client to the engine's evidence
// source. It asks the client whether it is up on every call, so evidence
// switches on when ClickHouse comes back and off while it is away.
func cloudTrail(ch *clickhouse.Client) engine.CHQuerier {
	if ch == nil || ch.Conn() == nil {
		return engine.NullCHClient{}
	}
	return &cloudTrailSource{
		client:  ch,
		adapter: engine.NewCHAdapter(ch.Conn(), ch.TableFor, ch.Timeout()),
	}
}

type cloudTrailSource struct {
	client  *clickhouse.Client
	adapter *engine.CHAdapter
}

func (s *cloudTrailSource) Enabled() bool { return s.client.Up() && s.adapter.Enabled() }

func (s *cloudTrailSource) QueryObservedActivity(ctx context.Context, arn string, accounts []string, limit int) ([]engine.ObservedEvent, error) {
	if !s.Enabled() {
		return nil, nil
	}
	return s.adapter.QueryObservedActivity(ctx, arn, accounts, limit)
}

func (s *cloudTrailSource) QueryAssumeObservations(ctx context.Context, accounts []string, limit int) ([]engine.AssumeObservation, error) {
	if !s.Enabled() {
		return nil, nil
	}
	return s.adapter.QueryAssumeObservations(ctx, accounts, limit)
}
