package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/ratelimit"
)

// apiLimiter caps each client address across the whole API for requests that
// carry no sign-in. It stops floods and scraping, not normal use; sign-in has
// its own much tighter limit.
// ponytail: per process, so N replicas allow N times the rate.
var apiLimiter = ratelimit.New(25, 200)

// signedInIPLimiter is the address-level backstop for requests that do carry a
// bearer token. Behind a CDN or proxy many people can share one address, so it
// is far above what a person needs; the real limit for them is per user
// (UserRateLimit, after authentication). A forged token gets nothing from
// this: it is refused before any work is done.
var signedInIPLimiter = ratelimit.New(250, 2000)

// userLimiter caps each signed-in user: a dashboard opens with about twenty
// requests at once and pages poll, so the burst is large; a runaway client
// still hits the rate.
var userLimiter = ratelimit.New(40, 400)

func tooMany(w http.ResponseWriter, wait time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
	httpx.SendJSONResponse(w, http.StatusTooManyRequests, httpx.APIResponse{
		Success: false, Message: "Too many requests. Wait a moment and try again.", Error: "RATE_LIMITED",
	})
}

// RateLimit answers 429 with Retry-After once a client address has used its
// burst. Requests with a bearer token get the high backstop limit here and
// their real, per-user limit after authentication.
func RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limiter := apiLimiter
		if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			limiter = signedInIPLimiter
		}
		if ok, wait := limiter.Allow(ratelimit.ClientIP(r), time.Now()); !ok {
			tooMany(w, wait)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// UserRateLimit limits each signed-in user on their own, whatever address they
// share with others. It must run after Authenticate.
func UserRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c := GetClaims(r); c != nil {
			if ok, wait := userLimiter.Allow(c.TenantID+"|"+c.UserID, time.Now()); !ok {
				tooMany(w, wait)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
