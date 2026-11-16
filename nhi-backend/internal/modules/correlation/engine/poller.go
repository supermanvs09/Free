package engine

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// TenantLister returns the schema names of the tenants to serve. Every name it
// returns must already be validated as a safe SQL identifier.
type TenantLister func(ctx context.Context) ([]string, error)

// Poller drains the correlation_engine_runs queue of every tenant, computing one
// blast radius per run.
type Poller struct {
	db       *sql.DB
	store    *RunStore
	engine   *Engine
	tenants  TenantLister
	interval time.Duration
	timeout  time.Duration

	// withTenant puts the tenant on the context so a per-tenant ClickHouse
	// client reads that tenant's database. Optional.
	withTenant func(ctx context.Context, schema string) context.Context

	// purge removes expired cache rows of a tenant; it runs about once an hour.
	purge     func(ctx context.Context, schema string) (int64, error)
	lastPurge time.Time
}

const purgeEvery = time.Hour

func NewPoller(db *sql.DB, store *RunStore, engine *Engine, tenants TenantLister, interval time.Duration) *Poller {
	if interval <= 0 {
		interval = 5 * time.Second
	}
	return &Poller{db: db, store: store, engine: engine, tenants: tenants, interval: interval, timeout: 2 * time.Minute}
}

// WithTenantContext sets how a tenant is attached to the context of its runs.
func (p *Poller) WithTenantContext(fn func(ctx context.Context, schema string) context.Context) *Poller {
	p.withTenant = fn
	return p
}

// WithCachePurge enables the hourly purge of expired cache rows.
func (p *Poller) WithCachePurge(fn func(ctx context.Context, schema string) (int64, error)) *Poller {
	p.purge = fn
	return p
}

// Run polls until ctx is cancelled. Safe to run in several instances.
func (p *Poller) Run(ctx context.Context) {
	p.failStaleRuns(ctx)
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		p.tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// tick drains every tenant's queue once, then purges the cache if it is due.
func (p *Poller) tick(ctx context.Context) {
	schemas, err := p.tenants(ctx)
	if err != nil {
		log.Printf("WARNING: correlation poller: list tenants: %v", err)
		return
	}
	for _, schema := range schemas {
		for p.processOne(ctx, schema) { // drain everything queued before moving on
		}
	}
	if p.purge != nil && time.Since(p.lastPurge) >= purgeEvery {
		p.lastPurge = time.Now()
		for _, schema := range schemas {
			n, err := p.purge(ctx, schema)
			switch {
			case err != nil && !isMissingTable(err):
				log.Printf("WARNING: correlation: purge cache of %s: %v", schema, err)
			case err == nil && n > 0:
				log.Printf("correlation: purged %d expired blast radius entries of %s", n, schema)
			}
		}
	}
}

func (p *Poller) failStaleRuns(ctx context.Context) {
	schemas, err := p.tenants(ctx)
	if err != nil {
		log.Printf("WARNING: correlation poller: list tenants: %v", err)
		return
	}
	for _, schema := range schemas {
		p.store.failStale(ctx, schema, 2*p.timeout)
	}
}

// processOne claims and runs one pending run of a tenant; it reports whether it
// ran one. A tenant without the correlation tables (not migrated yet) is skipped.
func (p *Poller) processOne(ctx context.Context, schema string) bool {
	if ctx.Err() != nil {
		return false
	}
	run, err := p.store.claim(ctx, schema)
	if err != nil {
		if !isMissingTable(err) {
			log.Printf("WARNING: correlation poller: claim in %s: %v", schema, err)
		}
		return false
	}
	if run == nil {
		return false
	}

	rctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()
	if p.withTenant != nil {
		rctx = p.withTenant(rctx, schema)
	}

	var total int
	scope := BuildScope(p.db, schema, nil, nil)
	res, runErr := p.engine.ComputeBlastRadiusOpts(rctx, scope, run.SourceARN, run.Refresh)
	if runErr == nil && res != nil {
		total = res.TotalPaths
	} else if runErr == nil {
		runErr = fmt.Errorf("no result")
	}
	// Finish with a fresh context so a cancelled run is still recorded.
	fctx, fcancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer fcancel()
	if err := p.store.finish(fctx, schema, run.ID, total, runErr); err != nil {
		log.Printf("WARNING: correlation poller: finish %s in %s: %v", run.ID, schema, err)
	}
	if runErr != nil {
		log.Printf("correlation run %s (%s, %s) failed: %v", run.ID, schema, run.SourceARN, runErr)
	} else {
		log.Printf("correlation run %s (%s, %s) completed: %d paths", run.ID, schema, run.SourceARN, total)
	}
	return true
}
