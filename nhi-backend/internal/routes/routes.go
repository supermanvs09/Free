package routes

import (
	"encoding/json"
	"net/http"
	"nhi-backend-api/internal/platform/datasource"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/modules/auditlog"
	"nhi-backend-api/internal/modules/auth"
	"nhi-backend-api/internal/modules/awsintegration"
	"nhi-backend-api/internal/modules/credentialexposure"
	"nhi-backend-api/internal/modules/credentials"
	"nhi-backend-api/internal/modules/dashboard"
	"nhi-backend-api/internal/modules/filters"
	"nhi-backend-api/internal/modules/genome/dashboardsummary"
	"nhi-backend-api/internal/modules/genome/identityactivity"
	"nhi-backend-api/internal/modules/genome/identitygenome"
	"nhi-backend-api/internal/modules/genome/identitysummary"
	"nhi-backend-api/internal/modules/genome/identitytimeline"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/modules/identities"
	"nhi-backend-api/internal/modules/identityevents"
	"nhi-backend-api/internal/modules/ispmworker"
	"nhi-backend-api/internal/modules/permissionsource"
	"nhi-backend-api/internal/modules/posture"
	"nhi-backend-api/internal/modules/remediation"
	"nhi-backend-api/internal/modules/scanchanges"
	"nhi-backend-api/internal/modules/settings"
	"nhi-backend-api/internal/modules/users"
	"nhi-backend-api/internal/platform/audit"
	"nhi-backend-api/internal/platform/middleware"
)

type HandlerContainer struct {
	AuthHandler    *auth.AuthHandler
	AuthMiddleware *middleware.AuthMiddleware

	NewAPIFilterHandler            *filters.FilterHandler
	NewAPISettingsHandler          *settings.SettingsHandler
	NewAPIDashboardOverviewHandler *dashboard.DashboardOverviewHandler
	DashboardTrendsHandler         *dashboard.DashboardTrendsHandler
	// Scan API of the ISPM rule engine: public (API key) and console (login) routes.
	Scans                         *ispmworker.Handler
	ScanChangesHandler            *scanchanges.ScanChangesHandler
	NewAPIIdentitiesListHandler   *identities.IdentitiesListHandler
	NewAPIIdentityDetailHandler   *identities.IdentityDetailHandler
	NewAPIIdentityEventsHandler   *identityevents.IdentityEventsHandler
	NewAPICredentialsHandler      *credentials.CredentialsHandler
	NewAPICredentialDetailHandler *credentials.CredentialDetailHandler
	NewAPIPermissionSourceHandler *permissionsource.PermissionSourceHandler
	AWSIntegrationHandler         *awsintegration.AWSIntegrationHandler

	// ISPM posture dashboard API (16 endpoints), mounted under PostureBasePath.
	PostureHandlers *posture.Handlers

	// NHI Genome (backend_api_contract.md §4.1 and §5), mounted under GenomeBasePath.
	GenomeHandlers *GenomeHandlers

	// Remediation API (27 endpoints: plans, approvals, executions, batches,
	// audit, catalog, accounts, integrations), mounted under RemediationBasePath.
	RemediationHandlers *remediation.Handlers

	CredentialExposureFindingsHandler  *credentialexposure.FindingsHandler
	CredentialExposureAllowlistHandler *credentialexposure.AllowlistHandler
	CredentialExposureDecisionHandler  *credentialexposure.DecisionHandler
	CredentialExposureDeepScanHandler  *credentialexposure.DeepScanHandler

	// Who may sign in (admin only) and what everyone did. Both are ordinary
	// routes: the audit middleware records changes made through them like any
	// other, so administering users is itself audited.
	UsersHandler    *users.Handler
	AuditLogHandler *auditlog.Handler

	// AuditSink receives one entry per action. Nil turns recording off, which
	// is what happens when no database is configured.
	AuditSink audit.Sink
	// AuditReads records ordinary GETs as well. Off unless asked for: a
	// console that polls would bury the entries that matter.
	AuditReads bool
}

func SetupRoutes(h HandlerContainer) *mux.Router {
	r := mux.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RequestLogger)
	r.Use(middleware.Recoverer)
	// One middleware records every action, including a sign-in and anything
	// refused, so an endpoint added later is covered without a line here.
	if h.AuditSink != nil {
		cfg := audit.DefaultConfig()
		cfg.Reads = h.AuditReads
		r.Use(audit.Middleware(h.AuditSink, nil, cfg))
	}

	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"success": false,
			"message": "route not found: " + req.Method + " " + req.URL.Path,
			"error":   "ROUTE_NOT_FOUND",
		})
	})
	r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"success": false,
			"message": "method not allowed: " + req.Method + " " + req.URL.Path,
		})
	})

	r.HandleFunc("/api/v1/health", func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": "nhi-backend-api"})
	}).Methods(http.MethodGet)

	if h.AuthHandler != nil {
		r.HandleFunc("/api/v1/auth/key", h.AuthHandler.PublicKey).Methods(http.MethodGet)
		r.HandleFunc("/api/v1/login", h.AuthHandler.Login).Methods(http.MethodPost)
		r.HandleFunc("/api/auth/login", h.AuthHandler.Login).Methods(http.MethodPost)
		r.HandleFunc("/api/v1/refresh", h.AuthHandler.Refresh).Methods(http.MethodPost)
		r.HandleFunc("/api/auth/refresh", h.AuthHandler.Refresh).Methods(http.MethodPost)
		r.HandleFunc("/api/v1/logout", h.AuthHandler.Logout).Methods(http.MethodPost)
		r.HandleFunc("/api/auth/logout", h.AuthHandler.Logout).Methods(http.MethodPost)
	}
	if h.Scans != nil { // no login: the worker validates the caller's key
		// Own prefix: /api/v1/scans is the discovery scan history (and its /changes).
		r.HandleFunc("/api/v1/ispm-scans", h.Scans.PublicStart).Methods(http.MethodPost)
		r.HandleFunc("/api/v1/ispm-scans/{job_id}", h.Scans.PublicJob).Methods(http.MethodGet)
	}
	if h.AuthMiddleware == nil {
		return r
	}

	v1 := r.PathPrefix("/api/v1").Subrouter()
	v1.Use(h.AuthMiddleware.Authenticate)
	// One gate decides every route from the capability table in
	// internal/platform/authz, so a new endpoint is covered by its default
	// (read for a GET, write for anything else) rather than by being forgotten.
	v1.Use(h.AuthMiddleware.Authorize)
	protected := r.PathPrefix("/api").Subrouter()
	protected.Use(h.AuthMiddleware.Authenticate)
	protected.Use(h.AuthMiddleware.Authorize)
	registerProtected(v1, h, true)
	registerProtected(protected, h, false)
	return r
}

func registerProtected(router *mux.Router, h HandlerContainer, versioned bool) {
	if h.AuthHandler != nil {
		path := "/auth/me"
		if versioned {
			path = "/me"
		}
		router.HandleFunc(path, h.AuthHandler.Me).Methods(http.MethodGet)
		router.HandleFunc(path+"/password", h.AuthHandler.ChangePassword).Methods(http.MethodPatch)
	}
	// Who may sign in to this workspace.
	if h.UsersHandler != nil {
		router.HandleFunc("/users", h.UsersHandler.List).Methods(http.MethodGet)
		router.HandleFunc("/users", h.UsersHandler.Create).Methods(http.MethodPost)
		router.HandleFunc("/users/{id}", h.UsersHandler.Update).Methods(http.MethodPatch)
		router.HandleFunc("/users/{id}", h.UsersHandler.Delete).Methods(http.MethodDelete)
	}
	// What everyone did. Read-only by design: entries are written by the
	// middleware and are never edited or deleted from the console.
	if h.AuditLogHandler != nil {
		router.HandleFunc("/audit-logs", h.AuditLogHandler.List).Methods(http.MethodGet)
		router.HandleFunc("/audit-logs/filters", h.AuditLogHandler.Facets).Methods(http.MethodGet)
	}
	if h.NewAPIFilterHandler != nil {
		router.HandleFunc("/filters", h.NewAPIFilterHandler.GetFilters).Methods(http.MethodGet)
	}
	if h.NewAPISettingsHandler != nil {
		router.HandleFunc("/settings", h.NewAPISettingsHandler.Get).Methods(http.MethodGet)
		router.HandleFunc("/settings", h.NewAPISettingsHandler.Update).Methods(http.MethodPut)
	}
	if h.NewAPIDashboardOverviewHandler != nil {
		router.HandleFunc("/dashboard/overview", h.NewAPIDashboardOverviewHandler.Get).Methods(http.MethodGet)
	}
	if h.Scans != nil && versioned {
		router.HandleFunc("/ispm/scans", h.Scans.Start).Methods(http.MethodPost)
		router.HandleFunc("/ispm/scans/{job_id}", h.Scans.Job).Methods(http.MethodGet)
	}
	if h.DashboardTrendsHandler != nil {
		router.HandleFunc("/dashboard/trends", h.DashboardTrendsHandler.Get).Methods(http.MethodGet)
	}
	// Scan change tracking: scans and what each changed.
	if h.ScanChangesHandler != nil {
		router.HandleFunc("/scans", h.ScanChangesHandler.List).Methods(http.MethodGet)
		router.HandleFunc("/scans/{scan_id}/changes", h.ScanChangesHandler.Changes).Methods(http.MethodGet)
		router.HandleFunc("/scans/{scan_id}/status", h.ScanChangesHandler.Status).Methods(http.MethodGet)
	}
	if h.NewAPIIdentitiesListHandler != nil {
		router.HandleFunc("/identities", h.NewAPIIdentitiesListHandler.List).Methods(http.MethodGet)
	}
	if h.NewAPIIdentityDetailHandler != nil {
		router.HandleFunc("/identities/{id}", h.NewAPIIdentityDetailHandler.Get).Methods(http.MethodGet)
	}
	if h.NewAPIIdentityEventsHandler != nil {
		router.HandleFunc("/identities/{id}/events", h.NewAPIIdentityEventsHandler.Get).Methods(http.MethodGet)
	}
	if h.NewAPICredentialsHandler != nil {
		router.HandleFunc("/credentials", h.NewAPICredentialsHandler.List).Methods(http.MethodGet)
	}
	if h.NewAPICredentialDetailHandler != nil {
		router.HandleFunc("/credentials/{id}", h.NewAPICredentialDetailHandler.Get).Methods(http.MethodGet)
	}
	if h.NewAPIPermissionSourceHandler != nil {
		router.HandleFunc("/permission-source", h.NewAPIPermissionSourceHandler.Get).Methods(http.MethodGet)
	}
	// Connect AWS Account (Integrations page). Writes are admin-only.
	if h.AWSIntegrationHandler != nil {
		router.HandleFunc("/integrations/aws", h.AWSIntegrationHandler.Get).Methods(http.MethodGet)
		router.HandleFunc("/integrations/aws/verify", h.AWSIntegrationHandler.Verify).Methods(http.MethodPost)
		router.HandleFunc("/integrations/aws/accounts/{account_id}/regions", h.AWSIntegrationHandler.UpdateRegions).Methods(http.MethodPut)
		router.HandleFunc("/integrations/aws/accounts/{account_id}/exposure", h.AWSIntegrationHandler.Exposure).Methods(http.MethodPut)
		router.HandleFunc("/integrations/aws/accounts/{account_id}/sync", h.AWSIntegrationHandler.Sync).Methods(http.MethodPost)
		router.HandleFunc("/integrations/aws/accounts/{account_id}/sync", h.AWSIntegrationHandler.CancelSync).Methods(http.MethodDelete)
		router.HandleFunc("/integrations/aws/accounts/{account_id}", h.AWSIntegrationHandler.Remove).Methods(http.MethodDelete)
	}
	registerPostures(router, h.PostureHandlers)
	registerGenome(router, h.GenomeHandlers)
	registerRemediation(router, h.RemediationHandlers)
	// Credential Exposure — secret scanner findings, tenant-isolated, admin-only
	// These were present in the original backends but not wired in the v1-only build.
	// They live in their own package with strict query validation and tenant scope.
	if h.CredentialExposureFindingsHandler != nil {
		router.HandleFunc("/credential-exposure/findings", h.CredentialExposureFindingsHandler.List).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/flagged", h.CredentialExposureFindingsHandler.ListFlagged).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/ml-flagged", h.CredentialExposureFindingsHandler.ListFlagged).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/review", h.CredentialExposureFindingsHandler.ListReview).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/repeated", h.CredentialExposureFindingsHandler.ListRepeated).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/noise", h.CredentialExposureFindingsHandler.ListNoise).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/findings/summary", h.CredentialExposureFindingsHandler.Summary).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/deep-findings", h.CredentialExposureFindingsHandler.ListDeep).Methods(http.MethodGet)
	}
	if h.CredentialExposureAllowlistHandler != nil {
		router.HandleFunc("/credential-exposure/allowlist", h.CredentialExposureAllowlistHandler.List).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/allowlist", h.CredentialExposureAllowlistHandler.Create).Methods(http.MethodPost)
		router.HandleFunc("/credential-exposure/allowlist", h.CredentialExposureAllowlistHandler.Delete).Methods(http.MethodDelete)
	}
	if h.CredentialExposureDecisionHandler != nil {
		router.HandleFunc("/credential-exposure/decisions", h.CredentialExposureDecisionHandler.Save).Methods(http.MethodPost)
	}
	if h.CredentialExposureDeepScanHandler != nil {
		router.HandleFunc("/credential-exposure/deep-scan", h.CredentialExposureDeepScanHandler.Trigger).Methods(http.MethodPost)
		router.HandleFunc("/credential-exposure/deep-scan/status", h.CredentialExposureDeepScanHandler.Status).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/repositories", h.CredentialExposureDeepScanHandler.Repositories).Methods(http.MethodGet)
		router.HandleFunc("/credential-exposure/branches", h.CredentialExposureDeepScanHandler.Branches).Methods(http.MethodGet)
	}
}

// PostureBasePath is where the ISPM posture dashboard API is mounted, below
// /api/v1 (and /api). /identities and /identities/{id} already belong to the
// inventory API, so the posture API lives under its own prefix; change this
// one constant to move all 16 endpoints.
const PostureBasePath = "/ispm"

// registerPostures mounts the 16 endpoints of ISPM_Dashboard_API_v2.md.
// Static paths are registered before the {id} ones so that /identities/facets
// is not read as an identity id.
func registerPostures(router *mux.Router, p *posture.Handlers) {
	if p == nil {
		return
	}
	r := router.PathPrefix(PostureBasePath).Subrouter()
	get := func(path string, h http.HandlerFunc) { r.HandleFunc(path, h).Methods(http.MethodGet) }

	if p.Overview != nil {
		get("/posture/overview", p.Overview.Get)
	}
	if p.QuickWinIdentities != nil {
		get("/posture/quick-wins/{rule_id}/identities", p.QuickWinIdentities.Get)
	}
	if p.Export != nil {
		get("/posture/export", p.Export.Get)
	}
	if p.IdentitiesList != nil {
		get("/identities", p.IdentitiesList.List)
	}
	if p.IdentitiesFacets != nil {
		get("/identities/facets", p.IdentitiesFacets.Get)
	}
	if p.IdentityHeader != nil {
		get("/identities/{id}", p.IdentityHeader.Get)
	}
	if p.IdentityPosture != nil {
		get("/identities/{id}/posture", p.IdentityPosture.Get)
	}
	if p.IdentityChecks != nil {
		get("/identities/{id}/checks", p.IdentityChecks.Get)
	}
	if p.IdentityHistory != nil {
		get("/identities/{id}/history", p.IdentityHistory.Get)
	}
	if p.IdentityCredentials != nil {
		get("/identities/{id}/credentials", p.IdentityCredentials.Get)
	}
	if p.IdentityRoleUse != nil {
		get("/identities/{id}/role-use", p.IdentityRoleUse.Get)
	}
	if p.IdentityActivity != nil {
		get("/identities/{id}/activity", p.IdentityActivity.Get)
	}
	if p.IdentityAlerts != nil {
		get("/identities/{id}/alerts", p.IdentityAlerts.Get)
	}
	if p.IdentityGraph != nil {
		get("/identities/{id}/graph", p.IdentityGraph.Get)
	}
	if p.CheckDetail != nil {
		get("/checks/{rule_id}", p.CheckDetail.Get)
	}
	if p.FindingUpdate != nil {
		r.HandleFunc("/findings/{id}", p.FindingUpdate.Patch).Methods(http.MethodPatch)
	}
}

// RemediationBasePath is where the remediation API is mounted, below /api/v1
// (and /api): /api/v1/remediation/plans, …
const RemediationBasePath = "/remediation"

// registerRemediation mounts the remediation endpoints. Roles are checked by
// each endpoint (viewer < analyst < approver < admin, see remediation/common).
func registerRemediation(router *mux.Router, h *remediation.Handlers) {
	if h == nil {
		return
	}
	r := router.PathPrefix(RemediationBasePath).Subrouter()
	route := func(method, path string, fn http.HandlerFunc) { r.HandleFunc(path, fn).Methods(method) }
	get, post, put := http.MethodGet, http.MethodPost, http.MethodPut

	// plans
	if h.CreatePlan != nil {
		route(post, "/plans", h.CreatePlan.Post)
	}
	if h.ListPlans != nil {
		route(get, "/plans", h.ListPlans.List)
	}
	if h.GetPlan != nil {
		route(get, "/plans/{id}", h.GetPlan.Get)
	}
	if h.FindingList != nil {
		route(get, "/findings", h.FindingList.List)
	}
	if h.FindingPlans != nil {
		route(get, "/findings/{finding_id}", h.FindingPlans.Get)
	}
	if h.FindingFix != nil {
		route(get, "/findings/{finding_id}/fix", h.FindingFix.Get)
	}
	if h.SubmitPlan != nil {
		route(post, "/plans/{id}/submit", h.SubmitPlan.Post)
	}
	if h.ApprovePlan != nil {
		route(post, "/plans/{id}/approve", h.ApprovePlan.Post)
	}
	if h.RejectPlan != nil {
		route(post, "/plans/{id}/reject", h.RejectPlan.Post)
	}
	if h.ExecutePlan != nil {
		route(post, "/plans/{id}/execute", h.ExecutePlan.Post)
	}
	if h.CancelPlan != nil {
		route(post, "/plans/{id}/cancel", h.CancelPlan.Post)
	}
	if h.MarkDone != nil {
		route(post, "/plans/{id}/mark-done", h.MarkDone.Post)
	}
	if h.ConfirmExternal != nil {
		route(post, "/plans/{id}/confirm-external", h.ConfirmExternal.Post)
	}
	// executions
	if h.GetExecution != nil {
		route(get, "/executions/{id}", h.GetExecution.Get)
	}
	if h.RollbackExecution != nil {
		route(post, "/executions/{id}/rollback", h.RollbackExecution.Post)
	}
	if h.ExecutionCredential != nil {
		route(get, "/executions/{id}/credential", h.ExecutionCredential.Get)
	}
	// batches
	if h.CreateBatch != nil {
		route(post, "/batches", h.CreateBatch.Post)
	}
	if h.GetBatch != nil {
		route(get, "/batches/{id}", h.GetBatch.Get)
	}
	if h.SubmitBatch != nil {
		route(post, "/batches/{id}/submit", h.SubmitBatch.Post)
	}
	if h.ExecuteBatch != nil {
		route(post, "/batches/{id}/execute", h.ExecuteBatch.Post)
	}
	// audit, catalog
	if h.AuditLog != nil {
		route(get, "/audit", h.AuditLog.List)
	}
	if h.ListActions != nil {
		route(get, "/actions", h.ListActions.List)
	}
	// e-mail sync status of the rule engine (reads ispm_email_sync, every role)
	if h.EmailSync != nil {
		route(get, "/email-sync", h.EmailSync.Get)
	}
	// settings
	if h.ListAccounts != nil {
		route(get, "/accounts", h.ListAccounts.List)
	}
	if h.GetAccount != nil {
		route(get, "/accounts/{account_id}", h.GetAccount.Get)
	}
	if h.UpdateAccount != nil {
		route(put, "/accounts/{account_id}", h.UpdateAccount.Put)
	}
	if h.ValidateAccount != nil {
		route(post, "/accounts/{account_id}/validate", h.ValidateAccount.Post)
	}
	if h.AccountSetup != nil {
		route(get, "/accounts/{account_id}/setup", h.AccountSetup.Get)
	}
	if h.ListIntegrations != nil {
		route(get, "/integrations", h.ListIntegrations.List)
	}
	if h.UpdateIntegration != nil {
		route(put, "/integrations/{type}", h.UpdateIntegration.Put)
	}
}

// GenomeBasePath is where the NHI Genome API is mounted, below /api/v1 (and
// /api). Its /identities list and /identities/{source_type}/{identity_name}
// pages would otherwise collide with the discovery API's /identities and
// /identities/{id}/events. Keep in step with genome service APIBasePath.
const GenomeBasePath = "/genome"

// GenomeHandlers are the NHI Genome endpoints: the fleet summary and, per
// identity, its behavioural genome, activity and timeline. Identities are
// listed from the discovery inventory, not here.
type GenomeHandlers struct {
	DashboardSummary *dashboardsummary.DashboardSummaryHandler
	IdentityActivity *identityactivity.IdentityActivityHandler
	IdentityGenome   *identitygenome.IdentityGenomeHandler
	IdentityTimeline *identitytimeline.IdentityTimelineHandler
	IdentitySummary  *identitysummary.IdentitySummaryHandler
	// Full is the rest of the contract (anomalies, baseline, peers, drift, containment...).
	Full *GenomeFull
}

// registerGenome mounts the genome endpoints. identity_name is an ARN (it
// contains ':' and '/'), so the patterns use {identity_name:.+}.
func registerGenome(router *mux.Router, g *GenomeHandlers) {
	if g == nil {
		return
	}
	r := router.PathPrefix(GenomeBasePath).Subrouter()
	// One log line per request: tenant schema, Postgres and ClickHouse tables read.
	r.Use(datasource.Middleware("genome"))
	get := func(path string, h http.HandlerFunc) { r.HandleFunc(path, h).Methods(http.MethodGet) }

	if g.DashboardSummary != nil {
		get("/dashboard/summary", g.DashboardSummary.Get)
	}
	// Which workload kinds NHI Genome shows (NHI_GENOME_WORKLOAD_TYPES), so the
	// console offers Genome links only for those.
	get("/workload-types", func(w http.ResponseWriter, _ *http.Request) {
		families, all := workloadtypes.Enabled()
		writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"families": families, "all": all}})
	})
	g.Full.register(r) // before the greedy identity route below
	if g.IdentityActivity != nil {
		get("/identities/{source_type}/{identity_name:.+}/activity", g.IdentityActivity.Get)
	}
	if g.IdentityGenome != nil {
		get("/identities/{source_type}/{identity_name:.+}/genome", g.IdentityGenome.Get)
	}
	if g.IdentityTimeline != nil {
		get("/identities/{source_type}/{identity_name:.+}/timeline", g.IdentityTimeline.Get)
	}
	// Last: identity_name is greedy, so the sub-resource routes must match first.
	if g.IdentitySummary != nil {
		get("/identities/{source_type}/{identity_name:.+}", g.IdentitySummary.Get)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
