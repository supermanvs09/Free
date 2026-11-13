package eventstore

import (
	"context"
	"fmt"
	"time"

	ch "github.com/ClickHouse/clickhouse-go/v2"
)

// assumeEvents are the STS calls that open a session on a role.
var assumeEvents = []string{"AssumeRole", "AssumeRoleWithWebIdentity", "AssumeRoleWithSAML"}

// RoleAssumer is one principal that opened sessions on a role (successful
// AssumeRole* calls whose resource is the role).
type RoleAssumer struct {
	CallerARN   string
	CallerType  string
	AccessKeyID string // the key of its latest call: AKIA… is a long-lived user key
	Sessions    uint64
	First, Last time.Time
}

// RoleSession is one session on a role, seen through the calls it made: all
// calls signed with the same temporary key (access_key_id) are one session.
type RoleSession struct {
	AccessKeyID string
	CallerARN   string // arn:aws:sts::…:assumed-role/<role>/<session name>
	SourceIP    string
	Start, End  time.Time // first and last call seen, not the STS expiry
	Calls       uint64
}

// RoleSessionsResult is the sessions view of one role.
type RoleSessionsResult struct {
	Assumers []RoleAssumer
	Sessions []RoleSession
	Hours    [24]uint64 // sessions opened per UTC hour of day
	Total    uint64     // sessions in the window (Sessions holds at most limit)
}

// RoleSessions reads who assumed roleARN and the sessions it ran, within the
// tenant's accounts and the window. ok-false scopes (no accounts) return nil.
func (c *Repository) RoleSessions(ctx context.Context, roleARN string, sc Scope, limit int) (*RoleSessionsResult, error) {
	if roleARN == "" || len(sc.Accounts) == 0 {
		return nil, nil
	}
	tc, ta := timeFilter(sc)
	base := []any{ch.Named("role", roleARN), ch.Named("accounts", sc.Accounts)}
	ctx, cancel := c.withTimeout(ctx)
	defer cancel()
	out := &RoleSessionsResult{}

	assumeWhere := "resource_arn = {role:String} AND event_name IN {events:Array(String)} AND error_code = '' AND account_id IN {accounts:Array(String)}" + tc
	args := append(append(append([]any{}, base...), ch.Named("events", assumeEvents)), ta...)
	rows, err := c.conn.Query(ctx, fmt.Sprintf(`SELECT caller_arn, argMax(caller_type, event_time), argMax(access_key_id, event_time),
			count(), min(event_time), max(event_time)
		FROM %s WHERE %s GROUP BY caller_arn ORDER BY max(event_time) DESC LIMIT 200`, c.tbl(ctx), assumeWhere), args...)
	if err != nil {
		return nil, fmt.Errorf("clickhouse role assumers: %w", err)
	}
	for rows.Next() {
		var a RoleAssumer
		if err := rows.Scan(&a.CallerARN, &a.CallerType, &a.AccessKeyID, &a.Sessions, &a.First, &a.Last); err != nil {
			rows.Close()
			return nil, fmt.Errorf("clickhouse role assumers scan: %w", err)
		}
		out.Assumers = append(out.Assumers, a)
	}
	rows.Close()

	sessionWhere := "session_issuer_arn = {role:String} AND access_key_id != '' AND account_id IN {accounts:Array(String)}" + tc
	args = append(append([]any{}, base...), ta...)
	rows, err = c.conn.Query(ctx, fmt.Sprintf(`SELECT access_key_id, argMin(caller_arn, event_time), argMin(source_ip, event_time),
			min(event_time) AS started, max(event_time), count(), count() OVER ()
		FROM %s WHERE %s GROUP BY access_key_id ORDER BY started DESC LIMIT %d`, c.tbl(ctx), sessionWhere, limit), args...)
	if err != nil {
		return nil, fmt.Errorf("clickhouse role sessions: %w", err)
	}
	for rows.Next() {
		var s RoleSession
		if err := rows.Scan(&s.AccessKeyID, &s.CallerARN, &s.SourceIP, &s.Start, &s.End, &s.Calls, &out.Total); err != nil {
			rows.Close()
			return nil, fmt.Errorf("clickhouse role sessions scan: %w", err)
		}
		out.Sessions = append(out.Sessions, s)
	}
	rows.Close()

	rows, err = c.conn.Query(ctx, fmt.Sprintf(`SELECT toHour(started), count() FROM (
			SELECT min(event_time) AS started FROM %s WHERE %s GROUP BY access_key_id)
		GROUP BY 1`, c.tbl(ctx), sessionWhere), args...)
	if err != nil {
		return nil, fmt.Errorf("clickhouse role session hours: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var h uint8
		var n uint64
		if err := rows.Scan(&h, &n); err != nil {
			return nil, fmt.Errorf("clickhouse role session hours scan: %w", err)
		}
		if h < 24 {
			out.Hours[h] = n
		}
	}
	return out, rows.Err()
}
