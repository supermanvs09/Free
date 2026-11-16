package alerts

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestInboxCacheSharesAndKeeps(t *testing.T) {
	var c inboxCache
	var calls atomic.Int32
	release := make(chan struct{})
	compute := func(context.Context) (*Inbox, error) {
		calls.Add(1)
		<-release
		return &Inbox{}, nil
	}
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ { // the list and the badge asking at once
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.get(context.Background(), "k", compute); err != nil {
				t.Error(err)
			}
		}()
	}
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()
	if _, err := c.get(context.Background(), "k", compute); err != nil {
		t.Fatal(err)
	}
	if n := calls.Load(); n != 1 {
		t.Fatalf("computed %d times, want 1", n)
	}
	if _, _ = c.get(context.Background(), "other", compute); calls.Load() != 2 {
		t.Fatal("another key must compute on its own")
	}
}

func TestInboxCacheDropsFailures(t *testing.T) {
	var c inboxCache
	n := 0
	fail := func(context.Context) (*Inbox, error) { n++; return nil, errors.New("down") }
	_, _ = c.get(context.Background(), "k", fail)
	_, _ = c.get(context.Background(), "k", fail)
	if n != 2 {
		t.Fatalf("a failure was cached: %d computations", n)
	}
}
