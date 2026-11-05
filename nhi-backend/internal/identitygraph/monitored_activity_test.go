package identitygraph

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/scope"
)

// fakeMonitored stands in for the Genome event store: per key, a list of
// events (newest first) and the per-day counts derived from them.
type fakeMonitored struct {
	on     bool
	events map[MonitoredKey][]eventstore.Event
	calls  []string
}

func (f *fakeMonitored) Enabled() bool { return f.on }
func (f *fakeMonitored) KeyFor(id MonitoredIdentity) (MonitoredKey, bool) {
	switch id.IdentityType {
	case "lambda_function":
		return MonitoredKey{SourceType: "LAMBDA", EventName: id.ARN}, true
	case "ecs_task":
		return MonitoredKey{SourceType: "ECS", EventName: id.ARN}, true
	}
	return MonitoredKey{}, false
}
func (f *fakeMonitored) Volume(_ context.Context, _ []string, key MonitoredKey, _, _ time.Time) ([]eventstore.VolumePoint, error) {
	f.calls = append(f.calls, "volume "+key.EventName)
	by := map[string]uint64{}
	for _, e := range f.events[key] {
		by[e.EventTime.Format("2006-01-02")]++
	}
	var out []eventstore.VolumePoint
	for d, n := range by {
		out = append(out, eventstore.VolumePoint{Date: d, Count: n})
	}
	return out, nil
}
func (f *fakeMonitored) Events(_ context.Context, _ []string, key MonitoredKey, _, _ time.Time, limit int) ([]eventstore.Event, error) {
	evs := f.events[key]
	if len(evs) > limit {
		evs = evs[:limit]
	}
	return evs, nil
}
func (f *fakeMonitored) Total(_ context.Context, _ []string, key MonitoredKey, _, _ time.Time) (uint64, error) {
	return uint64(len(f.events[key])), nil
}
func (f *fakeMonitored) Analytics(_ context.Context, _ []string, key MonitoredKey, _, _ time.Time) ([]eventstore.AnalyticsRow, error) {
	var out []eventstore.AnalyticsRow
	for _, e := range f.events[key] {
		out = append(out, eventstore.AnalyticsRow{SourceIP: e.SourceIP, Region: e.Region, EventSource: e.EventSource, EventName: e.EventName, Count: 1})
	}
	return out, nil
}

func eventsAt(base time.Time, n int, name string) []eventstore.Event {
	out := make([]eventstore.Event, n)
	for i := 0; i < n; i++ {
		out[i] = eventstore.Event{EventTime: base.Add(-time.Duration(i) * time.Hour), EventName: name, EventSource: "s3.amazonaws.com",
			Region: "ap-south-1", SourceIP: "10.0.0.1", EventID: fmt.Sprintf("%s-%03d", name, i)}
	}
	return out
}

// A credential bound to two monitored identities: the tab's totals are their
// sum, its volume merges by day, and its page is the newest events across
// both - paged exactly like the CloudTrail tab.
func TestMonitoredFetchMergesAndPages(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	a := MonitoredKey{SourceType: "LAMBDA", EventName: "arn:a"}
	b := MonitoredKey{SourceType: "ECS", EventName: "arn:b"}
	fake := &fakeMonitored{on: true, events: map[MonitoredKey][]eventstore.Event{
		a: eventsAt(now, 30, "GetObject"),
		b: eventsAt(now.Add(-30*time.Minute), 12, "PutObject"),
	}}
	svc := &ActivityService{monitored: fake}
	subjects := []monitoredSubject{{identity: MonitoredIdentity{ID: "1"}, key: a}, {identity: MonitoredIdentity{ID: "2"}, key: b}}
	tr := &ResolvedTimeRange{Start: now.AddDate(0, 0, -7), End: now}

	f, last, err := svc.monitoredFetch(context.Background(), []string{"111111111111"}, subjects, tr, activityPaging{page: 1, size: 10})
	if err != nil {
		t.Fatal(err)
	}
	if f.total != 42 {
		t.Fatalf("total = %d, want 42 (30 + 12)", f.total)
	}
	var vol uint64
	for _, v := range f.volume {
		vol += v.Count
	}
	if vol != 42 {
		t.Fatalf("volume sums to %d, want 42", vol)
	}
	if len(f.events) != 10 || f.events[0].EventName != "GetObject" || f.events[1].EventName != "PutObject" {
		t.Fatalf("page 1 is not the newest events across both identities: %v %v", len(f.events), f.events[:2])
	}
	for i := 1; i < len(f.events); i++ {
		if f.events[i].EventTime.After(f.events[i-1].EventTime) {
			t.Fatal("events are not newest first")
		}
	}
	if last["1"].EventID != "GetObject-000" || last["2"].EventID != "PutObject-000" {
		t.Fatalf("last event per identity wrong: %v", last)
	}

	f2, _, err := svc.monitoredFetch(context.Background(), []string{"111111111111"}, subjects, tr, activityPaging{page: 5, size: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(f2.events) != 2 {
		t.Fatalf("page 5 of 42 has %d events, want 2", len(f2.events))
	}
}

// Through the public service, against Postgres: a monitored identity is
// answered from the Genome store (and counts exactly its events there); an
// identity the pipeline does not watch, or a service filter, stays on
// CloudTrail (here: unavailable, so an empty tab).
func TestIdentityActivityReadsGenomeStore(t *testing.T) {
	dsn := os.Getenv("NHI_TEST_DSN")
	if dsn == "" {
		t.Skip("NHI_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := "monitored_activity_test"
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(q, err)
		}
	}
	mustExec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`)
	mustExec(`CREATE SCHEMA ` + schema)
	defer db.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`) //nolint:errcheck
	mustExec(`CREATE TABLE ` + schema + `.identities (id uuid PRIMARY KEY, name text, arn text, identity_type text, account_id text,
		region text, status text, type_attributes jsonb, deleted_at timestamptz)`)
	mustExec(`CREATE TABLE ` + schema + `.identity_credentials (identity_id uuid, credential_id uuid)`)
	mustExec(`INSERT INTO `+schema+`.identities VALUES
		('00000000-0000-0000-0000-000000000001','fn','arn:lambda:fn','lambda_function','111111111111','ap-south-1','active','{}',NULL),
		('00000000-0000-0000-0000-000000000002','task','arn:ecs:task','ecs_task','111111111111','ap-south-1','active','{}',NULL),
		('00000000-0000-0000-0000-000000000003','alice','arn:iam:user/alice','iam_user','111111111111','us-east-1','active','{}',NULL)`)
	mustExec(`INSERT INTO ` + schema + `.identity_credentials VALUES
		('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1'),
		('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1')`)

	now := time.Now().UTC()
	fake := &fakeMonitored{on: true, events: map[MonitoredKey][]eventstore.Event{
		{SourceType: "LAMBDA", EventName: "arn:lambda:fn"}: eventsAt(now, 7, "Invoke"),
		{SourceType: "ECS", EventName: "arn:ecs:task"}:     eventsAt(now, 5, "GetObject"),
	}}
	svc := NewActivityService(nil, NewIdentityLookupRepository())
	svc.SetMonitored(fake)
	sc := &scope.DataScope{DB: db, Schema: schema, DBName: schema, AccountIDs: []string{"111111111111"}, Regions: []string{"ap-south-1", "us-east-1"}}
	tr := &ResolvedTimeRange{Start: now.AddDate(0, 0, -7), End: now}
	ctx := context.Background()

	r := svc.IdentityActivity(ctx, sc, &ActivitySubject{ID: "00000000-0000-0000-0000-000000000001"}, tr, "", 1, 50)
	if !r.ActivityDataAvailable || r.EventsPagination.TotalCount != 7 || len(r.RecentEvents) != 7 {
		t.Fatalf("lambda identity: available=%v total=%d events=%d, want true/7/7", r.ActivityDataAvailable, r.EventsPagination.TotalCount, len(r.RecentEvents))
	}
	r = svc.IdentityActivity(ctx, sc, &ActivitySubject{ID: "00000000-0000-0000-0000-000000000003"}, tr, "", 1, 50)
	if r.ActivityDataAvailable || len(r.RecentEvents) != 0 {
		t.Fatal("an unmonitored identity must not be answered from the Genome store")
	}
	r = svc.IdentityActivity(ctx, sc, &ActivitySubject{ID: "00000000-0000-0000-0000-000000000001"}, tr, "s3", 1, 50)
	if len(r.RecentEvents) != 0 {
		t.Fatal("a service filter must stay on CloudTrail")
	}

	c := svc.CredentialActivity(ctx, sc, &ActivitySubject{ID: "00000000-0000-0000-0000-0000000000c1"}, tr, "", 1, 50)
	if !c.ActivityDataAvailable || c.EventsPagination.TotalCount != 12 || len(c.IdentitiesUsingThisCredential) != 2 {
		t.Fatalf("credential: available=%v total=%d users=%d, want true/12/2", c.ActivityDataAvailable, c.EventsPagination.TotalCount, len(c.IdentitiesUsingThisCredential))
	}
}
