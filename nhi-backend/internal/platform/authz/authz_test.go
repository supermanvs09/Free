package authz

import (
	"net/http"
	"testing"
)

func TestNormalizeRoleNeverGrantsMoreThanItShould(t *testing.T) {
	for in, want := range map[string]Role{
		"admin": RoleAdmin, "ADMIN": RoleAdmin, " super_admin ": RoleAdmin, "owner": RoleAdmin,
		"analyst": RoleAnalyst, "operator": RoleOperator, "manager": RoleOperator, "reviewer": RoleOperator,
		"viewer": RoleViewer, "user": RoleViewer, "read-only": RoleViewer,
		// Anything unrecognised must land on the least-privileged role.
		"": RoleViewer, "administrator!": RoleViewer, "root": RoleViewer, "admin;--": RoleViewer,
	} {
		if got := NormalizeRole(in); got != want {
			t.Errorf("NormalizeRole(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsKnownRoleOnlyAcceptsTheFour(t *testing.T) {
	for _, ok := range []string{"admin", "analyst", "operator", "viewer", "ADMIN", " viewer "} {
		if !IsKnownRole(ok) {
			t.Errorf("%q should be assignable", ok)
		}
	}
	// An alias is understood on read but must not be assignable: a workspace
	// should not acquire new spellings of a role.
	for _, no := range []string{"manager", "user", "super_admin", "", "root"} {
		if IsKnownRole(no) {
			t.Errorf("%q should not be assignable", no)
		}
	}
}

func TestEveryRoleCanRead(t *testing.T) {
	for _, r := range Roles {
		if !Can(r, CapRead) {
			t.Errorf("%s cannot read", r)
		}
	}
}

func TestViewerCanOnlyRead(t *testing.T) {
	for _, cap := range []Capability{CapWrite, CapOperate, CapApprove, CapPolicies, CapIntegrations, CapExposure, CapUsers, CapAuditAll} {
		if Can(RoleViewer, cap) {
			t.Errorf("viewer must not hold %s", cap)
		}
	}
}

// Separation of duties: whoever raises a request must not be able to approve
// it. Analyst writes, so analyst must not approve.
func TestSeparationOfDuties(t *testing.T) {
	if Can(RoleAnalyst, CapApprove) {
		t.Error("analyst both writes and approves, so one person could do both halves")
	}
	if !Can(RoleOperator, CapApprove) || !Can(RoleAdmin, CapApprove) {
		t.Error("nobody can give the second approval")
	}
}

func TestAnalystHasNoIntegrationsAndNoUsers(t *testing.T) {
	for _, cap := range []Capability{CapIntegrations, CapUsers} {
		if Can(RoleAnalyst, cap) {
			t.Errorf("analyst must not hold %s", cap)
		}
	}
}

func TestOnlyAdminManagesUsers(t *testing.T) {
	if holders := HoldersOf(CapUsers); len(holders) != 1 || holders[0] != RoleAdmin {
		t.Errorf("CapUsers holders = %v, want only admin", holders)
	}
}

func TestRequiredDefaultsAreSafeForNewRoutes(t *testing.T) {
	// A route nobody has thought about: a read needs read, a change needs write.
	if got := Required(http.MethodGet, "/api/v1/something/new"); got != CapRead {
		t.Errorf("new GET = %s, want read", got)
	}
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		if got := Required(m, "/api/v1/something/new"); got != CapWrite {
			t.Errorf("new %s = %s, want write", m, got)
		}
	}
	// So a viewer can read it and cannot change it, without anyone adding a rule.
	if !Can(RoleViewer, Required(http.MethodGet, "/api/v1/brand/new")) {
		t.Error("a viewer should be able to read a route added later")
	}
	if Can(RoleViewer, Required(http.MethodPost, "/api/v1/brand/new")) {
		t.Error("a viewer should not be able to change a route added later")
	}
}

func TestRequiredForTheRoutesThatMatter(t *testing.T) {
	cases := []struct {
		method, route string
		want          Capability
	}{
		// Users: reading the list is as restricted as changing it.
		{http.MethodGet, "/api/v1/users", CapUsers},
		{http.MethodPost, "/api/v1/users", CapUsers},
		{http.MethodPatch, "/api/v1/users/{id}", CapUsers},
		{http.MethodDelete, "/api/v1/users/{id}", CapUsers},

		// Integrations, including the re-check and sync that drive collection.
		{http.MethodPost, "/api/v1/integrations/aws/verify", CapIntegrations},
		{http.MethodDelete, "/api/v1/integrations/aws/accounts/{account_id}", CapIntegrations},
		{http.MethodPost, "/api/v1/integrations/aws/accounts/{account_id}/sync", CapIntegrations},
		{http.MethodPut, "/api/v1/integrations/aws/accounts/{account_id}/regions", CapIntegrations},
		// ... but reading the page is an ordinary read.
		{http.MethodGet, "/api/v1/integrations/aws", CapRead},

		// Leaked secrets: seeing one is the privileged part.
		{http.MethodGet, "/api/v1/credential-exposure/findings", CapExposure},
		{http.MethodPost, "/api/v1/credential-exposure/findings/{id}/decision", CapExposure},
		{http.MethodPost, "/api/v1/credential-exposure/allowlist", CapPolicies},

		// Second review.
		{http.MethodPost, "/api/v1/remediation/plans/{id}/approve", CapApprove},
		{http.MethodPost, "/api/v1/remediation/plans/{id}/reject", CapApprove},
		{http.MethodPost, "/api/v1/remediation/plans/{id}/execute", CapApprove},

		// Collection.
		{http.MethodPost, "/api/v1/ispm/scans", CapOperate},

		// Exports stay readable by everyone who can read the screen.
		{http.MethodGet, "/api/v1/ispm/posture/export", CapExport},

		// Ordinary posture work.
		{http.MethodPatch, "/api/v1/ispm/findings/{finding_id}", CapWrite},
		{http.MethodGet, "/api/v1/identities", CapRead},
		{http.MethodGet, "/api/v1/audit-logs", CapRead},
	}
	for _, c := range cases {
		if got := Required(c.method, c.route); got != c.want {
			t.Errorf("Required(%s %s) = %s, want %s", c.method, c.route, got, c.want)
		}
	}
}

// The matrix as a whole, read the way an operator would: who can do what.
func TestMatrix(t *testing.T) {
	want := map[Role][]Capability{
		RoleAdmin:    {CapRead, CapExport, CapWrite, CapOperate, CapApprove, CapPolicies, CapIntegrations, CapExposure, CapUsers, CapAuditAll},
		RoleAnalyst:  {CapRead, CapExport, CapWrite, CapOperate},
		RoleOperator: {CapRead, CapExport, CapApprove, CapPolicies, CapAuditAll},
		RoleViewer:   {CapRead, CapExport},
	}
	for role, caps := range want {
		held := map[Capability]bool{}
		for _, c := range Capabilities(role) {
			held[c] = true
		}
		for _, c := range caps {
			if !held[c] {
				t.Errorf("%s should hold %s", role, c)
			}
			delete(held, c)
		}
		for c := range held {
			t.Errorf("%s unexpectedly holds %s", role, c)
		}
	}
}

func TestNeedsReadsAsASentence(t *testing.T) {
	if got := Needs(CapUsers); got != "Only Admin can do this." {
		t.Errorf("Needs(users) = %q", got)
	}
	if got := Needs(CapApprove); got != "Needs the Admin or Operator role." {
		t.Errorf("Needs(approve) = %q", got)
	}
}
