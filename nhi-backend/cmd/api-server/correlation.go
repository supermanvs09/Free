package main

import (
	"context"
	"log/slog"

	"nhi-backend-api/internal/modules/correlation"
	"nhi-backend-api/internal/modules/correlation/engine"
	"nhi-backend-api/internal/platform/clickhouse"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/database"
)

// correlationApp is the correlation engine's API handler and the poller that
// drains every tenant's run queue. Its methods are safe on a nil receiver, so a
// disabled feature needs no checks at the call sites.
type correlationApp struct {
	handler *correlation.Handler
	poller  *engine.Poller
}

// newCorrelation builds the correlation feature on the backend's own pool of
// nhi_db. ch may be nil (ClickHouse not configured).
func newCorrelation(db *database.PostgresDB, ch *clickhouse.Client, cc config.CorrelationConfig) *correlationApp {
	handler, poller := correlation.New(db.DB, db.GlobalSchema(), ch, cc)
	return &correlationApp{handler: handler, poller: poller}
}

func (a *correlationApp) handlers() *correlation.Handler {
	if a == nil {
		return nil
	}
	return a.handler
}

// start runs the poller until ctx is cancelled.
func (a *correlationApp) start(ctx context.Context) {
	if a == nil || a.poller == nil {
		return
	}
	go a.poller.Run(ctx)
	slog.Info("correlation run queue poller started")
}
