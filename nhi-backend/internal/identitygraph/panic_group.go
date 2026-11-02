package identitygraph

import (
	"fmt"
	"runtime/debug"
	"sync"
)

// panicGroup is a sync.WaitGroup for request-scoped goroutines that keeps a
// panic in one of them from killing the process. Use it exactly like a
// WaitGroup with `defer wg.Done()` first in each goroutine: Done is then the
// deferred call, so its recover() catches the goroutine's panic. Wait
// re-raises it in the request goroutine, where middleware.Recoverer turns it
// into a 500.
type PanicGroup struct {
	sync.WaitGroup
	mu       sync.Mutex
	panicked any
}

func (g *PanicGroup) Done() {
	if p := recover(); p != nil {
		g.mu.Lock()
		if g.panicked == nil {
			g.panicked = fmt.Sprintf("%v\n%s", p, debug.Stack())
		}
		g.mu.Unlock()
	}
	g.WaitGroup.Done()
}

func (g *PanicGroup) Wait() {
	g.WaitGroup.Wait()
	if g.panicked != nil {
		panic(g.panicked)
	}
}
