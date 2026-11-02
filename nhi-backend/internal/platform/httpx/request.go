package httpx

import (
	"regexp"
	"strconv"
	"strings"
)

// Request-limit constants shared by every v1 handler, so the documented
// contract is enforced in exactly one place.
const (
	// maxPageSize is the documented ceiling for ?page_size= (PDF: "Rows per
	// page (max 100)"). Values above it are clamped, not rejected.
	MaxPageSize = 100

	// maxRelationshipDepth is the documented ceiling for ?depth= on the
	// relationships tab (PDF: "Hops: 1, 2, 3"). Values outside 1..3 are
	// rejected with 400 so the client knows what it actually received.
	MaxRelationshipDepth = 3
)

var CredentialUUIDRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func SplitAndTrim(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func ParseOptionalBool(q map[string][]string, key string) (*bool, error) {
	raw := strings.TrimSpace(firstOrEmpty(q, key))
	if raw == "" {
		return nil, nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func ParseOptionalInt(q map[string][]string, key string) (*int, error) {
	raw := strings.TrimSpace(firstOrEmpty(q, key))
	if raw == "" {
		return nil, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func firstOrEmpty(q map[string][]string, key string) string {
	if vs, ok := q[key]; ok && len(vs) > 0 {
		return vs[0]
	}
	return ""
}

var IdentityUUIDRegex = CredentialUUIDRegex
