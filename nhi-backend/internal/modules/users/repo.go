// Package users administers the people who can sign in to one workspace.
//
// Accounts live in nhi_global.nhi_users, the same table the sign-in reads, and
// every query here is narrowed to the caller's tenant: an admin of one
// workspace can never see or change an account in another. Passwords are only
// ever written as a bcrypt hash, and are never read back.
package users

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/database"
)

// Errors the handler turns into an answer a person can act on.
var (
	ErrNotFound     = errors.New("user not found")
	ErrEmailTaken   = errors.New("email already in use")
	ErrLastAdmin    = errors.New("last admin")
	ErrSelfDemotion = errors.New("cannot change your own role")
)

type Repository struct {
	db     *sql.DB
	schema string
}

func NewRepository(db *database.PostgresDB, globalSchema string) *Repository {
	var raw *sql.DB
	if db != nil {
		raw = db.DB
	}
	return &Repository{db: raw, schema: strings.TrimSpace(globalSchema)}
}

func (r *Repository) table() string { return database.Table(r.schema, "nhi_users") }

// User is an account as the console shows it. Never carries the password.
type User struct {
	ID          int        `json:"id"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	Team        string     `json:"team"`
	Department  string     `json:"department"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	CreatedBy   string     `json:"created_by,omitempty"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
	UpdatedBy   string     `json:"updated_by,omitempty"`
}

const columns = `id, email, COALESCE(full_name,''), COALESCE(team,''), COALESCE(department,''),
	COALESCE(role,''), COALESCE(status,''), last_login_at, created_at,
	COALESCE(created_by,''), updated_at, COALESCE(updated_by,'')`

func scanUser(s interface{ Scan(...any) error }) (*User, error) {
	var u User
	if err := s.Scan(&u.ID, &u.Email, &u.FullName, &u.Team, &u.Department, &u.Role, &u.Status,
		&u.LastLoginAt, &u.CreatedAt, &u.CreatedBy, &u.UpdatedAt, &u.UpdatedBy); err != nil {
		return nil, err
	}
	return &u, nil
}

// List returns the workspace's accounts, newest first, optionally filtered.
func (r *Repository) List(ctx context.Context, tenantID, search, role, status string) ([]User, error) {
	if r.db == nil {
		return nil, errors.New("user repository is not initialized")
	}
	conds := []string{"tenant_id = $1::uuid"}
	args := []any{tenantID}
	if search != "" {
		args = append(args, "%"+likeEscape(search)+"%")
		conds = append(conds, fmt.Sprintf("(email ILIKE $%d ESCAPE '\\' OR full_name ILIKE $%d ESCAPE '\\')", len(args), len(args)))
	}
	if role != "" {
		args = append(args, role)
		conds = append(conds, fmt.Sprintf("lower(role) = lower($%d)", len(args)))
	}
	if status != "" {
		args = append(args, status)
		conds = append(conds, fmt.Sprintf("lower(COALESCE(status,'active')) = lower($%d)", len(args)))
	}
	rows, err := r.db.QueryContext(ctx, `SELECT `+columns+` FROM `+r.table()+
		` WHERE `+strings.Join(conds, " AND ")+` ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 500`, args...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	out := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("read user: %w", err)
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

// Get reads one account of this tenant.
func (r *Repository) Get(ctx context.Context, tenantID string, id int) (*User, error) {
	if r.db == nil {
		return nil, errors.New("user repository is not initialized")
	}
	u, err := scanUser(r.db.QueryRowContext(ctx,
		`SELECT `+columns+` FROM `+r.table()+` WHERE id = $1 AND tenant_id = $2::uuid`, id, tenantID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("read user: %w", err)
	}
	return u, nil
}

// NewUser is what Create needs. PasswordHash is already hashed.
type NewUser struct {
	Email        string
	PasswordHash string
	FullName     string
	Team         string
	Department   string
	Role         string
	Status       string
	TenantID     string
	CreatedBy    string
}

func (r *Repository) Create(ctx context.Context, n NewUser) (*User, error) {
	if r.db == nil {
		return nil, errors.New("user repository is not initialized")
	}
	// The id column is an integer without a default in older deployments, so
	// the next one is taken under the insert rather than assumed. Two people
	// added at the same moment can pick the same id: that collision is on the
	// primary key, not the email, so it is retried rather than reported as
	// "that email already has an account".
	for attempt := 0; ; attempt++ {
		u, err := scanUser(r.db.QueryRowContext(ctx, `INSERT INTO `+r.table()+`
			(id, email, password, full_name, team, department, role, tenant_id, status, created_at, created_by)
			VALUES (COALESCE((SELECT max(id) FROM `+r.table()+`), 0) + 1,
			        $1, $2, NULLIF($3,''), $4, NULLIF($5,''), $6, $7::uuid, $8, now(), $9)
			RETURNING `+columns,
			n.Email, n.PasswordHash, n.FullName, n.Team, n.Department, n.Role, n.TenantID, n.Status, n.CreatedBy))
		if err == nil {
			return u, nil
		}
		if isUniqueViolation(err) && strings.Contains(err.Error(), "pkey") && attempt < 4 {
			continue
		}
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("add user: %w", err)
	}
}

// Changes is what Update may set. A nil field is left as it is, which is what
// lets the console send only what the person edited.
type Changes struct {
	FullName     *string
	Team         *string
	Department   *string
	Role         *string
	Status       *string
	PasswordHash *string
}

func (c Changes) empty() bool {
	return c.FullName == nil && c.Team == nil && c.Department == nil &&
		c.Role == nil && c.Status == nil && c.PasswordHash == nil
}

// Update applies the changes. requireOtherAdmin is set when the change takes
// an admin away (a demotion or a switch-off): the change is then refused with
// ErrLastAdmin unless another active admin remains - checked and applied in
// one transaction, under a per-workspace lock, so two admins demoting each
// other at the same moment cannot both succeed and leave nobody in charge.
// A new password or a switched-off account ends that person's open sessions.
func (r *Repository) Update(ctx context.Context, tenantID string, id int, c Changes, actor string, requireOtherAdmin bool) (*User, error) {
	if r.db == nil {
		return nil, errors.New("user repository is not initialized")
	}
	if c.empty() {
		return r.Get(ctx, tenantID, id)
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	add := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if c.FullName != nil {
		add("full_name", *c.FullName)
	}
	if c.Team != nil {
		add("team", *c.Team)
	}
	if c.Department != nil {
		add("department", *c.Department)
	}
	if c.Role != nil {
		add("role", *c.Role)
	}
	if c.Status != nil {
		add("status", *c.Status)
	}
	if c.PasswordHash != nil {
		add("password", *c.PasswordHash)
	}
	add("updated_by", actor)
	args = append(args, id, tenantID)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if requireOtherAdmin {
		if err := r.guardLastAdmin(ctx, tx, tenantID, id); err != nil {
			return nil, err
		}
	}
	u, err := scanUser(tx.QueryRowContext(ctx, `UPDATE `+r.table()+` SET `+strings.Join(sets, ", ")+
		fmt.Sprintf(" WHERE id = $%d AND tenant_id = $%d::uuid RETURNING ", len(args)-1, len(args))+columns, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	if c.PasswordHash != nil || (c.Status != nil && *c.Status != "active") {
		if err := r.endSessions(ctx, tx, id); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

// guardLastAdmin takes the workspace's user-admin lock and refuses with
// ErrLastAdmin when no other active admin would remain.
func (r *Repository) guardLastAdmin(ctx context.Context, tx *sql.Tx, tenantID string, excludeID int) error {
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('nhi-users:' || $1))`, tenantID); err != nil {
		return fmt.Errorf("lock users: %w", err)
	}
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM `+r.table()+`
		WHERE tenant_id = $1::uuid AND id <> $2
		  AND lower(COALESCE(status,'active')) = 'active'
		  AND lower(COALESCE(role,'')) IN ('admin','super_admin','superadmin','owner','administrator')`,
		tenantID, excludeID).Scan(&n); err != nil {
		return fmt.Errorf("count admins: %w", err)
	}
	if n == 0 {
		return ErrLastAdmin
	}
	return nil
}

// endSessions signs a person out everywhere: every session they hold stops
// working on its next request (the auth check reads session_ended_at).
func (r *Repository) endSessions(ctx context.Context, tx *sql.Tx, userID int) error {
	_, err := tx.ExecContext(ctx, `UPDATE `+database.Table(r.schema, "refresh_tokens")+`
		SET session_ended_at = COALESCE(session_ended_at, now()), revoked_at = COALESCE(revoked_at, now())
		WHERE user_id = $1`, userID)
	if err != nil && !strings.Contains(err.Error(), "42703") { // an older table without the session columns
		return fmt.Errorf("end sessions: %w", err)
	}
	return nil
}

// Delete removes an account and, with it, its sign-in sessions.
// requireOtherAdmin works as in Update.
func (r *Repository) Delete(ctx context.Context, tenantID string, id int, requireOtherAdmin bool) error {
	if r.db == nil {
		return errors.New("user repository is not initialized")
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if requireOtherAdmin {
		if err := r.guardLastAdmin(ctx, tx, tenantID, id); err != nil {
			return err
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM `+r.table()+` WHERE id = $1 AND tenant_id = $2::uuid`, id, tenantID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// CountActiveAdmins is what stops a workspace being left with nobody who can
// administer it.
func (r *Repository) CountActiveAdmins(ctx context.Context, tenantID string, excludeID int) (int, error) {
	if r.db == nil {
		return 0, errors.New("user repository is not initialized")
	}
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT count(*) FROM `+r.table()+`
		WHERE tenant_id = $1::uuid AND id <> $2
		  AND lower(COALESCE(status,'active')) = 'active'
		  AND lower(COALESCE(role,'')) IN ('admin','super_admin','superadmin','owner','administrator')`,
		tenantID, excludeID).Scan(&n)
	return n, err
}

// EmailTaken reports whether the address is already an account anywhere, since
// signing in looks an address up across the deployment.
func (r *Repository) EmailTaken(ctx context.Context, email string, excludeID int) (bool, error) {
	if r.db == nil {
		return false, errors.New("user repository is not initialized")
	}
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+r.table()+
		` WHERE lower(email) = lower($1) AND id <> $2)`, email, excludeID).Scan(&exists)
	return exists, err
}

// likeEscape makes % and _ in a search match themselves.
func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s)
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "23505")
}
