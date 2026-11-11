package identitylist

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

// Service implements GET /api/v1/genome/identities.
//
// The shared common.MonitoredIdentityLookup supplies the normalized fleet.
// For ECS, one discovery identity can expand into separate task-role and
// execution-role monitored principals. Both role principals retain the same
// inventory ID and resource ARN for the Open in inventory action.
type Service struct {
	lookup *common.MonitoredIdentityLookup
	repo   *Repository
	events *common.MonitoringEvents
}

// NewService wires the identity-list service.
func NewService(
	lookup *common.MonitoredIdentityLookup,
	repo *Repository,
	events *common.MonitoringEvents,
) *Service {
	return &Service{
		lookup: lookup,
		repo:   repo,
		events: events,
	}
}

const (
	SortRiskDesc     = "risk_desc"
	SortLastSeenDesc = "last_seen_desc"
	SortNameAsc      = "name_asc"
)

// Params contains the parsed list filters, sorting, and pagination values.
type Params struct {
	SourceType string
	Search     string
	AccountID  string
	Region     string
	Status     string
	Sort       string
	Limit      int
	Cursor     string
}

// List builds one page of monitored identities.
func (s *Service) List(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	params Params,
) (*Response, *string, error) {
	if params.Sort == "" {
		params.Sort = SortRiskDesc
	}

	after, err := decodeListCursor(
		params.Cursor,
		params.Sort,
	)
	if err != nil {
		return nil, nil, err
	}

	resolvedScope, fleet, err := s.lookup.Fleet(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return nil, nil, err
	}

	entries := make(
		[]listEntry,
		0,
		len(fleet),
	)

	for _, identity := range fleet {
		if !matchesFilters(identity, params) {
			continue
		}

		entries = append(
			entries,
			listEntry{
				id: identity,
				sortID: identity.Key.SourceType +
					":" +
					identity.Key.IdentityName,
			},
		)
	}

	var (
		risk     map[common.MonitoringKey]common.IdentityRiskSnapshotRow
		lastSeen map[common.MonitoringKey]time.Time
	)

	switch params.Sort {
	case SortRiskDesc:
		risk = s.riskFor(
			ctx,
			resolvedScope,
			entries,
		)

	case SortLastSeenDesc:
		lastSeen = s.lastSeenFor(
			ctx,
			entries,
		)
	}

	for index := range entries {
		entries[index].score = riskScore(
			risk,
			entries[index].id,
		)

		if seenAt, exists := lastSeen[entries[index].id.EventKey()]; exists {
			seenAt = seenAt.UTC()
			entries[index].lastSeen = &seenAt
		}
	}

	sort.SliceStable(
		entries,
		func(left int, right int) bool {
			return compareEntries(
				params.Sort,
				entries[left],
				entries[right],
			) < 0
		},
	)

	if after != nil {
		cut := sort.Search(
			len(entries),
			func(index int) bool {
				return compareEntries(
					params.Sort,
					entries[index],
					*after,
				) > 0
			},
		)

		entries = entries[cut:]
	}

	var nextCursor *string

	if len(entries) > params.Limit {
		entries = entries[:params.Limit]

		nextCursor = encodeListCursor(
			params.Sort,
			entries[len(entries)-1],
		)
	}

	if risk == nil {
		risk = s.riskFor(
			ctx,
			resolvedScope,
			entries,
		)
	}

	if lastSeen == nil {
		lastSeen = s.lastSeenFor(
			ctx,
			entries,
		)
	}

	keys := listKeys(entries)

	baselines, baselineErr := s.repo.BaselineSummaries(
		ctx,
		resolvedScope,
		keys,
	)
	if !common.ReadOK(
		"identity list baselines",
		baselineErr,
	) {
		baselines = nil
	}

	openAlerts, alertsErr := s.repo.OpenAlertCounts(
		ctx,
		resolvedScope,
		keys,
	)
	alertsOK := common.ReadOK(
		"identity list open alerts",
		alertsErr,
	)

	response := &Response{
		ActivityKnown: lastSeen != nil,
		Items: make(
			[]Item,
			0,
			len(entries),
		),
	}

	for _, entry := range entries {
		identity := entry.id

		item := Item{
			ID:              entry.sortID,
			SourceType:      identity.Key.SourceType,
			NHIIdentityType: identity.Subtype,
			IdentityName:    identity.Key.IdentityName,
			DisplayName:     identity.DisplayName,
			WorkloadKey:     identity.WorkloadKey,
			Status:          common.OptionalString(identity.Status),
			AccountID:       identity.AccountID,
			Region:          common.OptionalString(identity.Region),
			ServiceName:     common.OptionalString(identity.ServiceName),
			PrincipalARN:    common.OptionalString(identity.PrincipalARN),
			RoleKind:        common.OptionalString(identity.RoleKind),
			RoleType:        common.OptionalString(identity.RoleType),
			RoleARN:         common.OptionalString(identity.RoleARN),
			InventoryID:     common.OptionalString(identity.DiscoveryIdentityID),
			ResourceARN:     common.OptionalString(identity.ResourceARN),
			ClusterARN:      common.OptionalString(identity.ClusterARN),
		}

		// The identity's baseline: an active one if any of its keys has one
		// (for ECS the role ARN key, then the role-specific workload key),
		// otherwise the first inactive one. The console reads active as
		// established and inactive as learning; dropping inactive rows left
		// every learning identity reading "not started".
		var chosen *BaselineSummaryRow
		for _, key := range identity.AllKeys() {
			baseline, exists := baselines[key]
			if !exists {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(baseline.Status), "active") {
				b := baseline
				chosen = &b
				break
			}
			if chosen == nil {
				b := baseline
				chosen = &b
			}
		}
		if chosen != nil {
			item.Baseline = BaselineSummary{
				Status:       common.OptionalString(strings.ToLower(strings.TrimSpace(chosen.Status))),
				BuiltDays:    common.IntPtr(chosen.BuiltDays),
				RequiredDays: common.IntPtr(chosen.RequiredDays),
			}
		}

		for _, key := range identity.AllKeys() {
			riskRow, exists := risk[key]
			if !exists {
				continue
			}

			item.Risk = RiskSnapshot{
				Score: riskRow.RiskScore,
				Severity: common.OptionalString(
					riskRow.Severity,
				),
				Status: common.OptionalString(
					riskRow.ScoreStatus,
				),
			}

			break
		}

		if seenAt, exists := lastSeen[identity.EventKey()]; exists {
			seenAt = seenAt.UTC()
			item.LastSeen = &seenAt
		}

		if alertsOK {
			openCount := 0

			for _, key := range identity.AllKeys() {
				openCount += openAlerts[key]
			}

			item.OpenAnomalyCount =
				common.IntPtr(openCount)
		}

		response.Items = append(
			response.Items,
			item,
		)
	}

	if err := common.BudgetExceeded(
		ctx,
		"identity list",
	); err != nil {
		return nil, nil, err
	}

	return response, nextCursor, nil
}

func matchesFilters(
	identity common.MonitoredIdentity,
	params Params,
) bool {
	if params.SourceType != "" &&
		identity.Key.SourceType != params.SourceType {
		return false
	}

	if params.AccountID != "" &&
		identity.AccountID != params.AccountID {
		return false
	}

	if params.Region != "" &&
		identity.Region != params.Region {
		return false
	}

	if params.Status != "" &&
		!strings.EqualFold(
			identity.Status,
			params.Status,
		) {
		return false
	}

	if params.Search == "" {
		return true
	}

	needle := strings.ToLower(
		params.Search,
	)

	searchableValues := []string{
		identity.Key.IdentityName,
		identity.DisplayName,
		identity.WorkloadKey,
		identity.ServiceName,
		identity.RoleARN,
		identity.PrincipalARN,
		identity.ResourceARN,
		identity.DiscoveryIdentityID,
	}

	for _, value := range searchableValues {
		if strings.Contains(
			strings.ToLower(value),
			needle,
		) {
			return true
		}
	}

	return false
}

func (s *Service) riskFor(
	ctx context.Context,
	resolvedScope *scope.DataScope,
	entries []listEntry,
) map[common.MonitoringKey]common.IdentityRiskSnapshotRow {
	risk, err := common.LatestRiskSnapshots(
		ctx,
		resolvedScope,
		listKeys(entries),
	)
	if !common.ReadOK(
		"identity list risk scores",
		err,
	) {
		return map[common.MonitoringKey]common.IdentityRiskSnapshotRow{}
	}

	return risk
}

// lastSeenFor returns nil when the events store cannot be read, so the
// caller can tell "unknown" from "never seen".
func (s *Service) lastSeenFor(
	ctx context.Context,
	entries []listEntry,
) map[common.MonitoringKey]time.Time {
	if s.events == nil {
		return nil
	}

	keys := make(
		[]common.MonitoringKey,
		0,
		len(entries),
	)

	for _, entry := range entries {
		keys = append(
			keys,
			entry.id.EventKey(),
		)
	}

	lastSeen, err := s.events.LastSeenByIdentity(
		ctx,
		keys,
	)
	if !common.EventsReadOK(
		"identity list last seen",
		err,
	) {
		return nil
	}
	if lastSeen == nil {
		lastSeen = map[common.MonitoringKey]time.Time{}
	}

	return lastSeen
}

func riskScore(
	risk map[common.MonitoringKey]common.IdentityRiskSnapshotRow,
	identity common.MonitoredIdentity,
) *int {
	for _, key := range identity.AllKeys() {
		if riskRow, exists := risk[key]; exists {
			return riskRow.RiskScore
		}
	}

	return nil
}

func listKeys(
	entries []listEntry,
) []common.MonitoringKey {
	seen := make(
		map[common.MonitoringKey]struct{},
	)

	output := make(
		[]common.MonitoringKey,
		0,
		len(entries),
	)

	for _, entry := range entries {
		for _, key := range entry.id.AllKeys() {
			if _, duplicate := seen[key]; duplicate {
				continue
			}

			seen[key] = struct{}{}
			output = append(output, key)
		}
	}

	return output
}

type listEntry struct {
	id       common.MonitoredIdentity
	sortID   string
	score    *int
	lastSeen *time.Time
}

func compareEntries(
	sortBy string,
	left listEntry,
	right listEntry,
) int {
	switch sortBy {
	case SortLastSeenDesc:
		if comparison := common.CompareDesc(
			left.lastSeen != nil,
			right.lastSeen != nil,
			func() int {
				return left.lastSeen.Compare(
					*right.lastSeen,
				)
			},
		); comparison != 0 {
			return comparison
		}

	case SortNameAsc:
		if comparison := strings.Compare(
			strings.ToLower(left.id.DisplayName),
			strings.ToLower(right.id.DisplayName),
		); comparison != 0 {
			return comparison
		}

		if comparison := strings.Compare(
			left.id.DisplayName,
			right.id.DisplayName,
		); comparison != 0 {
			return comparison
		}

	default:
		if comparison := common.CompareDesc(
			left.score != nil,
			right.score != nil,
			func() int {
				return *left.score - *right.score
			},
		); comparison != 0 {
			return comparison
		}
	}

	return strings.Compare(
		left.sortID,
		right.sortID,
	)
}

type listCursor struct {
	Sort     string `json:"s"`
	ID       string `json:"id"`
	Score    *int   `json:"r,omitempty"`
	LastSeen *int64 `json:"t,omitempty"`
	Name     string `json:"n,omitempty"`
}

func encodeListCursor(
	sortBy string,
	last listEntry,
) *string {
	cursor := listCursor{
		Sort: sortBy,
		ID:   last.sortID,
	}

	switch sortBy {
	case SortLastSeenDesc:
		if last.lastSeen != nil {
			milliseconds := last.lastSeen.UnixMilli()
			cursor.LastSeen = &milliseconds
		}

	case SortNameAsc:
		cursor.Name = last.id.DisplayName

	default:
		cursor.Score = last.score
	}

	raw, _ := json.Marshal(cursor)
	encoded := base64.RawURLEncoding.EncodeToString(raw)

	return &encoded
}

func decodeListCursor(
	encoded string,
	sortBy string,
) (*listEntry, error) {
	if encoded == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(
		encoded,
	)
	if err != nil {
		return nil, common.ErrInvalidCursor
	}

	var cursor listCursor

	if err := json.Unmarshal(
		raw,
		&cursor,
	); err != nil ||
		cursor.Sort != sortBy ||
		cursor.ID == "" {
		return nil, common.ErrInvalidCursor
	}

	entry := &listEntry{
		sortID: cursor.ID,
		score:  cursor.Score,
	}

	entry.id.DisplayName = cursor.Name

	if cursor.LastSeen != nil {
		seenAt := time.UnixMilli(
			*cursor.LastSeen,
		).UTC()

		entry.lastSeen = &seenAt
	}

	return entry, nil
}
