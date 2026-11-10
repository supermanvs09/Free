package dashboardsummary

import (
	"context"
	"log"
	"nhi-backend-api/internal/modules/genome/summarycommon"
	"sort"
	"strings"
)

// DashboardSummaryService implements GET /api/v1/dashboard/summary.
type DashboardSummaryService struct {
	repo     *summarycommon.DashboardSummaryRepository
	resolver summarycommon.ScopeResolver
}

func NewDashboardSummaryService(
	repo *summarycommon.DashboardSummaryRepository,
	resolver summarycommon.ScopeResolver,
) *DashboardSummaryService {
	return &DashboardSummaryService{
		repo:     repo,
		resolver: resolver,
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

func (s *DashboardSummaryService) GetSummary(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	p DashboardSummaryParams,
) (*DashboardSummaryResponse, error) {
	sc, err := s.resolver.Resolve(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{
			Op:  "resolve tenant scope",
			Err: err,
		}
	}

	rows, err := s.repo.LatestIdentities(
		ctx,
		sc,
	)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{
			Op:  "read discovery identities",
			Err: err,
		}
	}

	// Load all credentials in one query. ECS rows can then be expanded into
	// separate task-role and execution-role monitored identities.
	identityIDs := uniqueDiscoveryIdentityIDs(rows)

	credentialsByIdentity, err := s.repo.IdentityCredentials(
		ctx,
		sc,
		identityIDs,
	)
	if err != nil {
		return nil, &summarycommon.StoreUnavailableError{
			Op:  "read identity credentials",
			Err: err,
		}
	}

	ids := make(
		[]summarycommon.MonitoredIdentity,
		0,
		len(rows),
	)

	for _, row := range rows {
		base, ok := summarycommon.NormalizeDiscoveryRow(row)
		if !ok {
			continue
		}

		identityID := strings.TrimSpace(row.ID)

		credentials := credentialsByIdentity[identityID]

		// ECS discovery can contain task and execution role credentials
		// even when identity_credentials has not been populated.
		if base.Subtype == "ecs_task" {
			discoveryCredentials :=
				summarycommon.ECSCredentialsFromAttributes(
					row.TypeAttributes,
				)

			credentials = mergeECSCredentials(
				credentials,
				discoveryCredentials,
			)
		}

		normalized := summarycommon.ExpandCredentialIdentities(
			base,
			credentials,
		)
		for _, identity := range normalized {
			log.Printf(
				"ECS_BASELINE_KEY_CHECK source_type=%q identity_name=%q workload_key=%q role_kind=%q discovery_id=%q",
				identity.Key.SourceType,
				identity.Key.IdentityName,
				identity.WorkloadKey,
				identity.RoleKind,
				identity.DiscoveryIdentityID,
			)
		}

		for _, id := range normalized {
			if p.SourceType != "" &&
				!strings.EqualFold(
					strings.TrimSpace(id.Key.SourceType),
					strings.TrimSpace(p.SourceType),
				) {
				continue
			}

			if p.AccountID != "" &&
				strings.TrimSpace(id.AccountID) !=
					strings.TrimSpace(p.AccountID) {
				continue
			}

			if p.Region != "" &&
				!strings.EqualFold(
					strings.TrimSpace(id.Region),
					strings.TrimSpace(p.Region),
				) {
				continue
			}

			ids = append(ids, id)
		}
	}

	sort.SliceStable(
		ids,
		func(i int, j int) bool {
			leftName := strings.ToLower(
				strings.TrimSpace(ids[i].DisplayName),
			)

			rightName := strings.ToLower(
				strings.TrimSpace(ids[j].DisplayName),
			)

			if leftName != rightName {
				return leftName < rightName
			}

			if ids[i].Key.SourceType !=
				ids[j].Key.SourceType {
				return ids[i].Key.SourceType <
					ids[j].Key.SourceType
			}

			return ids[i].Key.IdentityName <
				ids[j].Key.IdentityName
		},
	)

	set := newIdentityIndex(ids)
	keys := set.lookupKeys()

	out := &DashboardSummaryResponse{
		DeparturesByDimension:   []DashboardDimensionCount{},
		AnomaliesByDay:          []DashboardDayCount{},
		MostAnomalousIdentities: []DashboardAnomalousIdentity{},
		RecentlyBaselined:       []DashboardRecentlyBaselined{},
	}

	out.Cards.WindowHours = int(
		p.Cards.To.Sub(
			p.Cards.From,
		).Hours(),
	)

	out.Cards.IdentitiesWatched =
		summarycommon.IntPtr(len(ids))

	baselines, err := s.repo.BaselineStates(
		ctx,
		sc,
		keys,
	)
	if summarycommon.ReadOK(
		ctx,
		"dashboard summary baselines",
		err,
	) {
		established := 0

		for _, id := range ids {
			if _, ok := set.activeBaselineFor(
				baselines,
				id,
			); ok {
				established++
			}
		}

		out.Cards.BaselinesEstablished =
			summarycommon.IntPtr(established)

		out.Cards.StillLearning =
			summarycommon.IntPtr(
				len(ids) - established,
			)

		if len(ids) > 0 {
			coverage :=
				float64(established) /
					float64(len(ids)) *
					100

			out.Cards.BaselineCoveragePercent =
				summarycommon.FloatPtr(
					summarycommon.Round1(
						coverage,
					),
				)
		}
	}

	if openAlerts, readErr := s.repo.CountOpenAlerts(
		ctx,
		sc,
		keys,
		p.Cards.From,
		p.Cards.To,
	); summarycommon.ReadOK(
		ctx,
		"dashboard summary open alerts",
		readErr,
	) {
		out.Cards.OpenAnomalies =
			summarycommon.IntPtr(openAlerts)
	}

	riskRows, err := s.repo.LatestRiskScores(
		ctx,
		sc,
		keys,
	)
	if summarycommon.ReadOK(
		ctx,
		"dashboard summary risk scores",
		err,
	) {
		type scoredIdentity struct {
			Index int
			Row   summarycommon.IdentityRiskRow
		}

		scoredIdentities := make(
			[]scoredIdentity,
			0,
			len(ids),
		)

		for index, id := range ids {
			riskRow, ok := set.riskFor(
				riskRows,
				id,
			)
			if !ok || riskRow.RiskScore == nil {
				continue
			}

			scoredIdentities = append(
				scoredIdentities,
				scoredIdentity{
					Index: index,
					Row:   riskRow,
				},
			)
		}

		sort.SliceStable(
			scoredIdentities,
			func(i int, j int) bool {
				left := scoredIdentities[i]
				right := scoredIdentities[j]

				if *left.Row.RiskScore !=
					*right.Row.RiskScore {
					return *left.Row.RiskScore >
						*right.Row.RiskScore
				}

				if left.Row.AnomalousEventCount !=
					right.Row.AnomalousEventCount {
					return left.Row.AnomalousEventCount >
						right.Row.AnomalousEventCount
				}

				return ids[left.Index].DisplayName <
					ids[right.Index].DisplayName
			},
		)

		for index, item := range scoredIdentities {
			if index >= summaryTopN {
				break
			}

			id := ids[item.Index]

			out.MostAnomalousIdentities = append(
				out.MostAnomalousIdentities,
				DashboardAnomalousIdentity{
					DashboardIdentityRef: id.Ref(),
					AccountID:            id.AccountID,
					Region:               id.Region,
					ServiceName:          id.ServiceName,
					WorkloadKey:          id.WorkloadKey,
					RiskScore:            item.Row.RiskScore,
					Severity:             item.Row.Severity,
					ScoreStatus:          item.Row.ScoreStatus,
					EventCount:           item.Row.EventCount,
					AnomalousEventCount:  item.Row.AnomalousEventCount,
					WindowStart:          item.Row.WindowStart.UTC(),
					WindowEnd:            item.Row.WindowEnd.UTC(),
					ComputedAt:           item.Row.ComputedAt.UTC(),
				},
			)
		}
	}

	dimensions, err := s.repo.OpenAlertsByDimension(
		ctx,
		sc,
		keys,
		p.Charts.From,
		p.Charts.To,
	)
	if summarycommon.ReadOK(
		ctx,
		"dashboard summary alerts by dimension",
		err,
	) {
		for _, row := range dimensions {
			out.DeparturesByDimension = append(
				out.DeparturesByDimension,
				DashboardDimensionCount{
					Dimension: row.Dimension,
					Count:     row.Count,
				},
			)
		}
	}

	days, err := s.repo.AlertsByDay(
		ctx,
		sc,
		keys,
		p.Charts.From,
		p.Charts.To,
	)
	if summarycommon.ReadOK(
		ctx,
		"dashboard summary alerts by day",
		err,
	) {
		for _, row := range days {
			out.AnomaliesByDay = append(
				out.AnomaliesByDay,
				DashboardDayCount{
					Day: row.Day.Format(
						"2006-01-02",
					),
					Count: row.Count,
				},
			)
		}
	}

	recentEvents, err := s.repo.RecentlyBaselined(
		ctx,
		sc,
		keys,
		summaryRecentFeedRows,
	)
	if summarycommon.ReadOK(
		ctx,
		"dashboard summary recently baselined",
		err,
	) {
		seenIdentities := make(
			map[int]struct{},
		)

		for _, event := range recentEvents {
			identityIndex, ok := set.indexOf(
				event.Key,
			)
			if !ok {
				continue
			}

			if _, duplicate :=
				seenIdentities[identityIndex]; duplicate {
				continue
			}

			seenIdentities[identityIndex] = struct{}{}

			id := ids[identityIndex]

			baselineRef := summarycommon.DashboardIdentityRef{
				ID: event.Key.SourceType + ":" +
					event.Key.IdentityName,
				SourceType:   event.Key.SourceType,
				IdentityName: event.Key.IdentityName,
				DisplayName:  id.DisplayName,
			}

			out.RecentlyBaselined = append(
				out.RecentlyBaselined,
				DashboardRecentlyBaselined{
					DashboardIdentityRef: baselineRef,
					AccountID:            id.AccountID,
					Region:               id.Region,
					Event:                event.Event,
					OccurredAt:           event.OccurredAt,
					Version:              event.Version,
				},
			)

			if len(out.RecentlyBaselined) >=
				summaryTopN {
				break
			}
		}
	}

	return out, nil
}

// uniqueDiscoveryIdentityIDs produces the discovery IDs used to load
// identity_credentials in one PostgreSQL query.
func uniqueDiscoveryIdentityIDs(
	rows []summarycommon.DiscoveryIdentityRow,
) []string {
	ids := make(
		[]string,
		0,
		len(rows),
	)

	seen := make(
		map[string]struct{},
		len(rows),
	)

	for _, row := range rows {
		identityID := strings.TrimSpace(row.ID)
		if identityID == "" {
			continue
		}

		if _, exists := seen[identityID]; exists {
			continue
		}

		seen[identityID] = struct{}{}
		ids = append(ids, identityID)
	}

	return ids
}

// identityIndex maps principal identity keys and workload baseline keys back
// to the corresponding monitored identity.
type identityIndex struct {
	ids        []summarycommon.MonitoredIdentity
	byKey      map[summarycommon.MonitoringKey]int
	byWorkload map[summarycommon.MonitoringKey]int
}

func newIdentityIndex(
	ids []summarycommon.MonitoredIdentity,
) *identityIndex {
	set := &identityIndex{
		ids: ids,
		byKey: make(
			map[summarycommon.MonitoringKey]int,
		),
		byWorkload: make(
			map[summarycommon.MonitoringKey]int,
		),
	}

	for index, id := range ids {
		if _, duplicate :=
			set.byKey[id.Key]; !duplicate {
			set.byKey[id.Key] = index
		}

		workloadKey, ok :=
			id.MonitoringWorkloadKey()
		if !ok {
			continue
		}

		if _, duplicate :=
			set.byWorkload[workloadKey]; duplicate {
			continue
		}

		set.byWorkload[workloadKey] = index
	}

	return set
}

func (s *identityIndex) lookupKeys() []summarycommon.MonitoringKey {
	capacity := len(s.byKey) +
		len(s.byWorkload)

	keys := make(
		[]summarycommon.MonitoringKey,
		0,
		capacity,
	)

	seen := make(
		map[summarycommon.MonitoringKey]struct{},
		capacity,
	)

	for _, id := range s.ids {
		for _, key := range id.AllKeys() {
			if _, duplicate := seen[key]; duplicate {
				continue
			}

			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}

	return keys
}

func (s *identityIndex) indexOf(
	key summarycommon.MonitoringKey,
) (int, bool) {
	if index, ok := s.byKey[key]; ok {
		return index, true
	}

	if index, ok := s.byWorkload[key]; ok {
		return index, true
	}

	return 0, false
}

// activeBaselineFor returns an active baseline associated with the monitored
// principal.
//
// ECS task and execution roles are separate monitored identities, so each can
// independently contribute to identities_watched and baselines_established.
func (s *identityIndex) activeBaselineFor(
	baselines map[summarycommon.MonitoringKey]summarycommon.BaselineStateRow,
	id summarycommon.MonitoredIdentity,
) (summarycommon.BaselineStateRow, bool) {
	for _, key := range id.AllKeys() {
		baseline, ok := baselines[key]
		if !ok {
			continue
		}

		if strings.EqualFold(
			strings.TrimSpace(baseline.Status),
			"active",
		) {
			return baseline, true
		}
	}

	return summarycommon.BaselineStateRow{}, false
}

func (s *identityIndex) riskFor(
	riskRows map[summarycommon.MonitoringKey]summarycommon.IdentityRiskRow,
	id summarycommon.MonitoredIdentity,
) (summarycommon.IdentityRiskRow, bool) {
	for _, key := range id.AllKeys() {
		riskRow, ok := riskRows[key]
		if ok {
			return riskRow, true
		}
	}

	return summarycommon.IdentityRiskRow{}, false
}

func mergeECSCredentials(
	existing []summarycommon.IdentityCredentialRow,
	discovered []summarycommon.IdentityCredentialRow,
) []summarycommon.IdentityCredentialRow {
	out := make(
		[]summarycommon.IdentityCredentialRow,
		0,
		len(existing)+len(discovered),
	)

	seen := make(
		map[string]struct{},
		len(existing)+len(discovered),
	)

	add := func(
		credential summarycommon.IdentityCredentialRow,
	) {
		bindingType := strings.ToLower(
			strings.TrimSpace(
				credential.BindingType,
			),
		)

		credentialARN := strings.TrimSpace(
			credential.CredentialARN,
		)

		if bindingType == "" ||
			credentialARN == "" {
			return
		}

		key := bindingType + ":" + credentialARN

		if _, duplicate := seen[key]; duplicate {
			return
		}

		seen[key] = struct{}{}

		credential.BindingType = bindingType
		credential.CredentialARN = credentialARN

		out = append(out, credential)
	}

	// Database credentials have priority.
	for _, credential := range existing {
		add(credential)
	}

	// Discovery credentials fill missing bindings.
	for _, credential := range discovered {
		add(credential)
	}

	return out
}
