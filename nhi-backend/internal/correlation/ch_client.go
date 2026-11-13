package correlation

import (
	"context"
	"fmt"
	"strings"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
)

// CHAdapter wraps the clickhouse-go ch.Conn to implement CHQuerier.
type CHAdapter struct {
	conn    ch.Conn
	tableFn func(ctx context.Context) string // returns the table name for the request
	timeout time.Duration
}

func NewCHAdapter(conn ch.Conn, tableFn func(ctx context.Context) string, timeout time.Duration) *CHAdapter {
	return &CHAdapter{conn: conn, tableFn: tableFn, timeout: timeout}
}

func (a *CHAdapter) Enabled() bool {
	return a != nil && a.conn != nil
}

// NewCHClient creates a CHQuerier from a clickhouse-go connection.
func NewCHClient(conn ch.Conn, table, database string, timeout time.Duration) CHQuerier {
	adapter := NewCHAdapter(conn, func(ctx context.Context) string { return table }, timeout)
	return adapter
}

// NullCHClient is a no-op CHQuerier used when ClickHouse is not configured.
type NullCHClient struct{}

func (NullCHClient) Enabled() bool { return false }

func (NullCHClient) QueryObservedActivity(ctx context.Context, arn string, accounts []string, limit int) ([]ObservedEvent, error) {
	return nil, nil
}

func (NullCHClient) QueryAssumeObservations(ctx context.Context, accounts []string, limit int) ([]AssumeObservation, error) {
	return nil, nil
}

// chStringArray renders account ids as a ClickHouse array literal, for example
// ['111111111111','222222222222']. The driver binds typed query parameters from
// strings only, so a Go slice cannot be passed directly (it fails with "expected
// string value in NamedValue"). Quotes and backslashes are escaped.
func chStringArray(vals []string) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, v := range vals {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('\'')
		b.WriteString(strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(v))
		b.WriteByte('\'')
	}
	b.WriteByte(']')
	return b.String()
}

// QueryObservedActivity returns the newest events of one identity (as caller,
// session issuer or access key).
//
// The cloudtrail_events table is a ReplacingMergeTree, so the same event can
// appear more than once until a background merge; LIMIT 1 BY event_id keeps one
// row per event. Failed calls are returned too (error_code is set) so the engine
// can ignore them as evidence of access.
func (a *CHAdapter) QueryObservedActivity(ctx context.Context, arn string, accounts []string, limit int) ([]ObservedEvent, error) {
	if !a.Enabled() {
		return nil, nil
	}
	if limit <= 0 || limit > 1000 {
		limit = 500
	}

	ctx, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()

	table := a.tableFn(ctx)

	query := fmt.Sprintf(`
		SELECT event_time, event_name, event_source, aws_region,
		       resource_arn, resource_type, is_read_only,
		       caller_arn, session_issuer_arn, access_key_id,
		       caller_type, error_code, event_id
		FROM %s
		WHERE (caller_arn = {arn:String} OR session_issuer_arn = {arn:String} OR access_key_id = {arn:String})
		  AND (empty({accounts:Array(String)}) OR account_id IN {accounts:Array(String)})
		  AND resource_arn != ''
		ORDER BY event_time DESC, ingested_at DESC
		LIMIT 1 BY event_id
		LIMIT %d`, table, limit)

	rows, err := a.conn.Query(ctx, query,
		ch.Named("arn", arn),
		ch.Named("accounts", chStringArray(accounts)),
	)
	if err != nil {
		return nil, fmt.Errorf("query observed activity: %w", err)
	}
	defer rows.Close()

	var out []ObservedEvent
	for rows.Next() {
		var e ObservedEvent
		var eventTime time.Time
		var isReadOnly uint8
		if err := rows.Scan(
			&eventTime, &e.EventName, &e.EventSource, &e.AWSRegion,
			&e.ResourceARN, &e.ResourceType, &isReadOnly,
			&e.CallerARN, &e.SessionIssuerARN, &e.AccessKeyID,
			&e.CallerType, &e.ErrorCode, &e.EventID,
		); err != nil {
			return nil, fmt.Errorf("scan observed event: %w", err)
		}
		e.EventTime = eventTime
		e.IsReadOnly = isReadOnly != 0
		out = append(out, e)
	}
	return out, rows.Err()
}

// QueryAssumeObservations returns the successful AssumeRole calls seen in
// CloudTrail, one row per caller and assumed role. For these events the
// collector stores the assumed role's ARN as resource_arn, and the caller is the
// session issuer (the role) or, for an IAM user, the user ARN. uniqExact(event_id)
// counts each event once even before duplicates are merged.
func (a *CHAdapter) QueryAssumeObservations(ctx context.Context, accounts []string, limit int) ([]AssumeObservation, error) {
	if !a.Enabled() {
		return nil, nil
	}
	if limit <= 0 || limit > 20000 {
		limit = 5000
	}

	ctx, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()

	table := a.tableFn(ctx)

	query := fmt.Sprintf(`
		SELECT if(session_issuer_arn != '', session_issuer_arn, caller_arn) AS caller,
		       resource_arn AS target,
		       uniqExact(event_id) AS n,
		       min(event_time) AS first_seen,
		       max(event_time) AS last_seen
		FROM %s
		WHERE event_name IN ('AssumeRole', 'AssumeRoleWithWebIdentity', 'AssumeRoleWithSAML')
		  AND error_code = ''
		  AND resource_arn LIKE 'arn:%%:iam::%%:role/%%'
		  AND (empty({accounts:Array(String)}) OR account_id IN {accounts:Array(String)})
		GROUP BY caller, target
		ORDER BY n DESC
		LIMIT %d`, table, limit)

	rows, err := a.conn.Query(ctx, query, ch.Named("accounts", chStringArray(accounts)))
	if err != nil {
		return nil, fmt.Errorf("query assume observations: %w", err)
	}
	defer rows.Close()

	var out []AssumeObservation
	for rows.Next() {
		var o AssumeObservation
		var first, last time.Time
		if err := rows.Scan(&o.Caller, &o.Target, &o.Count, &first, &last); err != nil {
			return nil, fmt.Errorf("scan assume observation: %w", err)
		}
		o.FirstSeen, o.LastSeen = first, last
		out = append(out, o)
	}
	return out, rows.Err()
}
