package dashboardactivity

import (
	"context"
	"strings"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/platform/scope"
)

// Service implements GET /api/v1/genome/dashboard/activity: the fleet
// call-volume series from the monitoring ClickHouse log_events table and
// the anomalies-per-day series from the tenant's alerts table, both over
// [from, to).
//
// Scope: call volume is bound to the caller's tenant accounts/regions (the
// same DataScope the PostgreSQL reads use); anomalies are the alerts of the
// baselined identities the caller can see — the baselines rows the identity
// list and the summary count — read by the event identity names log_events
// recorded under each baseline key (alerts are stored under the event
// identity name). The optional source_type/account_id/region filters narrow
// both series. A store that cannot be read contributes an empty series
// (logged), never an error.
type Service struct {
	lookup *common.MonitoredIdentityLookup
	repo   *Repository
	events *common.MonitoringEvents
}

// NewService wires the service. events may be nil (monitoring ClickHouse
// not configured): call_volume is then empty and the alert keys are derived
// from the baseline keys alone.
func NewService(lookup *common.MonitoredIdentityLookup, repo *Repository, events *common.MonitoringEvents) *Service {
	return &Service{lookup: lookup, repo: repo, events: events}
}

// Params are the parsed query parameters.
type Params struct {
	Window     common.TimeWindow // [From, To); default last 14 days
	SourceType string            // optional compact family (EC2, ECS, LAMBDA, ...)
	AccountID  string            // optional exact account id
	Region     string            // optional exact region
}

// GetActivity builds the response.
func (s *Service) GetActivity(ctx context.Context, userID, tenantID, dbName string, p Params) (*Response, error) {
	sc, err := s.lookup.Scope(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}

	out := &Response{
		CallVolume: []CallVolumePoint{},
		Anomalies:  []AnomalyPoint{},
	}

	if keys := s.alertKeys(ctx, sc, p); len(keys) > 0 {
		if days, err := s.repo.AnomaliesByDay(ctx, sc, keys, p.Window.From, p.Window.To); common.ReadOK("dashboard activity anomalies", err) {
			for _, d := range days {
				out.Anomalies = append(out.Anomalies, AnomalyPoint{Bucket: d.Day.Format("2006-01-02"), Count: d.Count})
			}
		}
	}

	filter := common.FleetVolumeFilter{Accounts: sc.AccountIDs, Regions: sc.Regions, SourceType: p.SourceType, AccountID: p.AccountID, Region: p.Region}
	if points, err := s.events.FleetVolume(ctx, filter, p.Window.From, p.Window.To); common.EventsReadOK("dashboard activity call volume", err) {
		for _, pt := range points {
			out.CallVolume = append(out.CallVolume, CallVolumePoint{Bucket: pt.Bucket, Calls: pt.Calls})
		}
	}
	if err := common.BudgetExceeded(ctx, "dashboard activity"); err != nil {
		return nil, err
	}
	return out, nil
}

// alertKeys are the alert keys of the baselines in scope that match the
// filters (nil when baselines cannot be read).
func (s *Service) alertKeys(ctx context.Context, sc *scope.DataScope, p Params) []common.MonitoringKey {
	var families []string
	if enabled, all := workloadtypes.Enabled(); !all {
		families = enabled
	}
	rows, err := common.Baselines(ctx, sc, families)
	if !common.ReadOK("dashboard activity baselines", err) {
		return nil
	}
	regions := make(map[string]bool, len(sc.Regions))
	for _, r := range sc.Regions {
		regions[strings.ToLower(r)] = true
	}
	var keys [][]common.MonitoringKey
	var eventKeys []common.MonitoringKey
	for _, row := range rows {
		if workloadtypes.IsGhostECSBaseline(row.Key.SourceType, row.Key.IdentityName, row.BuiltDays) {
			continue
		}
		if p.SourceType != "" && row.Key.SourceType != p.SourceType {
			continue
		}
		if p.AccountID != "" && row.AccountID != p.AccountID {
			continue
		}
		region := workloadtypes.KeyRegion(row.Key.IdentityName)
		if region != "" && len(regions) > 0 && !regions[strings.ToLower(region)] {
			continue
		}
		if p.Region != "" && !strings.EqualFold(region, p.Region) {
			continue
		}
		group := common.BaselineEventKeys(row.Key, "")
		keys = append(keys, group)
		eventKeys = append(eventKeys, group...)
	}
	if len(keys) == 0 {
		return nil
	}

	accounts := sc.AccountIDs
	if p.AccountID != "" {
		accounts = []string{p.AccountID}
	}
	facts, err := s.events.WorkloadFacts(ctx, accounts, eventKeys)
	if !common.EventsReadOK("dashboard activity workload facts", err) {
		facts = nil
	}
	seen := map[common.MonitoringKey]struct{}{}
	var out []common.MonitoringKey
	for _, group := range keys {
		for _, k := range common.BaselineAlertKeys(group, facts) {
			if _, dup := seen[k]; !dup {
				seen[k] = struct{}{}
				out = append(out, k)
			}
		}
	}
	return out
}
