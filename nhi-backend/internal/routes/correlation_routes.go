package routes

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/correlation"
)

// CorrelationBasePath is where the correlation API is mounted, below /api/v1
// (and /api). Change this one constant to move all six endpoints.
const CorrelationBasePath = "/correlation"

// registerCorrelation mounts the six endpoints of the correlation engine:
// catalog, blast-radius, graph, paths and runs (POST queues, GET reads).
func registerCorrelation(router *mux.Router, h *correlation.Handler) {
	if h == nil {
		return
	}
	r := router.PathPrefix(CorrelationBasePath).Subrouter()
	r.HandleFunc("/catalog", h.Catalog).Methods(http.MethodGet)
	r.HandleFunc("/blast-radius", h.BlastRadius).Methods(http.MethodGet)
	r.HandleFunc("/graph", h.Graph).Methods(http.MethodGet)
	r.HandleFunc("/paths", h.Paths).Methods(http.MethodGet)
	r.HandleFunc("/runs", h.CreateRun).Methods(http.MethodPost)
	r.HandleFunc("/runs", h.Runs).Methods(http.MethodGet)
}
