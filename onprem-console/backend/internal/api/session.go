package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"onprem-console/internal/auth"
)

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	token, u, err := s.auth.Login(r.Context(), in.Email, in.Password)
	switch {
	case errors.Is(err, auth.ErrLocked):
		writeError(w, http.StatusTooManyRequests, err.Error())
	case errors.Is(err, auth.ErrBadLogin):
		s.st.Audit(r.Context(), strings.ToLower(clip(in.Email, 200)), "login_failed", "", "")
		writeError(w, http.StatusUnauthorized, "The email and password do not match an active account.")
	case err != nil:
		serverError(w, err)
	default:
		s.st.Audit(r.Context(), u.Email, "login", "", "")
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
	}
}

func (s *Server) userByEmail(ctx context.Context, email string) (*auth.User, error) {
	u := &auth.User{}
	err := s.st.DB.QueryRow(ctx, `SELECT id, email, name, role, active, created_at, last_login_at FROM users WHERE lower(email) = lower($1)`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt)
	return u, err
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.userByEmail(r.Context(), caller(r).Email)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "can_manage": auth.CanManage(u.Role)})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	email := caller(r).Email
	var hash string
	if err := s.st.DB.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE lower(email) = lower($1)`, email).Scan(&hash); err != nil {
		serverError(w, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		writeError(w, http.StatusBadRequest, "The current password is not right.")
		return
	}
	if p := auth.PasswordProblem(in.New); p != "" {
		writeError(w, http.StatusBadRequest, p)
		return
	}
	if err := s.setPassword(r.Context(), email, in.New); err != nil {
		serverError(w, err)
		return
	}
	s.st.Audit(r.Context(), email, "password_changed", email, "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) setPassword(ctx context.Context, email, pw string) error {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.st.DB.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE lower(email) = lower($1)`, email, string(h))
	return err
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.st.DB.Query(r.Context(), `SELECT id, email, name, role, active, created_at, last_login_at FROM users ORDER BY active DESC, lower(email)`)
	if err != nil {
		serverError(w, err)
		return
	}
	users, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (auth.User, error) {
		var u auth.User
		err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt)
		return u, err
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func validEmail(e string) bool {
	at := strings.LastIndex(e, "@")
	return at > 0 && at < len(e)-3 && strings.Contains(e[at:], ".") && !strings.ContainsAny(e, " \t<>\"") && len(e) <= 254
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	switch {
	case !validEmail(in.Email):
		writeError(w, http.StatusBadRequest, "Enter a valid email address.")
		return
	case !auth.ValidRole(in.Role):
		writeError(w, http.StatusBadRequest, "Choose a role: admin, analyst or viewer.")
		return
	}
	if p := auth.PasswordProblem(in.Password); p != "" {
		writeError(w, http.StatusBadRequest, p)
		return
	}
	u, err := s.auth.CreateUser(r.Context(), in.Email, clip(in.Name, 120), in.Password, in.Role, caller(r).Email)
	if err != nil {
		if strings.Contains(err.Error(), "users_email") {
			writeError(w, http.StatusConflict, "Someone already uses this email.")
			return
		}
		serverError(w, err)
		return
	}
	s.st.Audit(r.Context(), caller(r).Email, "user_created", u.Email, u.Role)
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(mux.Vars(r)["id"], 10, 64)
	var in struct {
		Name     *string `json:"name"`
		Role     *string `json:"role"`
		Active   *bool   `json:"active"`
		Password *string `json:"password"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var target auth.User
	err := s.st.DB.QueryRow(r.Context(), `SELECT id, email, role, active FROM users WHERE id = $1`, id).Scan(&target.ID, &target.Email, &target.Role, &target.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "No such user.")
		return
	} else if err != nil {
		serverError(w, err)
		return
	}
	me := caller(r).Email
	if strings.EqualFold(target.Email, me) && ((in.Role != nil && *in.Role != auth.RoleAdmin) || (in.Active != nil && !*in.Active)) {
		writeError(w, http.StatusBadRequest, "You cannot remove your own admin role or switch off your own account.")
		return
	}
	if in.Role != nil && !auth.ValidRole(*in.Role) {
		writeError(w, http.StatusBadRequest, "Choose a role: admin, analyst or viewer.")
		return
	}
	if in.Password != nil {
		if p := auth.PasswordProblem(*in.Password); p != "" {
			writeError(w, http.StatusBadRequest, p)
			return
		}
	}
	tx, err := s.st.DB.Begin(r.Context())
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	if in.Name != nil {
		_, err = tx.Exec(r.Context(), `UPDATE users SET name = $2 WHERE id = $1`, id, clip(*in.Name, 120))
	}
	if err == nil && in.Role != nil {
		_, err = tx.Exec(r.Context(), `UPDATE users SET role = $2 WHERE id = $1`, id, *in.Role)
	}
	if err == nil && in.Active != nil {
		_, err = tx.Exec(r.Context(), `UPDATE users SET active = $2 WHERE id = $1`, id, *in.Active)
	}
	if err == nil && in.Password != nil {
		var h []byte
		if h, err = bcrypt.GenerateFromPassword([]byte(*in.Password), bcrypt.DefaultCost); err == nil {
			_, err = tx.Exec(r.Context(), `UPDATE users SET password_hash = $2 WHERE id = $1`, id, string(h))
		}
	}
	var admins int
	if err == nil {
		err = tx.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE role = 'admin' AND active`).Scan(&admins)
	}
	if err != nil {
		serverError(w, err)
		return
	}
	if admins == 0 {
		writeError(w, http.StatusBadRequest, "The console needs at least one active admin.")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, err)
		return
	}
	var changed []string
	if in.Role != nil {
		changed = append(changed, "role="+*in.Role)
	}
	if in.Active != nil {
		changed = append(changed, "active="+strconv.FormatBool(*in.Active))
	}
	if in.Password != nil {
		changed = append(changed, "password reset")
	}
	s.st.Audit(r.Context(), me, "user_updated", target.Email, strings.Join(changed, ", "))
	u, err := s.userByEmail(r.Context(), target.Email)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}
