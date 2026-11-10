// Package engine is the platform-agnostic remediation engine: it decides WHAT
// to change (plans, approvals, execution queue, batches, audit, rollback)
// and calls a provider that knows HOW.
package engine

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/remediation/catalog"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/migrate"
	"nhi-backend-api/internal/remediation/provider"
	"nhi-backend-api/internal/remediation/store"
	"nhi-backend-api/internal/remediation/tenants"
)

// Error carries an HTTP status for the API layer.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func badRequest(f string, a ...any) error {
	return &Error{http.StatusBadRequest, "invalid_request", fmt.Sprintf(f, a...)}
}
func conflict(f string, a ...any) error {
	return &Error{http.StatusConflict, "conflict", fmt.Sprintf(f, a...)}
}
func forbidden(f string, a ...any) error {
	return &Error{http.StatusForbidden, "forbidden", fmt.Sprintf(f, a...)}
}
func notFoundErr(what string) error {
	return &Error{http.StatusNotFound, "not_found", what + " not found"}
}

// ScanClient asks the ispm-worker to rescan a tenant.
type ScanClient interface {
	RequestScan(ctx context.Context, tenantID, requestedBy string) (string, error)
}

// ScanClientFunc adapts a function to ScanClient (main wires it to the
// backend's ispm-worker client).
type ScanClientFunc func(ctx context.Context, tenantID, requestedBy string) (string, error)

func (f ScanClientFunc) RequestScan(ctx context.Context, tenantID, requestedBy string) (string, error) {
	return f(ctx, tenantID, requestedBy)
}

type Service struct {
	cfg     *config.RemediationConfig
	res     *tenants.Resolver
	prov    *provider.Registry
	scan    ScanClient
	log     *slog.Logger
	oneTime *oneTimeStore

	ready sync.Map // tenant id -> struct{}: migrated + seeded
	now   func() time.Time
}

func New(cfg *config.RemediationConfig, res *tenants.Resolver, prov *provider.Registry, scan ScanClient, log *slog.Logger) *Service {
	return &Service{cfg: cfg, res: res, prov: prov, scan: scan, log: log, oneTime: newOneTimeStore(10 * time.Minute), now: time.Now}
}

func (s *Service) OneTime() *oneTimeStore { return s.oneTime }

// Store returns the store of a tenant, creating / upgrading its remediation
// tables and seeding the catalog on first use.
func (s *Service) Store(ctx context.Context, tenantID string) (*store.Store, error) {
	t, ok, err := s.res.Find(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if !ok {
		if s.res.Restricted() {
			return nil, &Error{http.StatusNotFound, "not_found", "remediation is not enabled for this tenant (see REMEDIATION_TENANTS)"}
		}
		return nil, notFoundErr("tenant " + tenantID)
	}
	return s.storeFor(ctx, t)
}

func (s *Service) storeFor(ctx context.Context, t tenants.Tenant) (*store.Store, error) {
	tg, err := s.res.Target(ctx, t)
	if err != nil {
		return nil, err
	}
	st := store.New(tg)
	if _, done := s.ready.Load(t.ID); done {
		return st, nil
	}
	if !migrate.ValidSchema(tg.EngineSchema) {
		return nil, fmt.Errorf("invalid schema name %q", tg.EngineSchema)
	}
	if s.cfg.AutoMigrate {
		if err := migrate.Ensure(ctx, tg.Pool, tg.EngineSchema, s.log); err != nil {
			return nil, err
		}
	}
	if err := catalog.Seed(ctx, st); err != nil {
		return nil, fmt.Errorf("seed catalog: %w", err)
	}
	s.ready.Store(t.ID, struct{}{})
	return st, nil
}

// Stores returns the ready store of every tenant; a tenant that cannot be prepared is logged and skipped.
func (s *Service) Stores(ctx context.Context) []*store.Store {
	list, err := s.res.List(ctx)
	if err != nil {
		s.log.Error("cannot read tenants", "err", err)
		return nil
	}
	var out []*store.Store
	for _, t := range list {
		st, err := s.storeFor(ctx, t)
		if err != nil {
			s.log.Error("tenant not ready", "tenant", t.ID, "err", err)
			continue
		}
		out = append(out, st)
	}
	return out
}

// EachTenant runs fn for every tenant; one failing tenant does not stop the others.
func (s *Service) EachTenant(ctx context.Context, fn func(ctx context.Context, st *store.Store) error) {
	for _, st := range s.Stores(ctx) {
		if err := fn(ctx, st); err != nil {
			s.log.Error("tenant job failed", "tenant", st.TenantID, "err", err)
		}
	}
}

func newID() string { return uuid.NewString() }

func requireRole(a domain.Actor, p domain.Permission) error {
	if !a.Role.Can(p) {
		return forbidden("role %q may not do this (%s)", a.Role, p)
	}
	return nil
}

func isStoreNotFound(err error) bool { return errors.Is(err, store.ErrNotFound) }

// oneTimeStore holds values (new access keys) that are shown once and never
// written to the database.
type oneTimeStore struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[string]oneTimeEntry
}

type oneTimeEntry struct {
	v   map[string]string
	exp time.Time
}

func newOneTimeStore(ttl time.Duration) *oneTimeStore {
	return &oneTimeStore{ttl: ttl, m: map[string]oneTimeEntry{}}
}

func (o *oneTimeStore) Put(id string, v map[string]string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	now := time.Now()
	for k, e := range o.m {
		if now.After(e.exp) {
			delete(o.m, k)
		}
	}
	o.m[id] = oneTimeEntry{v, now.Add(o.ttl)}
}

// Take returns the value once.
func (o *oneTimeStore) Take(id string) (map[string]string, bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	e, ok := o.m[id]
	delete(o.m, id)
	if !ok || time.Now().After(e.exp) {
		return nil, false
	}
	return e.v, true
}
