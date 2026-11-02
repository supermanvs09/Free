package identitygraph

import (
	"strings"
)

// value enums — strict so credential_type=w errors
var ValidEdgeTypes = map[string]struct{}{
	"assume_role": {}, "bound_to": {}, "accesses": {}, "trusts": {},
	"contains": {}, "manages": {}, "attached_to": {}, "uses": {},
	// Stored in trust_edges today, and the CloudTrail-derived created_by.
	"service_trust": {}, "cross_account": {}, "federated_oidc": {}, "federated_saml": {}, "pass_role": {},
	"created_by": {},
}

// credentialActivityKeys returns what identifies a credential in CloudTrail:
// its ARN (the session issuer for roles) and, for access keys, the key ID
// (which is the credential's name).
func CredentialActivityKeys(arn, name, credentialType string) []string {
	var keys []string
	if arn != "" {
		keys = append(keys, arn)
	}
	if strings.EqualFold(credentialType, "access_key") && name != "" {
		keys = append(keys, name)
	}
	return keys
}

func LowerTrimAll(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.ToLower(strings.TrimSpace(s))
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// effectiveIdleDays is how long something has gone unused: days since its
// last recorded use, or, when it was never used, days since it was created -
// the rule the stale counts above apply, so a list filtered on idle days and
// the dashboard's stale counts agree.
func EffectiveIdleDays(idleDays, ageDays *int) *int {
	if idleDays != nil {
		return idleDays
	}
	return ageDays
}
