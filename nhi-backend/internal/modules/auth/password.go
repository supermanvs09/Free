package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"nhi-backend-api/internal/platform/passwordpolicy"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/fieldcrypt"
	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/middleware"
)

const (
	minOwnPasswordLen = 12
	maxOwnPasswordLen = 72
)

var errWrongPassword = errors.New("current password does not match")

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword handles PATCH /api/v1/me/password: a signed-in person sets a
// new password for their own account. The current password is required (a
// session left open on someone else's screen must not be enough), the new
// one is stored as a bcrypt hash, and every other session of the account is
// ended - the one making the change stays signed in.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		sendJSON(w, http.StatusUnauthorized, httpx.APIResponse{Success: false, Message: "Unauthorized", Error: "UNAUTHORIZED"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var req changePasswordRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, httpx.APIResponse{Success: false, Message: "Invalid JSON request body", Error: "INVALID_REQUEST"})
		return
	}
	var errCur, errNew error
	req.CurrentPassword, errCur = fieldcrypt.Open(req.CurrentPassword)
	req.NewPassword, errNew = fieldcrypt.Open(req.NewPassword)
	if errCur != nil || errNew != nil {
		sendJSON(w, http.StatusBadRequest, httpx.APIResponse{Success: false,
			Message: "Passwords must be sent encrypted. Reload the page and try again.", Error: "PASSWORD_NOT_ENCRYPTED"})
		return
	}
	if msg := passwordpolicy.Check(req.NewPassword); msg != "" {
		sendJSON(w, http.StatusUnprocessableEntity, httpx.APIResponse{Success: false,
			Message: msg, Error: "INVALID_PASSWORD", Data: map[string]string{"field": "new_password"}})
		return
	}
	if req.NewPassword == req.CurrentPassword {
		sendJSON(w, http.StatusUnprocessableEntity, httpx.APIResponse{Success: false,
			Message: "The new password must differ from the current one.", Error: "INVALID_PASSWORD", Data: map[string]string{"field": "new_password"}})
		return
	}
	err := h.authService.userRepo.ChangeOwnPassword(r.Context(), claims.UserID, claims.TenantID, claims.ID, req.CurrentPassword, req.NewPassword)
	if errors.Is(err, errWrongPassword) {
		sendJSON(w, http.StatusForbidden, httpx.APIResponse{Success: false,
			Message: "Your current password is not right.", Error: "WRONG_PASSWORD", Data: map[string]string{"field": "current_password"}})
		return
	}
	if err != nil {
		httpx.SendServerError(w, r, err, "Failed to change the password", "PASSWORD_CHANGE_FAILED")
		return
	}
	sendJSON(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Password changed. Your other sessions were signed out."})
}

// ChangeOwnPassword checks the current password, stores the new hash and ends
// every other session of the account, in one transaction.
func (r *UserRepository) ChangeOwnPassword(ctx context.Context, email, tenantID, keepSession, current, next string) error {
	db, err := r.globalDB()
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	users := database.Table(r.schema, globalUsersTable)
	var id int
	var hash string
	err = tx.QueryRowContext(ctx, `SELECT id, COALESCE(password, '') FROM `+users+`
		WHERE lower(trim(email)) = lower(trim($1)) AND tenant_id = $2::uuid FOR UPDATE`, email, tenantID).Scan(&id, &hash)
	if err != nil {
		return fmt.Errorf("read account: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		return errWrongPassword
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+users+` SET password = $1, updated_at = now(), updated_by = $2 WHERE id = $3`,
		string(newHash), strings.TrimSpace(email), id); err != nil {
		if !strings.Contains(err.Error(), "42703") { // updated_* columns missing: an older table
			return fmt.Errorf("store password: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE `+users+` SET password = $1 WHERE id = $2`, string(newHash), id); err != nil {
			return fmt.Errorf("store password: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+r.refreshTable()+`
		SET session_ended_at = COALESCE(session_ended_at, now()), revoked_at = COALESCE(revoked_at, now())
		WHERE user_id = $1 AND session_id::text <> $2`, id, keepSession); err != nil {
		return fmt.Errorf("end other sessions: %w", err)
	}
	return tx.Commit()
}
