package awsintegration

import "testing"

func TestHideOtherPeopleKeepsOnlyTheReader(t *testing.T) {
	res := &AWSIntegrationResponse{Accounts: []AWSConnectedAccount{{
		LastVerifiedBy: "admin@acme.test",
		Approval:       AWSApproval{RequestedBy: "viewer@acme.test", DecidedBy: "super admin"},
		Exposure:       AWSExposure{UpdatedBy: "admin@acme.test"},
		Sync:           AWSSync{RequestedBy: "Viewer@Acme.test"},
	}}}
	hideOtherPeople(res, "viewer@acme.test")
	a := res.Accounts[0]
	if a.LastVerifiedBy != "" || a.Approval.DecidedBy != "" || a.Exposure.UpdatedBy != "" {
		t.Fatalf("other people still shown: %+v", a)
	}
	if a.Approval.RequestedBy != "viewer@acme.test" || a.Sync.RequestedBy != "Viewer@Acme.test" {
		t.Fatalf("the reader's own actions were hidden: %+v", a)
	}
}
