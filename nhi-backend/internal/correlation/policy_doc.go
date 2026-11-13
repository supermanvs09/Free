package correlation

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PolicyStatement is one statement of an identity policy document.
type PolicyStatement struct {
	Sid          string
	Effect       string
	Actions      []string
	NotActions   []string
	Resources    []string
	NotResources []string
	Conditions   []TrustCondition
}

// statementsOf returns the raw statements of a policy or trust document.
// Statement may be an array or a single object, and the document itself may be
// stored as a JSON string. A document without statements yields none.
func statementsOf(doc []byte) ([]json.RawMessage, error) {
	var top struct {
		Statement json.RawMessage `json:"Statement"`
	}
	if err := json.Unmarshal(doc, &top); err != nil {
		var s string
		if err2 := json.Unmarshal(doc, &s); err2 != nil || json.Unmarshal([]byte(s), &top) != nil {
			return nil, fmt.Errorf("parse policy document: %w", err)
		}
	}
	var many []json.RawMessage
	if err := json.Unmarshal(top.Statement, &many); err == nil {
		return many, nil
	}
	var one json.RawMessage
	if json.Unmarshal(top.Statement, &one) != nil || len(one) == 0 || string(one) == "null" {
		return nil, nil
	}
	return []json.RawMessage{one}, nil
}

// ParsePolicyDocument parses an identity-policy document into statements.
func ParsePolicyDocument(doc []byte) ([]PolicyStatement, error) {
	raws, err := statementsOf(doc)
	if err != nil {
		return nil, err
	}
	var out []PolicyStatement
	for _, rs := range raws {
		var s struct {
			Sid         string                                `json:"Sid"`
			Effect      string                                `json:"Effect"`
			Action      json.RawMessage                       `json:"Action"`
			NotAction   json.RawMessage                       `json:"NotAction"`
			Resource    json.RawMessage                       `json:"Resource"`
			NotResource json.RawMessage                       `json:"NotResource"`
			Condition   map[string]map[string]json.RawMessage `json:"Condition"`
		}
		if json.Unmarshal(rs, &s) != nil {
			continue
		}
		out = append(out, PolicyStatement{
			Sid:          s.Sid,
			Effect:       s.Effect,
			Actions:      stringList(s.Action),
			NotActions:   stringList(s.NotAction),
			Resources:    stringList(s.Resource),
			NotResources: stringList(s.NotResource),
			Conditions:   parseConditions(s.Condition),
		})
	}
	return out, nil
}

// serviceOfAction returns the service prefix of an action ("s3" for
// "s3:GetObject"), or "*" when it is not a single known service ("*", "s*:Get*").
func serviceOfAction(a string) string {
	svc, _, ok := strings.Cut(strings.ToLower(a), ":")
	if !ok || svc == "" || strings.ContainsAny(svc, "*?") {
		return "*"
	}
	return svc
}

// ElementsFromStatements flattens statements into one element per action and
// resource, keeping what effective_permissions drops: the statement Sid, whether
// it has a Condition block, and NotAction / NotResource.
//
//   - Allow with NotAction becomes action "*" with ExceptActions, meaning "everything
//     except these".
//   - NotResource becomes resource "*" and is flagged not_resource_statement. For an
//     Allow that over-approximates (flagged); a Deny with NotResource is marked
//     conditional so it is never applied.
func ElementsFromStatements(stmts []PolicyStatement, policyName, policyType string) []ResourcePermission {
	var out []ResourcePermission
	for _, s := range stmts {
		effect := "Allow"
		if strings.EqualFold(s.Effect, "Deny") {
			effect = "Deny"
		}
		conditional := len(s.Conditions) > 0

		actions, except := s.Actions, []string(nil)
		if len(s.NotActions) > 0 {
			actions, except = []string{"*"}, s.NotActions
		}
		resources := s.Resources
		var flags []string
		if len(s.NotResources) > 0 {
			resources = []string{"*"}
			flags = append(flags, "not_resource_statement")
			if effect == "Deny" {
				conditional = true
			}
		}
		if len(resources) == 0 {
			resources = []string{"*"}
		}
		for _, a := range actions {
			for _, r := range resources {
				out = append(out, ResourcePermission{
					Action: a, Effect: effect, Service: serviceOfAction(a), ResourceARN: r,
					PolicyType: policyType, PolicySource: policyName,
					Conditional: conditional, Sid: s.Sid, ExceptActions: except, Flags: flags,
				})
			}
		}
	}
	return out
}

type storedPolicy struct {
	Name     string          `json:"name"`
	ARN      string          `json:"arn"`
	Type     string          `json:"type"`
	Document json.RawMessage `json:"document"`
}

// permissionsFromDocuments builds elements from the role's stored attached and
// inline policy documents. ok is false when there are none or any fails to
// parse, so the caller falls back to the collector's own elements rather than
// returning a partial set.
func permissionsFromDocuments(attached, inline []byte) (perms []ResourcePermission, ok bool) {
	var all []storedPolicy
	for i, raw := range [][]byte{attached, inline} {
		if len(raw) == 0 || string(raw) == "null" {
			continue
		}
		var list []storedPolicy
		if json.Unmarshal(raw, &list) != nil {
			return nil, false
		}
		kind := "managed"
		if i == 1 {
			kind = "inline"
		}
		for i := range list {
			if list[i].Type == "" {
				list[i].Type = kind
			}
		}
		all = append(all, list...)
	}
	if len(all) == 0 {
		return nil, false
	}
	for _, p := range all {
		doc := []byte(p.Document)
		var asString string
		if json.Unmarshal(doc, &asString) == nil { // stored as a JSON string
			doc = []byte(asString)
		}
		if len(doc) == 0 || string(doc) == "null" {
			return nil, false
		}
		stmts, err := ParsePolicyDocument(doc)
		if err != nil {
			return nil, false
		}
		name := p.Name
		if name == "" {
			name = p.ARN
		}
		perms = append(perms, ElementsFromStatements(stmts, name, p.Type)...)
	}
	return perms, len(perms) > 0
}

// permissionsFromStored parses the collector's effective_permissions JSON, which
// is either a flat array of elements or {"permissions": [...]}.
func permissionsFromStored(raw []byte) []ResourcePermission {
	var wrapped struct {
		Permissions []ResourcePermission `json:"permissions"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.Permissions != nil {
		return wrapped.Permissions
	}
	var flat []ResourcePermission
	if json.Unmarshal(raw, &flat) == nil {
		return flat
	}
	return nil
}

// ResolvePermissions returns the permission elements for one role. It prefers the
// full policy documents (which keep conditions, Sid, NotAction and NotResource)
// and falls back to the collector's flattened effective_permissions.
func ResolvePermissions(stored, attached, inline []byte) []ResourcePermission {
	if perms, ok := permissionsFromDocuments(attached, inline); ok {
		return perms
	}
	return permissionsFromStored(stored)
}
