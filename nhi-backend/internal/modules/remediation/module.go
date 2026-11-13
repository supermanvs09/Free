// Package remediation groups the 29 endpoints of the remediation API
// (plans, approvals, executions, batches, audit, catalog, e-mail sync status,
// accounts and integrations). Each endpoint is its own package with dto / handler / repo /
// service files; the shared engine is internal/remediation/engine.
package remediation

import (
	"nhi-backend-api/internal/modules/remediation/accountsetup"
	"nhi-backend-api/internal/modules/remediation/approveplan"
	"nhi-backend-api/internal/modules/remediation/auditlog"
	"nhi-backend-api/internal/modules/remediation/cancelplan"
	"nhi-backend-api/internal/modules/remediation/confirmexternal"
	"nhi-backend-api/internal/modules/remediation/createbatch"
	"nhi-backend-api/internal/modules/remediation/createplan"
	"nhi-backend-api/internal/modules/remediation/emailsync"
	"nhi-backend-api/internal/modules/remediation/executebatch"
	"nhi-backend-api/internal/modules/remediation/executeplan"
	"nhi-backend-api/internal/modules/remediation/executioncredential"
	"nhi-backend-api/internal/modules/remediation/findingfix"
	"nhi-backend-api/internal/modules/remediation/findinglist"
	"nhi-backend-api/internal/modules/remediation/findingplans"
	"nhi-backend-api/internal/modules/remediation/getaccount"
	"nhi-backend-api/internal/modules/remediation/getbatch"
	"nhi-backend-api/internal/modules/remediation/getexecution"
	"nhi-backend-api/internal/modules/remediation/getplan"
	"nhi-backend-api/internal/modules/remediation/listaccounts"
	"nhi-backend-api/internal/modules/remediation/listactions"
	"nhi-backend-api/internal/modules/remediation/listintegrations"
	"nhi-backend-api/internal/modules/remediation/listplans"
	"nhi-backend-api/internal/modules/remediation/markdone"
	"nhi-backend-api/internal/modules/remediation/rejectplan"
	"nhi-backend-api/internal/modules/remediation/rollbackplan"
	"nhi-backend-api/internal/modules/remediation/submitbatch"
	"nhi-backend-api/internal/modules/remediation/submitplan"
	"nhi-backend-api/internal/modules/remediation/updateaccount"
	"nhi-backend-api/internal/modules/remediation/updateintegration"
	"nhi-backend-api/internal/modules/remediation/validateaccount"
	"nhi-backend-api/internal/remediation/engine"
)

// Handlers groups the remediation endpoints so routes and main can pass them
// around as one value. Any field may be nil; routes skip a nil handler.
type Handlers struct {
	// plans
	CreatePlan      *createplan.CreatePlanHandler
	ListPlans       *listplans.ListPlansHandler
	GetPlan         *getplan.GetPlanHandler
	FindingPlans    *findingplans.FindingPlansHandler
	FindingList     *findinglist.Handler
	FindingFix      *findingfix.FindingFixHandler
	SubmitPlan      *submitplan.SubmitPlanHandler
	ApprovePlan     *approveplan.ApprovePlanHandler
	RejectPlan      *rejectplan.RejectPlanHandler
	ExecutePlan     *executeplan.ExecutePlanHandler
	CancelPlan      *cancelplan.CancelPlanHandler
	MarkDone        *markdone.MarkDoneHandler
	ConfirmExternal *confirmexternal.ConfirmExternalHandler
	// executions
	GetExecution        *getexecution.GetExecutionHandler
	RollbackPlan        *rollbackplan.RollbackPlanHandler
	ExecutionCredential *executioncredential.ExecutionCredentialHandler
	// batches
	CreateBatch  *createbatch.CreateBatchHandler
	GetBatch     *getbatch.GetBatchHandler
	SubmitBatch  *submitbatch.SubmitBatchHandler
	ExecuteBatch *executebatch.ExecuteBatchHandler
	// audit, catalog, e-mail sync status (read only)
	AuditLog    *auditlog.AuditLogHandler
	ListActions *listactions.ListActionsHandler
	EmailSync   *emailsync.EmailSyncHandler
	// settings
	ListAccounts      *listaccounts.ListAccountsHandler
	GetAccount        *getaccount.GetAccountHandler
	UpdateAccount     *updateaccount.UpdateAccountHandler
	ValidateAccount   *validateaccount.ValidateAccountHandler
	AccountSetup      *accountsetup.AccountSetupHandler
	ListIntegrations  *listintegrations.ListIntegrationsHandler
	UpdateIntegration *updateintegration.UpdateIntegrationHandler
}

// NewHandlers wires every endpoint (handler -> service -> repository) to the engine.
func NewHandlers(core *engine.Service) *Handlers {
	return &Handlers{
		CreatePlan:      createplan.NewCreatePlanHandler(createplan.NewCreatePlanService(createplan.NewCreatePlanRepository(core))),
		ListPlans:       listplans.NewListPlansHandler(listplans.NewListPlansService(listplans.NewListPlansRepository(core))),
		GetPlan:         getplan.NewGetPlanHandler(getplan.NewGetPlanService(getplan.NewGetPlanRepository(core))),
		FindingList:     findinglist.NewHandler(core),
		FindingPlans:    findingplans.NewFindingPlansHandler(findingplans.NewFindingPlansService(findingplans.NewFindingPlansRepository(core))),
		FindingFix:      findingfix.NewFindingFixHandler(findingfix.NewFindingFixService(findingfix.NewFindingFixRepository(core))),
		SubmitPlan:      submitplan.NewSubmitPlanHandler(submitplan.NewSubmitPlanService(submitplan.NewSubmitPlanRepository(core))),
		ApprovePlan:     approveplan.NewApprovePlanHandler(approveplan.NewApprovePlanService(approveplan.NewApprovePlanRepository(core))),
		RejectPlan:      rejectplan.NewRejectPlanHandler(rejectplan.NewRejectPlanService(rejectplan.NewRejectPlanRepository(core))),
		ExecutePlan:     executeplan.NewExecutePlanHandler(executeplan.NewExecutePlanService(executeplan.NewExecutePlanRepository(core))),
		CancelPlan:      cancelplan.NewCancelPlanHandler(cancelplan.NewCancelPlanService(cancelplan.NewCancelPlanRepository(core))),
		MarkDone:        markdone.NewMarkDoneHandler(markdone.NewMarkDoneService(markdone.NewMarkDoneRepository(core))),
		ConfirmExternal: confirmexternal.NewConfirmExternalHandler(confirmexternal.NewConfirmExternalService(confirmexternal.NewConfirmExternalRepository(core))),

		GetExecution:        getexecution.NewGetExecutionHandler(getexecution.NewGetExecutionService(getexecution.NewGetExecutionRepository(core))),
		RollbackPlan:        rollbackplan.NewRollbackPlanHandler(rollbackplan.NewRollbackPlanService(rollbackplan.NewRollbackPlanRepository(core))),
		ExecutionCredential: executioncredential.NewExecutionCredentialHandler(executioncredential.NewExecutionCredentialService(executioncredential.NewExecutionCredentialRepository(core))),

		CreateBatch:  createbatch.NewCreateBatchHandler(createbatch.NewCreateBatchService(createbatch.NewCreateBatchRepository(core))),
		GetBatch:     getbatch.NewGetBatchHandler(getbatch.NewGetBatchService(getbatch.NewGetBatchRepository(core))),
		SubmitBatch:  submitbatch.NewSubmitBatchHandler(submitbatch.NewSubmitBatchService(submitbatch.NewSubmitBatchRepository(core))),
		ExecuteBatch: executebatch.NewExecuteBatchHandler(executebatch.NewExecuteBatchService(executebatch.NewExecuteBatchRepository(core))),

		AuditLog:    auditlog.NewAuditLogHandler(auditlog.NewAuditLogService(auditlog.NewAuditLogRepository(core))),
		ListActions: listactions.NewListActionsHandler(listactions.NewListActionsService(listactions.NewListActionsRepository(core))),
		EmailSync:   emailsync.NewEmailSyncHandler(emailsync.NewEmailSyncService(emailsync.NewEmailSyncRepository(core))),

		ListAccounts:      listaccounts.NewListAccountsHandler(listaccounts.NewListAccountsService(listaccounts.NewListAccountsRepository(core))),
		GetAccount:        getaccount.NewGetAccountHandler(getaccount.NewGetAccountService(getaccount.NewGetAccountRepository(core))),
		UpdateAccount:     updateaccount.NewUpdateAccountHandler(updateaccount.NewUpdateAccountService(updateaccount.NewUpdateAccountRepository(core))),
		ValidateAccount:   validateaccount.NewValidateAccountHandler(validateaccount.NewValidateAccountService(validateaccount.NewValidateAccountRepository(core))),
		AccountSetup:      accountsetup.NewAccountSetupHandler(accountsetup.NewAccountSetupService(accountsetup.NewAccountSetupRepository(core))),
		ListIntegrations:  listintegrations.NewListIntegrationsHandler(listintegrations.NewListIntegrationsService(listintegrations.NewListIntegrationsRepository(core))),
		UpdateIntegration: updateintegration.NewUpdateIntegrationHandler(updateintegration.NewUpdateIntegrationService(updateintegration.NewUpdateIntegrationRepository(core))),
	}
}
