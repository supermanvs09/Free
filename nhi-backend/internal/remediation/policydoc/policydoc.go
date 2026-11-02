// Package policydoc parses, compares and rewrites AWS IAM policy documents
// (identity, trust and resource policies share the same grammar).
package policydoc

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"nhi-backend-api/internal/remediation/domain"
)

// Doc keeps every unknown field so a rewritten document stays complete.
type Doc struct {
	Version    string
	ID         string
	Statements []map[string]any
	extra      map[string]any
}

// Parse accepts a JSON string (also URL-encoded, as IAM returns it) or an
// already decoded map.
func Parse(in any) (*Doc, error) {
	var m map[string]any
	switch v := in.(type) {
	case string:
		s := strings.TrimSpace(v)
		if strings.HasPrefix(s, "%7B") || strings.HasPrefix(s, "%7b") {
			u, err := url.QueryUnescape(s)
			if err != nil {
				return nil, fmt.Errorf("decode policy: %w", err)
			}
			s = u
		}
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			return nil, fmt.Errorf("policy is not valid JSON: %w", err)
		}
	case []byte:
		return Parse(string(v))
	case map[string]any:
		b, _ := json.Marshal(v) // deep copy
		_ = json.Unmarshal(b, &m)
	default:
		return nil, fmt.Errorf("unsupported policy type %T", in)
	}
	d := &Doc{extra: map[string]any{}}
	for k, v := range m {
		switch k {
		case "Version":
			d.Version, _ = v.(string)
		case "Id":
			d.ID, _ = v.(string)
		case "Statement":
			switch st := v.(type) {
			case []any:
				for _, s := range st {
					sm, ok := s.(map[string]any)
					if !ok {
						return nil, fmt.Errorf("statement is not an object")
					}
					d.Statements = append(d.Statements, sm)
				}
			case map[string]any:
				d.Statements = append(d.Statements, st)
			default:
				return nil, fmt.Errorf("Statement must be an object or a list")
			}
		default:
			d.extra[k] = v
		}
	}
	if d.Version == "" {
		d.Version = "2012-10-17"
	}
	return d, nil
}

// Map returns the document as a plain map (for storing / hashing).
func (d *Doc) Map() map[string]any {
	m := map[string]any{"Version": d.Version}
	if d.ID != "" {
		m["Id"] = d.ID
	}
	st := make([]any, len(d.Statements))
	for i, s := range d.Statements {
		st[i] = s
	}
	m["Statement"] = st
	for k, v := range d.extra {
		m[k] = v
	}
	return m
}

// JSON returns the compact document.
func (d *Doc) JSON() string {
	b, _ := json.Marshal(d.Map())
	return string(b)
}

// Clone is a deep copy.
func (d *Doc) Clone() *Doc {
	c, _ := Parse(d.Map())
	return c
}

// Strings reads a policy element that is a string or a list of strings.
func Strings(v any) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case []any:
		out := make([]string, 0, len(t))
		for _, e := range t {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return t
	}
	return nil
}

func Effect(s map[string]any) string {
	e, _ := s["Effect"].(string)
	return e
}
func IsAllow(s map[string]any) bool       { return strings.EqualFold(Effect(s), "Allow") }
func Actions(s map[string]any) []string   { return Strings(s["Action"]) }
func Resources(s map[string]any) []string { return Strings(s["Resource"]) }

// Match is a case-insensitive glob (* and ?) as IAM uses for actions.
func Match(pattern, value string) bool {
	return glob(strings.ToLower(pattern), strings.ToLower(value))
}

func glob(p, s string) bool {
	for len(p) > 0 {
		switch p[0] {
		case '*':
			for len(p) > 0 && p[0] == '*' {
				p = p[1:]
			}
			if p == "" {
				return true
			}
			for i := 0; i <= len(s); i++ {
				if glob(p, s[i:]) {
					return true
				}
			}
			return false
		case '?':
			if s == "" {
				return false
			}
		default:
			if s == "" || p[0] != s[0] {
				return false
			}
		}
		p, s = p[1:], s[1:]
	}
	return s == ""
}

// Covered reports whether `action` is allowed by one of the patterns.
func Covered(action string, patterns []string) bool {
	for _, p := range patterns {
		if Match(p, action) {
			return true
		}
	}
	return false
}

func IsWildcard(a string) bool { return strings.ContainsAny(a, "*?") }

// AllowedActions lists the action patterns of all Allow statements.
func (d *Doc) AllowedActions() []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range d.Statements {
		if !IsAllow(s) {
			continue
		}
		for _, a := range Actions(s) {
			if !seen[strings.ToLower(a)] {
				seen[strings.ToLower(a)] = true
				out = append(out, a)
			}
		}
	}
	sort.Strings(out)
	return out
}

// Hash is a stable hash of any JSON-able value (map keys are sorted by encoding/json).
func Hash(v any) string {
	b, _ := json.Marshal(v)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Diff compares two documents statement by statement.
func Diff(before, after *Doc) []domain.DiffEntry {
	key := func(s map[string]any) string { return Hash(s) }
	bset, aset := map[string]bool{}, map[string]bool{}
	for _, s := range before.Statements {
		bset[key(s)] = true
	}
	for _, s := range after.Statements {
		aset[key(s)] = true
	}
	var out []domain.DiffEntry
	for i, s := range before.Statements {
		if !aset[key(s)] {
			out = append(out, domain.DiffEntry{Path: fmt.Sprintf("Statement[%d]", i), Change: "removed", Before: s})
		}
	}
	for i, s := range after.Statements {
		if !bset[key(s)] {
			out = append(out, domain.DiffEntry{Path: fmt.Sprintf("Statement[%d]", i), Change: "added", After: s})
		}
	}
	return out
}

// ScopeToUsage rewrites Allow statements so that wildcard actions are replaced
// by the actions that were really used. `used` may contain service-level
// patterns ("s3:*") when only service-level data exists. When pruneUnused is
// true, explicit actions that were not used are dropped too.
//
// It returns the new document and the statement indexes that could not be
// scoped automatically (NotAction statements).
func ScopeToUsage(d *Doc, used []string, pruneUnused bool) (*Doc, []int) {
	out := d.Clone()
	var manual []int
	var kept []map[string]any
	for i, s := range out.Statements {
		if !IsAllow(s) {
			kept = append(kept, s)
			continue
		}
		if _, ok := s["NotAction"]; ok {
			manual = append(manual, i)
			kept = append(kept, s)
			continue
		}
		var acts []string
		seen := map[string]bool{}
		add := func(a string) {
			if !seen[strings.ToLower(a)] {
				seen[strings.ToLower(a)] = true
				acts = append(acts, a)
			}
		}
		for _, a := range Actions(s) {
			if IsWildcard(a) {
				for _, u := range used {
					if Match(a, u) { // keep the used entry when the old pattern covers it
						add(u)
					}
				}
				continue
			}
			if !pruneUnused || Covered(a, used) {
				add(a)
			}
		}
		if len(acts) == 0 {
			continue // nothing left in this statement
		}
		sort.Strings(acts)
		if len(acts) == 1 {
			s["Action"] = acts[0]
		} else {
			list := make([]any, len(acts))
			for j, a := range acts {
				list[j] = a
			}
			s["Action"] = list
		}
		kept = append(kept, s)
	}
	out.Statements = kept
	return out, manual
}

// NewList converts []string to the []any form used in documents.
func NewList(ss []string) any {
	if len(ss) == 1 {
		return ss[0]
	}
	l := make([]any, len(ss))
	for i, s := range ss {
		l[i] = s
	}
	return l
}
