package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// Patch is the part of a company that can be edited: the domain and the four
// collector details. A nil field is "not part of this edit". The company's
// tenant id and workspace name are deliberately absent: every user, account and
// table of the company is tied to them, so they never change here.
type Patch struct {
	DomainName     *string   `json:"domain_name"`
	AWSAccountID   *string   `json:"collector_aws_account_id"`
	ExternalID     *string   `json:"collector_external_id"`
	EventBridgeARN *string   `json:"collector_event_bridge_arn"`
	Regions        *[]string `json:"collector_regions"`
}

// UpdateRequest carries the new values and, for the same fields, the values the
// person was looking at. If the row has moved on since, nothing is written.
type UpdateRequest struct {
	Expected Patch `json:"expected"`
	Changes  Patch `json:"changes"`
}

// UpdateResult is the company after the edit and which fields really changed.
type UpdateResult struct {
	Tenant  Tenant   `json:"tenant"`
	Changed []string `json:"changed"`
}

// NotFoundError means there is no such company.
type NotFoundError struct{}

func (NotFoundError) Error() string { return "That company no longer exists." }

// StaleError means the company was changed by someone else after it was loaded.
type StaleError struct{}

func (StaleError) Error() string {
	return "This company was changed by someone else while you were editing. Reload it and try again."
}

// ListTenants returns every company, newest first.
func (s *Service) ListTenants(ctx context.Context) ([]Tenant, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+tenantColumns+` FROM `+s.table("tenants")+`
		ORDER BY created_at DESC NULLS LAST, db_name LIMIT 5000`)
	if err != nil {
		return nil, fmt.Errorf("list companies: %w", err)
	}
	defer rows.Close()
	out := []Tenant{}
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, fmt.Errorf("read company: %w", err)
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

type edit struct {
	field    string // the JSON name, also the form field name
	column   string
	expected *string
	value    *string
	isList   bool
}

func joinRegions(r *[]string) *string {
	if r == nil {
		return nil
	}
	j := strings.Join(*r, ",")
	return &j
}

func trimmed(p *string, lower bool) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if lower {
		v = strings.ToLower(v)
	}
	return &v
}

// UpdateTenant changes the editable details of one company in the tenants
// table, and nothing else. It is all-or-nothing, refuses to overwrite someone
// else's newer edit, and refuses values the database would reject anyway.
func (s *Service) UpdateTenant(ctx context.Context, id string, req UpdateRequest) (*UpdateResult, error) {
	bad := map[string]string{}
	var regionsNew, regionsExp *[]string
	if req.Changes.Regions != nil {
		list, msg := cleanRegions(*req.Changes.Regions)
		switch {
		case msg != "":
			bad["collector_regions"] = msg
		case len(list) == 0:
			bad["collector_regions"] = "Enter at least one region, for example ap-south-1."
		default:
			regionsNew = &list
		}
	}
	if req.Expected.Regions != nil {
		list := make([]string, 0, len(*req.Expected.Regions))
		for _, r := range *req.Expected.Regions {
			list = append(list, strings.TrimSpace(r))
		}
		regionsExp = &list
	}
	c, e := req.Changes, req.Expected
	edits := []edit{
		{"domain_name", "domain_name", trimmed(e.DomainName, true), trimmed(c.DomainName, true), false},
		{"collector_aws_account_id", "collector_aws_account_id", trimmed(e.AWSAccountID, false), trimmed(c.AWSAccountID, false), false},
		{"collector_external_id", "collector_external_id", trimmed(e.ExternalID, false), trimmed(c.ExternalID, false), false},
		{"collector_event_bridge_arn", "collector_event_bridge_arn", trimmed(e.EventBridgeARN, false), trimmed(c.EventBridgeARN, false), false},
		{"collector_regions", "collector_regions", joinRegions(regionsExp), joinRegions(regionsNew), true},
	}
	checks := map[string]func(string) string{
		"domain_name":                checkDomain,
		"collector_aws_account_id":   checkAccount,
		"collector_external_id":      checkExternal,
		"collector_event_bridge_arn": checkBus,
	}
	asked := 0
	for _, ed := range edits {
		if ed.field == "collector_regions" && req.Changes.Regions != nil {
			asked++
			continue
		}
		if ed.value == nil {
			continue
		}
		asked++
		if *ed.value == "" {
			bad[ed.field] = "Enter a value. A saved detail can't be left empty."
		} else if m := checks[ed.field](*ed.value); m != "" {
			bad[ed.field] = m
		}
	}
	if asked == 0 {
		bad["_"] = "There is nothing to save."
	}
	if len(bad) > 0 {
		return nil, &ValidationError{Fields: bad}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, stmt := range []string{`SET LOCAL lock_timeout = '20s'`, `SET LOCAL statement_timeout = '60s'`} {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return nil, fmt.Errorf("set timeouts: %w", err)
		}
	}
	// The same lock onboarding takes, so an edit and an onboarding never interleave.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey); err != nil {
		return nil, fmt.Errorf("lock: %w", err)
	}
	cur, err := scanTenant(tx.QueryRowContext(ctx, `SELECT `+tenantColumns+` FROM `+s.table("tenants")+` WHERE tenant_id = $1::uuid FOR UPDATE`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, NotFoundError{}
	}
	if err != nil {
		return nil, fmt.Errorf("read company: %w", err)
	}
	now := map[string]string{
		"domain_name":                strings.ToLower(cur.DomainName),
		"collector_aws_account_id":   cur.AWSAccountID,
		"collector_external_id":      cur.ExternalID,
		"collector_event_bridge_arn": cur.EventBridgeARN,
		"collector_regions":          strings.Join(cur.Regions, ","),
	}

	// Only the fields that really differ are written; each must still be what
	// the person was looking at.
	var set []string
	var args []any
	var changed []string
	args = append(args, id)
	changing := map[string]bool{}
	for _, ed := range edits {
		if ed.value == nil {
			continue
		}
		if ed.expected == nil || *ed.expected != now[ed.field] {
			return nil, StaleError{}
		}
		if *ed.value == now[ed.field] {
			continue
		}
		changing[ed.field] = true
		changed = append(changed, ed.field)
		args = append(args, *ed.value)
		ph := fmt.Sprintf("$%d::text", len(args))
		if ed.isList {
			ph = "string_to_array(" + ph + ", ',')"
		}
		set = append(set, ed.column+" = "+ph)
	}
	if len(set) == 0 {
		return &UpdateResult{Tenant: *cur, Changed: []string{}}, nil
	}

	// A detail saved long ago in an old format would make the database refuse
	// any update of the row. Say which one, instead of a database error.
	for field, check := range checks {
		if changing[field] || now[field] == "" {
			continue
		}
		if check(now[field]) != "" {
			bad[field] = "This saved value is in an old format. Update it too, then save."
		}
	}
	if len(bad) > 0 {
		return nil, &ValidationError{Fields: bad}
	}

	// One company per domain and per External ID.
	conflict := map[string]string{}
	for field, col := range map[string]string{"domain_name": "lower(domain_name)", "collector_external_id": "collector_external_id"} {
		if !changing[field] {
			continue
		}
		var v string
		for _, ed := range edits {
			if ed.field == field {
				v = *ed.value
			}
		}
		var other string
		err := tx.QueryRowContext(ctx, `SELECT db_name FROM `+s.table("tenants")+` WHERE `+col+` = $1::text AND tenant_id <> $2::uuid LIMIT 1`, v, id).Scan(&other)
		if err == nil {
			if field == "domain_name" {
				conflict[field] = "Another company already uses this domain."
			} else {
				conflict[field] = "Another company already uses this External ID."
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("check duplicates: %w", err)
		}
	}
	if len(conflict) > 0 {
		var msgs []string
		for _, m := range conflict {
			msgs = append(msgs, m)
		}
		return nil, &ConflictError{Message: "Nothing was changed. " + strings.Join(msgs, " "), Fields: conflict}
	}

	row := tx.QueryRowContext(ctx, `UPDATE `+s.table("tenants")+` SET `+strings.Join(set, ", ")+` WHERE tenant_id = $1::uuid RETURNING `+tenantColumns, args...)
	updated, err := scanTenant(row)
	if err != nil {
		return nil, fmt.Errorf("save company: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &UpdateResult{Tenant: *updated, Changed: changed}, nil
}

/* ---------- deleting a company ---------- */

// DeletePreview says what deleting a company would remove, so the person can see
// the consequence before they confirm it.
type DeletePreview struct {
	TenantID     string `json:"tenant_id"`
	DBName       string `json:"db_name"`
	Users        int    `json:"users"`
	Tables       int    `json:"tables"`
	Accounts     int    `json:"accounts"` // AWS accounts connected in the workspace
	SchemaExists bool   `json:"workspace_exists"`
}

// DeleteResult says what was removed.
type DeleteResult struct {
	TenantID      string `json:"tenant_id"`
	DBName        string `json:"db_name"`
	UsersDeleted  int    `json:"users_deleted"`
	WorkspaceGone bool   `json:"workspace_dropped"`
}

// protectedName is a schema that must never be dropped, whatever a tenants row says:
// the shared ones, and Postgres' own.
func (s *Service) protectedName(name string) bool {
	n := strings.ToLower(name)
	return n == "" || reserved[n] || n == strings.ToLower(s.global) || strings.HasPrefix(n, "pg_")
}

func (s *Service) workspaceExists(ctx context.Context, tx *sql.Tx, name string) (bool, error) {
	var ok bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)`, name).Scan(&ok)
	return ok, err
}

// PreviewDelete counts what a delete would remove. It changes nothing.
func (s *Service) PreviewDelete(ctx context.Context, id string) (*DeletePreview, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	t, err := scanTenant(tx.QueryRowContext(ctx, `SELECT `+tenantColumns+` FROM `+s.table("tenants")+` WHERE tenant_id = $1::uuid`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, NotFoundError{}
	}
	if err != nil {
		return nil, fmt.Errorf("read company: %w", err)
	}
	p := &DeletePreview{TenantID: t.TenantID, DBName: t.DBName}
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM `+s.table("nhi_users")+` WHERE tenant_id = $1::uuid`, id).Scan(&p.Users); err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}
	if p.SchemaExists, err = s.workspaceExists(ctx, tx, t.DBName); err != nil {
		return nil, fmt.Errorf("check workspace: %w", err)
	}
	if p.SchemaExists && !s.protectedName(t.DBName) {
		tables, err := tableNames(ctx, tx, t.DBName)
		if err != nil {
			return nil, err
		}
		p.Tables = len(tables)
		var has bool
		if err := tx.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, quote(t.DBName)+".accounts").Scan(&has); err != nil {
			return nil, fmt.Errorf("check accounts: %w", err)
		}
		if has {
			if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM `+quote(t.DBName)+`.accounts`).Scan(&p.Accounts); err != nil {
				return nil, fmt.Errorf("count accounts: %w", err)
			}
		}
	}
	return p, nil
}

// DeleteTenant removes a company completely and for good: its tenants row, its
// users (and their sign-in tokens), and its whole workspace. All of it happens in
// one transaction, so a failure leaves everything as it was. confirm must be the
// company's workspace name, typed out.
func (s *Service) DeleteTenant(ctx context.Context, id, confirm string) (*DeleteResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	for _, stmt := range []string{`SET LOCAL lock_timeout = '20s'`, `SET LOCAL statement_timeout = '180s'`} {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return nil, fmt.Errorf("set timeouts: %w", err)
		}
	}
	// The same lock onboarding and editing take: nothing else changes the company meanwhile.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey); err != nil {
		return nil, fmt.Errorf("lock: %w", err)
	}
	t, err := scanTenant(tx.QueryRowContext(ctx, `SELECT `+tenantColumns+` FROM `+s.table("tenants")+` WHERE tenant_id = $1::uuid FOR UPDATE`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, NotFoundError{}
	}
	if err != nil {
		return nil, fmt.Errorf("read company: %w", err)
	}
	if s.protectedName(t.DBName) {
		return nil, &ConflictError{
			Message: fmt.Sprintf("Nothing was deleted. %q is a name this tool never deletes. Remove that company by hand if you are sure.", t.DBName),
			Fields:  map[string]string{"confirm": "Protected name."},
		}
	}
	if strings.TrimSpace(confirm) != t.DBName {
		return nil, &ValidationError{Fields: map[string]string{"confirm": "Type the workspace name exactly as shown to confirm."}}
	}

	res := &DeleteResult{TenantID: t.TenantID, DBName: t.DBName}
	var hasTokens bool
	if err := tx.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, quote(s.global)+".refresh_tokens").Scan(&hasTokens); err != nil {
		return nil, fmt.Errorf("check tokens: %w", err)
	}
	if hasTokens { // explicit, so it works whether or not the foreign key cascades
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+s.table("refresh_tokens")+` WHERE user_id IN (SELECT id FROM `+s.table("nhi_users")+` WHERE tenant_id = $1::uuid)`, id); err != nil {
			return nil, fmt.Errorf("delete sign-in tokens: %w", err)
		}
	}
	r, err := tx.ExecContext(ctx, `DELETE FROM `+s.table("nhi_users")+` WHERE tenant_id = $1::uuid`, id)
	if err != nil {
		return nil, fmt.Errorf("delete users: %w", err)
	}
	n, _ := r.RowsAffected()
	res.UsersDeleted = int(n)

	exists, err := s.workspaceExists(ctx, tx, t.DBName)
	if err != nil {
		return nil, fmt.Errorf("check workspace: %w", err)
	}
	if exists {
		if _, err := tx.ExecContext(ctx, `DROP SCHEMA `+quote(t.DBName)+` CASCADE`); err != nil {
			return nil, fmt.Errorf("drop workspace: %w", err)
		}
		res.WorkspaceGone = true
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM `+s.table("tenants")+` WHERE tenant_id = $1::uuid`, id); err != nil {
		return nil, fmt.Errorf("delete company: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return res, nil
}
