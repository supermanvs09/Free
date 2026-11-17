package identities

import "testing"

const conflicting = "Conflicting: Two or more people have similar evidence, so picking one would be a guess: vamshi.krishna (70%) created it (2026-11-12); abhishek.tiwari (60%) owns similar identities; shashi.kumar (40%) changed it (2026-11-16). Please pick the owner."

func TestClassifyOwner(t *testing.T) {
	cases := []struct {
		name, owner, reason string
		assigned            bool
		want                string
	}{
		{"tag", "platform-team", "", false, OwnerStateDirect},
		{"suggested", "alice", "Created it on 2026-01-02", false, OwnerStateSuggested},
		{"conflict", "", conflicting, false, OwnerStateConflicting},
		{"needs review", "", "Needs review (no evidence): No owner found: it has no owner tag.", false, OwnerStateNeedsReview},
		{"nothing at all", "", "", false, OwnerStateNeedsReview},
		{"a person decided", "x", conflicting, true, OwnerStateAssigned},
	}
	for _, c := range cases {
		if got, _ := ClassifyOwner(c.owner, c.reason, c.assigned); got != c.want {
			t.Errorf("%s: %s, want %s", c.name, got, c.want)
		}
	}
}

func TestConflictingReasonYieldsItsCandidates(t *testing.T) {
	_, got := ClassifyOwner("", conflicting, false)
	want := []OwnerCandidate{
		{"vamshi.krishna", 70, "created it (2026-11-12)"},
		{"abhishek.tiwari", 60, "owns similar identities"},
		{"shashi.kumar", 40, "changed it (2026-11-16)"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("candidate %d: %+v, want %+v", i, got[i], want[i])
		}
	}
}
