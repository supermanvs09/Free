package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/correlation"
)

// The correlation API is six routes, mounted below /api/v1 and /api.
func TestCorrelationRoutes(t *testing.T) {
	for _, prefix := range []string{"/api/v1", "/api"} {
		r := mux.NewRouter()
		registerCorrelation(r.PathPrefix(prefix).Subrouter(), &correlation.Handler{})

		for _, c := range []struct{ method, path string }{
			{"GET", "/correlation/catalog"},
			{"GET", "/correlation/blast-radius"},
			{"GET", "/correlation/graph"},
			{"GET", "/correlation/paths"},
			{"GET", "/correlation/runs"},
			{"POST", "/correlation/runs"},
		} {
			var m mux.RouteMatch
			if !r.Match(httptest.NewRequest(c.method, prefix+c.path, nil), &m) {
				t.Errorf("%s %s%s: no route", c.method, prefix, c.path)
			}
		}

		// Reads are GET-only; only the run queue takes a POST.
		for _, c := range []struct{ method, path string }{
			{"POST", "/correlation/catalog"},
			{"POST", "/correlation/blast-radius"},
			{"DELETE", "/correlation/runs"},
		} {
			var m mux.RouteMatch
			if r.Match(httptest.NewRequest(c.method, prefix+c.path, nil), &m) {
				t.Errorf("%s %s%s must not be routed", c.method, prefix, c.path)
			}
		}

		// The standalone engine's thirteen paths are gone: ARNs are query parameters now.
		for _, path := range []string{
			"/correlations/rules",
			"/correlation/rules",
			"/correlation/composition-rules",
			"/correlation/path-types",
			"/correlation/families",
			"/correlation/path",
			"/correlation/blast-radius/arn:aws:iam::111111111111:role/DevRole",
			"/correlation/graph/arn:aws:iam::111111111111:role/DevRole",
			"/correlation/who-can-assume/arn:aws:iam::111111111111:role/DevRole",
			"/correlation/reverse-access/arn:aws:s3:::reports",
			"/correlation/runs/0b7a1f4e-1c1f-4c55-9d52-2f1d5a1f9a10",
		} {
			var m mux.RouteMatch
			if r.Match(httptest.NewRequest(http.MethodGet, prefix+path, nil), &m) {
				t.Errorf("GET %s%s must not exist any more", prefix, path)
			}
		}
	}
}

func TestCorrelationRoutesSkippedWhenDisabled(t *testing.T) {
	r := mux.NewRouter()
	registerCorrelation(r, nil)
	var m mux.RouteMatch
	if r.Match(httptest.NewRequest("GET", "/correlation/catalog", nil), &m) {
		t.Error("a disabled feature registers no routes")
	}
}
