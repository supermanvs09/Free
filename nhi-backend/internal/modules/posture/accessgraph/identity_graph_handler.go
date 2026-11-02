package accessgraph

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/posture/common"
)

type IdentityGraphHandler struct {
	service *IdentityGraphService
}

func NewIdentityGraphHandler(service *IdentityGraphService) *IdentityGraphHandler {
	return &IdentityGraphHandler{service: service}
}

// Get handles GET /identities/{id}/graph?depth=2&edge_types=&max_nodes=200 —
// the Access graph as nodes and edges.
func (h *IdentityGraphHandler) Get(w http.ResponseWriter, r *http.Request) {
	c, ok := common.Begin(w, r)
	if !ok {
		return
	}
	id, ok := common.IdentityIDOK(w, mux.Vars(r)["id"])
	if !ok {
		return
	}
	q := r.URL.Query()
	if !common.StrictQuery(w, q, common.Allow("depth", "edge_types", "max_nodes")) {
		return
	}
	f := IdentityGraphFilter{Depth: DefaultGraphDepth, MaxNodes: DefaultGraphMaxNodes}
	if raw := strings.TrimSpace(q.Get("depth")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > MaxGraphDepth {
			common.Invalid(w, "depth", fmt.Sprintf("depth must be an integer between 1 and %d", MaxGraphDepth))
			return
		}
		f.Depth = n
	}
	if raw := strings.TrimSpace(q.Get("max_nodes")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > MaxGraphMaxNodes {
			common.Invalid(w, "max_nodes", fmt.Sprintf("max_nodes must be an integer between 1 and %d", MaxGraphMaxNodes))
			return
		}
		f.MaxNodes = n
	}
	types, ok := common.CsvEnum(w, q, "edge_types", GraphEdgeTypes)
	if !ok {
		return
	}
	f.EdgeTypes = types
	if common.NotModified(w, r, c, h.service.ScanMeta) {
		return
	}
	env, err := h.service.Get(r.Context(), c, id, f)
	if err != nil {
		common.Fail(w, r, "load identity graph", err)
		return
	}
	common.Respond(w, env, true)
}
