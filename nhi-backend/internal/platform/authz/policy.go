package authz

import (
	"net/http"
	"strings"
)

// Which capability a request needs.
//
// The rule is deliberately "safe by default" so that an endpoint added later
// is covered without anybody remembering to come back here:
//
//	GET, HEAD            CapRead
//	anything else        CapWrite
//
// A route that needs something other than that is listed below, matched on the
// route template mux registered (for example "/api/v1/aws/accounts/{id}"), so
// the rule does not depend on the ids in a particular URL.
//
// Entries are matched in order and the first match wins, so put the specific
// ones first.
type rule struct {
	// contains is matched against the lower-cased route template. A rule with
	// several fragments needs all of them.
	contains []string
	// methods limits the rule; empty means every method that changes state.
	methods []string
	// reads makes the rule apply to GET and HEAD as well (for a read that is
	// itself privileged, such as a leaked secret).
	reads bool
	cap   Capability
}

var policy = []rule{
	// Things a signed-in person does to their own account: change their own
	// password, save their own data scope. Every role may, or a viewer could
	// not pick which accounts their own dashboard shows.
	{contains: []string{"/me/"}, cap: CapRead},
	{contains: []string{"/settings"}, methods: []string{http.MethodPut}, cap: CapRead},

	// People who can sign in. Reading the list is as restricted as changing it:
	// it names everyone with access.
	{contains: []string{"/users"}, reads: true, cap: CapUsers},

	// Remediation decides its own steps (remediation/common.RoleOf): running or
	// retrying an approved plan is the analyst's job there, not an approval,
	// and account settings are for admins only.
	{contains: []string{"/remediation/", "/execute"}, cap: CapWrite},
	{contains: []string{"/remediation/accounts"}, cap: CapIntegrations},

	// Leaked secrets: seeing one is the privileged part, so reads included.
	{contains: []string{"/credential-exposure/allowlist"}, cap: CapPolicies},
	{contains: []string{"/credential-exposure"}, reads: true, cap: CapExposure},

	// Integrations: connecting or removing an AWS account, and the
	// re-check/sync that drives collection for it.
	{contains: []string{"/aws/"}, cap: CapIntegrations},
	{contains: []string{"/aws"}, cap: CapIntegrations},
	{contains: []string{"/integrations"}, cap: CapIntegrations},

	// Second review. Separation of duties: approving is a different capability
	// from requesting, so the roles that raise requests cannot grant them.
	{contains: []string{"/approve"}, cap: CapApprove},
	{contains: []string{"/approvals"}, cap: CapApprove},
	{contains: []string{"/reject"}, cap: CapApprove},
	{contains: []string{"/execute"}, cap: CapApprove},

	// Policies that decide what is enforced.
	{contains: []string{"/suppress"}, cap: CapPolicies},
	{contains: []string{"/policies"}, cap: CapPolicies},
	{contains: []string{"/settings"}, cap: CapPolicies},

	// Collection.
	{contains: []string{"/scans"}, cap: CapOperate},
	{contains: []string{"-scans"}, cap: CapOperate},
	{contains: []string{"/sync"}, cap: CapOperate},

	// Exports are reads, but worth their own capability so they can be taken
	// away without taking away the screen.
	{contains: []string{"/export"}, reads: true, methods: []string{http.MethodGet, http.MethodHead}, cap: CapExport},
}

// Required returns the capability a request needs, and whether the route is
// one the caller must hold anything at all for.
//
// route is the template mux matched (falling back to the path when a request
// matched no route, where the answer does not matter because it 404s).
func Required(method, route string) Capability {
	r := strings.ToLower(route)
	isRead := method == http.MethodGet || method == http.MethodHead
	for _, p := range policy {
		if isRead && !p.reads {
			continue
		}
		if len(p.methods) > 0 && !hasMethod(p.methods, method) {
			continue
		}
		if !matches(r, p.contains) {
			continue
		}
		return p.cap
	}
	if isRead {
		return CapRead
	}
	return CapWrite
}

func matches(route string, fragments []string) bool {
	for _, f := range fragments {
		if !strings.Contains(route, f) {
			return false
		}
	}
	return true
}

func hasMethod(methods []string, method string) bool {
	for _, m := range methods {
		if strings.EqualFold(m, method) {
			return true
		}
	}
	return false
}
