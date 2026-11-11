package middleware

import (
	"net/http"
	"strconv"
	"time"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/ratelimit"
)

// apiLimiter caps each client address across the whole API. It is generous on
// purpose: a dashboard opens with about twenty requests at once, and several
// people can share one office address. It stops floods and scraping, not
// normal use; sign-in has its own much tighter limit.
// ponytail: per process, so N replicas allow N times the rate.
var apiLimiter = ratelimit.New(25, 200)

// RateLimit answers 429 with Retry-After once a client address has used its
// burst of 200 requests and keeps going faster than 25 a second.
func RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ok, wait := apiLimiter.Allow(ratelimit.ClientIP(r), time.Now()); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			httpx.SendJSONResponse(w, http.StatusTooManyRequests, httpx.APIResponse{
				Success: false, Message: "Too many requests. Wait a moment and try again.", Error: "RATE_LIMITED",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}
