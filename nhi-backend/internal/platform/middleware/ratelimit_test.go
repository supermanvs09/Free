package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRateLimit(t *testing.T) {
	h := RateLimit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	codes := map[int]int{}
	for i := 0; i < 260; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/x", nil)
		req.RemoteAddr = "203.0.113.9:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		codes[rec.Code]++
	}
	if codes[200] < 200 || codes[429] == 0 {
		t.Fatalf("burst of 200 then 429 expected, got %v", codes)
	}
	other := httptest.NewRequest(http.MethodGet, "/api/v1/x", nil)
	other.RemoteAddr = "203.0.113.10:1"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, other)
	if rec.Code != 200 {
		t.Fatal("another address was limited")
	}
}

// Many users behind one address (a CDN, an office) must not starve each
// other: with a bearer token the address limit is only a high backstop.
func TestRateLimitSharedAddressSignedIn(t *testing.T) {
	h := RateLimit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	limited := 0
	for i := 0; i < 600; i++ { // 600 requests from many users through one edge address
		req := httptest.NewRequest(http.MethodGet, "/api/v1/x", nil)
		req.RemoteAddr = "203.0.113.50:1234"
		req.Header.Set("Authorization", "Bearer user-token")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited != 0 {
		t.Fatalf("%d signed-in requests were refused on a shared address", limited)
	}
}
