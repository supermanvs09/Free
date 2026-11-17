// Package humanidentities serves the Human Identities API: the overview
// counts, the paginated identity list, and the per-identity detail.
package humanidentities

import (
	"net/http"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

// Module wires the package's handler and registers its routes.
type Module struct {
	handler *HumanIdentityHandler
}

// New builds the module.
func New(resolver *scope.Resolver) *Module {
	repo := identitygraph.NewHumanIdentityRepository()
	svc := NewHumanIdentityService(repo, resolver)
	return &Module{handler: NewHumanIdentityHandler(svc)}
}

// Register mounts the human identity routes on an authenticated router.
// "/overview" is registered before "/{id}" so it is not read as an ID.
func (m *Module) Register(r *mux.Router) {
	r.HandleFunc("/human-identities/overview", m.handler.Overview).Methods(http.MethodGet)
	r.HandleFunc("/human-identities", m.handler.List).Methods(http.MethodGet)
	r.HandleFunc("/human-identities/{id}", m.handler.Get).Methods(http.MethodGet)
}
