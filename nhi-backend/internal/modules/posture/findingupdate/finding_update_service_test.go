package findingupdate

import (
	"testing"
	"time"
)

func sp(s string) *string { return &s }

func TestValidateFindingUpdate(t *testing.T) {
	now := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	future := now.Add(24 * time.Hour)
	past := now.Add(-time.Hour)
	cases := []struct {
		name string
		req  FindingUpdateRequest
		ok   bool
	}{
		{"empty", FindingUpdateRequest{}, false},
		{"note only", FindingUpdateRequest{Note: sp("hi")}, true},
		{"assign only", FindingUpdateRequest{AssignedTo: sp("bob")}, true},
		{"accept with reason", FindingUpdateRequest{Status: sp("ACCEPTED"), AcceptedReason: sp("why")}, true},
		{"accept no reason", FindingUpdateRequest{Status: sp("ACCEPTED")}, false},
		{"suppress future", FindingUpdateRequest{Status: sp("SUPPRESSED"), SuppressedUntil: &future}, true},
		{"suppress past", FindingUpdateRequest{Status: sp("SUPPRESSED"), SuppressedUntil: &past}, false},
		{"suppress no date", FindingUpdateRequest{Status: sp("SUPPRESSED")}, false},
		{"reopen", FindingUpdateRequest{Status: sp("OPEN")}, true},
		{"resolved", FindingUpdateRequest{Status: sp("RESOLVED")}, false},
		{"bogus status", FindingUpdateRequest{Status: sp("DONE")}, false},
	}
	for _, c := range cases {
		req := c.req
		if err := validateFindingUpdate(&req, now); (err == nil) != c.ok {
			t.Errorf("%s: err=%v wantOK=%v", c.name, err, c.ok)
		}
	}
}
