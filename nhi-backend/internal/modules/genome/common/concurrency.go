package common

import (
	"context"
	"fmt"
	"sync"

	"golang.org/x/sync/errgroup"
)

// RunParallel runs independent read operations concurrently while preserving
// the caller's deadline, cancellation, and tenant scope.
//
// Use it only for genuinely independent I/O, such as PostgreSQL alert counts
// and ClickHouse event facts. Do not use it for operations that must remain
// serially consistent or share a database transaction.
//
// Each task receives a derived context. If any task fails, the group cancels
// the remaining tasks and returns the first error.
func RunParallel(ctx context.Context, ops map[string]func(context.Context) error) error {
	if len(ops) == 0 {
		return nil
	}

	g, ctx := errgroup.WithContext(ctx)
	var mu sync.Mutex
	started := make(map[string]bool, len(ops))

	for name, op := range ops {
		name, op := name, op
		g.Go(func() error {
			mu.Lock()
			started[name] = true
			mu.Unlock()

			if err := op(ctx); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			return nil
		})
	}

	return g.Wait()
}
