package auditlog

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/audit"
	"nhi-backend-api/internal/platform/database"
)

// Repository reads the audit log. It only ever reads: entries are written by
// the middleware and are never edited or deleted from the console, which is
// what makes the log worth having.
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

func (r *Repository) table() string { return database.Table(r.schema, "audit_logs") }

// Query is one page of the log, already narrowed to a tenant.
type Query struct {
	TenantID string
	// Actor narrows to one person. The handler sets it for a role that may
	// only see its own actions, so the narrowing cannot be bypassed by a
	// parameter.
	Actor    string
	Action   string
	Outcome  string
	Search   string
	From     *time.Time
	To       *time.Time
	Page     int
	PageSize int
}

type Page struct {
	Entries  []audit.Entry `json:"entries"`
	Total    int           `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

const selectColumns = `id, occurred_at, COALESCE(tenant_id::text, ''), actor, actor_role, action,
	method, route, path, target, status, outcome, error_code, request_id,
	COALESCE(host(ip), ''), user_agent, duration_ms, screen, details::text`

// where builds the filter shared by the page query and its count, so the two
// can never drift apart.
func (q Query) where() (string, []any) {
	conds := []string{"tenant_id = $1::uuid"}
	args := []any{q.TenantID}
	add := func(cond string, val any) {
		args = append(args, val)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if q.Actor != "" {
		add("lower(actor) = lower($%d)", q.Actor)
	}
	if q.Action != "" {
		add("action = $%d", q.Action)
	}
	if q.Outcome != "" {
		add("outcome = $%d", q.Outcome)
	}
	if q.From != nil {
		add("occurred_at >= $%d", *q.From)
	}
	if q.To != nil {
		add("occurred_at < $%d", *q.To)
	}
	if q.Search != "" {
		// ILIKE over the columns a person searches by. The gin index covers
		// the common case; this stays correct for a partial word either way.
		args = append(args, "%"+q.Search+"%")
		n := len(args)
		conds = append(conds, fmt.Sprintf(
			"(actor ILIKE $%d OR action ILIKE $%d OR target ILIKE $%d OR path ILIKE $%d OR screen ILIKE $%d)",
			n, n, n, n, n))
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

func (r *Repository) List(ctx context.Context, q Query) (*Page, error) {
	if r.db == nil {
		return nil, fmt.Errorf("audit log repository is not initialized")
	}
	where, args := q.where()

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT count(*) FROM `+r.table()+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count audit entries: %w", err)
	}

	page := Page{Entries: []audit.Entry{}, Total: total, Page: q.Page, PageSize: q.PageSize}
	if total == 0 {
		return &page, nil
	}
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	rows, err := r.db.QueryContext(ctx, `SELECT `+selectColumns+` FROM `+r.table()+where+
		fmt.Sprintf(" ORDER BY occurred_at DESC, id DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return nil, fmt.Errorf("read audit entries: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		e, err := scan(rows)
		if err != nil {
			return nil, err
		}
		page.Entries = append(page.Entries, *e)
	}
	return &page, rows.Err()
}

func scan(rows *sql.Rows) (*audit.Entry, error) {
	var e audit.Entry
	var details string
	if err := rows.Scan(&e.ID, &e.OccurredAt, &e.TenantID, &e.Actor, &e.ActorRole, &e.Action,
		&e.Method, &e.Route, &e.Path, &e.Target, &e.Status, &e.Outcome, &e.ErrorCode,
		&e.RequestID, &e.IP, &e.UserAgent, &e.DurationMS, &e.Screen, &details); err != nil {
		return nil, fmt.Errorf("read audit entry: %w", err)
	}
	e.Details = decodeDetails(details)
	return &e, nil
}

// Facets are the values the console offers in its filters, so a person picks
// from what the log actually holds rather than typing a guess.
type Facets struct {
	Actions  []string `json:"actions"`
	Actors   []string `json:"actors"`
	Outcomes []string `json:"outcomes"`
}

func (r *Repository) Facets(ctx context.Context, tenantID string, actor string) (*Facets, error) {
	if r.db == nil {
		return nil, fmt.Errorf("audit log repository is not initialized")
	}
	out := &Facets{Actions: []string{}, Actors: []string{}, Outcomes: []string{}}
	// Only the last 90 days: a filter list is about what is being looked at,
	// and the query stays fast as the log grows.
	const window = " AND occurred_at >= now() - interval '90 days'"
	narrow := ""
	args := []any{tenantID}
	if actor != "" {
		args = append(args, actor)
		narrow = " AND lower(actor) = lower($2)"
	}
	for _, f := range []struct {
		column string
		into   *[]string
	}{
		{"action", &out.Actions},
		{"actor", &out.Actors},
		{"outcome", &out.Outcomes},
	} {
		rows, err := r.db.QueryContext(ctx,
			`SELECT DISTINCT `+f.column+` FROM `+r.table()+
				` WHERE tenant_id = $1::uuid`+narrow+window+
				` AND `+f.column+` <> '' ORDER BY 1 LIMIT 300`, args...)
		if err != nil {
			return nil, fmt.Errorf("read audit %s values: %w", f.column, err)
		}
		for rows.Next() {
			var v string
			if err := rows.Scan(&v); err != nil {
				rows.Close()
				return nil, err
			}
			*f.into = append(*f.into, v)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}
