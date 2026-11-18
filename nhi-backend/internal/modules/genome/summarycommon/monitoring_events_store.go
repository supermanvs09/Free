package summarycommon

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"

	chclient "nhi-backend-api/internal/platform/clickhouse"
)

// MonitoringEvents reads the behaviour pipeline's ClickHouse event table
// (current_pipeline_schema_guide.md §14: log_events, ReplacingMergeTree
// (ingested_at) ORDER BY event_id) for the NHI Genome endpoints of
// backend_api_contract.md. It is a separate connection from the legacy
// CloudTrail store (internal/repository/clickhouse): host, database and
// table come from config.MonitoringClickHouse() (NHI_MONITORING_CLICKHOUSE_*).
// Read-only.
//
// Because the table is a ReplacingMergeTree, several versions of one event
// can coexist until a merge runs. Every aggregate therefore counts
// uniqExact(event_id) and row reads use FINAL on a bounded time range, as
// the contract prescribes (§5.3, §14). The per-endpoint readers are methods
// of this type in the <api>_repo.go file of their endpoint; TotalCalls lives
// here because three endpoints (§5.2, §5.3, §5.4) share it.
type MonitoringEvents struct {
	conn    driver.Conn
	table   string // `database`.`table`, both validated identifiers
	timeout time.Duration
	client  *chclient.Client
}

type AlertRiskEvent struct {
	EventID           string
	RiskStatus        string
	EventRiskSeverity string
	Region            string
}

// ErrMonitoringEventsNotConfigured is returned by every reader when no
// monitoring ClickHouse is configured (NHI_MONITORING_CLICKHOUSE_HOST empty)
// or it is not answering right now.
var ErrMonitoringEventsNotConfigured = errors.New("monitoring clickhouse is not configured")

func (
	e *MonitoringEvents,
) AlertRiskEvents(
	ctx context.Context,
	eventIDs []string,
) (
	map[string]AlertRiskEvent,
	error,
) {
	output := make(
		map[string]AlertRiskEvent,
		len(eventIDs),
	)

	if len(eventIDs) == 0 {
		return output, nil
	}

	if !e.Enabled() {
		return output, nil
	}

	queryCtx, cancel :=
		e.queryContext(ctx)

	defer cancel()

	query := `
		SELECT
			event_id,

			tupleElement(
				latest,
				1
			) AS risk_status,

			tupleElement(
				latest,
				2
			) AS event_risk_severity

		FROM
		(
			SELECT
				toString(event_id)
					AS event_id,

				argMax(
					tuple(
						ifNull(
							risk_status,
							''
						),

						ifNull(
							event_risk_severity,
							''
						)
					),

					tuple(
						ingested_at,
						event_time
					)
				) AS latest

			FROM ` + e.tbl(queryCtx) + `

			WHERE has(
				{event_ids:Array(String)},
				toString(event_id)
			)

			GROUP BY
				event_id
		)
	`

	rows, err := e.client.Conn().Query(
		queryCtx,
		query,
		ch.Named(
			"event_ids",
			eventIDs,
		),
	)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	for rows.Next() {
		var event AlertRiskEvent

		if err := rows.Scan(
			&event.EventID,
			&event.RiskStatus,
			&event.EventRiskSeverity,
		); err != nil {
			return nil, err
		}

		event.EventID =
			strings.TrimSpace(
				event.EventID,
			)

		event.RiskStatus =
			strings.TrimSpace(
				event.RiskStatus,
			)

		event.EventRiskSeverity =
			strings.TrimSpace(
				event.EventRiskSeverity,
			)

		if event.EventID == "" {
			continue
		}

		output[event.EventID] =
			event
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return output, nil
}

// NewMonitoringEvents wraps the monitoring ClickHouse client. database is
// the configured database name; a nil client yields a nil *MonitoringEvents,
// on which every method is safe to call and reports
// ErrMonitoringEventsNotConfigured, so callers degrade to null/empty fields.
func NewMonitoringEvents(client *chclient.Client, database string) *MonitoringEvents {
	if client == nil {
		return nil
	}
	table := "`" + client.Table() + "`"
	if database != "" {
		table = "`" + database + "`." + table
	}
	return &MonitoringEvents{conn: client.Conn(), table: table, timeout: client.Timeout(), client: client}
}

// Enabled reports whether the event table can be queried: configured and the
// server answering pings. Safe on nil.
func (e *MonitoringEvents) Enabled() bool { return e != nil && e.client.Up() }

// tbl is the table for this request's tenant: `<tenant>_clickhouse`.`log_events`
// in per-tenant mode, else the configured one.
func (e *MonitoringEvents) tbl(ctx context.Context) string {
	if e.client != nil && e.client.PerTenant() {
		return e.client.TableFor(ctx)
	}
	return e.table
}

// Table is the schema-qualified table the readers query (for logs/tests).
func (e *MonitoringEvents) Table() string {
	if e == nil {
		return ""
	}
	return e.table
}

// queryContext applies the configured per-query timeout.
func (e *MonitoringEvents) queryContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, e.timeout)
}

// identityWindowSQL(sourceType) is the contract's per-identity predicate (§5.3/§5.4):
// one identity of the caller's accounts, half-open [from, to) on
// event_time. The account predicate keeps two tenants with a same-named role
// apart. Values are bound as server-side query parameters, never interpolated.
func identityWindowSQL(sourceType string) string {
	return ` source_type = {source_type:String}
	  AND ` + chclient.IdentityEquals(sourceType) + `
	  AND has({accounts:Array(String)}, account_id)
	  AND event_time >= {from:DateTime64(3)}
	  AND event_time < {to:DateTime64(3)} `
}

func identityWindowArgs(accounts []string, sourceType, identityName string, from, to time.Time) []any {
	return []any{
		ch.Named("accounts", accounts),
		ch.Named("source_type", sourceType),
		ch.Named("identity_name", identityName),
		ch.DateNamed("from", from.UTC(), ch.MilliSeconds),
		ch.DateNamed("to", to.UTC(), ch.MilliSeconds),
	}
}

// TotalCalls is uniqExact(event_id) for the identity inside [from, to) —
// headline_metrics.calls_in_window (§10.2); the §5.3 activity endpoint
// reuses it for total_calls.
func (e *MonitoringEvents) TotalCalls(ctx context.Context, accounts []string, sourceType, identityName string, from, to time.Time) (uint64, error) {
	if !e.Enabled() {
		return 0, ErrMonitoringEventsNotConfigured
	}
	q := `SELECT uniqExact(event_id) FROM ` + e.tbl(ctx) + ` WHERE` + identityWindowSQL(sourceType)
	ctx, cancel := e.queryContext(ctx)
	defer cancel()
	var total uint64
	if err := e.conn.QueryRow(ctx, q, identityWindowArgs(accounts, sourceType, identityName, from, to)...).Scan(&total); err != nil {
		return 0, fmt.Errorf("log_events total calls: %w", err)
	}
	return total, nil
}

// LastSeen is §10.2 last_seen: MAX(event_time) over the latest row per
// event_id of the identity, resolved events only (is_resolved = 1), across
// all stored history. nil when the identity has no resolved event.
func (e *MonitoringEvents) LastSeen(ctx context.Context, accounts []string, sourceType, identityName string) (*time.Time, error) {
	if !e.Enabled() {
		return nil, ErrMonitoringEventsNotConfigured
	}
	q := `SELECT maxOrNull(event_time)
	      FROM (
	          SELECT event_id,
	                 argMax(event_time, ingested_at)  AS event_time,
	                 argMax(is_resolved, ingested_at) AS is_resolved
	          FROM ` + e.tbl(ctx) + `
	          WHERE source_type = {source_type:String} AND ` + chclient.IdentityEquals(sourceType) + `
	            AND has({accounts:Array(String)}, account_id)
	          GROUP BY event_id
	      )
	      WHERE is_resolved = 1`
	ctx, cancel := e.queryContext(ctx)
	defer cancel()
	var last *time.Time
	if err := e.conn.QueryRow(ctx, q, ch.Named("accounts", accounts), ch.Named("source_type", sourceType), ch.Named("identity_name", identityName)).Scan(&last); err != nil {
		return nil, fmt.Errorf("log_events last seen: %w", err)
	}
	if last == nil {
		return nil, nil
	}
	t := last.UTC()
	return &t, nil
}

// WorkloadFacts reads, for every baseline key at once, the log_events facts
// of the workload (chclient.ReadWorkloadFacts): the event identity names its
// alerts and risk scores are stored under, its last resolved event and the
// labels of its newest event. Keys without events are absent from the map.
func (e *MonitoringEvents) WorkloadFacts(ctx context.Context, accounts []string, keys []MonitoringKey) (map[MonitoringKey]chclient.WorkloadFacts, error) {
	if !e.Enabled() {
		return nil, ErrMonitoringEventsNotConfigured
	}
	out := map[MonitoringKey]chclient.WorkloadFacts{}
	want := make(map[MonitoringKey]struct{}, len(keys))
	names := make([]string, 0, len(keys))
	seenName := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		want[k] = struct{}{}
		if _, dup := seenName[k.IdentityName]; !dup && k.IdentityName != "" {
			seenName[k.IdentityName] = struct{}{}
			names = append(names, k.IdentityName)
		}
	}
	table := e.tbl(ctx)
	ctx, cancel := e.queryContext(ctx)
	defer cancel()
	facts, err := chclient.ReadWorkloadFacts(ctx, e.conn, table, accounts, names)
	if err != nil {
		return nil, fmt.Errorf("log_events workload facts: %w", err)
	}
	for _, f := range facts {
		k := MonitoringKey{SourceType: f.SourceType, IdentityName: f.Key}
		if _, ok := want[k]; ok {
			out[k] = f
		}
	}
	return out, nil
}
