package alerts

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/platform/scope"
)

// inboxTTL is how long one computed inbox answers later requests. The
// console asks twice on every page load (the Alerts list and the sidebar
// badge) and the badge polls every minute; each inbox reads posture, every
// open genome anomaly (with a fleet build and an event-store query) and
// exposure. A sync changes alerts at most every few minutes.
// ponytail: per-process cache; several API replicas each compute their own.
const inboxTTL = 30 * time.Second

// inboxBudget bounds a shared computation, which runs detached from the
// request that started it so a closed tab does not fail the others waiting.
const inboxBudget = 60 * time.Second

type inboxEntry struct {
	done chan struct{}
	out  *Inbox
	err  error
	at   time.Time
}

// inboxCache shares one inbox computation between concurrent requests of the
// same user and scope, and keeps a successful result for inboxTTL.
type inboxCache struct {
	mu      sync.Mutex
	entries map[string]*inboxEntry
}

func inboxKey(ds *scope.DataScope, userID, tenantID string, canExposure bool) string {
	return strings.Join([]string{tenantID, userID, ds.Schema, strings.Join(ds.AccountIDs, ","), strings.Join(ds.Regions, ","), strconv.FormatBool(canExposure)}, "|")
}

func (h *Handler) cachedInbox(ctx context.Context, ds *scope.DataScope, userID, tenantID, dbName string, canExposure bool) (*Inbox, error) {
	return h.cache.get(ctx, inboxKey(ds, userID, tenantID, canExposure), func(run context.Context) (*Inbox, error) {
		return h.inbox(run, ds, userID, tenantID, dbName, canExposure)
	})
}

func (c *inboxCache) get(ctx context.Context, key string, compute func(context.Context) (*Inbox, error)) (*Inbox, error) {
	c.mu.Lock()
	if c.entries == nil {
		c.entries = map[string]*inboxEntry{}
	}
	e := c.entries[key]
	fresh := e != nil && (e.at.IsZero() || time.Since(e.at) < inboxTTL)
	if !fresh {
		e = &inboxEntry{done: make(chan struct{})}
		c.entries[key] = e
		for k, old := range c.entries { // drop expired entries of other users
			if !old.at.IsZero() && time.Since(old.at) >= inboxTTL {
				delete(c.entries, k)
			}
		}
		go func() {
			run, cancel := context.WithTimeout(context.WithoutCancel(ctx), inboxBudget)
			defer cancel()
			out, err := compute(run)
			c.mu.Lock()
			e.out, e.err, e.at = out, err, time.Now()
			if err != nil {
				delete(c.entries, key) // never keep a failure
			}
			c.mu.Unlock()
			close(e.done)
		}()
	}
	c.mu.Unlock()

	select {
	case <-e.done:
		return e.out, e.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
