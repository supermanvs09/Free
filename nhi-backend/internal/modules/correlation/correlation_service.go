package correlation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"nhi-backend-api/internal/modules/correlation/engine"
	"nhi-backend-api/internal/platform/clickhouse"
)

// computeBudget bounds one synchronous computation. The server's WriteTimeout
// is 30 s, so the answer (or the 202 that hands the work to the run queue) is
// still written in time. A variable only so a test can shorten it.
var computeBudget = 25 * time.Second

// caller is who is asking: the tenant comes from the JWT only.
type caller struct {
	TenantID string
	DBName   string // the tenant's schema
}

// Service composes the engine's calls into the six endpoints. It holds no
// per-tenant state: every call names the tenant schema.
type Service struct {
	db     *sql.DB
	engine *engine.Engine
	runs   *engine.RunStore
}

func NewService(db *sql.DB, eng *engine.Engine, runs *engine.RunStore) *Service {
	return &Service{db: db, engine: eng, runs: runs}
}

// scope is the whole tenant: every account and region (nil means no filter), so
// cross-account paths are complete and the per-ARN cache is right for any user.
func (s *Service) scope(c caller) *engine.Scope {
	return engine.BuildScope(s.db, c.DBName, nil, nil)
}

// ctx attaches the tenant so a per-tenant ClickHouse client reads its database.
func (s *Service) ctx(ctx context.Context, c caller) context.Context {
	return clickhouse.WithTenant(ctx, c.DBName)
}

// ensureProvisioned reports engine.ErrTableMissing when the tenant has no
// correlation tables yet. The engine's loaders read a missing table as "no
// rows", which would answer an empty catalog (200) or an unknown identity (404)
// for a workspace that is simply not set up; this makes every read say 503.
func (s *Service) ensureProvisioned(ctx context.Context, c caller) error {
	var ok bool
	err := s.db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`,
		engine.QualifiedTable(c.DBName, "correlation_definitions")).Scan(&ok)
	if err != nil {
		return fmt.Errorf("check the correlation tables: %w", err)
	}
	if !ok {
		return engine.ErrTableMissing
	}
	return nil
}

// withBudget runs fn under computeBudget. When the budget (not the client going
// away) ends the call, it reports errTimeout even if fn returned something: the
// engine treats a failed source as "no evidence" and carries on, so a result
// computed under an expired context may be incomplete.
func withBudget[T any](ctx context.Context, fn func(context.Context) (T, error)) (T, error) {
	bctx, cancel := context.WithTimeout(ctx, computeBudget)
	defer cancel()
	out, err := fn(bctx)
	if bctx.Err() != nil && ctx.Err() == nil {
		var zero T
		return zero, errTimeout
	}
	return out, err
}

// ── Catalog ───────────────────────────────────────────────────────────────────

// Catalog returns the requested sections of the rule catalogue. category
// narrows the rules section only.
func (s *Service) Catalog(ctx context.Context, c caller, sections map[string]bool, category string) (map[string]any, error) {
	ctx = s.ctx(ctx, c)
	if err := s.ensureProvisioned(ctx, c); err != nil {
		return nil, err
	}
	ds := s.scope(c)
	out := map[string]any{}
	if sections[sectionRules] {
		rules, err := s.engine.LoadCorrelationDefinitions(ctx, ds, category)
		if err != nil {
			return nil, fmt.Errorf("load rules: %w", err)
		}
		out[sectionRules] = nonNil(rules)
	}
	if sections[sectionComposition] {
		rules, err := s.engine.LoadCompositionRules(ctx, ds)
		if err != nil {
			return nil, fmt.Errorf("load composition rules: %w", err)
		}
		out[sectionComposition] = nonNil(rules)
	}
	if sections[sectionPathTypes] {
		types, err := s.engine.LoadPathTypes(ctx, ds)
		if err != nil {
			return nil, fmt.Errorf("load path types: %w", err)
		}
		out[sectionPathTypes] = nonNil(types)
	}
	if sections[sectionFamilies] {
		fams := s.engine.Families(ctx, ds)
		counts := map[string]int{}
		for _, f := range fams {
			counts[f.Status]++
		}
		out[sectionFamilies] = FamiliesBlock{Total: len(fams), ByStatus: counts, Items: nonNil(fams)}
	}
	return out, nil
}

// ── Blast radius ──────────────────────────────────────────────────────────────

// BlastRadius returns the identity's blast radius, from the cache or computed
// now. When the computation does not fit its budget the work is queued instead
// and the queued run is returned (the result is nil): the caller answers 202.
func (s *Service) BlastRadius(ctx context.Context, c caller, arn string, refresh, summary bool) (*engine.BlastRadiusResult, *engine.Run, error) {
	cctx := s.ctx(ctx, c)
	if err := s.ensureProvisioned(cctx, c); err != nil {
		return nil, nil, err
	}
	res, err := withBudget(cctx, func(bctx context.Context) (*engine.BlastRadiusResult, error) {
		return s.engine.ComputeBlastRadiusOpts(bctx, s.scope(c), arn, refresh)
	})
	if errors.Is(err, errTimeout) {
		run, qerr := s.runs.Enqueue(ctx, c.DBName, arn, true)
		if qerr != nil {
			return nil, nil, fmt.Errorf("queue run after timeout: %w", qerr)
		}
		return nil, run, nil
	}
	if err != nil {
		return nil, nil, err
	}
	if summary {
		res = engine.SummarizeResult(res)
	}
	return res, nil, nil
}

// ── Graph ─────────────────────────────────────────────────────────────────────

// Graph returns one step around the identity. depth > 0 also answers who can
// assume it, following chains up to depth hops; it is left out for an identity
// that is not a role with a trust policy.
func (s *Service) Graph(ctx context.Context, c caller, arn string, opts engine.NavOptions, depth int) (*GraphResponse, error) {
	cctx := s.ctx(ctx, c)
	if err := s.ensureProvisioned(cctx, c); err != nil {
		return nil, err
	}
	return withBudget(cctx, func(bctx context.Context) (*GraphResponse, error) {
		ds := s.scope(c)
		view, err := s.engine.Navigate(bctx, ds, arn, opts)
		if err != nil {
			return nil, err
		}
		resp := &GraphResponse{NavView: view}
		if depth > 0 {
			if inbound, ok := s.engine.WhoCanAssume(bctx, ds, arn, depth); ok {
				resp.Inbound = inbound
			}
		}
		return resp, nil
	})
}

// ── Paths ─────────────────────────────────────────────────────────────────────

// Paths lists explained paths from one identity to a target. Without from it
// answers the reverse question: which identities can reach the target.
func (s *Service) Paths(ctx context.Context, c caller, from, to string) (*PathsResponse, error) {
	cctx := s.ctx(ctx, c)
	if err := s.ensureProvisioned(cctx, c); err != nil {
		return nil, err
	}
	return withBudget(cctx, func(bctx context.Context) (*PathsResponse, error) {
		ds := s.scope(c)
		resp := &PathsResponse{To: to}
		var paths []engine.BlastRadiusPath
		var err error
		if from == "" {
			resp.Mode = "reverse"
			paths, err = s.engine.ReverseAccess(bctx, ds, to)
		} else {
			resp.Mode, resp.From = "forward", from
			paths, err = s.engine.PathsBetween(bctx, ds, from, to)
		}
		if err != nil {
			return nil, err
		}
		resp.Paths = nonNil(paths)
		resp.Total = len(resp.Paths)
		return resp, nil
	})
}

// ── Runs ──────────────────────────────────────────────────────────────────────

func (s *Service) CreateRun(ctx context.Context, c caller, arn string, refresh bool) (*engine.Run, error) {
	return s.runs.Enqueue(ctx, c.DBName, arn, refresh)
}

func (s *Service) Run(ctx context.Context, c caller, id string) (*engine.Run, error) {
	return s.runs.Get(ctx, c.DBName, id)
}

func (s *Service) Runs(ctx context.Context, c caller, status string, limit int) (*RunsList, error) {
	runs, err := s.runs.List(ctx, c.DBName, status, limit)
	if err != nil {
		return nil, err
	}
	return &RunsList{Total: len(runs), Runs: runs}, nil
}

// nonNil makes a nil slice an empty one, so JSON carries [] and never null.
func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
