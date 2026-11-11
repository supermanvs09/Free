package auth

import "testing"

func TestPasswordProblem(t *testing.T) {
	for _, bad := range []string{"111111111111", "            ", "abcdefghijkl", "Abcdefghijk1", " StrongPass1!"} {
		if PasswordProblem(bad) == "" {
			t.Errorf("accepted %q", bad)
		}
	}
	if p := PasswordProblem("StrongPass123!"); p != "" {
		t.Errorf("refused a strong password: %s", p)
	}
}

func TestRoles(t *testing.T) {
	if !CanManage(RoleAdmin) || !CanManage(RoleAnalyst) || CanManage(RoleViewer) {
		t.Fatal("only admins and analysts manage connections")
	}
}
