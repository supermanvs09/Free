package users

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"

	"nhi-backend-api/internal/platform/authz"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

// Handler serves user management. The route policy already limits it to a role
// holding authz.CapUsers, so these checks are about the rules a workspace needs
// beyond "may this person administer users at all":
//
//   - nobody can change their own role or switch their own account off, so an
//     admin cannot lock themselves out and a mistake needs two people;
//   - the last active admin cannot be removed, demoted or deactivated, so a
//     workspace is never left with nobody who can administer it;
//   - a password is only ever stored as a bcrypt hash, and is never read back.
type Handler struct{ repo *Repository }

func NewHandler(repo *Repository) *Handler { return &Handler{repo: repo} }

const (
	minPasswordLen = 12
	maxPasswordLen = 72 // bcrypt ignores anything past this
)

var listParams = map[string]struct{}{"q": {}, "role": {}, "status": {}}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		unauthorized(w)
		return
	}
	if httpx.RejectUnknownQuery(w, r, listParams) {
		return
	}
	q := r.URL.Query()
	list, err := h.repo.List(r.Context(), claims.TenantID, trim(q.Get("q"), 120), trim(q.Get("role"), 40), trim(q.Get("status"), 20))
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to list users", "USERS_LIST_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{
		Success: true, Message: "Users retrieved successfully",
		Data: map[string]any{"users": list, "roles": roleOptions()},
	})
}

// roleOptions is what the console offers when assigning a role, with the one
// sentence that says what each one may do.
func roleOptions() []map[string]any {
	out := make([]map[string]any, 0, len(authz.Roles))
	for _, r := range authz.Roles {
		// capabilities: the server's own matrix, so the console's Roles &
		// permissions view can never disagree with what is enforced.
		out = append(out, map[string]any{"key": string(r), "label": r.Label(), "summary": roleSummary(r), "capabilities": authz.Capabilities(r)})
	}
	return out
}

func roleSummary(r authz.Role) string {
	switch r {
	case authz.RoleAdmin:
		return "Everything, including connecting AWS accounts and managing users."
	case authz.RoleOperator:
		return "Reads everything, gives the second approval, and maintains policies."
	case authz.RoleAnalyst:
		return "Investigates and works findings. No integrations, no user management."
	default:
		return "Read only."
	}
}

type createRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	FullName   string `json:"full_name"`
	Team       string `json:"team"`
	Department string `json:"department"`
	Role       string `json:"role"`
	Status     string `json:"status"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		unauthorized(w)
		return
	}
	var req createRequest
	if !decode(w, r, &req) {
		return
	}
	req.Email = strings.ToLower(trim(req.Email, 320))
	req.Role = strings.ToLower(trim(req.Role, 40))
	req.Status = strings.ToLower(trim(req.Status, 20))
	if req.Status == "" {
		req.Status = "active"
	}
	if msg, field := validateNew(req); msg != "" {
		invalid(w, msg, field)
		return
	}
	taken, err := h.repo.EmailTaken(r.Context(), req.Email, 0)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to add the user", "USER_CREATE_FAILED")
		return
	}
	if taken {
		conflict(w, "That email already has an account.", "email")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to add the user", "USER_CREATE_FAILED")
		return
	}
	user, err := h.repo.Create(r.Context(), NewUser{
		Email: req.Email, PasswordHash: string(hash), FullName: trim(req.FullName, 200),
		Team: trim(req.Team, 120), Department: trim(req.Department, 120),
		Role: req.Role, Status: req.Status, TenantID: claims.TenantID, CreatedBy: claims.UserID,
	})
	if errors.Is(err, ErrEmailTaken) {
		conflict(w, "That email already has an account.", "email")
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to add the user", "USER_CREATE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusCreated, httpx.APIResponse{Success: true, Message: "User added successfully", Data: user})
}

func validateNew(req createRequest) (message, field string) {
	switch {
	case req.Email == "" || !strings.Contains(req.Email, "@") || strings.ContainsAny(req.Email, " \t"):
		return "Enter the email address they will sign in with.", "email"
	case len(req.Password) < minPasswordLen:
		return "Use a password of at least " + strconv.Itoa(minPasswordLen) + " characters.", "password"
	case len(req.Password) > maxPasswordLen:
		return "Use a password of at most " + strconv.Itoa(maxPasswordLen) + " characters.", "password"
	case !authz.IsKnownRole(req.Role):
		return "Choose one of: " + roleNames() + ".", "role"
	case !validStatus(req.Status):
		return "Status must be active or inactive.", "status"
	}
	return "", ""
}

type updateRequest struct {
	FullName   *string `json:"full_name"`
	Team       *string `json:"team"`
	Department *string `json:"department"`
	Role       *string `json:"role"`
	Status     *string `json:"status"`
	Password   *string `json:"password"`
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		unauthorized(w)
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var req updateRequest
	if !decode(w, r, &req) {
		return
	}
	target, err := h.repo.Get(r.Context(), claims.TenantID, id)
	if errors.Is(err, ErrNotFound) {
		notFound(w)
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to update the user", "USER_UPDATE_FAILED")
		return
	}
	self := strings.EqualFold(target.Email, claims.UserID)

	changes := Changes{}
	if req.FullName != nil {
		changes.FullName = ptr(trim(*req.FullName, 200))
	}
	if req.Team != nil {
		changes.Team = ptr(trim(*req.Team, 120))
	}
	if req.Department != nil {
		changes.Department = ptr(trim(*req.Department, 120))
	}
	if req.Role != nil {
		role := strings.ToLower(trim(*req.Role, 40))
		if !authz.IsKnownRole(role) {
			invalid(w, "Choose one of: "+roleNames()+".", "role")
			return
		}
		if !strings.EqualFold(role, target.Role) {
			if self {
				forbidden(w, "You cannot change your own role. Ask another admin to do it.", "role")
				return
			}
			changes.Role = ptr(role)
		}
	}
	if req.Status != nil {
		status := strings.ToLower(trim(*req.Status, 20))
		if !validStatus(status) {
			invalid(w, "Status must be active or inactive.", "status")
			return
		}
		if !strings.EqualFold(status, target.Status) {
			if self && status != "active" {
				forbidden(w, "You cannot switch off your own account.", "status")
				return
			}
			changes.Status = ptr(status)
		}
	}
	if req.Password != nil {
		pw := *req.Password
		if len(pw) < minPasswordLen || len(pw) > maxPasswordLen {
			invalid(w, "Use a password of "+strconv.Itoa(minPasswordLen)+" to "+strconv.Itoa(maxPasswordLen)+" characters.", "password")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		if err != nil {
			httpx.SendServerError(w, r, err, "Failed to update the user", "USER_UPDATE_FAILED")
			return
		}
		changes.PasswordHash = ptr(string(hash))
	}

	// Taking an admin away (demoting or switching off an active admin) needs
	// another active admin to remain; the repository checks that and applies
	// the change in one transaction.
	wasAdmin := authz.NormalizeRole(target.Role) == authz.RoleAdmin && strings.EqualFold(strings.TrimSpace(target.Status), "active")
	losesAdmin := wasAdmin && ((changes.Role != nil && authz.NormalizeRole(*changes.Role) != authz.RoleAdmin) ||
		(changes.Status != nil && *changes.Status != "active"))
	user, err := h.repo.Update(r.Context(), claims.TenantID, id, changes, claims.UserID, losesAdmin)
	if errors.Is(err, ErrLastAdmin) {
		field := "role"
		if changes.Status != nil {
			field = "status"
		}
		forbidden(w, "This is the only active admin. Make someone else an admin first.", field)
		return
	}
	if errors.Is(err, ErrNotFound) {
		notFound(w)
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to update the user", "USER_UPDATE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "User updated successfully", Data: user})
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		unauthorized(w)
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	target, err := h.repo.Get(r.Context(), claims.TenantID, id)
	if errors.Is(err, ErrNotFound) {
		notFound(w)
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to remove the user", "USER_DELETE_FAILED")
		return
	}
	if strings.EqualFold(target.Email, claims.UserID) {
		forbidden(w, "You cannot remove your own account.", "id")
		return
	}
	activeAdmin := authz.NormalizeRole(target.Role) == authz.RoleAdmin && strings.EqualFold(strings.TrimSpace(target.Status), "active")
	if err := h.repo.Delete(r.Context(), claims.TenantID, id, activeAdmin); err != nil {
		if errors.Is(err, ErrLastAdmin) {
			forbidden(w, "This is the only active admin. Make someone else an admin first.", "id")
			return
		}
		if errors.Is(err, ErrNotFound) {
			notFound(w)
			return
		}
		httpx.SendServerError(w, r, err, "Failed to remove the user", "USER_DELETE_FAILED")
		return
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "User removed successfully", Data: map[string]any{"id": id, "email": target.Email}})
}

/* ---------- small helpers, so the handlers above read as rules ---------- */

func roleNames() string {
	names := make([]string, 0, len(authz.Roles))
	for _, r := range authz.Roles {
		names = append(names, string(r))
	}
	return strings.Join(names, ", ")
}

func validStatus(s string) bool { return s == "active" || s == "inactive" }

func ptr[T any](v T) *T { return &v }

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

func decode(w http.ResponseWriter, r *http.Request, into any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid JSON request body", Error: "INVALID_REQUEST"})
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(strings.TrimSpace(mux.Vars(r)["id"]))
	if err != nil || id <= 0 {
		httpx.SendJSONResponse(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid user id", Error: "INVALID_ID"})
		return 0, false
	}
	return id, true
}

func unauthorized(w http.ResponseWriter) {
	httpx.SendJSONResponse(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
}

func notFound(w http.ResponseWriter) {
	httpx.SendJSONResponse(w, http.StatusNotFound, httpx.APIResponse{Success: false, Message: "That user is not in this workspace", Error: "USER_NOT_FOUND"})
}

func invalid(w http.ResponseWriter, message, field string) {
	httpx.SendJSONResponse(w, http.StatusUnprocessableEntity, httpx.APIResponse{
		Success: false, Message: message, Error: "INVALID_USER", Data: map[string]string{"field": field}})
}

func conflict(w http.ResponseWriter, message, field string) {
	httpx.SendJSONResponse(w, http.StatusConflict, httpx.APIResponse{
		Success: false, Message: message, Error: "USER_EXISTS", Data: map[string]string{"field": field}})
}

func forbidden(w http.ResponseWriter, message, field string) {
	httpx.SendJSONResponse(w, http.StatusForbidden, httpx.APIResponse{
		Success: false, Message: message, Error: "FORBIDDEN", Data: map[string]string{"field": field}})
}
