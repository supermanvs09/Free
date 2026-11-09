package middleware

import "net/http"

// SecurityHeaders sets the response headers every API answer carries. The API
// serves JSON only, so its policy is the strictest one: nothing may load, frame
// or cache a response. nginx in front of the console hides its own copies on
// /api so a browser never receives a header twice.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("X-Permitted-Cross-Domain-Policies", "none")
		h.Set("Cache-Control", "no-store")
		h.Set("Pragma", "no-cache")
		next.ServeHTTP(w, r)
	})
}
