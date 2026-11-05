package summarycommon

import (
	"context"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/identitygraph/eventstore"
)

// InventoryActivity serves the inventory's Activity tabs (an identity's, a
// credential's) from the NHI Genome event store, so those tabs and the
// identity's Genome page read the same calls: the same log_events rows, the
// same identity key (NormalizeDiscoveryRow + EventName, as GET
// /genome/identities/{source_type}/{identity_name}/activity resolves it), the
// same unique-event counting (uniqExact(event_id), FINAL on row reads) and
// the same window rule [from, to). It implements
// identitygraph.MonitoredActivity.
type InventoryActivity struct {
	events *MonitoringEvents
}

// NewInventoryActivity wraps the Genome event store; nil when it is not
// configured (the tabs then stay on CloudTrail).
func NewInventoryActivity(events *MonitoringEvents) *InventoryActivity {
	if events == nil {
		return nil
	}
	return &InventoryActivity{events: events}
}

var _ identitygraph.MonitoredActivity = (*InventoryActivity)(nil)

// Enabled reports that the Genome store is configured and answering.
func (a *InventoryActivity) Enabled() bool { return a != nil && a.events.Enabled() }

// KeyFor is the identity's Genome key, by the Genome's own rules.
func (a *InventoryActivity) KeyFor(id identitygraph.MonitoredIdentity) (identitygraph.MonitoredKey, bool) {
	m, ok := NormalizeDiscoveryRow(DiscoveryIdentityRow{
		ID: id.ID, ARN: id.ARN, Name: id.Name, IdentityType: id.IdentityType, AccountID: id.AccountID,
		Region: id.Region, Status: id.Status, TypeAttributes: id.TypeAttributes,
	})
	if !ok || m.Key.SourceType == "" {
		return identitygraph.MonitoredKey{}, false
	}
	return identitygraph.MonitoredKey{SourceType: m.Key.SourceType, EventName: m.EventName()}, true
}

// Volume is calls per UTC day - the Genome activity volume with day buckets.
func (a *InventoryActivity) Volume(ctx context.Context, accounts []string, key identitygraph.MonitoredKey, start, end time.Time) ([]eventstore.VolumePoint, error) {
	points, err := a.events.Volume(ctx, accounts, key.SourceType, key.EventName, start, end, VolumeBucketDay)
	if err != nil {
		return nil, err
	}
	out := make([]eventstore.VolumePoint, 0, len(points))
	for _, p := range points {
		out = append(out, eventstore.VolumePoint{Date: p.Bucket.UTC().Format("2006-01-02"), Count: p.Calls})
	}
	return out, nil
}

// Events are the newest calls first - the Genome recent calls.
func (a *InventoryActivity) Events(ctx context.Context, accounts []string, key identitygraph.MonitoredKey, start, end time.Time, limit int) ([]eventstore.Event, error) {
	if limit > 1000 {
		limit = 1000
	}
	rows, err := a.events.RecentCalls(ctx, accounts, key.SourceType, key.EventName, start, end, nil, limit)
	if err != nil {
		return nil, err
	}
	out := make([]eventstore.Event, 0, len(rows))
	for _, r := range rows {
		out = append(out, eventstore.Event{
			CallerARN:   key.EventName,
			EventTime:   r.EventTime,
			EventName:   r.EventName,
			EventSource: r.EventSource,
			Region:      r.Region,
			SourceIP:    r.SourceIP,
			ResourceARN: firstARN(r.ResourceARNs),
			EventID:     r.EventID,
		})
	}
	return out, nil
}

// Total is the number of unique calls in the window - Genome's total_calls.
func (a *InventoryActivity) Total(ctx context.Context, accounts []string, key identitygraph.MonitoredKey, start, end time.Time) (uint64, error) {
	return a.events.TotalCalls(ctx, accounts, key.SourceType, key.EventName, start, end)
}

// Analytics groups the identity's unique calls by source IP, region, service,
// action and hour, for the tab's analytics cards. log_events records no AWS
// error code, so error rates read zero here.
func (a *InventoryActivity) Analytics(ctx context.Context, accounts []string, key identitygraph.MonitoredKey, start, end time.Time) ([]eventstore.AnalyticsRow, error) {
	e := a.events
	if !e.Enabled() {
		return nil, ErrMonitoringEventsNotConfigured
	}
	q := `SELECT source_ip, region, event_source, event_name, toHour(event_time) AS hour, uniqExact(event_id) AS calls
	      FROM ` + e.tbl(ctx) + `
	      WHERE` + identityWindowSQL(key.SourceType) + `
	      GROUP BY source_ip, region, event_source, event_name, hour
	      ORDER BY calls DESC
	      LIMIT 20000`
	ctx, cancel := e.queryContext(ctx)
	defer cancel()
	rows, err := e.conn.Query(ctx, q, identityWindowArgs(accounts, key.SourceType, key.EventName, start, end)...)
	if err != nil {
		return nil, fmt.Errorf("log_events activity analytics: %w", err)
	}
	defer rows.Close()
	var out []eventstore.AnalyticsRow
	for rows.Next() {
		var r eventstore.AnalyticsRow
		if err := rows.Scan(&r.SourceIP, &r.Region, &r.EventSource, &r.EventName, &r.Hour, &r.Count); err != nil {
			return nil, fmt.Errorf("log_events activity analytics: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func firstARN(joined string) string {
	for _, part := range strings.Split(joined, ",") {
		if p := strings.TrimSpace(part); p != "" {
			return p
		}
	}
	return ""
}
