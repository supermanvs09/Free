package identities

import (
	"context"
	"testing"
	"time"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/identitygraph/eventstore"
)

func idRow(name, arn string, credKeys []string, granted int64) identityListRow {
	return identityListRow{
		item:    IdentityListItem{Name: name, ARN: arn},
		keys:    append([]string{arn}, credKeys...),
		credKey: credKeys,
		granted: granted,
	}
}

func TestAttachIdentityActivityUsesNewestKeyAndBulkCalls(t *testing.T) {
	src := &identitygraph.FakeActivity{
		IsAvailable: true,
		Seen: map[string]time.Time{
			"arn:user/a": identitygraph.TestNow.Add(-10 * 24 * time.Hour),
			"arn:role/r": identitygraph.TestNow.Add(-2 * 24 * time.Hour), // newer: through its credential
			"arn:user/b": identitygraph.TestNow.Add(-40 * time.Hour),
		},
		CreatorByARN: map[string]string{"arn:user/a": "arn:user/admin"},
		Used: map[string][]eventstore.UsedAction{
			"arn:role/r": {{Service: "s3", Action: "GetObject"}, {Service: "sts", Action: "AssumeRole"}},
			"AKIAKEY":    {{Service: "s3", Action: "GetObject"}, {Service: "ec2", Action: "RunInstances"}},
		},
	}
	rows := []identityListRow{
		idRow("a", "arn:user/a", []string{"arn:role/r", "AKIAKEY"}, 10),
		idRow("b", "arn:user/b", nil, 0),
		idRow("c", "arn:user/c", nil, 5),
	}
	attachIdentityActivity(context.Background(), rows, src, identitygraph.TestNow)

	a := rows[0].item
	if a.LastActivityAt == nil || !a.LastActivityAt.Equal(identitygraph.TestNow.Add(-2*24*time.Hour)) {
		t.Fatalf("a last activity = %v", a.LastActivityAt)
	}
	if a.IdleDays == nil || *a.IdleDays != 2 {
		t.Fatalf("a idle days = %v", a.IdleDays)
	}
	if a.CreatedBy == nil || *a.CreatedBy != "arn:user/admin" {
		t.Fatalf("a created by = %v", a.CreatedBy)
	}
	// 3 distinct actions (s3:GetObject shared, AssumeRole, RunInstances) of 10 granted.
	if a.PermissionUtilizationPct == nil || *a.PermissionUtilizationPct != 30 {
		t.Fatalf("a utilisation = %v, want 30", a.PermissionUtilizationPct)
	}
	if b := rows[1].item; b.PermissionUtilizationPct != nil || b.LastActivityAt == nil {
		t.Fatalf("b: granted 0 must give nil utilisation, last activity set: %+v", b)
	}
	if c := rows[2].item; c.LastActivityAt != nil || c.IdleDays != nil || c.PermissionUtilizationPct == nil || *c.PermissionUtilizationPct != 0 {
		t.Fatalf("c: no events -> nil activity, 0%% utilisation: %+v", c)
	}
	if src.SeenCalls != 1 {
		t.Fatalf("LastSeen called %d times, want one bulk call", src.SeenCalls)
	}
	// Utilisation is measured over the last 90 days, not all time.
	if want := identitygraph.TestNow.AddDate(0, 0, -90); !src.LastSince.Equal(want) {
		t.Fatalf("used actions window starts %v, want %v", src.LastSince, want)
	}
}

func TestAttachIdentityActivityWhenUnavailableLeavesFieldsNil(t *testing.T) {
	rows := []identityListRow{idRow("a", "arn:user/a", nil, 10)}
	attachIdentityActivity(context.Background(), rows, &identitygraph.FakeActivity{IsAvailable: false}, identitygraph.TestNow)
	if it := rows[0].item; it.LastActivityAt != nil || it.IdleDays != nil || it.CreatedBy != nil || it.PermissionUtilizationPct != nil {
		t.Fatalf("unavailable source must leave activity unknown: %+v", it)
	}
	attachIdentityActivity(context.Background(), rows, identitygraph.NoActivity{}, identitygraph.TestNow) // must not panic
}

func TestSortIdentityRowsNullsLastBothDirections(t *testing.T) {
	mk := func(name string, idle *int) identityListRow {
		return identityListRow{item: IdentityListItem{Name: name, IdleDays: idle}}
	}
	rows := []identityListRow{mk("n1", nil), mk("old", identitygraph.Intp(50)), mk("new", identitygraph.Intp(1)), mk("n0", nil), mk("mid", identitygraph.Intp(10))}

	sortIdentityRows(rows, "idle_days", true) // desc
	want := []string{"old", "mid", "new", "n0", "n1"}
	for i, w := range want {
		if rows[i].item.Name != w {
			t.Fatalf("desc order[%d] = %s, want %s (%v)", i, rows[i].item.Name, w, names(rows))
		}
	}
	sortIdentityRows(rows, "idle_days", false) // asc
	want = []string{"new", "mid", "old", "n0", "n1"}
	for i, w := range want {
		if rows[i].item.Name != w {
			t.Fatalf("asc order[%d] = %s, want %s (%v)", i, rows[i].item.Name, w, names(rows))
		}
	}
}

func names(rows []identityListRow) []string {
	var out []string
	for _, r := range rows {
		out = append(out, r.item.Name)
	}
	return out
}

func TestSortIdentityRowsByLastActivityAndUtilisation(t *testing.T) {
	t1, t2 := identitygraph.TestNow.Add(-time.Hour), identitygraph.TestNow.Add(-48*time.Hour)
	rows := []identityListRow{
		{item: IdentityListItem{Name: "b", LastActivityAt: &t2, PermissionUtilizationPct: identitygraph.Intp(5)}},
		{item: IdentityListItem{Name: "a", LastActivityAt: &t1, PermissionUtilizationPct: identitygraph.Intp(50)}},
		{item: IdentityListItem{Name: "z"}},
	}
	sortIdentityRows(rows, "last_activity_at", true)
	if rows[0].item.Name != "a" || rows[1].item.Name != "b" || rows[2].item.Name != "z" {
		t.Fatalf("last_activity desc: %v", names(rows))
	}
	sortIdentityRows(rows, "permission_utilization_pct", false)
	if rows[0].item.Name != "b" || rows[1].item.Name != "a" || rows[2].item.Name != "z" {
		t.Fatalf("utilisation asc: %v", names(rows))
	}
}
