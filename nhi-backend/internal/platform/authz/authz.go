// Package authz holds the console's roles, what each role may do, and which
// capability every API route needs.
//
// It exists so that permission rules live in ONE table rather than in a check
// inside each handler. A new endpoint is covered the moment it is registered:
// a read needs CapRead, anything that changes state needs CapWrite, and a
// route that needs something stricter says so in the policy below. Nothing
// has to be edited in the handler itself.
//
// Role names come from nhi_global.nhi_users.role, written by whoever
// administers the workspace, so they are normalised rather than trusted:
// an unknown or empty role becomes Viewer (read-only), never more.
package authz

import (
	"sort"
	"strings"
)

// Role is a normalised console role. The four are ordered by reach.
type Role string

const (
	// RoleAdmin runs the workspace: every feature, user management, and the
	// second approval that separation of duties requires.
	RoleAdmin Role = "admin"
	// RoleAnalyst works the security queue: investigates and acts on findings,
	// but cannot touch integrations, users, or approve their own requests.
	RoleAnalyst Role = "analyst"
	// RoleOperator reviews and approves what others requested, and maintains
	// the policies (allowlists, suppressions) that decide what is enforced.
	RoleOperator Role = "operator"
	// RoleViewer may read, and nothing else.
	RoleViewer Role = "viewer"
)

// Roles in order of reach, widest first. The order is what "the least role
// that can do this" answers are derived from.
var Roles = []Role{RoleAdmin, RoleOperator, RoleAnalyst, RoleViewer}

// Label is the role's name as a person reads it.
func (r Role) Label() string {
	switch r {
	case RoleAdmin:
		return "Admin"
	case RoleAnalyst:
		return "Analyst"
	case RoleOperator:
		return "Operator"
	default:
		return "Viewer"
	}
}

// aliases maps what a role column may actually hold onto the four canonical
// roles. Everything unlisted is a viewer: a typo must never grant more.
var aliases = map[string]Role{
	"admin":         RoleAdmin,
	"super_admin":   RoleAdmin,
	"superadmin":    RoleAdmin,
	"super admin":   RoleAdmin,
	"owner":         RoleAdmin,
	"administrator": RoleAdmin,
	"analyst":       RoleAnalyst,
	"security":      RoleAnalyst,
	"operator":      RoleOperator,
	"approver":      RoleOperator,
	"reviewer":      RoleOperator,
	"manager":       RoleOperator,
	"viewer":        RoleViewer,
	"read_only":     RoleViewer,
	"readonly":      RoleViewer,
	"read-only":     RoleViewer,
	"user":          RoleViewer,
	"guest":         RoleViewer,
}

// NormalizeRole turns whatever the database holds into one of the four roles.
func NormalizeRole(role string) Role {
	if r, ok := aliases[strings.ToLower(strings.TrimSpace(role))]; ok {
		return r
	}
	return RoleViewer
}

// IsKnownRole reports whether the text names a role exactly (used when a role
// is being assigned, where a silent fallback to Viewer would be wrong).
func IsKnownRole(role string) bool {
	switch Role(strings.ToLower(strings.TrimSpace(role))) {
	case RoleAdmin, RoleAnalyst, RoleOperator, RoleViewer:
		return true
	}
	return false
}

// Capability is one thing a role may do. Routes are mapped to capabilities,
// never to roles, so a role's reach is changed in one place.
type Capability string

const (
	// CapRead is every GET: posture, inventory, access, behaviour, reports.
	CapRead Capability = "read"
	// CapWrite is an ordinary state change: work a finding, an alert, a note.
	CapWrite Capability = "write"
	// CapOperate runs collection: start a scan, request a sync.
	CapOperate Capability = "operate"
	// CapApprove is the second review separation of duties asks for. Never
	// held by the same role that raises the request.
	CapApprove Capability = "approve"
	// CapPolicies maintains allowlists and suppressions.
	CapPolicies Capability = "policies"
	// CapIntegrations connects and removes AWS accounts.
	CapIntegrations Capability = "integrations"
	// CapExposure reads and decides on leaked secrets.
	CapExposure Capability = "exposure"
	// CapUsers administers the people who can sign in.
	CapUsers Capability = "users"
	// CapAuditAll reads every actor's entries in the audit log. Without it a
	// user still sees their own (the handler narrows the query, it does not
	// refuse), so "what did I change" is answerable by everyone.
	CapAuditAll Capability = "audit.all"
	// CapExport downloads a table as CSV.
	CapExport Capability = "export"
)

// grants is the matrix: which roles hold which capability. This is the whole
// permission model; everything else derives from it.
var grants = map[Capability][]Role{
	CapRead:         {RoleAdmin, RoleOperator, RoleAnalyst, RoleViewer},
	CapExport:       {RoleAdmin, RoleOperator, RoleAnalyst, RoleViewer},
	CapWrite:        {RoleAdmin, RoleAnalyst},
	CapOperate:      {RoleAdmin, RoleAnalyst},
	CapApprove:      {RoleAdmin, RoleOperator},
	CapPolicies:     {RoleAdmin, RoleOperator},
	CapIntegrations: {RoleAdmin},
	CapExposure:     {RoleAdmin},
	CapUsers:        {RoleAdmin},
	CapAuditAll:     {RoleAdmin, RoleOperator},
}

// Can reports whether the role holds the capability.
func Can(role Role, cap Capability) bool {
	for _, r := range grants[cap] {
		if r == role {
			return true
		}
	}
	return false
}

// CanText is Can for a role straight out of the database.
func CanText(role string, cap Capability) bool { return Can(NormalizeRole(role), cap) }

// Capabilities lists what a role holds, sorted, for the console to gate its
// own controls with (presentation; every API still checks for itself).
func Capabilities(role Role) []Capability {
	var out []Capability
	for cap := range grants {
		if Can(role, cap) {
			out = append(out, cap)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// HoldersOf names the roles that hold a capability, widest first.
func HoldersOf(cap Capability) []Role {
	var out []Role
	for _, r := range Roles {
		if Can(r, cap) {
			out = append(out, r)
		}
	}
	return out
}

// Needs is one sentence for a refusal: what the caller would have to be.
func Needs(cap Capability) string {
	holders := HoldersOf(cap)
	if len(holders) == 0 {
		return "No role can do this."
	}
	names := make([]string, 0, len(holders))
	for _, r := range holders {
		names = append(names, r.Label())
	}
	if len(names) == 1 {
		return "Only " + names[0] + " can do this."
	}
	return "Needs the " + strings.Join(names[:len(names)-1], ", ") + " or " + names[len(names)-1] + " role."
}
