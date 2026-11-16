package identitysummary

import (
	"context"

	"nhi-backend-api/internal/modules/genome/summarycommon"
)

// IdentitySummaryService implements
// GET /api/v1/genome/identities/{source_type}/{identity_name}
// (backend_api_contract.md §5.2 / §10.2) — the identity page header:
//
//   - identity          latest discovery snapshot, normalized (PostgreSQL)
//   - baseline_summary  baselines                                (PostgreSQL)
//   - headline_metrics  open alerts (PostgreSQL); calls in the requested
//     window and last seen (ClickHouse log_events)
//
// The path is a baselines key (as the identity list links it) or a
// discovery key. Monitoring facts are looked up by the baseline key —
// log_events by workload_key, alerts by the workload's event identity names —
// or, for a discovery key, by the identity key then the shared workload key. Nothing is invented: a
// section whose store cannot be read is omitted (logged server-side), and the
// ClickHouse metrics are omitted until the pipeline's log_events is reachable.
type IdentitySummaryService struct {
	lookup *summarycommon.MonitoredIdentityLookup
	repo   *IdentitySummaryRepository
	events *summarycommon.MonitoringEvents // nil when no monitoring ClickHouse is configured
}

// NewIdentitySummaryService wires the service.
func NewIdentitySummaryService(lookup *summarycommon.MonitoredIdentityLookup, repo *IdentitySummaryRepository, events *summarycommon.MonitoringEvents) *IdentitySummaryService {
	return &IdentitySummaryService{lookup: lookup, repo: repo, events: events}
}

// IdentitySummaryParams are the parsed query parameters (§2 from/to).
type IdentitySummaryParams struct {
	Window summarycommon.TimeWindow // window of headline_metrics.calls_in_window
}

// GetIdentity builds the §5.2 response. Unknown identities are
// ErrIdentityNotFound; scope/discovery failures are *StoreUnavailableError.
func (s *IdentitySummaryService) GetIdentity(ctx context.Context, userID, tenantID, dbName, sourceType, identityName string, p IdentitySummaryParams) (*IdentitySummaryResponse, error) {
	res, err := s.lookup.Resolve(ctx, userID, tenantID, dbName, sourceType, identityName)
	if err != nil {
		return nil, err
	}
	id, sc, accounts := res.Identity, res.Scope, res.Accounts()
	keys := res.BaselineKeys() // the baseline key (or identity key, then workload key)
	eventName := res.EventName(ctx, s.events)
	out := &IdentitySummaryResponse{
		Identity: IdentityRecord{
			SourceType: id.Key.SourceType,

			NHIIdentityType: id.Subtype,

			IdentityName: id.Key.IdentityName,

			DisplayName: id.DisplayName,

			WorkloadKey: id.WorkloadKey,

			Status: id.Status,

			AccountID: id.AccountID,

			Region: id.Region,

			ServiceName: id.ServiceName,

			ClusterARN: id.ClusterARN,

			PrincipalARN: id.PrincipalARN,

			RoleKind: id.RoleKind,

			RoleType: id.RoleType,

			RoleARN: id.RoleARN,

			InventoryID: id.DiscoveryIdentityID,

			ResourceARN: id.ResourceARN,
		},
	}

	// ---- PostgreSQL monitoring tables -------------------------------------
	if b, err := s.repo.BaselineSummary(ctx, sc, accounts, keys); summarycommon.ReadOK(ctx, "identity baseline summary", err) && b != nil {
		out.BaselineSummary = &IdentityBaselineSummary{Status: b.Status, BuiltDays: b.BuiltDays, RequiredDays: b.RequiredDays}
	}
	if n, err := s.repo.OpenAlertCount(ctx, sc, accounts, res.AlertKeys(ctx, s.events)); summarycommon.ReadOK(ctx, "identity open alerts", err) {
		out.HeadlineMetrics.OpenAnomalies = summarycommon.IntPtr(n)
	}

	// ---- ClickHouse log_events ------------------------------------------------
	if s.events != nil {
		if calls, err := s.events.TotalCalls(
			ctx,
			accounts,
			id.Key.SourceType,
			eventName,
			p.Window.From,
			p.Window.To,
		); summarycommon.EventsReadOK(
			ctx,
			"identity calls in window",
			err,
		) {
			out.HeadlineMetrics.CallsInWindow =
				&calls
		}

		if lastSeen, err := s.events.LastSeen(
			ctx,
			accounts,
			id.Key.SourceType,
			eventName,
		); summarycommon.EventsReadOK(
			ctx,
			"identity last seen",
			err,
		) {
			out.HeadlineMetrics.LastSeen =
				lastSeen
		}
	}

	return out, nil
}
