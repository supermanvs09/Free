package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

// The tenant tables, generated from nhi_db by scripts/extract_tenant_schema.py.
//
//go:embed sql/tenant_schema.sql
var schemaSQL string

//go:embed sql/tenant_seed.sql
var seedSQL string

const (
	// maxNameLength keeps every index and constraint name that embeds the
	// tenant name within Postgres' 63 characters, so none is silently truncated.
	maxNameLength = 23

	// One onboarding at a time: it is rare, and a single lock makes "two people
	// submit the same company" impossible to race.
	lockKey = 7461001

	minPassword = 10
	maxPassword = 72 // bcrypt ignores everything after 72 bytes
)

var roles = []string{"admin", "manager", "analyst", "user"}

var (
	uuidRE     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	slugRE     = regexp.MustCompile(`[^a-z0-9]+`)
	accountRE  = regexp.MustCompile(`^[0-9]{12}$`)
	externalRE = regexp.MustCompile(`^[A-Za-z0-9+=,.@:/_-]{16,255}$`)
	suffixRE   = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`)
	busARNRE   = regexp.MustCompile(`^arn:aws[a-z-]*:events:[a-z0-9-]+:[0-9]{12}:event-bus/[.\-_A-Za-z0-9]+$`)
	regionRE   = regexp.MustCompile(`^[a-z]{2}(-[a-z0-9]+)+-[0-9]$`)
	usernameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,31}$`)
	tableRE    = regexp.MustCompile(`(?m)^CREATE TABLE __SCHEMA__\.([a-z0-9_]+) `)

	// Names a tenant must not take: other schemas of nhi_db, and Postgres' own.
	reserved = map[string]bool{"public": true, "nhi_global": true, "nhi_scanner": true, "information_schema": true}
)

// UserInput is the optional first user of the company.
type UserInput struct {
	Username   string `json:"username"` // the part before the @
	FullName   string `json:"full_name"`
	Password   string `json:"password"`
	Role       string `json:"role"`
	Department string `json:"department"`
	Team       string `json:"team"`
}

// Request is what the form sends.
type Request struct {
	CompanyName       string     `json:"company_name"`
	AWSAccountID      string     `json:"collector_aws_account_id"`
	ExternalID        string     `json:"collector_external_id"`
	EventBridgeARN    string     `json:"collector_event_bridge_arn"`
	Regions           []string   `json:"collector_regions"`
	CustomerAccountID string     `json:"customer_aws_account_id"`
	User              *UserInput `json:"admin_user"`
}

// Tenant is a row of nhi_global.tenants.
type Tenant struct {
	TenantID       string     `json:"tenant_id"`
	DBName         string     `json:"db_name"`
	CreatedAt      *time.Time `json:"created_at"`
	DomainName     string     `json:"domain_name"`
	AWSAccountID   string     `json:"collector_aws_account_id"`
	ExternalID     string     `json:"collector_external_id"`
	EventBridgeARN string     `json:"collector_event_bridge_arn"`
	Regions        []string   `json:"collector_regions"`
}

// Difference is a submitted value that disagrees with the registered company.
// Nothing is overwritten (an External ID in particular must never change once
// a customer's role trusts it); the page shows the difference instead.
type Difference struct {
	Field      string `json:"field"`
	Registered string `json:"registered"`
	Submitted  string `json:"submitted"`
}

// UserReport describes the user that was created.
type UserReport struct {
	ID        int       `json:"id"`
	Username  string    `json:"username"` // name@workspace, what they type to sign in
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// Result is the answer to the form.
type Result struct {
	Outcome     string       `json:"outcome"` // created | already_exists
	Tenant      Tenant       `json:"tenant"`
	Setup       string       `json:"setup"`        // created | existing
	Incomplete  bool         `json:"incomplete"`   // an existing setup is missing parts
	AccountID   string       `json:"account_id"`   // the customer account pre-registered ("" if none)
	AccountNote string       `json:"account_note"` // why none was added, when one was asked for
	Differences []Difference `json:"differences,omitempty"`
	User        *UserReport  `json:"user,omitempty"`
}

const (
	OutcomeCreated       = "created"
	OutcomeAlreadyExists = "already_exists"
)

// ValidationError lists the fields that are wrong, by field name.
type ValidationError struct{ Fields map[string]string }

func (e *ValidationError) Error() string {
	keys := make([]string, 0, len(e.Fields))
	for k := range e.Fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+": "+e.Fields[k])
	}
	return "invalid details: " + strings.Join(parts, "; ")
}

// ConflictError means the details collide with something already registered.
type ConflictError struct {
	Message string
	Fields  map[string]string
}

func (e *ConflictError) Error() string { return e.Message }

// WorkspaceName turns a company name into the tenant's db_name: lowercase
// letters, digits and underscores, at most maxNameLength. The same company
// written the same way always gives the same name, which is what stops a
// second submission from adding a second row. A name too long to fit keeps its
// start and gains a short hash of the whole, so two long names that begin alike
// stay apart.
func WorkspaceName(company string) (string, error) {
	full := strings.Trim(slugRE.ReplaceAllString(strings.ToLower(strings.TrimSpace(company)), "_"), "_")
	if full == "" {
		return "", fmt.Errorf("Use letters or digits (A-Z, 0-9) in the company name.")
	}
	if full[0] >= '0' && full[0] <= '9' {
		full = "c" + full
	}
	name := full
	if len(name) > maxNameLength {
		sum := sha256.Sum256([]byte(full))
		name = strings.TrimRight(full[:maxNameLength-6], "_") + "_" + hex.EncodeToString(sum[:])[:5]
	}
	if reserved[name] || strings.HasPrefix(name, "pg_") {
		name += "_co"
	}
	return name, nil
}

// DomainFor is the tenant's domain_name: its workspace name with hyphens, under
// the suffix. The database requires a dotted name, and one per company.
func DomainFor(workspace, suffix string) string {
	return strings.ReplaceAll(workspace, "_", "-") + "." + suffix
}

// cleaned is a validated request with its derived names.
type cleaned struct {
	Request
	Company   string
	Workspace string
	Domain    string
	hash      []byte // bcrypt of the new user's password, computed outside the transaction
}

func required(bad map[string]string, field, value, msg string) bool {
	if strings.TrimSpace(value) == "" {
		bad[field] = msg
		return false
	}
	return true
}

// Normalize trims and checks every field. It returns the cleaned request, or a
// *ValidationError naming each bad field.
func Normalize(in Request) (*cleaned, error) {
	bad := map[string]string{}
	c := &cleaned{Request: in}
	c.Company = strings.Join(strings.Fields(in.CompanyName), " ")
	c.AWSAccountID = strings.TrimSpace(in.AWSAccountID)
	c.ExternalID = strings.TrimSpace(in.ExternalID)
	c.EventBridgeARN = strings.TrimSpace(in.EventBridgeARN)
	c.CustomerAccountID = strings.TrimSpace(in.CustomerAccountID)

	switch n := utf8.RuneCountInString(c.Company); {
	case n < 2:
		bad["company_name"] = "Enter the company name."
	case n > 80:
		bad["company_name"] = "Keep the company name under 80 characters."
	default:
		w, err := WorkspaceName(c.Company)
		if err != nil {
			bad["company_name"] = err.Error()
		} else {
			c.Workspace = w
		}
	}

	if required(bad, "collector_aws_account_id", c.AWSAccountID, "Enter the collector AWS account ID.") {
		if m := checkAccount(c.AWSAccountID); m != "" {
			bad["collector_aws_account_id"] = m
		}
	}
	if required(bad, "collector_external_id", c.ExternalID, "Enter the collector external ID.") {
		if m := checkExternal(c.ExternalID); m != "" {
			bad["collector_external_id"] = m
		}
	}
	if required(bad, "collector_event_bridge_arn", c.EventBridgeARN, "Enter the collector event bus ARN.") {
		if m := checkBus(c.EventBridgeARN); m != "" {
			bad["collector_event_bridge_arn"] = m
		}
	}
	regions, msg := cleanRegions(in.Regions)
	switch {
	case msg != "":
		bad["collector_regions"] = msg
	case len(regions) == 0:
		bad["collector_regions"] = "Enter at least one region, for example ap-south-1."
	default:
		c.Regions = regions
	}
	if c.CustomerAccountID != "" && checkAccount(c.CustomerAccountID) != "" {
		bad["customer_aws_account_id"] = "Must be exactly 12 digits, or leave it empty."
	}

	if u := in.User; u != nil {
		cu := *u
		cu.Username = strings.ToLower(strings.TrimSpace(strings.SplitN(u.Username, "@", 2)[0]))
		cu.FullName = strings.Join(strings.Fields(u.FullName), " ")
		cu.Role = strings.ToLower(strings.TrimSpace(u.Role))
		if cu.Role == "" {
			cu.Role = "admin"
		}
		cu.Department = strings.Join(strings.Fields(u.Department), " ")
		cu.Team = strings.Join(strings.Fields(u.Team), " ")
		if !usernameRE.MatchString(cu.Username) {
			bad["user_username"] = "Use 2-32 characters: lowercase letters, digits, dot, dash or underscore."
		}
		if n := utf8.RuneCountInString(cu.FullName); n < 2 || n > 100 {
			bad["user_full_name"] = "Enter the user's full name."
		}
		if !contains(roles, cu.Role) {
			bad["user_role"] = "Pick one of: " + strings.Join(roles, ", ") + "."
		}
		switch {
		case len(u.Password) < minPassword:
			bad["user_password"] = fmt.Sprintf("Use at least %d characters.", minPassword)
		case len(u.Password) > maxPassword:
			bad["user_password"] = fmt.Sprintf("Use at most %d characters.", maxPassword)
		}
		if utf8.RuneCountInString(cu.Department) > 100 {
			bad["user_department"] = "Keep it under 100 characters."
		}
		if utf8.RuneCountInString(cu.Team) > 100 {
			bad["user_team"] = "Keep it under 100 characters."
		}
		c.User = &cu
	}
	if len(bad) > 0 {
		return nil, &ValidationError{Fields: bad}
	}
	if c.User != nil {
		h, err := bcrypt.GenerateFromPassword([]byte(c.User.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		c.hash = h
	}
	return c, nil
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// Service onboards companies into one database.
type Service struct {
	db     *sql.DB
	global string
	suffix string // appended to the workspace name to make each company's domain
	now    func() time.Time
	source string // which database and schema this tool reads, for the Approvals page
}

// SetSource names the database this tool reads ("nhi_db on db.example:5432,
// schema nhi_global"); never the password.
func (s *Service) SetSource(v string) { s.source = v }

// NewService returns a Service over the database holding the global schema.
// domainSuffix ends every generated domain (acme-corp.<suffix>).
func NewService(db *sql.DB, globalSchema, domainSuffix string) (*Service, error) {
	if strings.TrimSpace(globalSchema) == "" {
		globalSchema = "nhi_global"
	}
	domainSuffix = strings.ToLower(strings.Trim(strings.TrimSpace(domainSuffix), "."))
	if !suffixRE.MatchString(domainSuffix) || len(domainSuffix) > 150 {
		return nil, fmt.Errorf("DOMAIN_SUFFIX %q is not a domain such as nhi.local", domainSuffix)
	}
	return &Service{db: db, global: globalSchema, suffix: domainSuffix, now: time.Now}, nil
}

// quote makes an identifier safe to put in SQL text.
func quote(id string) string { return `"` + strings.ReplaceAll(id, `"`, `""`) + `"` }

func (s *Service) table(name string) string { return quote(s.global) + "." + quote(name) }

// Onboard registers the company and, in the same transaction, builds its
// workspace, its optional customer account and its optional first user: either
// everything is there afterwards or nothing changed.
func (s *Service) Onboard(ctx context.Context, raw Request) (*Result, error) {
	in, err := Normalize(raw)
	if err != nil {
		return nil, err
	}
	in.Domain = DomainFor(in.Workspace, s.suffix)
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
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey); err != nil {
		return nil, fmt.Errorf("lock: %w", err)
	}

	found, err := s.lookup(ctx, tx, in)
	if err != nil {
		return nil, err
	}
	res := &Result{}
	if len(found) == 0 {
		t, err := s.insertTenant(ctx, tx, in)
		if err != nil {
			return nil, err
		}
		res.Outcome, res.Tenant = OutcomeCreated, *t
	} else {
		same, err := sameCompany(in, found)
		if err != nil {
			return nil, err
		}
		res.Outcome, res.Tenant, res.Differences = OutcomeAlreadyExists, *same, differences(in, *same)
	}

	name := res.Tenant.DBName
	res.Setup, res.Incomplete, err = s.ensureWorkspace(ctx, tx, name)
	if err != nil {
		return nil, err
	}
	switch {
	case in.CustomerAccountID != "" && res.Incomplete:
		res.AccountNote = "The company's setup is incomplete, so the customer account was not added."
	case in.CustomerAccountID != "":
		res.AccountID, res.AccountNote, err = s.registerAccount(ctx, tx, res.Tenant, in.CustomerAccountID)
		if err != nil {
			return nil, err
		}
	}
	if in.User != nil {
		res.User, err = s.insertUser(ctx, tx, res.Tenant, in)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return res, nil
}

const tenantColumns = `tenant_id::text, db_name, created_at, COALESCE(domain_name, ''), COALESCE(collector_aws_account_id, ''),
	COALESCE(collector_external_id, ''), COALESCE(collector_event_bridge_arn, ''), COALESCE(array_to_string(collector_regions, ','), '')`

func scanTenant(row interface{ Scan(...any) error }) (*Tenant, error) {
	var t Tenant
	var created sql.NullTime
	var regions string
	if err := row.Scan(&t.TenantID, &t.DBName, &created, &t.DomainName, &t.AWSAccountID, &t.ExternalID, &t.EventBridgeARN, &regions); err != nil {
		return nil, err
	}
	if created.Valid {
		c := created.Time
		t.CreatedAt = &c
	}
	t.Regions = []string{}
	if regions != "" {
		t.Regions = strings.Split(regions, ",")
	}
	return &t, nil
}

// lookup finds every registered company the request points at: by workspace
// name, by domain, or by the External ID (which must belong to one company).
func (s *Service) lookup(ctx context.Context, tx *sql.Tx, in *cleaned) ([]Tenant, error) {
	rows, err := tx.QueryContext(ctx, `SELECT `+tenantColumns+` FROM `+s.table("tenants")+`
		WHERE db_name = $1 OR lower(domain_name) = $2 OR collector_external_id = $3
		ORDER BY created_at NULLS LAST, tenant_id`, in.Workspace, in.Domain, in.ExternalID)
	if err != nil {
		return nil, fmt.Errorf("look up company: %w", err)
	}
	defer rows.Close()
	var out []Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, fmt.Errorf("read company: %w", err)
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

// sameCompany decides whether the rows found are exactly the submitted company,
// and says what collides when they are not.
func sameCompany(in *cleaned, found []Tenant) (*Tenant, error) {
	var match *Tenant
	for i := range found {
		if found[i].DBName == in.Workspace {
			match = &found[i]
		}
	}
	if match != nil && len(found) == 1 {
		return match, nil
	}
	conflict := map[string]string{}
	for _, t := range found {
		if match != nil && t.TenantID == match.TenantID {
			continue
		}
		if in.ExternalID != "" && t.ExternalID == in.ExternalID {
			conflict["collector_external_id"] = "This external ID already belongs to another company."
		}
		if strings.EqualFold(t.DomainName, in.Domain) {
			conflict["company_name"] = "A different company already uses this name's domain. Use a more specific company name."
		}
	}
	if match == nil && len(conflict) == 0 {
		conflict["company_name"] = "This name is too close to one already registered. Use a more specific company name."
	}
	if len(conflict) == 0 {
		// The company exists, and so do rows that only share its domain or
		// External ID: report instead of guessing which is meant.
		conflict["company_name"] = "These details match more than one registered company."
	}
	msgs := make([]string, 0, len(conflict))
	for _, m := range conflict {
		msgs = append(msgs, m)
	}
	sort.Strings(msgs)
	return nil, &ConflictError{Message: "Nothing was changed. " + strings.Join(msgs, " "), Fields: conflict}
}

// differences lists submitted values that disagree with the registered company.
func differences(in *cleaned, t Tenant) []Difference {
	var out []Difference
	add := func(field, registered, submitted string) {
		if submitted != registered {
			out = append(out, Difference{Field: field, Registered: registered, Submitted: submitted})
		}
	}
	add("collector_aws_account_id", t.AWSAccountID, in.AWSAccountID)
	add("collector_external_id", t.ExternalID, in.ExternalID)
	add("collector_event_bridge_arn", t.EventBridgeARN, in.EventBridgeARN)
	a, b := append([]string(nil), in.Regions...), append([]string(nil), t.Regions...)
	sort.Strings(a)
	sort.Strings(b)
	if strings.Join(a, ", ") != strings.Join(b, ", ") {
		out = append(out, Difference{Field: "collector_regions", Registered: strings.Join(t.Regions, ", "), Submitted: strings.Join(in.Regions, ", ")})
	}
	return out
}

func (s *Service) insertTenant(ctx context.Context, tx *sql.Tx, in *cleaned) (*Tenant, error) {
	row := tx.QueryRowContext(ctx, `INSERT INTO `+s.table("tenants")+`
		(tenant_id, db_name, created_at, domain_name, collector_aws_account_id, collector_external_id, collector_event_bridge_arn, collector_regions)
		VALUES ($1::uuid, $2::text, now(), $3::text, $4::text, $5::text, $6::text, string_to_array($7::text, ','))
		RETURNING `+tenantColumns, newUUID(), in.Workspace, in.Domain, in.AWSAccountID, in.ExternalID, in.EventBridgeARN, strings.Join(in.Regions, ","))
	t, err := scanTenant(row)
	if err != nil {
		return nil, fmt.Errorf("add company: %w", err)
	}
	return t, nil
}

// ensureWorkspace builds the company's tables unless it already has some. An
// existing workspace is never altered: it may hold a live company's data.
func (s *Service) ensureWorkspace(ctx context.Context, tx *sql.Tx, name string) (state string, incomplete bool, err error) {
	if err := validWorkspace(name); err != nil {
		return "", false, err
	}
	existing, err := tableNames(ctx, tx, name)
	if err != nil {
		return "", false, err
	}
	if len(existing) > 0 {
		have := map[string]bool{}
		for _, t := range existing {
			have[t] = true
		}
		for _, t := range expectedTables() {
			if !have[t] {
				return "existing", true, nil
			}
		}
		return "existing", false, nil
	}
	steps := []struct{ what, sql string }{
		{"create workspace", `CREATE SCHEMA IF NOT EXISTS ` + quote(name)},
		{"create tables", strings.ReplaceAll(schemaSQL, "__SCHEMA__", name)},
		{"create partitions", partitionsSQL(name, s.now().UTC())},
		{"add reference rows", strings.ReplaceAll(seedSQL, "__SCHEMA__", name)},
	}
	for _, st := range steps {
		if _, err := tx.ExecContext(ctx, st.sql); err != nil {
			return "", false, fmt.Errorf("%s: %w", st.what, err)
		}
	}
	return "created", false, nil
}

// validWorkspace guards the name that goes into SQL text. Names this service
// makes always pass; an older company with capitals or a long name does not and
// has to be set up by hand.
func validWorkspace(name string) error {
	if len(name) == 0 || len(name) > maxNameLength || reserved[name] || strings.HasPrefix(name, "pg_") ||
		strings.Trim(name, "abcdefghijklmnopqrstuvwxyz0123456789_") != "" || name[0] < 'a' || name[0] > 'z' {
		return &ConflictError{
			Message: fmt.Sprintf("%q is registered, but its name cannot be set up automatically. Set it up by hand.", name),
			Fields:  map[string]string{"company_name": "Cannot be set up automatically."},
		}
	}
	return nil
}

// registerAccount pre-registers the customer's AWS account in the company's
// workspace with the collector External ID, so it is ready for the customer to
// connect. It never changes an account that is already there.
func (s *Service) registerAccount(ctx context.Context, tx *sql.Tx, t Tenant, account string) (id, note string, err error) {
	if err := validWorkspace(t.DBName); err != nil {
		return "", "", err
	}
	// An AWS account belongs to one company.
	rows, err := tx.QueryContext(ctx, `SELECT db_name FROM `+s.table("tenants")+` WHERE tenant_id <> $1::uuid`, t.TenantID)
	if err != nil {
		return "", "", fmt.Errorf("list companies: %w", err)
	}
	var others []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return "", "", err
		}
		others = append(others, n)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", "", err
	}
	rows.Close()
	for _, n := range others {
		var has bool
		if err := tx.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, quote(n)+".accounts").Scan(&has); err != nil {
			return "", "", fmt.Errorf("check account: %w", err)
		}
		if !has {
			continue
		}
		var taken bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+quote(n)+`.accounts WHERE account_id = $1::text)`, account).Scan(&taken); err != nil {
			return "", "", fmt.Errorf("check account: %w", err)
		}
		if taken {
			return "", "", &ConflictError{
				Message: "Nothing was changed. This AWS account already belongs to another company.",
				Fields:  map[string]string{"customer_aws_account_id": "Already used by another company."},
			}
		}
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO `+quote(t.DBName)+`.accounts
		(tenant_id, account_id, is_default, client_aws_account_id, regions, external_id, is_connected, account_status)
		SELECT $1::uuid, $2::text, true, $2::text, string_to_array($3::text, ','), $4::text, false, 'pending'
		WHERE NOT EXISTS (SELECT 1 FROM `+quote(t.DBName)+`.accounts WHERE account_id = $2::text)`,
		t.TenantID, account, strings.Join(t.Regions, ","), t.ExternalID)
	if err != nil {
		return "", "", fmt.Errorf("add account: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return account, "This account was already registered; it was left as it is.", nil
	}
	return account, "", nil
}

// insertUser adds the first sign-in. The username is name@workspace, the form
// the sign-in page accepts. The id is the next free one, taken under the lock.
func (s *Service) insertUser(ctx context.Context, tx *sql.Tx, t Tenant, in *cleaned) (*UserReport, error) {
	u := in.User
	login := u.Username + "@" + t.DBName
	var taken bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+s.table("nhi_users")+` WHERE lower(email) = $1::text)`, login).Scan(&taken); err != nil {
		return nil, fmt.Errorf("check user: %w", err)
	}
	if taken {
		return nil, &ConflictError{
			Message: fmt.Sprintf("Nothing was changed. The username %s already exists. Pick another.", login),
			Fields:  map[string]string{"user_username": "Already taken for this company."},
		}
	}
	var r UserReport
	err := tx.QueryRowContext(ctx, `INSERT INTO `+s.table("nhi_users")+`
		(id, email, password, full_name, department, role, tenant_id, status, last_login_at, created_at, team)
		VALUES ((SELECT COALESCE(max(id), 0) + 1 FROM `+s.table("nhi_users")+`), $1::text, $2::text, $3::text, NULLIF($4::text, ''), $5::text, $6::uuid, 'active', NULL, now(), $7::text)
		RETURNING id, email, full_name, role, created_at`,
		login, string(in.hash), u.FullName, u.Department, u.Role, t.TenantID, u.Team).
		Scan(&r.ID, &r.Username, &r.FullName, &r.Role, &r.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add user: %w", err)
	}
	return &r, nil
}

// tableNames lists the ordinary and partitioned tables of a schema, leaving
// out partition children (those are created per company and per date).
func tableNames(ctx context.Context, tx *sql.Tx, schema string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`, schema)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// expectedTables is every table a company's workspace should have, by name.
func expectedTables() []string {
	var out []string
	for _, m := range tableRE.FindAllStringSubmatch(schemaSQL, -1) {
		out = append(out, m[1])
	}
	sort.Strings(out)
	return out
}

// partitionsSQL creates the time partitions of the two partitioned posture
// tables: months around today for the daily one (plus a default), days around
// today for the hourly one. The posture engine adds later ones itself.
func partitionsSQL(schema string, today time.Time) string {
	var b strings.Builder
	q := quote(schema)
	month := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -1, 0)
	for i := 0; i < 7; i++ {
		from, to := month.AddDate(0, i, 0), month.AddDate(0, i+1, 0)
		fmt.Fprintf(&b, "CREATE TABLE IF NOT EXISTS %s.%s PARTITION OF %s.ispm_identity_posture_daily FOR VALUES FROM ('%s') TO ('%s');\n",
			q, quote("ispm_identity_posture_daily_"+from.Format("2006_01")), q, from.Format("2006-01-02"), to.Format("2006-01-02"))
	}
	fmt.Fprintf(&b, "CREATE TABLE IF NOT EXISTS %s.ispm_identity_posture_daily_default PARTITION OF %s.ispm_identity_posture_daily DEFAULT;\n", q, q)
	day := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1)
	for i := 0; i < 8; i++ {
		from, to := day.AddDate(0, 0, i), day.AddDate(0, 0, i+1)
		fmt.Fprintf(&b, "CREATE TABLE IF NOT EXISTS %s.%s PARTITION OF %s.ispm_identity_posture_hourly FOR VALUES FROM ('%s 00:00:00+00') TO ('%s 00:00:00+00');\n",
			q, quote("ispm_identity_posture_hourly_"+from.Format("20060102")), q, from.Format("2006-01-02"), to.Format("2006-01-02"))
	}
	return b.String()
}

func newUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("onboarding: no randomness: " + err.Error())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}
