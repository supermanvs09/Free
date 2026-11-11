// Package datasource records which tables a request read, so one log line
// per request can say where its data came from (schema, Postgres tables,
// ClickHouse tables). A request without a recorder records nothing.
package datasource

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

type Recorder struct {
	mu       sync.Mutex
	postgres map[string]struct{}
	click    map[string]struct{}
}

type key struct{}

// With returns a context that records the tables read under it.
func With(ctx context.Context) (context.Context, *Recorder) {
	r := &Recorder{postgres: map[string]struct{}{}, click: map[string]struct{}{}}
	return context.WithValue(ctx, key{}, r), r
}

// From is the request's recorder, or nil.
func From(ctx context.Context) *Recorder {
	r, _ := ctx.Value(key{}).(*Recorder)
	return r
}

// Postgres records schema.table. Safe on a nil recorder.
func (r *Recorder) Postgres(schema, table string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.postgres[schema+"."+table] = struct{}{}
	r.mu.Unlock()
}

// ClickHouse records a (database-qualified) ClickHouse table. Safe on nil.
func (r *Recorder) ClickHouse(table string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.click[strings.ReplaceAll(table, "`", "")] = struct{}{}
	r.mu.Unlock()
}

func sorted(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Tables returns what was recorded, sorted.
func (r *Recorder) Tables() (postgres, clickhouse []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return sorted(r.postgres), sorted(r.click)
}

// Middleware logs, after each request, the tables it read:
//
//	genome data sources path=... postgres=[nhi_acme.alerts ...] clickhouse=[acme_monitoring.log_events]
func Middleware(label string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx, rec := With(req.Context())
			start := time.Now()
			next.ServeHTTP(w, req.WithContext(ctx))
			pg, ch := rec.Tables()
			schemas := map[string]struct{}{}
			for _, t := range pg {
				if i := strings.Index(t, "."); i > 0 {
					schemas[t[:i]] = struct{}{}
				}
			}
			slog.Default().InfoContext(ctx, label+" data sources",
				"method", req.Method, "path", req.URL.Path,
				"schema", strings.Join(sorted(schemas), ","),
				"postgres_tables", pg, "clickhouse_tables", ch,
				"duration_ms", time.Since(start).Milliseconds())
		})
	}
}
