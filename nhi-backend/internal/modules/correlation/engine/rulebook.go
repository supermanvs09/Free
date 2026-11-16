package engine

import (
	"context"
	"sync"
	"time"
)

// RuleBook is the engine's view of the rule tables (correlation_definitions,
// correlation_composition_rules, correlation_path_types). It decides which
// phases run, which path types may be emitted, how many hops a chain may have
// and which limitations every path of a type carries. When the tables are
// missing or empty the zero value is used and the engine's built-in defaults apply.
type RuleBook struct {
	loaded       bool
	phaseEnabled map[int]bool
	pathTypes    map[string]PathType
	multiPath    bool
	fam          map[string]bool // composition family id -> is_active; nil when the table has no family rows
}

// PhaseEnabled reports whether any active correlation rule belongs to phase.
func (rb *RuleBook) PhaseEnabled(phase int) bool {
	if rb == nil || !rb.loaded || len(rb.phaseEnabled) == 0 {
		return true
	}
	return rb.phaseEnabled[phase]
}

// PathActive reports whether a path type may be emitted.
func (rb *RuleBook) PathActive(pathID string) bool {
	if rb == nil || !rb.loaded {
		return true
	}
	pt, ok := rb.pathTypes[pathID]
	return !ok || pt.IsActive
}

// MaxHops returns the path type's max_hops, or def if it has none.
func (rb *RuleBook) MaxHops(pathID string, def int) int {
	if rb != nil && rb.loaded {
		if pt, ok := rb.pathTypes[pathID]; ok && pt.MaxHops > 0 {
			return pt.MaxHops
		}
	}
	return def
}

// Limitations merges the path type's limitations with extra ones, without duplicates.
func (rb *RuleBook) Limitations(pathID string, extra ...string) []string {
	out := []string{}
	add := func(s string) {
		if s != "" && !containsString(out, s) {
			out = append(out, s)
		}
	}
	if rb != nil && rb.loaded {
		if pt, ok := rb.pathTypes[pathID]; ok {
			for _, l := range pt.Limitations {
				add(l)
			}
		}
	}
	for _, l := range extra {
		add(l)
	}
	return out
}

// MultiPathEnabled reports whether converging-path detection (RULE-010) is on.
func (rb *RuleBook) MultiPathEnabled() bool {
	if rb == nil || !rb.loaded {
		return true
	}
	return rb.multiPath
}

// ruleCache holds one RuleBook per tenant schema: every tenant has its own rule
// and family switches, so a book loaded for one must never serve another.
type ruleCache struct {
	mu    sync.Mutex
	books map[string]ruleEntry
}

type ruleEntry struct {
	book    *RuleBook
	expires time.Time
}

const ruleCacheTTL = 5 * time.Minute

// ruleBook returns the tenant's cached RuleBook, reloading it from PG when stale.
// The lock is not held across the loads, so a slow tenant does not block others;
// two concurrent misses may both load, which is harmless.
func (e *Engine) ruleBook(ctx context.Context, ds *Scope) *RuleBook {
	e.rules.mu.Lock()
	ent, ok := e.rules.books[ds.Schema]
	e.rules.mu.Unlock()
	if ok && time.Now().Before(ent.expires) {
		return ent.book
	}

	rb := &RuleBook{phaseEnabled: map[int]bool{}, pathTypes: map[string]PathType{}, multiPath: true}
	defs, errD := e.repo.LoadCorrelationDefinitions(ctx, ds, "")
	pts, errP := e.repo.LoadPathTypes(ctx, ds)
	comps, errC := e.repo.LoadCompositionRules(ctx, ds)
	if errD == nil && errP == nil && len(defs) > 0 && len(pts) > 0 {
		rb.loaded = true
		for _, d := range defs {
			if d.IsActive {
				rb.phaseEnabled[d.Phase] = true
			}
		}
		for _, pt := range pts {
			rb.pathTypes[pt.PathID] = pt
		}
		if errC == nil && len(comps) > 0 {
			rb.multiPath = false
			for _, c := range comps {
				if c.RuleID == "RULE-010" && c.IsActive {
					rb.multiPath = true
				}
			}
		}
	}
	if states, err := e.repo.LoadFamilyStates(ctx, ds); err == nil && len(states) > 0 {
		rb.fam = states
	}
	e.rules.mu.Lock()
	if e.rules.books == nil {
		e.rules.books = map[string]ruleEntry{}
	}
	e.rules.books[ds.Schema] = ruleEntry{book: rb, expires: time.Now().Add(ruleCacheTTL)}
	e.rules.mu.Unlock()
	return rb
}
