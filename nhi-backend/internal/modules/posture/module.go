package posture

import (
	"nhi-backend-api/internal/modules/posture/accessgraph"
	"nhi-backend-api/internal/modules/posture/checkdetail"
	"nhi-backend-api/internal/modules/posture/export"
	"nhi-backend-api/internal/modules/posture/facets"
	"nhi-backend-api/internal/modules/posture/findingupdate"
	"nhi-backend-api/internal/modules/posture/identityactivity"
	"nhi-backend-api/internal/modules/posture/identityalerts"
	"nhi-backend-api/internal/modules/posture/identitychecks"
	"nhi-backend-api/internal/modules/posture/identitycredentials"
	"nhi-backend-api/internal/modules/posture/identityheader"
	"nhi-backend-api/internal/modules/posture/identityhistory"
	"nhi-backend-api/internal/modules/posture/identitylist"
	"nhi-backend-api/internal/modules/posture/identityposture"
	"nhi-backend-api/internal/modules/posture/identityroleuse"
	"nhi-backend-api/internal/modules/posture/overview"
	"nhi-backend-api/internal/modules/posture/quickwins"
)

// Handlers groups the 16 posture endpoints so routes and main can pass them
// around as one value. Any field may be nil; routes skip a nil handler.
type Handlers struct {
	Overview            *overview.PostureOverviewHandler
	QuickWinIdentities  *quickwins.QuickWinIdentitiesHandler
	Export              *export.PostureExportHandler
	IdentitiesList      *identitylist.IdentitiesListHandler
	IdentitiesFacets    *facets.IdentitiesFacetsHandler
	IdentityHeader      *identityheader.IdentityHeaderHandler
	IdentityPosture     *identityposture.IdentityPostureHandler
	IdentityChecks      *identitychecks.IdentityChecksHandler
	IdentityHistory     *identityhistory.IdentityHistoryHandler
	IdentityCredentials *identitycredentials.IdentityCredentialsHandler
	IdentityRoleUse     *identityroleuse.IdentityRoleUseHandler
	IdentityActivity    *identityactivity.IdentityActivityHandler
	IdentityAlerts      *identityalerts.IdentityAlertsHandler
	IdentityGraph       *accessgraph.IdentityGraphHandler
	CheckDetail         *checkdetail.CheckDetailHandler
	FindingUpdate       *findingupdate.FindingUpdateHandler
}
