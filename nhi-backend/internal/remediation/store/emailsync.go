package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The rule engine's e-mail sync keeps its position in ispm_finding_history in ispm_email_sync
// (one row per tenant: cursor_at and cursor_id, like the Jira sync). This service only READS
// that table: it never writes it, so it cannot disturb the engine's sync.

// EmailSync is the row of ispm_email_sync of the tenant.
type EmailSync struct {
	TenantID  string
	CursorAt  *time.Time
	CursorID  string
	UpdatedAt *time.Time
}

// ErrNoEmailSyncTable: the tenant schema has no ispm_email_sync table (the rule engine creates it).
var ErrNoEmailSyncTable = errors.New("ispm_email_sync does not exist")

func undefinedTable(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "42P01"
}

// GetEmailSync reads the tenant's row. It returns nil, nil when the engine has not written one yet.
func (s *Store) GetEmailSync(ctx context.Context) (*EmailSync, error) {
	var e EmailSync
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`SELECT tenant_id::text, cursor_at, COALESCE(cursor_id,''), updated_at FROM %s WHERE tenant_id = $1::uuid`,
		s.tbl("ispm_email_sync")), s.TenantID).Scan(&e.TenantID, &e.CursorAt, &e.CursorID, &e.UpdatedAt)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil, nil
	case undefinedTable(err):
		return nil, ErrNoEmailSyncTable
	case err != nil:
		return nil, err
	}
	return &e, nil
}

// HistoryEventByID reads one finding-history row of the tenant, or nil when there is none.
func (s *Store) HistoryEventByID(ctx context.Context, id string) (*HistoryEvent, error) {
	rows, err := s.pool.Query(ctx, s.historyFrom()+" AND h.id::text = $2 LIMIT 1", s.TenantID, id)
	if err != nil {
		return nil, err
	}
	evs, err := scanHistory(rows)
	if err != nil || len(evs) == 0 {
		return nil, err
	}
	return &evs[0], nil
}

// CountHistoryAfter counts the finding-history rows after the cursor (all rows when at is nil).
func (s *Store) CountHistoryAfter(ctx context.Context, at *time.Time, id string) (int, error) {
	q := fmt.Sprintf(`SELECT count(*) FROM %s h JOIN %s f ON f.finding_id = h.finding_id WHERE f.tenant_id = $1::uuid`,
		s.tbl("ispm_finding_history"), s.tbl("ispm_nhi_findings"))
	args := []any{s.TenantID}
	if at != nil {
		q += " AND (h.created_at, h.id::text) > ($2, $3)"
		args = append(args, *at, id)
	}
	var n int
	err := s.pool.QueryRow(ctx, q, args...).Scan(&n)
	return n, err
}
