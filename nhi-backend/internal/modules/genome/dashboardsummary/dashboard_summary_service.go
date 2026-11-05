package dashboardsummary

import (
	"context"
	"sort"
	"strings"

	"nhi-backend-api/internal/modules/genome/summarycommon"
)

// DashboardSummaryService implements GET /api/v1/dashboard/summary
// (backend_api_contract.md §4.1 / §10.1) on top of the caller's tenant
// schema in PostgreSQL, resolved through scope.Resolver like every other
// data API.
//
// Flow (the contract's two-step process):
//  1. read the latest non-deleted discovery snapshot per resource from the
//     tenant's identities table inside the caller's account/region scope;
//  2. normalize every row to the monitoring key (source_type, identity_name,
//     workload_key) with the §1.4 registry rules — never by joining raw
//     discovery columns in SQL;
//  3. look the keys up in baselines / identity_risk_scores / alerts and
//     aggregate the cards and panels.
//
// Nothing is invented: every value is a query result or null. A card whose
// table cannot be read is null (the failure is logged server-side); the
// ClickHouse-backed cards (critical_anomalies, mean_provenance_confidence)
// are null until log_events is connected; mean_confidence_percent and
// drifting_baselines are null because the pipeline does not persist them.
type DashboardSummaryService struct {
	repo     *summarycommon.DashboardSummaryRepository
	resolver summarycommon.ScopeResolver
}

// NewDashboardSummaryService wires the service (pass the shared scope.Resolver).
func NewDashboardSummaryService(repo *summarycommon.DashboardSummaryRepository, resolver summarycommon.ScopeResolver) *DashboardSummaryService {
	return &DashboardSummaryService{repo: repo, resolver: resolver}
}

// DashboardSummaryParams are the parsed query parameters (§4.1).
type DashboardSummaryParams struct {
	Charts     summarycommon.TimeWindow // departures, anomalies_by_day (default: last 14 days)
	Cards      summarycommon.TimeWindow // open-anomaly cards (default: last 24 hours)
	SourceType string                   // optional upper-case service family, e.g. ECS
	AccountID  string                   // optional
	Region     string                   // optional
}

const (
	summaryTopN           = 10 // §4.1: top 10 / most recent 10
	summaryRecentFeedRows = 50 // raw baseline events read before collapsing to 10 identities
)

// GetSummary builds the dashboard summary for the caller's tenant scope.
func (s *DashboardSummaryService) GetSummary(ctx context.Context, userID, tenantID, dbName string, p DashboardSummaryParams) (*DashboardSummaryResponse, error) {
	sc, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{Op: "resolve tenant scope", Err: err}
	}
	rows, err := s.repo.LatestIdentities(ctx, sc)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{Op: "read discovery identities", Err: err}
	}

	// ---- step 2: normalize + filter ----------------------------------------
	var ids []summarycommon.MonitoredIdentity
	for _, row := range rows {
		id, ok := summarycommon.NormalizeDiscoveryRow(row)
		if !ok {
			continue // deferred (EKS), human/resource-only or unknown type
		}
		if p.SourceType != "" && id.Key.SourceType != p.SourceType {
			continue
		}
		if p.AccountID != "" && id.AccountID != p.AccountID {
			continue
		}
		if p.Region != "" && !strings.EqualFold(id.Region, p.Region) {
			continue
		}
		ids = append(ids, id)
	}
	sort.SliceStable(ids, func(i, j int) bool {
		a, b := strings.ToLower(ids[i].DisplayName), strings.ToLower(ids[j].DisplayName)
		if a != b {
			return a < b
		}
		return ids[i].Key.IdentityName < ids[j].Key.IdentityName
	})
	set := newIdentityIndex(ids)
	keys := set.lookupKeys()

	out := &DashboardSummaryResponse{
		DeparturesByDimension:   []DashboardDimensionCount{},
		AnomaliesByDay:          []DashboardDayCount{},
		MostAnomalousIdentities: []DashboardAnomalousIdentity{},
		RecentlyBaselined:       []DashboardRecentlyBaselined{},
	}
	out.Cards.WindowHours = int(p.Cards.To.Sub(p.Cards.From).Hours())
	out.Cards.IdentitiesWatched = summarycommon.IntPtr(len(ids))

	// ---- baseline cards ----------------------------------------------------
	baselines, err := s.repo.BaselineStates(ctx, sc, keys)
	if summarycommon.ReadOK(ctx, "dashboard summary baselines", err) {
		established := 0
		for _, id := range ids {
			if b, ok := set.baselineFor(baselines, id); ok && strings.EqualFold(b.Status, "active") {
				established++
			}
		}
		out.Cards.BaselinesEstablished = summarycommon.IntPtr(established)
		out.Cards.StillLearning = summarycommon.IntPtr(len(ids) - established)
		if len(ids) > 0 { // §4.1: baselines_established / identities_watched * 100
			out.Cards.BaselineCoveragePercent = summarycommon.FloatPtr(summarycommon.Round1(float64(established) / float64(len(ids)) * 100))
		}
	}

	// ---- open anomalies (cards window) -------------------------------------
	if n, err := s.repo.CountOpenAlerts(ctx, sc, keys, p.Cards.From, p.Cards.To); summarycommon.ReadOK(ctx, "dashboard summary open alerts", err) {
		out.Cards.OpenAnomalies = summarycommon.IntPtr(n)
	}
	// critical_anomalies and mean_provenance_confidence come from ClickHouse
	// log_events (§10.1) and stay null until that store is connected.
	// mean_confidence_percent (no product formula) and drifting_baselines
	// (not persisted) are null; drifting_baselines_available is false (§4.1).

	// ---- most anomalous identities -----------------------------------------
	risk, err := s.repo.LatestRiskScores(ctx, sc, keys)
	riskOK := summarycommon.ReadOK(ctx, "dashboard summary risk scores", err)
	if riskOK {
		type scored struct {
			idx int
			row summarycommon.IdentityRiskRow
		}
		var list []scored
		for i, id := range ids {
			if rr, ok := set.riskFor(risk, id); ok && rr.RiskScore != nil {
				list = append(list, scored{i, rr})
			}
		}
		sort.SliceStable(list, func(i, j int) bool {
			a, b := list[i], list[j]
			if *a.row.RiskScore != *b.row.RiskScore {
				return *a.row.RiskScore > *b.row.RiskScore
			}
			if a.row.AnomalousEventCount != b.row.AnomalousEventCount {
				return a.row.AnomalousEventCount > b.row.AnomalousEventCount
			}
			return ids[a.idx].DisplayName < ids[b.idx].DisplayName
		})
		for i, item := range list {
			if i >= summaryTopN {
				break
			}
			id := ids[item.idx]
			out.MostAnomalousIdentities = append(out.MostAnomalousIdentities, DashboardAnomalousIdentity{
				DashboardIdentityRef: id.Ref(),
				AccountID:            id.AccountID,
				Region:               id.Region,
				ServiceName:          id.ServiceName,
				WorkloadKey:          id.WorkloadKey,
				RiskScore:            item.row.RiskScore,
				Severity:             item.row.Severity,
				ScoreStatus:          item.row.ScoreStatus,
				EventCount:           item.row.EventCount,
				AnomalousEventCount:  item.row.AnomalousEventCount,
				WindowStart:          item.row.WindowStart.UTC(),
				WindowEnd:            item.row.WindowEnd.UTC(),
				ComputedAt:           item.row.ComputedAt.UTC(),
			})
		}
	}

	// ---- departures by dimension / anomalies per day (charts window) -------
	dims, err := s.repo.OpenAlertsByDimension(ctx, sc, keys, p.Charts.From, p.Charts.To)
	if summarycommon.ReadOK(ctx, "dashboard summary alerts by dimension", err) {
		for _, d := range dims {
			out.DeparturesByDimension = append(out.DeparturesByDimension, DashboardDimensionCount{Dimension: d.Dimension, Count: d.Count})
		}
	}
	days, err := s.repo.AlertsByDay(ctx, sc, keys, p.Charts.From, p.Charts.To)
	if summarycommon.ReadOK(ctx, "dashboard summary alerts by day", err) {
		for _, d := range days {
			out.AnomaliesByDay = append(out.AnomaliesByDay, DashboardDayCount{Day: d.Day.Format("2006-01-02"), Count: d.Count})
		}
	}

	// ---- recently baselined ------------------------------------------------
	// §4.1: "the most recent 10 identities where the baseline became active
	// or a new version was published" — one row per identity, newest event.
	recent, err := s.repo.RecentlyBaselined(ctx, sc, keys, summaryRecentFeedRows)
	if summarycommon.ReadOK(ctx, "dashboard summary recently baselined", err) {
		seen := map[int]struct{}{}
		for _, ev := range recent {
			idx, known := set.indexOf(ev.Key)
			if !known {
				continue
			}
			if _, dup := seen[idx]; dup {
				continue
			}
			seen[idx] = struct{}{}
			id := ids[idx]
			out.RecentlyBaselined = append(out.RecentlyBaselined, DashboardRecentlyBaselined{
				DashboardIdentityRef: id.Ref(), AccountID: id.AccountID, Region: id.Region,
				Event: ev.Event, OccurredAt: ev.OccurredAt, Version: ev.Version,
			})
			if len(out.RecentlyBaselined) >= summaryTopN {
				break
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Identity index: lookups by identity key with workload-key fallback
// ---------------------------------------------------------------------------

type identityIndex struct {
	ids        []summarycommon.MonitoredIdentity
	byKey      map[summarycommon.MonitoringKey]int
	byWorkload map[summarycommon.MonitoringKey]int // first identity sharing the workload key
}

func newIdentityIndex(ids []summarycommon.MonitoredIdentity) *identityIndex {
	set := &identityIndex{ids: ids, byKey: map[summarycommon.MonitoringKey]int{}, byWorkload: map[summarycommon.MonitoringKey]int{}}
	for i, id := range ids {
		if _, dup := set.byKey[id.Key]; !dup {
			set.byKey[id.Key] = i
		}
		if wk, ok := id.MonitoringWorkloadKey(); ok {
			if _, dup := set.byWorkload[wk]; !dup {
				set.byWorkload[wk] = i
			}
		}
	}
	return set
}

// lookupKeys returns every key worth querying: identity keys plus workload
// keys (the pipeline may store a shared profile under the workload key).
func (s *identityIndex) lookupKeys() []summarycommon.MonitoringKey {
	out := make([]summarycommon.MonitoringKey, 0, len(s.byKey)+len(s.byWorkload))
	seen := map[summarycommon.MonitoringKey]struct{}{}
	for _, id := range s.ids {
		for _, k := range id.AllKeys() {
			if _, ok := seen[k]; !ok {
				seen[k] = struct{}{}
				out = append(out, k)
			}
		}
	}
	return out
}

// indexOf resolves a monitoring key (identity key first, then workload key).
func (s *identityIndex) indexOf(k summarycommon.MonitoringKey) (int, bool) {
	if i, ok := s.byKey[k]; ok {
		return i, true
	}
	if i, ok := s.byWorkload[k]; ok {
		return i, true
	}
	return 0, false
}

func (s *identityIndex) baselineFor(m map[summarycommon.MonitoringKey]summarycommon.BaselineStateRow, id summarycommon.MonitoredIdentity) (summarycommon.BaselineStateRow, bool) {
	for _, k := range id.AllKeys() {
		if b, ok := m[k]; ok {
			return b, true
		}
	}
	return summarycommon.BaselineStateRow{}, false
}

func (s *identityIndex) riskFor(m map[summarycommon.MonitoringKey]summarycommon.IdentityRiskRow, id summarycommon.MonitoredIdentity) (summarycommon.IdentityRiskRow, bool) {
	for _, k := range id.AllKeys() {
		if r, ok := m[k]; ok {
			return r, true
		}
	}
	return summarycommon.IdentityRiskRow{}, false
}
