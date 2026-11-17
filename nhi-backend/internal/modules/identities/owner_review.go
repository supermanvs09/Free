package identities

import (
	"regexp"
	"strconv"
	"strings"
)

// Owner states, as the console shows them.
const (
	OwnerStateDirect      = "direct"       // read from an owner tag: nothing to review
	OwnerStateAssigned    = "assigned"     // a person set or confirmed it
	OwnerStateSuggested   = "suggested"    // the scanner inferred one: confirm or change
	OwnerStateConflicting = "conflicting"  // two or more people fit: pick one
	OwnerStateNeedsReview = "needs_review" // no evidence: assign one
)

// OwnerCandidate is one person the scanner found evidence for.
type OwnerCandidate struct {
	Name       string `json:"name"`
	Confidence int    `json:"confidence"`         // percent
	Evidence   string `json:"evidence,omitempty"` // "created it (2026-11-12)"
}

// "vamshi.krishna (70%) created it (2026-11-12); abhishek.tiwari (60%) owns similar identities; ..."
var candidateRE = regexp.MustCompile(`([^\s;:()]+) \((\d{1,3})%\) ([^;.]*?)(?:;|\.\s|\.$|$)`)

// ClassifyOwner turns what the scanner stored (owner, owner_reason) and what a
// person assigned into the state the console acts on, and, for a conflict, the
// people to choose between.
func ClassifyOwner(owner, reason string, assigned bool) (string, []OwnerCandidate) {
	owner, reason = strings.TrimSpace(owner), strings.TrimSpace(reason)
	if assigned {
		return OwnerStateAssigned, nil
	}
	lower := strings.ToLower(reason)
	switch {
	case strings.HasPrefix(lower, "conflicting"):
		return OwnerStateConflicting, parseCandidates(reason)
	case strings.HasPrefix(lower, "needs review"):
		return OwnerStateNeedsReview, nil
	case owner == "":
		return OwnerStateNeedsReview, nil // nothing to show and nothing to confirm
	case reason != "":
		return OwnerStateSuggested, nil
	}
	return OwnerStateDirect, nil
}

func parseCandidates(reason string) []OwnerCandidate {
	// The sentence before the colon names the problem; the people follow it.
	if i := strings.Index(reason, ":"); i >= 0 {
		if j := strings.Index(reason[i+1:], ":"); j >= 0 {
			reason = reason[i+1+j+1:] // "Conflicting: <why>: <people>."
		} else {
			reason = reason[i+1:]
		}
	}
	var out []OwnerCandidate
	for _, m := range candidateRE.FindAllStringSubmatch(reason, -1) {
		pct, _ := strconv.Atoi(m[2])
		out = append(out, OwnerCandidate{Name: m[1], Confidence: pct, Evidence: strings.TrimSpace(m[3])})
	}
	return out
}
