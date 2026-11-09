package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/joho/godotenv"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/modules/auditlog"
	"nhi-backend-api/internal/modules/auth"
	"nhi-backend-api/internal/modules/awsintegration"
	"nhi-backend-api/internal/modules/credentialexposure"
	"nhi-backend-api/internal/modules/credentials"
	"nhi-backend-api/internal/modules/dashboard"
	"nhi-backend-api/internal/modules/filters"
	genomefullcommon "nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/dashboardsummary"
	"nhi-backend-api/internal/modules/genome/identityactivity"
	"nhi-backend-api/internal/modules/genome/identitygenome"
	"nhi-backend-api/internal/modules/genome/identitysummary"
	"nhi-backend-api/internal/modules/genome/identitytimeline"
	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/modules/identities"
	"nhi-backend-api/internal/modules/identityevents"
	"nhi-backend-api/internal/modules/ispmworker"
	"nhi-backend-api/internal/modules/permissionsource"
	"nhi-backend-api/internal/modules/posture"
	"nhi-backend-api/internal/modules/posture/accessgraph"
	"nhi-backend-api/internal/modules/posture/checkdetail"
	"nhi-backend-api/internal/modules/posture/export"
	"nhi-backend-api/internal/modules/posture/facets"
	"nhi-backend-api/internal/modules/posture/findingupdate"
	posturehandlers "nhi-backend-api/internal/modules/posture/identityactivity"
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
	"nhi-backend-api/internal/modules/scanchanges"
	"nhi-backend-api/internal/modules/settings"
	"nhi-backend-api/internal/modules/users"
	"nhi-backend-api/internal/platform/audit"
	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/clickhouse"
	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/fieldcrypt"
	"nhi-backend-api/internal/platform/githubcheck"
	"nhi-backend-api/internal/platform/globalschema"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/mailer"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
	"nhi-backend-api/internal/routes"
)

func main() {
	// Optional .env for local runs; variables already in the environment win.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		fatal("load .env", err)
	}

	cfg, err := config.Load()
	if err != nil {
		fatal("load configuration", err)
	}
	logging.Setup(cfg.Logging.Level, cfg.Logging.Format)
	if err := workloadtypes.Configure(cfg.Genome.WorkloadTypes); err != nil {
		fatal("load configuration", err)
	}
	if list, all := workloadtypes.Enabled(); !all {
		slog.Info("genome: showing only these workload types", "types", list)
	}

	// DB is the global authentication/tenant registry pool. Tenant pools are
	// opened only through the registry-validated db_name in a signed token.
	db, err := database.NewPostgresDB(cfg)
	if err != nil {
		fatal("connect to global database", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Warn("close database pools", "err", err)
		}
	}()

	// ClickHouse (CloudTrail events) is optional. Unconfigured: chClient is nil.
	// Unreachable: the client is kept and retried; until it answers the API
	// serves Postgres data only.
	chCtx, chCancel := context.WithTimeout(context.Background(), 10*time.Second)
	chClient, err := clickhouse.New(chCtx, cfg.ClickHouse)
	chCancel()
	switch {
	case err != nil:
		slog.Warn("clickhouse unavailable, activity data disabled until it answers", "err", err)
	case chClient == nil:
		slog.Info("clickhouse not configured, activity data disabled")
	default:
		slog.Info("clickhouse connected", "host", cfg.ClickHouse.Host, "port", cfg.ClickHouse.Port, "database", cfg.ClickHouse.Database, "table", cfg.ClickHouse.Table)
		colCtx, colCancel := context.WithTimeout(context.Background(), 10*time.Second)
		// In per-tenant mode there is no single table to check at startup.
		if chClient.PerTenant() {
			slog.Info("clickhouse: one database per tenant", "pattern", "<tenant db_name>"+cfg.ClickHouse.DatabaseSuffix, "table", cfg.ClickHouse.Table)
		} else if err := chClient.RequireColumns(colCtx, "event_time", "event_name", "event_source", "caller_arn", "session_issuer_arn", "access_key_id", "account_id", "resource_arn", "source_ip", "error_code"); err != nil {
			slog.Error("clickhouse CloudTrail table unusable, activity data disabled", "err", err)
		}
		colCancel()
	}
	defer func() {
		if err := chClient.Close(); err != nil {
			slog.Warn("close clickhouse", "err", err)
		}
	}()
	slowQuery := time.Second
	if cfg.Logging.SlowQueryMS > 0 {
		slowQuery = time.Duration(cfg.Logging.SlowQueryMS) * time.Millisecond
	}
	chRepo := eventstore.New(chClient, eventstore.WithSlowQueryThreshold(slowQuery))
	activityService := identitygraph.NewActivityService(chRepo, identitygraph.NewIdentityLookupRepository())

	// Monitoring ClickHouse (NHI Genome log_events, NHI_MONITORING_CLICKHOUSE_*) is
	// optional too. If it is unconfigured or unreachable the genome endpoints
	// still serve Postgres data; the event-backed fields are then null.
	monitoringCfg, err := config.MonitoringClickHouse()
	if err != nil {
		fatal("load monitoring clickhouse configuration", err)
	}
	monCtx, monCancel := context.WithTimeout(context.Background(), 10*time.Second)
	monitoringClient, err := clickhouse.New(monCtx, monitoringCfg)
	monCancel()
	switch {
	case err != nil:
		slog.Warn("monitoring clickhouse unavailable, event-backed fields disabled until it answers", "err", err)
	case monitoringClient == nil:
		slog.Info("monitoring clickhouse not configured (NHI_MONITORING_CLICKHOUSE_HOST empty), event-backed fields disabled")
	default:
		slog.Info("monitoring clickhouse connected", "host", monitoringCfg.Host, "port", monitoringCfg.Port, "database", monitoringCfg.Database, "table", monitoringCfg.Table)
	}
	defer func() {
		if err := monitoringClient.Close(); err != nil {
			slog.Warn("close monitoring clickhouse", "err", err)
		}
	}()
	monitoringEvents := summarycommon.NewMonitoringEvents(monitoringClient, monitoringCfg.Database)
	// The inventory's Activity tabs read monitored workloads from the same
	// store as NHI Genome, so the two screens show and count the same calls.
	if inv := summarycommon.NewInventoryActivity(monitoringEvents); inv != nil {
		activityService.SetMonitored(inv)
	}

	// Who may sign in, what everyone did. The audit store writes in the
	// background so recording never slows a request; Close drains the last
	// few entries on shutdown.
	globalSchema := config.DefaultGlobalSchema
	if s := strings.TrimSpace(db.GlobalSchema()); s != "" {
		globalSchema = s
	}
	// Tables this process writes to must exist before it starts writing: a
	// deployment whose migrations were not applied lost every audit entry.
	// Failing here is logged and not fatal; the API still serves.
	{
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		if _, err := globalschema.Ensure(ctx, db.DB, globalSchema); err != nil {
			slog.Error("global tables are missing and could not be created", "err", err)
		}
		cancel()
	}
	auditStore := audit.NewStore(db.DB, globalSchema)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		auditStore.Close(ctx)
		cancel()
	}()
	usersHandler := users.NewHandler(users.NewRepository(db, globalSchema))
	auditLogHandler := auditlog.NewHandler(auditlog.NewRepository(db, globalSchema))

	userRepo := auth.NewUserRepository(db)
	resolver := scope.NewResolver(db)

	authService := auth.NewAuthService(userRepo, cfg.JWT)
	// Passwords arrive encrypted (see fieldcrypt); the key comes from the JWT secret.
	if err := fieldcrypt.Init(cfg.JWT.Secret); err != nil {
		slog.Error("password encryption key", "err", err)
		os.Exit(1)
	}
	authHandler := auth.NewAuthHandler(authService)
	authMiddleware := middleware.NewAuthMiddleware(cfg.JWT, userRepo)

	filterHandler := filters.NewFilterHandler(filters.NewFilterService(filters.NewFilterRepository(), resolver))
	settingsHandler := settings.NewSettingsHandler(settings.NewSettingsService(settings.NewSettingsRepository(), db, resolver))
	// Scan change tracking (the scanner's nhi_scans_aws + scan_changes).
	scanChangesRepo := identitygraph.NewScanChangesRepository()
	scanChangesHandler := scanchanges.NewScanChangesHandler(identitygraph.NewScanChangesService(scanChangesRepo, resolver))
	dashboardHandler := dashboard.NewDashboardOverviewHandler(dashboard.NewDashboardOverviewService(dashboard.NewDashboardOverviewRepository(), scanChangesRepo, resolver, activityService))
	identitiesHandler := identities.NewIdentitiesListHandler(identities.NewIdentitiesListService(identities.NewIdentitiesListRepository(), scanChangesRepo, resolver, activityService))
	identityDetailHandler := identities.NewIdentityDetailHandler(identities.NewIdentityDetailService(identitygraph.NewIdentityDetailRepository(), scanChangesRepo, resolver, activityService))
	identityEventsHandler := identityevents.NewIdentityEventsHandler(identityevents.NewIdentityEventsService(identityevents.NewIdentityEventsRepository(), resolver, activityService))
	credentialsHandler := credentials.NewCredentialsHandler(credentials.NewCredentialsService(credentials.NewCredentialsRepository(), scanChangesRepo, resolver, activityService))
	credentialDetailHandler := credentials.NewCredentialDetailHandler(credentials.NewCredentialDetailService(identitygraph.NewCredentialDetailRepository(), scanChangesRepo, resolver, activityService))

	permissionSourceHandler := permissionsource.NewPermissionSourceHandler(permissionsource.NewPermissionSourceService(identitygraph.NewPermissionSourceRepository(), resolver))

	// ISPM posture dashboard API — 16 endpoints under /api/v1/ispm, tenant from the JWT only.
	postureHandlers := &posture.Handlers{
		Overview:            overview.NewPostureOverviewHandler(overview.NewPostureOverviewService(overview.NewPostureOverviewRepository(), resolver)),
		QuickWinIdentities:  quickwins.NewQuickWinIdentitiesHandler(quickwins.NewQuickWinIdentitiesService(quickwins.NewQuickWinIdentitiesRepository(), resolver)),
		Export:              export.NewPostureExportHandler(export.NewPostureExportService(export.NewPostureExportRepository(), resolver)),
		IdentitiesList:      identitylist.NewIdentitiesListHandler(identitylist.NewIdentitiesListService(identitylist.NewIdentitiesListRepository(), resolver)),
		IdentitiesFacets:    facets.NewIdentitiesFacetsHandler(facets.NewIdentitiesFacetsService(facets.NewIdentitiesFacetsRepository(), resolver)),
		IdentityHeader:      identityheader.NewIdentityHeaderHandler(identityheader.NewIdentityHeaderService(identityheader.NewIdentityHeaderRepository(), resolver)),
		IdentityPosture:     identityposture.NewIdentityPostureHandler(identityposture.NewIdentityPostureService(identityposture.NewIdentityPostureRepository(), resolver)),
		IdentityChecks:      identitychecks.NewIdentityChecksHandler(identitychecks.NewIdentityChecksService(identitychecks.NewIdentityChecksRepository(), resolver)),
		IdentityHistory:     identityhistory.NewIdentityHistoryHandler(identityhistory.NewIdentityHistoryService(identityhistory.NewIdentityHistoryRepository(), resolver)),
		IdentityCredentials: identitycredentials.NewIdentityCredentialsHandler(identitycredentials.NewIdentityCredentialsService(identitycredentials.NewIdentityCredentialsRepository(), resolver)),
		IdentityRoleUse:     identityroleuse.NewIdentityRoleUseHandler(identityroleuse.NewIdentityRoleUseService(identityroleuse.NewIdentityRoleUseRepository(), resolver)),
		IdentityActivity: posturehandlers.NewIdentityActivityHandler(posturehandlers.NewIdentityActivityService(
			posturehandlers.NewIdentityActivityRepository(chRepo, identitygraph.NewIdentityLookupRepository()), resolver)),
		IdentityAlerts: identityalerts.NewIdentityAlertsHandler(identityalerts.NewIdentityAlertsService(identityalerts.NewIdentityAlertsRepository(), resolver)),
		IdentityGraph:  accessgraph.NewIdentityGraphHandler(accessgraph.NewIdentityGraphService(accessgraph.NewIdentityGraphRepository(), resolver)),
		CheckDetail:    checkdetail.NewCheckDetailHandler(checkdetail.NewCheckDetailService(checkdetail.NewCheckDetailRepository(), resolver)),
		FindingUpdate:  findingupdate.NewFindingUpdateHandler(findingupdate.NewFindingUpdateService(findingupdate.NewFindingUpdateRepository(), resolver)),
	}

	// NHI Genome (backend_api_contract.md §4.1, §5) under /api/v1/genome — Postgres
	// through the tenant scope, ClickHouse log_events through monitoringEvents.
	genomeIdentities := summarycommon.NewMonitoredIdentityLookup(summarycommon.NewDashboardSummaryRepository(), resolver)
	genomeHandlers := &routes.GenomeHandlers{
		DashboardSummary: dashboardsummary.NewDashboardSummaryHandler(dashboardsummary.NewDashboardSummaryService(summarycommon.NewDashboardSummaryRepository(), resolver)),
		IdentityActivity: identityactivity.NewIdentityActivityHandler(identityactivity.NewIdentityActivityService(genomeIdentities, monitoringEvents)),
		IdentityGenome:   identitygenome.NewIdentityGenomeHandler(identitygenome.NewIdentityGenomeService(genomeIdentities, monitoringEvents)),
		IdentityTimeline: identitytimeline.NewIdentityTimelineHandler(identitytimeline.NewIdentityTimelineService(genomeIdentities, identitytimeline.NewIdentityTimelineRepository())),
		IdentitySummary:  identitysummary.NewIdentitySummaryHandler(identitysummary.NewIdentitySummaryService(genomeIdentities, identitysummary.NewIdentitySummaryRepository(), monitoringEvents)),
		Full:             routes.NewGenomeFull(resolver, genomefullcommon.NewMonitoringEvents(monitoringClient, monitoringCfg.Database, monitoringCfg.Table)),
	}

	// Connect AWS Account. The SDK's default chain supplies this process's
	// identity (task role, instance profile, AWS_PROFILE); credentials resolve
	// on first use, so a host without AWS access still serves every other route.
	var awsVerifier awsintegration.AWSVerifier
	var awsClient *awsconnect.Client
	awsCtx, awsCancel := context.WithTimeout(context.Background(), 10*time.Second)
	awsBase, err := awsconfig.LoadDefaultConfig(awsCtx)
	awsCancel()
	if err != nil {
		slog.Warn("aws integration: AWS configuration unavailable, connection checks disabled", "err", err)
	} else {
		awsClient = awsconnect.NewClient(awsBase, cfg.AWSIntegration.AssumeAssumerRole).WithEventQueue(cfg.AWSIntegration.EventQueueURL)
		awsVerifier = awsClient
		// Are we the account and role customers are told to trust? Checked in
		// the background so start-up never waits on AWS.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			awsintegration.CheckPlatformAtStart(ctx, awsintegration.NewAWSIntegrationRepository(db), awsClient, cfg.AWSIntegration.AssumerRoleName)
		}()
	}
	// "Receive your events" peeks at the central SQS queue only: the tenant's
	// ClickHouse database is created by another service once an account is
	// connected, so it cannot be part of the check that connects it.
	var awsEvents awsintegration.AWSEventSource
	switch {
	case awsClient == nil:
	case cfg.AWSIntegration.EventQueueURL == "":
		slog.Warn("aws integration: NHI_AWS_EVENT_QUEUE_URL is not set; the \"Receive your events\" check cannot run, so no account can connect")
	default:
		awsEvents = awsintegration.QueueEventSource{Client: awsClient}
		slog.Info("aws integration: events check reads the SQS queue", "queue_url", cfg.AWSIntegration.EventQueueURL)
	}
	// A machine with no AWS behind it can stand in a simulator, so the whole
	// connection flow can be tried: never in production.
	if strings.EqualFold(os.Getenv("NHI_AWS_SIMULATE"), "true") {
		if env := strings.ToLower(os.Getenv("NHI_ENV")); env == "production" || env == "prod" {
			fatal("aws integration", fmt.Errorf("NHI_AWS_SIMULATE is refused when NHI_ENV is production"))
		}
		every, _ := time.ParseDuration(os.Getenv("NHI_AWS_SIMULATE_EVENT_EVERY"))
		awsVerifier, awsEvents = awsintegration.NewSimulatedVerifier(every)
		slog.Warn("aws integration: SIMULATED AWS - no real account is checked (NHI_AWS_SIMULATE=true). Never use this in production.")
	}
	approvalMailer := mailer.FromEnv()
	if approvalMailer.Configured() {
		slog.Info("approval e-mail: ready (Amazon SES)", "region", approvalMailer.Region(), "to", approvalMailer.To())
	} else {
		slog.Warn("approval e-mail: off, approvals are only shown in the tenant-onboarding tool", "problem", approvalMailer.Problem())
	}
	awsIntegrationHandler := awsintegration.NewAWSIntegrationHandler(awsintegration.NewAWSIntegrationService(
		awsintegration.NewAWSIntegrationRepository(db),
		awsVerifier,
		githubcheck.New(cfg.AWSIntegration.GitHubAPIURL),
		awsEvents,
		awsintegration.AWSIntegrationOptions{
			AssumerRoleName:    cfg.AWSIntegration.AssumerRoleName,
			CollectorRoleName:  cfg.AWSIntegration.CollectorRoleName,
			ApprovalsLocation:  cfg.Database.DatabaseName + ", schema " + globalSchema + ", table connection_approvals",
			ForwardRuleName:    cfg.AWSIntegration.ForwardRuleName,
			GitHubSecretPrefix: cfg.AWSIntegration.GitHubSecretPrefix,
			ForwardRoleName:    cfg.AWSIntegration.ForwardRoleName,
			TrailName:          cfg.AWSIntegration.TrailName,
			EventPollInterval:  time.Duration(cfg.AWSIntegration.EventPollSeconds) * time.Second,
			EventWaitLimit:     time.Duration(cfg.AWSIntegration.EventWaitMinutes) * time.Minute,
			// The approval notice, through Amazon SES: EMAIL_FROM and
			// SES_REGION, to CONNECTION_APPROVAL_EMAILS.
			Mailer: approvalMailer,
		},
	))

	// Remediation — plans, approvals and executions in the customer's AWS
	// account (REMEDIATION_ENABLED, default on). Its background worker stops
	// after the HTTP server, so running executions finish first.
	remCfg, err := config.Remediation()
	if err != nil {
		fatal("load remediation configuration", err)
	}
	var remApp *remediationApp
	if remCfg.Enabled {
		if remApp, err = newRemediation(cfg, &remCfg); err != nil {
			fatal("start remediation", err)
		}
		remApp.Start()
		defer remApp.Stop()
	} else {
		slog.Info("remediation disabled (REMEDIATION_ENABLED=false)")
	}

	// Credential Exposure — tenant-isolated, admin-only
	ceFindingsRepo := credentialexposure.NewFindingsRepository()
	ceAllowlistRepo := credentialexposure.NewAllowlistRepository()
	ceDecisionRepo := credentialexposure.NewDecisionRepository()
	ceDeepScanRepo := credentialexposure.NewDeepScanRepository()

	ceFindingsService := credentialexposure.NewFindingsService(ceFindingsRepo, resolver)
	ceAllowlistService := credentialexposure.NewAllowlistService(ceAllowlistRepo, resolver)
	ceDecisionService := credentialexposure.NewDecisionService(ceDecisionRepo, resolver)
	ceDeepScanService := credentialexposure.NewDeepScanService(ceDeepScanRepo, resolver)

	ceFindingsHandler := credentialexposure.NewFindingsHandler(ceFindingsService)
	ceAllowlistHandler := credentialexposure.NewAllowlistHandler(ceAllowlistService)
	ceDecisionHandler := credentialexposure.NewDecisionHandler(ceDecisionService)
	ceDeepScanHandler := credentialexposure.NewDeepScanHandler(ceDeepScanService)

	router := routes.SetupRoutes(routes.HandlerContainer{
		AuthHandler:                    authHandler,
		AuthMiddleware:                 authMiddleware,
		UsersHandler:                   usersHandler,
		AuditLogHandler:                auditLogHandler,
		AuditSink:                      auditStore,
		AuditReads:                     cfg.AuditReads,
		NewAPIFilterHandler:            filterHandler,
		NewAPISettingsHandler:          settingsHandler,
		NewAPIDashboardOverviewHandler: dashboardHandler,
		Scans:                          ispmworker.NewHandler(ispmworker.WorkerConfig{BaseURL: cfg.Worker.BaseURL, Token: cfg.Worker.ScanToken, Timeout: time.Duration(cfg.Worker.TimeoutSeconds) * time.Second}),
		DashboardTrendsHandler:         dashboard.NewDashboardTrendsHandler(dashboard.NewDashboardTrendsService(dashboard.NewDashboardTrendsRepository(), resolver)),
		ScanChangesHandler:             scanChangesHandler,
		NewAPIIdentitiesListHandler:    identitiesHandler,
		NewAPIIdentityDetailHandler:    identityDetailHandler,
		NewAPIIdentityEventsHandler:    identityEventsHandler,
		NewAPICredentialsHandler:       credentialsHandler,
		NewAPICredentialDetailHandler:  credentialDetailHandler,
		AWSIntegrationHandler:          awsIntegrationHandler,
		NewAPIPermissionSourceHandler:  permissionSourceHandler,
		PostureHandlers:                postureHandlers,
		GenomeHandlers:                 genomeHandlers,
		RemediationHandlers:            remApp.handlers(),

		CredentialExposureFindingsHandler:  ceFindingsHandler,
		CredentialExposureAllowlistHandler: ceAllowlistHandler,
		CredentialExposureDecisionHandler:  ceDecisionHandler,
		CredentialExposureDeepScanHandler:  ceDeepScanHandler,
	})

	// Readiness: 200 when Postgres answers (ClickHouse is optional and only
	// reported), 503 otherwise. /health stays a plain liveness probe.
	router.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		state := func(c *clickhouse.Client) string {
			switch {
			case c == nil:
				return "not_configured"
			case c.Up():
				return "ok"
			}
			return "down"
		}
		body := map[string]string{"postgres": "ok", "clickhouse": state(chClient), "monitoring_clickhouse": state(monitoringClient)}
		status := http.StatusOK
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := db.DB.PingContext(ctx); err != nil {
			slog.Warn("readiness: postgres down", "err", err)
			body["postgres"], status = "down", http.StatusServiceUnavailable
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(body)
	}).Methods(http.MethodGet)

	server := &http.Server{
		Addr:        fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler:     middleware.SecurityHeaders(middleware.SetupCORS(cfg.CORS)(router)),
		ReadTimeout: 15 * time.Second,
		// Above the slowest handler: AWS verify runs up to 12 s of checks and
		// then a 5 s save; queries stop at the 25 s statement_timeout.
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	// Drain in-flight requests on SIGINT/SIGTERM so deferred cleanup (pool
	// close) runs instead of the process being killed mid-request.
	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.ListenAndServe() }()
	slog.Info("API server listening", "addr", server.Addr, "log_level", cfg.Logging.Level, "log_format", cfg.Logging.Format)

	select {
	case err := <-serveErr:
		if err != nil && err != http.ErrServerClosed {
			// Keep the original non-zero exit; close pools first since fatal skips defers.
			_ = db.Close()
			fatal("API server", err)
		}
	case <-sigCtx.Done():
		slog.Info("shutdown signal received, draining requests")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("graceful shutdown failed", "err", err)
		}
	}
}

// fatal logs a startup failure as an ERROR record and exits.
func fatal(msg string, err error) {
	slog.Error(msg, "err", err)
	os.Exit(1)
}
