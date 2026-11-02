package credentials

import (
	"context"
	"testing"
	"time"

	"nhi-backend-api/internal/identitygraph"
)

func TestCredentialActivityKeysAndAttach(t *testing.T) {
	if k := identitygraph.CredentialActivityKeys("arn:role/r", "r", "iam_role"); len(k) != 1 || k[0] != "arn:role/r" {
		t.Fatalf("role keys = %v", k)
	}
	k := identitygraph.CredentialActivityKeys("arn:aws:iam::1:access-key/AKIAX", "AKIAX", "access_key")
	if len(k) != 2 || k[1] != "AKIAX" {
		t.Fatalf("access key keys = %v", k)
	}
	if k := identitygraph.CredentialActivityKeys("", "", "iam_role"); len(k) != 0 {
		t.Fatalf("empty = %v", k)
	}

	src := &identitygraph.FakeActivity{IsAvailable: true, Seen: map[string]time.Time{"AKIAX": identitygraph.TestNow.Add(-5 * 24 * time.Hour)}}
	rows := []credentialListRow{
		{item: CredentialListItem{Name: "AKIAX"}, keys: k},
		{item: CredentialListItem{Name: "never"}, keys: []string{"arn:role/never"}},
	}
	attachCredentialActivity(context.Background(), rows, src, identitygraph.TestNow)
	if rows[0].item.IdleDays == nil || *rows[0].item.IdleDays != 5 || rows[0].item.LastUsedAt == nil {
		t.Fatalf("used key: %+v", rows[0].item)
	}
	if rows[1].item.LastUsedAt != nil || rows[1].item.IdleDays != nil {
		t.Fatalf("never used must stay nil: %+v", rows[1].item)
	}
}

func TestSortCredentialRows(t *testing.T) {
	t1, t2 := identitygraph.TestNow.Add(-time.Hour), identitygraph.TestNow.Add(-72*time.Hour)
	rows := []credentialListRow{
		{item: CredentialListItem{Name: "none"}},
		{item: CredentialListItem{Name: "old", LastUsedAt: &t2, IdleDays: identitygraph.Intp(3)}},
		{item: CredentialListItem{Name: "new", LastUsedAt: &t1, IdleDays: identitygraph.Intp(0)}},
	}
	sortCredentialRows(rows, "last_used_at", true)
	if rows[0].item.Name != "new" || rows[1].item.Name != "old" || rows[2].item.Name != "none" {
		t.Fatalf("last_used desc: %v / %v / %v", rows[0].item.Name, rows[1].item.Name, rows[2].item.Name)
	}
	sortCredentialRows(rows, "idle_days", true)
	if rows[0].item.Name != "old" || rows[2].item.Name != "none" {
		t.Fatalf("idle desc: %v / %v / %v", rows[0].item.Name, rows[1].item.Name, rows[2].item.Name)
	}
}
