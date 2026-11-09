package identitytimeline

import (
	"testing"
	"time"
)

func TestAnomalyDimensionEntriesOnePerDimension(t *testing.T) {
	at := time.Date(2026, 10, 13, 2, 0, 0, 0, time.UTC)
	rows := []TimelineDimensionRow{
		{Dimension: "api_operation", AlertCount: 3, OpenCount: 2, LatestOccurredAt: at, LatestAlertID: 9, LatestReason: "new operation"},
		{Dimension: "region", AlertCount: 1, OpenCount: 0, LatestOccurredAt: at.Add(-time.Hour), LatestAlertID: 5},
	}
	got := anomalyDimensionEntries(rows)
	if len(got) != 2 {
		t.Fatalf("got %d items, want 2", len(got))
	}
	first := got[0].item
	if first.Type != TimelineTypeAnomalyDimension || first.Title != "3 api_operation anomalies" || *first.Status != "open" ||
		*first.Description != "Latest reason: new operation" || *first.Count != 3 || *first.OpenCount != 2 || got[0].key.Ref != "9" {
		t.Errorf("first item = %+v", first)
	}
	second := got[1].item
	if second.Title != "1 region anomaly" || *second.Status != "closed" || second.Description != nil {
		t.Errorf("second item = %+v", second)
	}
}
