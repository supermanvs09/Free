package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"nhi-backend-api/internal/modules/ispmworker"
	"nhi-backend-api/internal/modules/remediation"
	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/secrets"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/provider"
	awsprov "nhi-backend-api/internal/remediation/provider/aws"
	"nhi-backend-api/internal/remediation/store"
	"nhi-backend-api/internal/remediation/tenants"
	remworker "nhi-backend-api/internal/remediation/worker"
)

// remediationApp is the remediation engine, its API handlers and its
// background worker (execution queue, reconcile, Jira sync, e-mail outbox).
type remediationApp struct {
	Handlers *remediation.Handlers
	pool     *pgxpool.Pool
	worker   *remworker.Worker
	cancel   context.CancelFunc
	done     chan struct{}
}

// newRemediation builds the remediation engine on its own pgx pool of nhi_db.
// The rescan after a change goes through the backend's ispm-worker client.
func newRemediation(cfg *config.Config, rc *config.RemediationConfig) (*remediationApp, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	store.SetEnvIntegrations(rc.Integrations) // Jira / e-mail platform defaults
	store.AccountsTable = rc.AccountsTable    // shared accounts table (account_id)
	pool, err := database.NewPgxPool(ctx, cfg.Database, int32(4*rc.Worker.Concurrency+8), "nhi-backend-remediation")
	if err != nil {
		return nil, fmt.Errorf("remediation database pool: %w", err)
	}
	factory, err := awsconnect.NewFactory(ctx, rc.AWS.Region, rc.AWS.PlatformRoleARN, rc.AWS.SessionDuration)
	if err != nil {
		pool.Close()
		return nil, err
	}
	aws := awsprov.New(factory, awsprov.Options{UsageWindowDays: rc.Worker.UsageWindowDays, MinKeyIdleDays: rc.Worker.MinKeyIdleDays})

	var scan engine.ScanClient
	worker := ispmworker.NewClient(ispmworker.WorkerConfig{BaseURL: cfg.Worker.BaseURL, Token: cfg.Worker.ScanToken,
		Timeout: time.Duration(cfg.Worker.TimeoutSeconds) * time.Second})
	if worker.Enabled() {
		scan = engine.ScanClientFunc(func(ctx context.Context, tenantID, requestedBy string) (string, error) {
			res, err := worker.Start(ctx, tenantID, requestedBy)
			if err != nil {
				return "", err
			}
			return res.JobID, nil
		})
	} else {
		slog.Warn("remediation: WORKER_URL / WORKER_SCAN_TOKEN not set, no rescan is requested after a change")
	}

	core := engine.New(rc, tenants.NewResolver(pool, cfg.Database.Schema).WithOnly(rc.Tenants), provider.NewRegistry(aws), scan, slog.Default().With("component", "remediation"))
	if len(rc.Tenants) > 0 {
		slog.Info("remediation: limited to these tenants", "tenants", rc.Tenants)
	}
	if rc.Safety.DryRunOnly {
		slog.Warn("remediation: REMEDIATOR_DRY_RUN_ONLY is on, executions are simulated and nothing is written to AWS")
	}
	return &remediationApp{
		Handlers: remediation.NewHandlers(core),
		pool:     pool,
		worker:   remworker.New(rc, core, secrets.New(rc.AWS.Region), slog.Default().With("component", "remediation-worker")),
	}, nil
}

// handlers returns the API handlers, nil when remediation is disabled.
func (a *remediationApp) handlers() *remediation.Handlers {
	if a == nil {
		return nil
	}
	return a.Handlers
}

// Start runs the background worker until Stop.
func (a *remediationApp) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	a.cancel, a.done = cancel, make(chan struct{})
	go func() {
		defer close(a.done)
		a.worker.Run(ctx)
	}()
	slog.Info("remediation worker started")
}

// Stop stops the loops, waits for running executions to finish (a change in
// AWS is never cut in the middle) and closes the pool.
func (a *remediationApp) Stop() {
	if a == nil {
		return
	}
	if a.cancel != nil {
		a.cancel()
		<-a.done
	}
	a.pool.Close()
}
