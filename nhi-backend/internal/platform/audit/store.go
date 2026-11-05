package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"nhi-backend-api/internal/platform/database"
)

const auditTable = "audit_logs"

// Store writes entries to Postgres.
//
// Recording must never slow a request down or fail one, so Record hands the
// entry to a buffered channel and returns. A background writer drains it in
// batches. If the buffer is full (the database is slow or down) entries are
// dropped and counted, and the count is logged - an audit log that stalls the
// console it audits would be worse than a gap that is reported.
type Store struct {
	db     *sql.DB
	schema string
	queue  chan Entry

	mu      sync.Mutex
	dropped int64

	closeOnce sync.Once
	closed    bool // set under mu: Record after Close drops instead of panicking
	done      chan struct{}
}

// NewStore starts the background writer. globalSchema is where audit_logs
// lives (nhi_global): the log is one table for the whole deployment, with a
// tenant column, so it survives a tenant schema being rebuilt.
func NewStore(db *sql.DB, globalSchema string) *Store {
	s := &Store{
		db:     db,
		schema: strings.TrimSpace(globalSchema),
		queue:  make(chan Entry, 2048),
		done:   make(chan struct{}),
	}
	go s.run()
	return s
}

func (s *Store) table() string { return database.Table(s.schema, auditTable) }

// Record queues an entry. It never blocks and never returns an error.
func (s *Store) Record(_ context.Context, e Entry) {
	if s == nil {
		return
	}
	// The lock makes "not closed" and the send one step: a request that
	// finishes while the server shuts down used to send on the closed channel
	// and panic.
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		s.dropped++
		return
	}
	select {
	case s.queue <- normalize(e):
	default:
		s.dropped++
	}
}

// normalize makes an entry insertable whatever the request carried: the ip
// and tenant columns are typed, and one unparsable value used to fail the
// whole batch it was written with.
func normalize(e Entry) Entry {
	if e.IP != "" {
		if ip := net.ParseIP(strings.TrimSpace(e.IP)); ip != nil {
			e.IP = ip.String()
		} else {
			if e.Details == nil {
				e.Details = map[string]any{}
			}
			e.Details["ip_raw"] = trim(e.IP, 64)
			e.IP = ""
		}
	}
	if e.TenantID != "" && !uuidRE.MatchString(e.TenantID) {
		e.TenantID = ""
	}
	e.Actor = cleanText(e.Actor)
	e.UserAgent = cleanText(e.UserAgent)
	e.Path = cleanText(e.Path)
	e.Target = cleanText(e.Target)
	e.Screen = cleanText(e.Screen)
	return e
}

var uuidRE = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// cleanText drops NUL bytes and invalid UTF-8, which Postgres refuses in text.
func cleanText(s string) string {
	if !strings.ContainsRune(s, 0) && utf8.ValidString(s) {
		return s
	}
	return strings.ToValidUTF8(strings.ReplaceAll(s, "\x00", ""), "")
}

// Close drains what is queued and stops the writer. Called on shutdown so the
// last few actions are not lost.
func (s *Store) Close(ctx context.Context) {
	if s == nil {
		return
	}
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		close(s.queue)
		s.mu.Unlock()
	})
	select {
	case <-s.done:
	case <-ctx.Done():
	}
}

func (s *Store) run() {
	defer close(s.done)
	const (
		batchSize  = 50
		flushEvery = time.Second
	)
	ticker := time.NewTicker(flushEvery)
	defer ticker.Stop()
	report := time.NewTicker(time.Minute)
	defer report.Stop()

	batch := make([]Entry, 0, batchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := s.insert(ctx, batch); err != nil {
			// A batch is one transaction, so one bad row would lose every
			// entry with it. Write them one by one instead: the good ones are
			// kept and only the row that cannot be stored is reported.
			lost := 0
			for _, e := range batch {
				if err := s.insert(ctx, []Entry{e}); err != nil {
					lost++
					slog.Error("audit: could not write an entry", "err", err, "action", e.Action, "actor", e.Actor)
				}
			}
			if lost > 0 {
				slog.Error("audit: entries lost", "lost", lost, "of", len(batch), "batch_err", err)
			}
		}
		cancel()
		batch = batch[:0]
	}
	for {
		select {
		case e, ok := <-s.queue:
			if !ok {
				flush()
				return
			}
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-report.C:
			s.mu.Lock()
			n := s.dropped
			s.dropped = 0
			s.mu.Unlock()
			if n > 0 {
				slog.Warn("audit: entries dropped because the write buffer was full", "dropped", n)
			}
		}
	}
}

func (s *Store) insert(ctx context.Context, batch []Entry) error {
	if s.db == nil {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO `+s.table()+`
		(occurred_at, tenant_id, actor, actor_role, action, method, route, path, target,
		 status, outcome, error_code, request_id, ip, user_agent, duration_ms, screen, details)
		VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULLIF($14,'')::inet, $15, $16, $17, $18::jsonb)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, e := range batch {
		details := "{}"
		if len(e.Details) > 0 {
			if b, err := json.Marshal(e.Details); err == nil {
				// jsonb refuses the NUL character even escaped.
				details = strings.ReplaceAll(string(b), `\u0000`, "")
			}
		}
		if _, err := stmt.ExecContext(ctx, e.OccurredAt, e.TenantID, e.Actor, e.ActorRole, e.Action,
			e.Method, e.Route, e.Path, e.Target, e.Status, e.Outcome, e.ErrorCode, e.RequestID,
			e.IP, e.UserAgent, e.DurationMS, e.Screen, details); err != nil {
			return err
		}
	}
	return tx.Commit()
}
