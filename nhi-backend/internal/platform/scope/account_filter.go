package scope

import (
	"context"
	"net/http"
	"regexp"
	"strings"
)

// AccountFilterParam is the query parameter a screen's "AWS account" filter
// sends: comma-separated 12-digit account ids. It narrows what the user's saved
// scope already allows, never widens it, for every scoped read on that request.
const AccountFilterParam = "account_filter"

type accountFilterKey struct{}

var accountFilterRE = regexp.MustCompile(`^\d{12}$`)

// WithAccountFilter carries a per-request account narrowing to Resolve.
func WithAccountFilter(ctx context.Context, ids []string) context.Context {
	return context.WithValue(ctx, accountFilterKey{}, ids)
}

// AccountFilterMiddleware moves ?account_filter= out of the query (handlers
// reject parameters they do not know) and into the request context. Only GET
// reads are filtered, so a write never acts on a narrowed scope by accident.
func AccountFilterMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		raw, has := q[AccountFilterParam]
		if !has {
			next.ServeHTTP(w, r)
			return
		}
		q.Del(AccountFilterParam)
		r.URL.RawQuery = q.Encode()
		if r.Method == http.MethodGet {
			ids := []string{} // non-nil: a filter that matches nothing yields no rows
			for _, part := range strings.Split(strings.Join(raw, ","), ",") {
				if part = strings.TrimSpace(part); accountFilterRE.MatchString(part) {
					ids = append(ids, part)
				}
			}
			r = r.WithContext(WithAccountFilter(r.Context(), ids))
		}
		next.ServeHTTP(w, r)
	})
}

// narrowAccounts keeps the saved-scope accounts that are in the request's filter.
func narrowAccounts(ctx context.Context, accounts []string) []string {
	want, ok := ctx.Value(accountFilterKey{}).([]string)
	if !ok {
		return accounts
	}
	out := make([]string, 0, len(accounts))
	for _, a := range accounts {
		for _, w := range want {
			if a == w {
				out = append(out, a)
				break
			}
		}
	}
	return out
}
