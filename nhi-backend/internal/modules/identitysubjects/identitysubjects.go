// Package identitysubjects answers which credentials an identity signs in
// with (roles first), so the console can trace an identity's blast radius
// through its role:
//
//	GET /api/v1/identity-subjects/{id}
//
// The correlation engine takes an ARN; this maps a discovery identity to the
// ARNs worth asking about. Read-only, scoped to the caller's accounts and
// regions.
package identitysubjects

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"

	"github.com/gorilla/mux"
	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)

type Handler struct{ resolver *scope.Resolver }

func NewHandler(resolver *scope.Resolver) *Handler { return &Handler{resolver: resolver} }

func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/identity-subjects/{id}", h.Get).Methods(http.MethodGet)
}

// Subject is one credential of the identity.
type Subject struct {
	ARN            string `json:"arn"`
	Name           string `json:"name"`
	CredentialType string `json:"credential_type"`
	IsPrimary      bool   `json:"is_primary"`
}

func fail(w http.ResponseWriter, status int, msg, code string) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: false, Message: msg, Error: code})
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if !uuidRe.MatchString(id) {
		fail(w, http.StatusBadRequest, "Invalid identity ID", "INVALID_REQUEST")
		return
	}
	c := middleware.GetClaims(r)
	if c == nil {
		fail(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return
	}
	ds, err := h.resolver.Resolve(r.Context(), c.UserID, c.TenantID, c.DBName)
	if err != nil {
		httpx.SendServerError(w, r, err, "Could not load your workspace", "SCOPE_UNAVAILABLE")
		return
	}
	rows, err := ds.DB.QueryContext(r.Context(), fmt.Sprintf(`
		SELECT DISTINCT ON (c.arn) c.arn, COALESCE(c.name, ''), COALESCE(c.credential_type, ''), COALESCE(ic.is_primary, false)
		FROM %s ic
		JOIN %s c ON c.id::text = ic.credential_id::text AND c.deleted_at IS NULL
		WHERE ic.identity_id::text = $1
		  AND (cardinality($2::text[]) = 0 OR c.account_id = ANY($2::text[]))
		  AND (cardinality($3::text[]) = 0 OR c.region = ANY($3::text[]))
		ORDER BY c.arn, ic.is_primary DESC`, ds.Table("identity_credentials"), ds.Table("credentials")),
		id, pq.Array(ds.AccountIDs), pq.Array(ds.Regions))
	if err != nil {
		var pe *pq.Error
		if errors.As(err, &pe) && pe.Code == "42P01" { // no tables yet: nothing to trace
			httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: map[string]any{"credentials": []Subject{}}})
			return
		}
		httpx.SendServerError(w, r, err, "The identity's credentials could not be loaded", "SUBJECTS_FAILED")
		return
	}
	defer rows.Close()
	out := []Subject{}
	for rows.Next() {
		var s Subject
		if err := rows.Scan(&s.ARN, &s.Name, &s.CredentialType, &s.IsPrimary); err != nil {
			httpx.SendServerError(w, r, err, "The identity's credentials could not be loaded", "SUBJECTS_FAILED")
			return
		}
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool {
		ri, rj := out[i].CredentialType == "iam_role", out[j].CredentialType == "iam_role"
		if ri != rj {
			return ri
		}
		return out[i].IsPrimary && !out[j].IsPrimary
	})
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "ok", Data: map[string]any{"credentials": out}})
}
