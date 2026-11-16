package engine

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"
)

// Run is one queued blast-radius computation (correlation_engine_runs row).
type Run struct {
	ID          string     `json:"id"`
	SourceARN   string     `json:"source_arn"`
	Status      string     `json:"status"` // pending, running, completed, failed
	Refresh     bool       `json:"refresh"`
	Error       *string    `json:"error,omitempty"`
	TotalPaths  *int       `json:"total_paths,omitempty"`
	RequestedAt time.Time  `json:"requested_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	FinishedAt  *time.Time `json:"finished_at,omitempty"`
}

var ErrRunNotFound = errors.New("run not found")

// RunStore reads and writes the correlation_engine_runs queue. One store serves
// every tenant: each call names the tenant schema it works in.
type RunStore struct {
	db *sql.DB
}

func NewRunStore(db *sql.DB) *RunStore { return &RunStore{db: db} }

const runCols = `id::text, source_arn, status, refresh, error, total_paths, requested_at, started_at, finished_at`

func runsTable(schema string) string { return QualifiedTable(schema, "correlation_engine_runs") }

func scanRun(sc interface{ Scan(...any) error }) (*Run, error) {
	var r Run
	if err := sc.Scan(&r.ID, &r.SourceARN, &r.Status, &r.Refresh, &r.Error, &r.TotalPaths,
		&r.RequestedAt, &r.StartedAt, &r.FinishedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

// Enqueue adds a pending run. A pending run for the same ARN is reused so that
// repeated requests do not pile up duplicate work.
func (s *RunStore) Enqueue(ctx context.Context, schema, arn string, refresh bool) (*Run, error) {
	t := runsTable(schema)
	existing := s.db.QueryRowContext(ctx, fmt.Sprintf(
		`SELECT %s FROM %s WHERE source_arn = $1 AND status = 'pending' ORDER BY requested_at LIMIT 1`,
		runCols, t), arn)
	if r, err := scanRun(existing); err == nil {
		if refresh && !r.Refresh {
			if _, err := s.db.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET refresh = true WHERE id::text = $1`, t), r.ID); err != nil {
				return nil, fmt.Errorf("upgrade pending run to refresh: %w", err)
			}
			r.Refresh = true
		}
		return r, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("look up pending run: %w", err)
	}
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(
		`INSERT INTO %s (source_arn, refresh) VALUES ($1, $2) RETURNING %s`, t, runCols), arn, refresh)
	return scanRun(row)
}

func (s *RunStore) Get(ctx context.Context, schema, id string) (*Run, error) {
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(
		`SELECT %s FROM %s WHERE id::text = $1`, runCols, runsTable(schema)), id)
	r, err := scanRun(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRunNotFound
	}
	return r, err
}

func (s *RunStore) List(ctx context.Context, schema, status string, limit int) ([]Run, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(
		`SELECT %s FROM %s WHERE ($1 = '' OR status = $1) ORDER BY requested_at DESC LIMIT $2`,
		runCols, runsTable(schema)), status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// claim atomically takes the oldest pending run (SKIP LOCKED lets several
// engine instances share one queue). It returns nil when the queue is empty.
func (s *RunStore) claim(ctx context.Context, schema string) (*Run, error) {
	t := runsTable(schema)
	row := s.db.QueryRowContext(ctx, fmt.Sprintf(`
		UPDATE %[1]s SET status = 'running', started_at = now()
		WHERE id = (
			SELECT id FROM %[1]s WHERE status = 'pending'
			ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1)
		RETURNING %[2]s`, t, runCols))
	r, err := scanRun(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

func (s *RunStore) finish(ctx context.Context, schema, id string, total int, runErr error) error {
	t := runsTable(schema)
	if runErr != nil {
		_, err := s.db.ExecContext(ctx, fmt.Sprintf(
			`UPDATE %s SET status = 'failed', error = $2, finished_at = now() WHERE id::text = $1`, t),
			id, runErr.Error())
		return err
	}
	_, err := s.db.ExecContext(ctx, fmt.Sprintf(
		`UPDATE %s SET status = 'completed', total_paths = $2, finished_at = now() WHERE id::text = $1`, t),
		id, total)
	return err
}

// failStale marks runs stuck in 'running' (instance died mid-run) as failed.
func (s *RunStore) failStale(ctx context.Context, schema string, olderThan time.Duration) {
	_, err := s.db.ExecContext(ctx, fmt.Sprintf(`
		UPDATE %s SET status = 'failed', error = 'abandoned: worker stopped', finished_at = now()
		WHERE status = 'running' AND started_at < now() - ($1 * interval '1 second')`, runsTable(schema)),
		int(olderThan.Seconds()))
	if err != nil && !isMissingTable(err) {
		log.Printf("WARNING: correlation: fail stale runs in %s: %v", schema, err)
	}
}

// PurgeExpiredCache removes expired blast-radius cache rows of one tenant
// (their path rows go with them: the FK is ON DELETE CASCADE).
func PurgeExpiredCache(ctx context.Context, db *sql.DB, schema string) (int64, error) {
	res, err := db.ExecContext(ctx, fmt.Sprintf(
		`DELETE FROM %s WHERE expires_at <= NOW()`, QualifiedTable(schema, "nhi_blast_radius")))
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}
