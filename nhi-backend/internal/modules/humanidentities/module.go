// Package humanidentities serves the Human Identities API: the overview
// counts, the paginated identity list, the per-identity detail, and the
// IAM and SSO permission sets.
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
func New(resolver *scope.Resolver, activity *identitygraph.ActivityService) *Module {
	repo := identitygraph.NewHumanIdentityRepository()
	svc := NewHumanIdentityService(repo, resolver, activity)
	return &Module{handler: NewHumanIdentityHandler(svc)}
}

// Register mounts the human identity routes on an authenticated router.
// Fixed paths ("/overview", "/permission-sets") are registered before "/{id}"
// so they are not read as an ID.
func (m *Module) Register(r *mux.Router) {
	r.HandleFunc("/human-identities/overview", m.handler.Overview).Methods(http.MethodGet)
	r.HandleFunc("/human-identities/permission-sets", m.handler.PermissionSets).Methods(http.MethodGet)
	r.HandleFunc("/human-identities", m.handler.List).Methods(http.MethodGet)
	r.HandleFunc("/human-identities/{id}/posture", m.handler.Posture).Methods(http.MethodGet)
	r.HandleFunc("/human-identities/{id}", m.handler.Get).Methods(http.MethodGet)
}
