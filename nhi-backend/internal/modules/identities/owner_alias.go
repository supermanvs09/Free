package identities

import "nhi-backend-api/internal/identitygraph"

// The owner review rules live in identitygraph so the list and the identity
// record classify an owner the same way.
type OwnerCandidate = identitygraph.OwnerCandidate

const (
	OwnerStateDirect      = identitygraph.OwnerStateDirect
	OwnerStateAssigned    = identitygraph.OwnerStateAssigned
	OwnerStateSuggested   = identitygraph.OwnerStateSuggested
	OwnerStateConflicting = identitygraph.OwnerStateConflicting
	OwnerStateNeedsReview = identitygraph.OwnerStateNeedsReview
)

var ClassifyOwner = identitygraph.ClassifyOwner
