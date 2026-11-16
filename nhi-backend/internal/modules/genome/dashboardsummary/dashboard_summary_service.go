package dashboardsummary

import (
	"context"
	"sort"
	"strings"

	"nhi-backend-api/internal/modules/genome/summarycommon"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	chclient "nhi-backend-api/internal/platform/clickhouse"
)

// DashboardSummaryService implements GET /api/v1/genome/dashboard/summary.
//
// The identities of the dashboard are the pipeline's baselines rows (the
// same identities the genome identity list shows), in the caller's accounts
// and regions, restricted to the enabled workload families:
//
//   - baselines / baseline_versions are read by the baseline key
//     (baselines.identity_name, which is log_events.workload_key);
//   - alerts and identity_risk_scores are stored under the event identity
//     name, so they are read by the identity names log_events recorded under
//     each baseline key (summarycommon.BaselineAlertKeys).
type DashboardSummaryService struct {
	repo     *summarycommon.DashboardSummaryRepository
	resolver summarycommon.ScopeResolver
	events   *summarycommon.MonitoringEvents // nil when no monitoring ClickHouse is configured
}

// NewDashboardSummaryService wires the service. events may be nil: alert
// keys are then derived from the baseline keys alone and display names from
// the keys.
func NewDashboardSummaryService(
	repo *summarycommon.DashboardSummaryRepository,
	resolver summarycommon.ScopeResolver,
	events *summarycommon.MonitoringEvents,
) *DashboardSummaryService {
	return &DashboardSummaryService{
		repo:     repo,
		resolver: resolver,
		events:   events,
	}
}

type DashboardSummaryParams struct {
	Charts     summarycommon.TimeWindow
	Cards      summarycommon.TimeWindow
	SourceType string
	AccountID  string
	Region     string
}

const (
	summaryTopN           = 10
	summaryRecentFeedRows = 50
)

// summaryIdentity is one baselines row of the dashboard with its labels.
type summaryIdentity struct {
	baseline    summarycommon.BaselineIdentity
	eventKeys   []summarycommon.MonitoringKey // names its log_events rows carry, baseline key first
	region      string
	displayName string
	serviceName string
}

func (id summaryIdentity) ref() summarycommon.DashboardIdentityRef {
	key := id.baseline.Key
	return summarycommon.DashboardIdentityRef{
		ID:           key.SourceType + ":" + key.IdentityName,
		SourceType:   key.SourceType,
		IdentityName: key.IdentityName,
		DisplayName:  id.displayName,
	}
}

func (s *DashboardSummaryService) GetSummary(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	p DashboardSummaryParams,
) (*DashboardSummaryResponse, error) {
	sc, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{Op: "resolve tenant scope", Err: err}
	}

	out := &DashboardSummaryResponse{
		DeparturesByDimension:   []DashboardDimensionCount{},
		AnomaliesByDay:          []DashboardDayCount{},
		MostAnomalousIdentities: []DashboardAnomalousIdentity{},
		RecentlyBaselined:       []DashboardRecentlyBaselined{},
	}
	out.Cards.WindowHours = int(p.Cards.To.Sub(p.Cards.From).Hours())

	var families []string
	if enabled, all := workloadtypes.Enabled(); !all {
		families = enabled
	}
	rows, err := s.repo.Baselines(ctx, sc, summarycommon.BaselineFilter{SourceType: p.SourceType, Families: families})
	if summarycommon.IsMonitoringTableMissing(err) {
		// The pipeline has not provisioned this tenant yet: nothing is watched.
		return out, nil
	}
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{Op: "read baselines", Err: err}
	}

	regions := make(map[string]bool, len(sc.Regions))
	for _, r := range sc.Regions {
		regions[strings.ToLower(r)] = true
	}
	ids := make([]summaryIdentity, 0, len(rows))
	keys := make([]summarycommon.MonitoringKey, 0, len(rows))
	var eventKeys []summarycommon.MonitoringKey
	for _, row := range rows {
		if workloadtypes.IsGhostECSBaseline(row.Key.SourceType, row.Key.IdentityName, row.BuiltDays) {
			continue
		}
		if p.AccountID != "" && row.AccountID != strings.TrimSpace(p.AccountID) {
			continue
		}
		region := workloadtypes.KeyRegion(row.Key.IdentityName)
		if region != "" && len(regions) > 0 && !regions[strings.ToLower(region)] {
			continue
		}
		if p.Region != "" && !strings.EqualFold(region, strings.TrimSpace(p.Region)) {
			continue
		}
		id := summaryIdentity{baseline: row, region: region, eventKeys: summarycommon.BaselineEventKeys(row.Key, "")}
		ids = append(ids, id)
		keys = append(keys, row.Key)
		eventKeys = append(eventKeys, id.eventKeys...)
	}

	facts, err := s.events.WorkloadFacts(ctx, sc.AccountIDs, eventKeys)
	if !summarycommon.EventsReadOK(ctx, "dashboard summary workload facts", err) {
		facts = map[summarycommon.MonitoringKey]chclient.WorkloadFacts{}
	}

	// owner maps every alert / risk key to the dashboard identity it belongs
	// to; the first baseline claiming a key keeps it.
	owner := map[summarycommon.MonitoringKey]int{}
	byBaseline := map[string]int{}
	alertKeys := make([]summarycommon.MonitoringKey, 0, len(ids))
	for i := range ids {
		id := &ids[i]
		f, _ := summarycommon.MergedFacts(id.eventKeys, facts)
		id.displayName = strings.TrimSpace(f.DisplayName)
		if id.displayName == "" {
			id.displayName = workloadtypes.KeyDisplayName(id.baseline.Key.IdentityName)
		}
		id.serviceName = strings.TrimSpace(f.ServiceName)
		if ecsKey, ok := workloadtypes.ParseECSKey(id.baseline.Key.IdentityName); ok && id.serviceName == "" {
			id.serviceName = strings.TrimPrefix(ecsKey.Service, "standalone:")
		}
		byBaseline[id.baseline.AccountID+"|"+id.baseline.Key.SourceType+"|"+id.baseline.Key.IdentityName] = i
		for _, k := range summarycommon.BaselineAlertKeys(id.eventKeys, facts) {
			if _, claimed := owner[k]; !claimed {
				owner[k] = i
				alertKeys = append(alertKeys, k)
			}
		}
	}

	// ---- cards ---------------------------------------------------------------
	established := 0
	for _, id := range ids {
		if strings.EqualFold(strings.TrimSpace(id.baseline.Status), "active") {
			established++
		}
	}
	out.Cards.IdentitiesWatched = summarycommon.IntPtr(len(ids))
	out.Cards.BaselinesEstablished = summarycommon.IntPtr(established)
	out.Cards.StillLearning = summarycommon.IntPtr(len(ids) - established)
	if len(ids) > 0 {
		out.Cards.BaselineCoveragePercent = summarycommon.FloatPtr(summarycommon.Round1(float64(established) / float64(len(ids)) * 100))
	}

	if n, err := s.repo.CountOpenAlerts(ctx, sc, sc.AccountIDs, alertKeys, p.Cards.From, p.Cards.To); summarycommon.ReadOK(ctx, "dashboard summary open alerts", err) {
		out.Cards.OpenAnomalies = summarycommon.IntPtr(n)
	}

	// ---- most anomalous identities -----------------------------------------
	if riskRows, err := s.repo.LatestRiskScores(ctx, sc, sc.AccountIDs, alertKeys); summarycommon.ReadOK(ctx, "dashboard summary risk scores", err) {
		best := map[int]summarycommon.IdentityRiskRow{}
		for key, row := range riskRows {
			i, ok := owner[key]
			if !ok || row.RiskScore == nil {
				continue
			}
			if current, seen := best[i]; !seen || betterRisk(row, current) {
				best[i] = row
			}
		}
		ranked := make([]int, 0, len(best))
		for i := range best {
			ranked = append(ranked, i)
		}
		sort.SliceStable(ranked, func(a, b int) bool {
			left, right := best[ranked[a]], best[ranked[b]]
			if *left.RiskScore != *right.RiskScore {
				return *left.RiskScore > *right.RiskScore
			}
			if left.AnomalousEventCount != right.AnomalousEventCount {
				return left.AnomalousEventCount > right.AnomalousEventCount
			}
			if ids[ranked[a]].displayName != ids[ranked[b]].displayName {
				return ids[ranked[a]].displayName < ids[ranked[b]].displayName
			}
			return ids[ranked[a]].baseline.Key.IdentityName < ids[ranked[b]].baseline.Key.IdentityName
		})
		for n, i := range ranked {
			if n >= summaryTopN {
				break
			}
			id, row := ids[i], best[i]
			out.MostAnomalousIdentities = append(out.MostAnomalousIdentities, DashboardAnomalousIdentity{
				DashboardIdentityRef: id.ref(),
				AccountID:            id.baseline.AccountID,
				Region:               id.region,
				ServiceName:          id.serviceName,
				WorkloadKey:          id.baseline.Key.IdentityName,
				RiskScore:            row.RiskScore,
				Severity:             row.Severity,
				ScoreStatus:          row.ScoreStatus,
				EventCount:           row.EventCount,
				AnomalousEventCount:  row.AnomalousEventCount,
				WindowStart:          row.WindowStart.UTC(),
				WindowEnd:            row.WindowEnd.UTC(),
				ComputedAt:           row.ComputedAt.UTC(),
			})
		}
	}

	// ---- charts --------------------------------------------------------------
	if dimensions, err := s.repo.OpenAlertsByDimension(ctx, sc, sc.AccountIDs, alertKeys, p.Charts.From, p.Charts.To); summarycommon.ReadOK(ctx, "dashboard summary alerts by dimension", err) {
		for _, row := range dimensions {
			out.DeparturesByDimension = append(out.DeparturesByDimension, DashboardDimensionCount{Dimension: row.Dimension, Count: row.Count})
		}
	}
	if days, err := s.repo.AlertsByDay(ctx, sc, sc.AccountIDs, alertKeys, p.Charts.From, p.Charts.To); summarycommon.ReadOK(ctx, "dashboard summary alerts by day", err) {
		for _, row := range days {
			out.AnomaliesByDay = append(out.AnomaliesByDay, DashboardDayCount{Day: row.Day.Format("2006-01-02"), Count: row.Count})
		}
	}

	// ---- recently baselined --------------------------------------------------
	if events, err := s.repo.RecentlyBaselined(ctx, sc, sc.AccountIDs, keys, summaryRecentFeedRows); summarycommon.ReadOK(ctx, "dashboard summary recently baselined", err) {
		seen := map[int]struct{}{}
		for _, event := range events {
			i, ok := byBaseline[event.AccountID+"|"+event.Key.SourceType+"|"+event.Key.IdentityName]
			if !ok {
				continue
			}
			if _, duplicate := seen[i]; duplicate {
				continue
			}
			seen[i] = struct{}{}
			id := ids[i]
			out.RecentlyBaselined = append(out.RecentlyBaselined, DashboardRecentlyBaselined{
				DashboardIdentityRef: id.ref(),
				AccountID:            id.baseline.AccountID,
				Region:               id.region,
				Event:                event.Event,
				OccurredAt:           event.OccurredAt,
				Version:              event.Version,
			})
			if len(out.RecentlyBaselined) >= summaryTopN {
				break
			}
		}
	}

	return out, nil
}

// betterRisk orders two snapshots of one identity: a higher score wins,
// then the later window.
func betterRisk(a, b summarycommon.IdentityRiskRow) bool {
	if *a.RiskScore != *b.RiskScore {
		return *a.RiskScore > *b.RiskScore
	}
	return a.WindowEnd.After(b.WindowEnd)
}
