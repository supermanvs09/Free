package common

import (
	"testing"

	"nhi-backend-api/internal/remediation/domain"
)

func TestRoleOf(t *testing.T) {
	for in, want := range map[string]domain.Role{
		"admin": domain.RoleAdmin, "Super_Admin": domain.RoleAdmin, "superadmin": domain.RoleAdmin,
		"approver": domain.RoleApprover, "manager": domain.RoleApprover,
		"analyst": domain.RoleAnalyst, " Analyst ": domain.RoleAnalyst,
		"user": domain.RoleViewer, "viewer": domain.RoleViewer, "": domain.RoleViewer, "root": domain.RoleViewer,
	} {
		if got := RoleOf(in); got != want {
			t.Errorf("RoleOf(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestCallerActorLowercasesTenant(t *testing.T) {
	a := Caller{UserID: "u@x", TenantID: "AAAAAAAA-1111-1111-1111-111111111111", Role: "analyst"}.Actor()
	if a.TenantID != "aaaaaaaa-1111-1111-1111-111111111111" || a.Role != domain.RoleAnalyst || a.UserID != "u@x" {
		t.Fatalf("unexpected actor %+v", a)
	}
}
