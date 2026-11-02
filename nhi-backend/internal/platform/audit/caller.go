package audit

import (
	"context"
	"net/http"
	"sync"
)

// The audit middleware sits outside authentication so that it records a
// request whichever way it ends - including one refused before any handler
// ran, and a sign-in, where there is no caller until it succeeds.
//
// That means it cannot read the caller from the context it passed downstream:
// the request the authenticator enriched only exists below it. So it puts an
// empty holder in the context on the way in, and whoever learns who the caller
// is fills it in. Reading it afterwards is how the entry gets a name.

type holderKey struct{}

type holder struct {
	mu sync.Mutex
	c  Caller
}

// WithHolder returns a context carrying somewhere to record the caller.
func WithHolder(ctx context.Context) context.Context {
	return context.WithValue(ctx, holderKey{}, &holder{})
}

// SetCaller names who made this request. Called by the authentication
// middleware once a token has been checked, and by the sign-in handler once a
// password has been. Safe to call more than once; the last call wins.
func SetCaller(ctx context.Context, c Caller) {
	if h, ok := ctx.Value(holderKey{}).(*holder); ok {
		h.mu.Lock()
		h.c = c
		h.mu.Unlock()
	}
}

// CallerFrom reads back what SetCaller recorded.
func CallerFrom(r *http.Request) Caller {
	if r == nil {
		return Caller{}
	}
	if h, ok := r.Context().Value(holderKey{}).(*holder); ok {
		h.mu.Lock()
		defer h.mu.Unlock()
		return h.c
	}
	return Caller{}
}
