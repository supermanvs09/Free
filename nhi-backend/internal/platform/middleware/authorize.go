package middleware

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/authz"
	"nhi-backend-api/internal/platform/logging"
)

// Authorize refuses a request the caller's role does not cover.
//
// It is mounted once, after Authenticate, on the router every API hangs off.
// The capability a route needs comes from authz.Required, which has a safe
// default (a read needs read, anything else needs write), so an endpoint added
// later is covered without a line being added here or in its handler.
//
// Handlers that already check a role of their own keep doing so: this is the
// gate, those are defence in depth.
func (m *AuthMiddleware) Authorize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r)
		if claims == nil {
			// Authenticate runs first and refuses anonymous callers; reaching
			// here means the two were mounted in the wrong order.
			respondError(w, r, http.StatusUnauthorized, "Sign in to continue", "UNAUTHORIZED")
			return
		}
		role := authz.NormalizeRole(claims.Role)
		cap := authz.Required(r.Method, routeTemplate(r))
		if authz.Can(role, cap) {
			next.ServeHTTP(w, r)
			return
		}
		logging.FromContext(r.Context()).Warn("authorization refused",
			"role", string(role), "capability", string(cap), "route", routeTemplate(r), "method", r.Method)
		respondError(w, r, http.StatusForbidden,
			"Your role cannot do this. "+authz.Needs(cap),
			"FORBIDDEN")
	})
}

// routeTemplate is the pattern mux matched, so the rule does not depend on the
// ids in a particular URL.
func routeTemplate(r *http.Request) string {
	if route := mux.CurrentRoute(r); route != nil {
		if tpl, err := route.GetPathTemplate(); err == nil && tpl != "" {
			return tpl
		}
	}
	return r.URL.Path
}
