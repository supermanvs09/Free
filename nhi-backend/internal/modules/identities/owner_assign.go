package identities

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"

	"github.com/gorilla/mux"
	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

const (
	maxOwnerLen  = 255
	maxReasonLen = 1000
	minReasonLen = 3
)

var errIdentityNotFound = errors.New("identity not found")

type setOwnerBody struct {
	Owner  string `json:"owner"`
	Reason string `json:"reason"`
}

// clean trims and rejects control characters, which have no place in a name
// or a sentence a person types.
func clean(s string) (string, bool) {
	s = strings.TrimSpace(s)
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' {
			return "", false
		}
	}
	return s, true
}

// SetOwner handles PUT /api/v1/identities/{id}/owner: a person confirms or
// names the owner and says why. Who did it and when are recorded with it.
func (h *IdentitiesListHandler) SetOwner(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	bad := func(msg string) {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: msg, Error: "INVALID_REQUEST"})
	}
	var body setOwnerBody
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		bad("Send JSON with owner and reason.")
		return
	}
	owner, ok1 := clean(body.Owner)
	reason, ok2 := clean(body.Reason)
	switch {
	case !ok1 || !ok2:
		bad("Owner and reason must be plain text.")
		return
	case owner == "" || len(owner) > maxOwnerLen:
		bad(fmt.Sprintf("Owner is required (up to %d characters).", maxOwnerLen))
		return
	case len([]rune(reason)) < minReasonLen || len(reason) > maxReasonLen:
		bad(fmt.Sprintf("Say why this is the owner (%d to %d characters).", minReasonLen, maxReasonLen))
		return
	}
	err := h.service.SetOwner(r.Context(), claims.UserID, claims.TenantID, claims.DBName, mux.Vars(r)["id"], owner, reason)
	if errors.Is(err, errIdentityNotFound) {
		httpx.SendJSONResponse(w, http.StatusNotFound, httpx.APIResponse{Success: false, Message: "Identity not found", Error: "NOT_FOUND"})
		return
	}
	if err != nil {
		httpx.SendJSONResponse(w, http.StatusInternalServerError, httpx.APIResponse{Success: false, Message: "The owner could not be saved right now.", Error: "INTERNAL_ERROR"})
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Owner saved", Data: map[string]any{"owner": owner, "set_by": claims.UserID}})
}

func (s *IdentitiesListService) SetOwner(ctx context.Context, userID, tenantID, dbName, identityID, owner, reason string) error {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return err
	}
	return s.repo.SetOwner(ctx, resolved, identityID, owner, reason, userID)
}

// SetOwner writes the assignment on an identity in the user's scope.
func (r *IdentitiesListRepository) SetOwner(ctx context.Context, resolved *scope.DataScope, identityID, owner, reason, by string) error {
	res, err := resolved.DB.ExecContext(ctx, fmt.Sprintf(`
		UPDATE %s.identities
		   SET owner_assigned = $3, owner_assigned_reason = $4, owner_assigned_by = $5, owner_assigned_at = NOW()
		 WHERE id::text = $1 AND account_id = ANY($2::text[]) AND deleted_at IS NULL`, resolved.QSchema()),
		identityID, pq.Array(resolved.AccountIDs), owner, reason, by)
	if err != nil {
		return fmt.Errorf("save identity owner: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errIdentityNotFound
	}
	return nil
}
