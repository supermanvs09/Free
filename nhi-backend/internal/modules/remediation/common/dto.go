// Package common holds what every remediation endpoint shares: the caller
// taken from the JWT, the role mapping, the response and error envelopes and
// request parsing. The remediation logic itself is internal/remediation/engine.
package common

import (
	"regexp"
	"strings"

	"nhi-backend-api/internal/remediation/domain"
)

// Caller is the authenticated user, copied from the JWT claims. The tenant
// always comes from here, never from a request parameter.
type Caller struct {
	UserID   string
	TenantID string
	DBName   string
	Role     string
}

// Actor is the caller as the remediation engine sees it.
func (c Caller) Actor() domain.Actor {
	return domain.Actor{TenantID: strings.ToLower(c.TenantID), UserID: c.UserID, Role: RoleOf(c.Role)}
}

// Can reports whether the caller's role allows a remediation permission.
func (c Caller) Can(p domain.Permission) bool { return RoleOf(c.Role).Can(p) }

// RoleOf maps a backend user role (nhi_users.role) to a remediation role:
//
//	admin, super_admin   admin     everything, including account and integration settings
//	approver, manager    approver  read, approve / reject
//	analyst              analyst   read, create and submit plans, execute, roll back
//	anything else        viewer    read only
func RoleOf(role string) domain.Role {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "super_admin", "superadmin":
		return domain.RoleAdmin
	case "approver", "manager":
		return domain.RoleApprover
	case "analyst":
		return domain.RoleAnalyst
	}
	return domain.RoleViewer
}

// Envelope is the success body: { "data": … } plus endpoint extras.
type Envelope struct {
	Data any `json:"data"`
}

// ErrorEnvelope is the error body: { "error": { "code", "message", "field" } },
// the same shape as the /ispm API.
type ErrorEnvelope struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

var (
	UUIDRegex      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	AccountIDRegex = regexp.MustCompile(`^\d{12}$`)
)
