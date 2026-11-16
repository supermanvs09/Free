package awsintegration

import (
	"testing"
	"time"
)

func TestScanFresh(t *testing.T) {
	now := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	cases := map[string]bool{
		"scan-20261116-083209": true,  // started half an hour ago
		"scan-20261115-083209": false, // a day old: a dead scan, not a running one
		"some-other-id":         true,  // unknown form: trust the RUNNING status
	}
	for id, want := range cases {
		if got := scanFresh(id, now); got != want {
			t.Errorf("scanFresh(%q) = %v, want %v", id, got, want)
		}
	}
}
