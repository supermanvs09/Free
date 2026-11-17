package awsintegration

import "testing"

func TestSyncCooldownMinutes(t *testing.T) {
	for in, want := range map[string]int{"": 0, "0": 0, " 10 ": 10, "abc": 0, "-5": 0, "99999": 1440} {
		t.Setenv("NHI_SYNC_COOLDOWN_MINUTES", in)
		if got := SyncCooldownMinutes(); got != want {
			t.Errorf("%q: got %d, want %d", in, got, want)
		}
	}
}
