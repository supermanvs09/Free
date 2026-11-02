package routes

import (
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/genome/dashboardsummary"
	"nhi-backend-api/internal/modules/genome/identityactivity"
	"nhi-backend-api/internal/modules/genome/identitygenome"
	"nhi-backend-api/internal/modules/genome/identitysummary"
	"nhi-backend-api/internal/modules/genome/identitytimeline"
)

// identity_name is an ARN matched by {identity_name:.+}, so the sub-resource
// routes must win over the plain identity route.
func TestGenomeRoutesMatchSubResourcesFirst(t *testing.T) {
	r := mux.NewRouter()
	registerGenome(r, &GenomeHandlers{
		DashboardSummary: &dashboardsummary.DashboardSummaryHandler{},
		IdentityActivity: &identityactivity.IdentityActivityHandler{},
		IdentityGenome:   &identitygenome.IdentityGenomeHandler{},
		IdentityTimeline: &identitytimeline.IdentityTimelineHandler{},
		IdentitySummary:  &identitysummary.IdentitySummaryHandler{},
	})
	arn := "arn:aws:ecs:ap-south-2:111122223333:task%2Fcluster%2Fabc"
	for path, want := range map[string]string{
		"/genome/identities/ECS/" + arn + "/activity": "/genome/identities/{source_type}/{identity_name:.+}/activity",
		"/genome/identities/ECS/" + arn + "/genome":   "/genome/identities/{source_type}/{identity_name:.+}/genome",
		"/genome/identities/ECS/" + arn + "/timeline": "/genome/identities/{source_type}/{identity_name:.+}/timeline",
		"/genome/identities/ECS/" + arn:               "/genome/identities/{source_type}/{identity_name:.+}",
		"/genome/dashboard/summary":                   "/genome/dashboard/summary",
	} {
		var m mux.RouteMatch
		if !r.Match(httptest.NewRequest("GET", path, nil), &m) {
			t.Errorf("%s: no route", path)
			continue
		}
		if got, _ := m.Route.GetPathTemplate(); got != want {
			t.Errorf("%s matched %s, want %s", path, got, want)
		}
	}
}
