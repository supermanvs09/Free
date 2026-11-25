package identitylist

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/workloadtypes"
	chclient "nhi-backend-api/internal/platform/clickhouse"
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/scope"
)

// Service implements GET /api/v1/genome/identities.
//
// The list shows only identities the behaviour pipeline has a baselines row
// for (learning or active), in the caller's accounts. Each row is keyed by
// its baseline key (baselines.identity_name):
//
//   - IAM: baselines.identity_name matches log_events.identity_name; the
//     matching log_events row's instance_arn is matched exactly against
//     identities.arn.
//   - ECS: baselines.identity_name matches log_events.workload_key; the
//     matching log_events row's task_id is resolved through
//     ecs_task_registry.task_arn, which is matched exactly against
//     identities.arn.
//   - Every other family: baselines.identity_name matches both
//     log_events.identity_name and identities.arn.
//
// Every link addresses the genome endpoints by the baseline key.
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
	SourceType     string
	Search         string
	AccountID      string
	Region         string
	Status         string // discovery status of the primary mapped identity
	BaselineStatus string // baselines.status (active | inactive)
	Mapping        string // mapped | unmapped
	Sort           string
	Limit          int
	Cursor         string
}

// List builds one page of baselined identities.
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

	after, err := decodeListCursor(params.Cursor, params.Sort)
	if err != nil {
		return nil, nil, err
	}

	resolvedScope, fleet, discoveryRows, err := s.lookup.FleetWithDiscovery(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, nil, err
	}

	var families []string
	if enabled, all := workloadtypes.Enabled(); !all {
		families = enabled
	}
	baselineRows, err := s.repo.Baselines(ctx, resolvedScope, families)
	if database.IsMissingTable(err) {
		// The pipeline has not provisioned this tenant yet: nothing is baselined.
		return &Response{Items: []Item{}}, nil, nil
	}
	if err != nil {
		return nil, nil, &common.StoreUnavailableError{Op: "read baselines", Err: err}
	}

	mapper := newIdentityMapper(fleet, discoveryRows)
	regions := stringSet(resolvedScope.Regions)

	entries := make([]listEntry, 0, len(baselineRows))
	for _, row := range baselineRows {
		if workloadtypes.IsGhostECSBaseline(row.Key.SourceType, row.Key.IdentityName, row.BuiltDays) {
			continue
		}
		entry := newListEntry(mapper, row)
		if _, mapped := entry.primary(); !mapped && entry.region != "" && !regions[entry.region] {
			continue // an unmapped baseline outside the caller's selected regions
		}
		entries = append(entries, entry)
	}

	// One log_events read for every baseline: the event identity names
	// (alert / risk keys), last_seen, the display labels, the ECS task_id and
	// the IAM instance_arn.
	facts := s.workloadFacts(ctx, resolvedScope, entries)
	for index := range entries {
		entries[index].attachFacts(facts)
	}
	s.resolveLegacyMappings(ctx, resolvedScope, mapper, entries)

	// The identities API is inventory-backed. A baseline that cannot be
	// resolved to exactly one live identities row is not an identity that the
	// API can safely expose. Drop it before filtering, sorting, pagination,
	// risk reads, and alert-count reads so response metadata and cursors are
	// calculated exclusively from mapped identities.
	filtered := entries[:0]
	for _, entry := range entries {
		if _, mapped := entry.primary(); !mapped {
			continue
		}
		if matchesFilters(entry, params) {
			filtered = append(filtered, entry)
		}
	}
	entries = filtered

	var risk map[common.MonitoringKey]common.IdentityRiskSnapshotRow
	if params.Sort == SortRiskDesc {
		risk = s.riskFor(ctx, resolvedScope, entries)
		for index := range entries {
			if row, ok := bestRisk(risk, entries[index]); ok {
				entries[index].score = row.RiskScore
			}
		}
	}

	sort.SliceStable(entries, func(left, right int) bool {
		return compareEntries(params.Sort, entries[left], entries[right]) < 0
	})

	if after != nil {
		cut := sort.Search(len(entries), func(index int) bool {
			return compareEntries(params.Sort, entries[index], *after) > 0
		})
		entries = entries[cut:]
	}

	var nextCursor *string
	if len(entries) > params.Limit {
		entries = entries[:params.Limit]
		nextCursor = encodeListCursor(params.Sort, entries[len(entries)-1])
	}

	if risk == nil {
		risk = s.riskFor(ctx, resolvedScope, entries)
	}

	openAlerts, alertsErr := s.repo.OpenAlertCounts(ctx, resolvedScope, listKeys(entries))
	alertsOK := common.ReadOK("identity list open alerts", alertsErr)

	response := &Response{Items: make([]Item, 0, len(entries))}
	for _, entry := range entries {
		item := buildItem(entry)

		if row, ok := bestRisk(risk, entry); ok {
			item.Risk = RiskSnapshot{
				Score:    row.RiskScore,
				Severity: common.OptionalString(row.Severity),
			}
		}

		if alertsOK {
			openCount := 0
			for _, key := range entry.keys() {
				openCount += openAlerts[key]
			}
			item.OpenAnomalyCount = common.IntPtr(openCount)
		}

		response.Items = append(response.Items, item)
	}

	if err := common.BudgetExceeded(ctx, "identity list"); err != nil {
		return nil, nil, err
	}

	return response, nextCursor, nil
}

// workloadFacts reads the log_events facts of every entry's baseline key in
// one query; nil when log_events cannot be read.
func (s *Service) workloadFacts(ctx context.Context, resolvedScope *scope.DataScope, entries []listEntry) map[common.MonitoringKey]chclient.WorkloadFacts {
	keys := make([]common.MonitoringKey, 0, len(entries))
	for _, entry := range entries {
		if entry.row.Key.SourceType == "ECS" {
			// ECS facts must be read only by the exact baseline workload key.
			// Role ARN and cluster name are shared attributes, not identity keys.
			keys = append(keys, entry.row.Key)
			continue
		}
		keys = append(keys, entry.eventKeys...)
	}
	if len(keys) == 0 {
		return nil
	}
	facts, err := s.events.WorkloadFacts(ctx, resolvedScope.AccountIDs, keys)
	if !common.EventsReadOK("identity list workload facts", err) {
		return nil
	}
	return facts
}

// resolveLegacyMappings preserves the pre-canonical correlation path.
//
// ECS uses ClickHouse task_id -> ecs_task_registry -> identities, with the
// role binding read from ClickHouse role_type. IAM uses the ClickHouse
// instance_arn of the row whose identity_name matches the baseline key. Every
// other family maps the ClickHouse identity_name, which is the resource ARN
// stored in identities.
func (s *Service) resolveLegacyMappings(
	ctx context.Context,
	resolved *scope.DataScope,
	mapper *identityMapper,
	entries []listEntry,
) {
	lookups := make([]ECSInventoryLookup, 0)
	seenLookups := make(map[string]struct{})

	for index := range entries {
		entry := &entries[index]
		if entry.row.Key.SourceType != "ECS" {
			continue
		}

		// ECS mapping is fail-closed. The generic discovery match created while
		// constructing the entry must not rescue a missing task-registry mapping.
		entry.matches = nil
		entry.matchedBy = ""
		entry.context = normalizeECSRoleType(entry.roleType)

		if entry.context == "" || strings.TrimSpace(entry.taskID) == "" {
			continue
		}

		key := ecsTaskLookupKey(entry.row.AccountID, entry.region, entry.taskID)
		if _, exists := seenLookups[key]; exists {
			continue
		}
		seenLookups[key] = struct{}{}

		lookups = append(lookups, ECSInventoryLookup{
			TaskID:    entry.taskID,
			AccountID: entry.row.AccountID,
			Region:    entry.region,
		})
	}

	ecsMappings, err := s.repo.ResolveECSInventory(ctx, resolved, lookups)
	if !common.ReadOK("identity list ECS task registry", err) {
		ecsMappings = nil
	}

	for index := range entries {
		entry := &entries[index]

		if entry.row.Key.SourceType == "ECS" {
			// Missing registry row, null/empty task ARN, no identities.arn match,
			// or an ambiguous match all remain unmapped. Never try another key.
			if entry.context == "" || strings.TrimSpace(entry.taskID) == "" {
				continue
			}

			mapping, ok := ecsMappings[ecsTaskLookupKey(
				entry.row.AccountID,
				entry.region,
				entry.taskID,
			)]
			if !ok || strings.TrimSpace(mapping.Identity.ID) == "" || strings.TrimSpace(mapping.Identity.ARN) == "" {
				continue
			}

			entry.matches = []mappedIdentity{{
				raw:  rawIdentity{row: mapping.Identity, subtype: "ecs_task"},
				role: entry.keyRole,
			}}
			entry.matchedBy = "ecs_task_registry"
			entry.region = common.FirstNonEmpty(mapping.Identity.Region, entry.region)
			continue
		}

		if entry.row.Key.SourceType == "IAM" {
			// IAM: baselines.identity_name is the ClickHouse identity_name.
			// The matching ClickHouse row's instance_profile_arn is the exact
			// identities.arn.
			if strings.TrimSpace(entry.instanceProfileARN) == "" {
				continue
			}

			resolvedInstance := mapper.Resolve(
				entry.row.Key.SourceType,
				entry.instanceProfileARN,
				entry.row.AccountID,
			)
			if len(resolvedInstance.Matches) == 0 {
				continue
			}

			instanceMatches := make([]mappedIdentity, 0, len(resolvedInstance.Matches))
			for _, match := range resolvedInstance.Matches {
				mapped := mappedIdentity{
					raw: mapper.raw[match.raw],
					role: mapper.RoleFor(
						match,
						entry.row.Key.SourceType,
						entry.instanceProfileARN,
						resolvedInstance.Role,
					),
				}
				if match.fleet >= 0 {
					identity := mapper.fleet[match.fleet]
					mapped.fleet = &identity
				}
				instanceMatches = append(instanceMatches, mapped)
			}

			entry.matches = instanceMatches
			entry.matchedBy = "instance_profile_arn"
			continue
		}

		// For every non-ECS family, ClickHouse identity_name is the resource ARN
		// stored in identities. Prefer this observed exact value as the default
		// mapping key. If ClickHouse has no value or it does not map, preserve the
		// existing baseline-key mapping as the compatibility fallback.
		if strings.TrimSpace(entry.eventIdentityName) == "" {
			continue
		}

		resolvedEvent := mapper.Resolve(
			entry.row.Key.SourceType,
			entry.eventIdentityName,
			entry.row.AccountID,
		)
		if len(resolvedEvent.Matches) == 0 {
			continue
		}

		observedMatches := make([]mappedIdentity, 0, len(resolvedEvent.Matches))
		for _, match := range resolvedEvent.Matches {
			mapped := mappedIdentity{
				raw: mapper.raw[match.raw],
				role: mapper.RoleFor(
					match,
					entry.row.Key.SourceType,
					entry.eventIdentityName,
					resolvedEvent.Role,
				),
			}
			if match.fleet >= 0 {
				identity := mapper.fleet[match.fleet]
				mapped.fleet = &identity
			}
			observedMatches = append(observedMatches, mapped)
		}

		entry.matches = observedMatches
		entry.matchedBy = "event_identity_name"
	}
}

func normalizeECSRoleType(roleType string) string {
	switch strings.ToLower(strings.TrimSpace(roleType)) {
	case "task", "task_role", "taskrole":
		return "task_role"
	case "execution", "execution_role", "executionrole":
		return "execution_role"
	default:
		return ""
	}
}

func ecsTaskLookupKey(accountID, region, taskID string) string {
	return strings.TrimSpace(accountID) + "|" +
		strings.ToLower(strings.TrimSpace(region)) + "|" +
		strings.TrimSpace(taskID)
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

// mappedIdentity is one discovery identity of an entry.
type mappedIdentity struct {
	raw   rawIdentity
	fleet *common.MonitoredIdentity // nil: no fleet principal for this role
	role  string                    // role ARN the baseline is for ("" unknown)
}

type listEntry struct {
	row                BaselineRow
	matches            []mappedIdentity
	matchedBy          string
	keyRole            string
	context            string
	keyService         string
	eventKeys          []common.MonitoringKey
	alertKeys          []common.MonitoringKey
	eventIdentityName  string
	instanceProfileARN string
	taskID             string
	taskDefinition     string
	roleType           string
	sortID             string
	displayName        string
	serviceName        string
	region             string
	score              *int
	lastSeen           *time.Time
}

func newListEntry(mapper *identityMapper, row BaselineRow) listEntry {
	res := mapper.Resolve(row.Key.SourceType, row.Key.IdentityName, row.AccountID)
	entry := listEntry{
		row:       row,
		matchedBy: res.MatchedBy,
		keyRole:   res.Role,
		context:   res.Context,
		sortID:    row.AccountID + ":" + row.Key.SourceType + ":" + row.Key.IdentityName,
	}
	if parsed, ok := workloadtypes.ParseECSKey(row.Key.IdentityName); ok && row.Key.SourceType == "ECS" {
		entry.keyService = strings.TrimPrefix(parsed.Service, "standalone:")
	}
	for _, match := range res.Matches {
		mapped := mappedIdentity{
			raw:  mapper.raw[match.raw],
			role: mapper.RoleFor(match, row.Key.SourceType, row.Key.IdentityName, res.Role),
		}
		if match.fleet >= 0 {
			id := mapper.fleet[match.fleet]
			mapped.fleet = &id
		}
		entry.matches = append(entry.matches, mapped)
	}
	sort.SliceStable(entry.matches, func(a, b int) bool {
		left, right := entry.matches[a].raw.row, entry.matches[b].raw.row
		if c := strings.Compare(strings.ToLower(left.Name), strings.ToLower(right.Name)); c != 0 {
			return c < 0
		}
		return left.ARN < right.ARN
	})

	entry.displayName = workloadtypes.KeyDisplayName(row.Key.IdentityName)
	entry.region = workloadtypes.KeyRegion(row.Key.IdentityName)
	if primary, ok := entry.primary(); ok {
		switch {
		case primary.fleet != nil:
			entry.displayName = common.FirstNonEmpty(primary.fleet.DisplayName, entry.displayName)
			entry.serviceName = primary.fleet.ServiceName
		case row.Key.SourceType != "ECS":
			// One baseline per resource: the resource names it. (An ECS task
			// has one baseline per role, so its key names it instead.)
			entry.displayName = common.FirstNonEmpty(primary.raw.row.Name, entry.displayName)
		}
		entry.region = common.FirstNonEmpty(primary.raw.row.Region, entry.region)
	}

	// The names the baseline's events can carry: the key (workload_key), the
	// ARN a serverless key names and, outside ECS, the canonical ARNs of the
	// mapped resources (alerts and risk of those are stored under them too).
	partition := ""
	var resourceARNs []string
	for _, match := range entry.matches {
		partition = common.FirstNonEmpty(partition, workloadtypes.ARNPartition(match.raw.row.ARN))
		if row.Key.SourceType != "ECS" {
			if arn := intelCanonicalARN(row.Key.SourceType, match.raw.row.ARN); strings.HasPrefix(arn, "arn:") {
				resourceARNs = append(resourceARNs, arn)
			}
		}
	}
	entry.eventKeys = common.BaselineEventKeys(row.Key, partition, resourceARNs...)
	return entry
}

// attachFacts completes the entry from the log_events facts of its baseline
// key: the alert / risk keys, last_seen, the pipeline's display labels, the
// ECS task_id and the IAM instance_arn.
func (e *listEntry) attachFacts(facts map[common.MonitoringKey]chclient.WorkloadFacts) {
	e.alertKeys = common.BaselineAlertKeys(e.eventKeys, facts)
	var f chclient.WorkloadFacts
	var ok bool
	if e.row.Key.SourceType == "ECS" {
		f, ok = facts[e.row.Key]
	} else {
		f, ok = common.MergedFacts(e.eventKeys, facts)
	}
	if !ok {
		return
	}
	e.eventIdentityName = strings.TrimSpace(f.EventIdentityName)
	e.instanceProfileARN = strings.TrimSpace(f.InstanceProfileARN)
	e.taskID = strings.TrimSpace(f.TaskID)
	e.taskDefinition = strings.TrimSpace(f.TaskDefinition)
	e.roleType = strings.TrimSpace(f.RoleType)
	if f.LastSeen != nil {
		t := f.LastSeen.UTC()
		e.lastSeen = &t
	}
	e.displayName = common.FirstNonEmpty(strings.TrimSpace(f.DisplayName), e.displayName)
	e.serviceName = common.FirstNonEmpty(e.serviceName, f.ServiceName)
	if e.keyRole == "" && strings.HasPrefix(f.RoleARN, "arn:") && e.row.Key.SourceType == "ECS" {
		e.keyRole = f.RoleARN
	}
	if e.context == "" {
		e.context = f.RoleKind
	}
}

func (e listEntry) primary() (mappedIdentity, bool) {
	if len(e.matches) == 0 {
		return mappedIdentity{}, false
	}
	return e.matches[0], true
}

// keys are the keys the entry's alerts and risk scores are stored under.
func (e listEntry) keys() []common.MonitoringKey {
	if len(e.alertKeys) == 0 {
		return []common.MonitoringKey{e.row.Key}
	}
	return e.alertKeys
}

func matchesFilters(entry listEntry, params Params) bool {
	row := entry.row
	primary, mapped := entry.primary()

	if params.SourceType != "" && row.Key.SourceType != params.SourceType {
		return false
	}
	if params.AccountID != "" && row.AccountID != params.AccountID {
		return false
	}
	if params.Region != "" && entry.region != params.Region {
		return false
	}
	if params.BaselineStatus != "" && !strings.EqualFold(strings.TrimSpace(row.Status), params.BaselineStatus) {
		return false
	}
	if params.Status != "" && (!mapped || !strings.EqualFold(primary.raw.row.Status, params.Status)) {
		return false
	}
	switch params.Mapping {
	case MappingMapped:
		if !mapped {
			return false
		}
	case MappingUnmapped:
		if mapped {
			return false
		}
	}

	if params.Search == "" {
		return true
	}
	needle := strings.ToLower(params.Search)
	values := []string{row.Key.IdentityName, entry.eventIdentityName, entry.instanceProfileARN, entry.displayName, entry.serviceName, entry.keyRole}
	for _, m := range entry.matches {
		values = append(values, m.raw.row.ID, m.raw.row.ARN, m.raw.row.Name, m.role)
		if m.fleet != nil {
			values = append(values, m.fleet.Key.IdentityName, m.fleet.DisplayName, m.fleet.ServiceName, m.fleet.PrincipalARN)
		}
	}
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), needle) {
			return true
		}
	}
	return false
}

// normalizeBinding normalizes discovery role-binding labels.
func normalizeBinding(binding string) string {
	switch intelToken(binding) {
	case "taskrole", "task_role":
		return "task_role"
	case "executionrole", "execution_role":
		return "execution_role"
	case "instanceprofile", "instance_profile":
		return "instance_profile"
	case "":
		return ""
	}
	return intelToken(binding)
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

// buildItem renders the baselines row and its discovery mapping.
func buildItem(entry listEntry) Item {
	row := entry.row
	links := common.IdentityLinksFor(row.Key.SourceType, row.Key.IdentityName)
	item := Item{
		ID:                entry.sortID,
		SourceType:        row.Key.SourceType,
		IdentityName:      row.Key.IdentityName,
		EventIdentityName: common.OptionalString(entry.eventIdentityName),
		DisplayName:       entry.displayName,
		AccountID:         row.AccountID,
		Region:            common.OptionalString(entry.region),
		RoleARN:           common.OptionalString(entry.keyRole),
		RoleKind:          common.OptionalString(entry.context),
		ServiceName:       common.OptionalString(common.FirstNonEmpty(entry.serviceName, entry.keyService)),
		Baseline: BaselineSummary{
			Status:        common.OptionalString(row.Status),
			BuiltDays:     common.IntPtr(row.BuiltDays),
			RequiredDays:  common.IntPtr(row.RequiredDays),
			DaysRemaining: common.IntPtr(row.DaysRemaining),
			ActiveSince:   row.ActiveSince,
		},
		LastSeen: entry.lastSeen,
		Mapping: Mapping{
			Status:         MappingUnmapped,
			DiscoveryCount: len(entry.matches),
		},
		Links: Links{
			Summary:  strings.TrimSuffix(links.Activity, "/activity"),
			Baseline: links.Baseline,
			Activity: links.Activity,
			Genome:   links.Genome,
			Timeline: links.Timeline,
		},
	}

	primary, ok := entry.primary()
	if !ok {
		return item
	}
	if row.Key.SourceType == "ECS" {
		item.Parent = nil
		item.InventoryID = common.OptionalString(primary.raw.row.ID)
		item.ResourceARN = common.OptionalString(primary.raw.row.ARN)
		item.PrincipalARN = common.OptionalString(entry.keyRole)
		item.BindingType = common.OptionalString(normalizeECSRoleType(entry.roleType))
		item.Mapping.Status = MappingMapped
		item.Mapping.MatchedBy = common.OptionalString(entry.matchedBy)
		item.NHIIdentityType = common.OptionalString("ecs_task")
		return item
	}
	item.Mapping.Status = MappingMapped
	item.Mapping.MatchedBy = common.OptionalString(entry.matchedBy)
	item.NHIIdentityType = common.OptionalString(nhiIdentityType(primary))
	if item.RoleARN == nil {
		item.RoleARN = common.OptionalString(primary.role)
	}
	if item.RoleKind == nil && primary.fleet != nil {
		item.RoleKind = common.OptionalString(primary.fleet.RoleKind)
	}
	item.Parent = &Parent{
		InventoryID:  primary.raw.row.ID,
		ARN:          primary.raw.row.ARN,
		Name:         common.OptionalString(primary.raw.row.Name),
		IdentityType: primary.raw.row.IdentityType,
		Status:       common.OptionalString(primary.raw.row.Status),
	}
	return item
}

func nhiIdentityType(m mappedIdentity) string {
	if m.fleet != nil && m.fleet.Subtype != "" {
		return m.fleet.Subtype
	}
	subtype, _, _ := workloadtypes.Resolve(m.raw.row.IdentityType)
	return subtype
}

// ---------------------------------------------------------------------------
// Risk, keys
// ---------------------------------------------------------------------------

func (s *Service) riskFor(
	ctx context.Context,
	resolvedScope *scope.DataScope,
	entries []listEntry,
) map[common.MonitoringKey]common.IdentityRiskSnapshotRow {
	risk, err := common.LatestRiskSnapshots(ctx, resolvedScope, listKeys(entries))
	if !common.ReadOK("identity list risk scores", err) {
		return map[common.MonitoringKey]common.IdentityRiskSnapshotRow{}
	}
	return risk
}

// bestRisk is the highest-scoring latest snapshot among the entry's keys:
// a workload baseline shared by several identities is as risky as its
// riskiest member.
func bestRisk(
	risk map[common.MonitoringKey]common.IdentityRiskSnapshotRow,
	entry listEntry,
) (common.IdentityRiskSnapshotRow, bool) {
	var (
		best  common.IdentityRiskSnapshotRow
		found bool
	)
	for _, key := range entry.keys() {
		row, ok := risk[key]
		if !ok {
			continue
		}
		if !found || betterRisk(row, best) {
			best, found = row, true
		}
	}
	return best, found
}

func betterRisk(a, b common.IdentityRiskSnapshotRow) bool {
	switch {
	case a.RiskScore != nil && b.RiskScore == nil:
		return true
	case a.RiskScore == nil && b.RiskScore != nil:
		return false
	case a.RiskScore != nil && *a.RiskScore != *b.RiskScore:
		return *a.RiskScore > *b.RiskScore
	}
	return a.WindowEnd.After(b.WindowEnd)
}

// listKeys is every monitoring key the entries' risk and alert rows may be
// stored under.
func listKeys(entries []listEntry) []common.MonitoringKey {
	seen := make(map[common.MonitoringKey]struct{})
	output := make([]common.MonitoringKey, 0, len(entries))
	for _, entry := range entries {
		for _, key := range entry.keys() {
			if _, duplicate := seen[key]; duplicate {
				continue
			}
			seen[key] = struct{}{}
			output = append(output, key)
		}
	}
	return output
}

func stringSet(values []string) map[string]bool {
	out := make(map[string]bool, len(values))
	for _, v := range values {
		out[v] = true
	}
	return out
}

// ---------------------------------------------------------------------------
// Sorting and cursor
// ---------------------------------------------------------------------------

func compareEntries(sortBy string, left listEntry, right listEntry) int {
	switch sortBy {
	case SortLastSeenDesc:
		if comparison := common.CompareDesc(
			left.lastSeen != nil,
			right.lastSeen != nil,
			func() int { return left.lastSeen.Compare(*right.lastSeen) },
		); comparison != 0 {
			return comparison
		}

	case SortNameAsc:
		if comparison := strings.Compare(
			strings.ToLower(left.displayName),
			strings.ToLower(right.displayName),
		); comparison != 0 {
			return comparison
		}
		if comparison := strings.Compare(left.displayName, right.displayName); comparison != 0 {
			return comparison
		}

	default:
		if comparison := common.CompareDesc(
			left.score != nil,
			right.score != nil,
			func() int { return *left.score - *right.score },
		); comparison != 0 {
			return comparison
		}
	}

	return strings.Compare(left.sortID, right.sortID)
}

type listCursor struct {
	Sort     string `json:"s"`
	ID       string `json:"id"`
	Score    *int   `json:"r,omitempty"`
	LastSeen *int64 `json:"t,omitempty"`
	Name     string `json:"n,omitempty"`
}

func encodeListCursor(sortBy string, last listEntry) *string {
	cursor := listCursor{Sort: sortBy, ID: last.sortID}

	switch sortBy {
	case SortLastSeenDesc:
		if last.lastSeen != nil {
			milliseconds := last.lastSeen.UnixMilli()
			cursor.LastSeen = &milliseconds
		}
	case SortNameAsc:
		cursor.Name = last.displayName
	default:
		cursor.Score = last.score
	}

	raw, _ := json.Marshal(cursor)
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return &encoded
}

func decodeListCursor(encoded string, sortBy string) (*listEntry, error) {
	if encoded == "" {
		return nil, nil
	}

	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, common.ErrInvalidCursor
	}

	var cursor listCursor
	if err := json.Unmarshal(raw, &cursor); err != nil || cursor.Sort != sortBy || cursor.ID == "" {
		return nil, common.ErrInvalidCursor
	}

	entry := &listEntry{
		sortID:      cursor.ID,
		score:       cursor.Score,
		displayName: cursor.Name,
	}
	if cursor.LastSeen != nil {
		seenAt := time.UnixMilli(*cursor.LastSeen).UTC()
		entry.lastSeen = &seenAt
	}
	return entry, nil
}

// ===========================================================================
// Baseline -> discovery identity mapping
// ===========================================================================

// Mapping of a baselines row (the behaviour pipeline's monitoring key) to the
// discovery identities it belongs to.
//
// The pipeline (genome_intell) stores baselines under its own workload key,
// which is not always the key this backend's normalizer derives:
//
//	EC2          ec2:<account>:<region>:<instance-profile-name>:<role-name>
//	ECS (events) ecs:<account>:<region>:<cluster-arn>:<service|standalone:family>:<role-arn>:<task|execution>
//	LAMBDA/GLUE  lambda:<account>:<region>:<function> / glue:<account>:<region>:<job>
//	SFN          step_functions:<account>:<region>:<state-machine>
//	others       <source>:<account>:<region>:<nhi-type>:<resource-name>
//
// so the resolver tries, in order: the backend's own identity/workload keys,
// a plain ARN, the pipeline's workload key recomputed from the raw discovery
// row (a port of genome_intell/app/identity_discovery.py _workload_key), the
// same with a role-context suffix removed, and finally the ECS event-key
// format matched on account, region, role, cluster and service.

// Values of mapping.matched_by.
const (
	MatchIdentityKey         = "identity_key"
	MatchWorkloadKey         = "workload_key"
	MatchResourceARN         = "resource_arn"
	MatchPipelineWorkloadKey = "pipeline_workload_key"
	MatchECSTaskRole         = "ecs_task_role"
)

// ---------------------------------------------------------------------------
// Port of the pipeline's NHI type registry (genome_intell/app/nhi_types.py)
// ---------------------------------------------------------------------------

// intelTypes maps each pipeline NHI type to its source_type.
var intelTypes = map[string]string{
	"ec2_instance":                  "EC2",
	"lambda_function":               "LAMBDA",
	"ecs_task":                      "ECS",
	"app_runner_service":            "APP_RUNNER",
	"elastic_beanstalk_environment": "ELASTIC_BEAN",
	"ssm_managed_node":              "SSM",
	"glue_job":                      "GLUE",
	"glue_crawler":                  "GLUE",
	"emr_cluster":                   "EMR",
	"batch_job":                     "BATCH",
	"dms_replication_instance":      "DMS",
	"kinesis_firehose":              "KINESIS",
	"kinesis_analytics_app":         "KINESIS",
	"datasync_task":                 "DATASYNC",
	"sagemaker_notebook":            "SAGEMAKER",
	"sagemaker_training_job":        "SAGEMAKER",
	"sagemaker_processing_job":      "SAGEMAKER",
	"sagemaker_endpoint":            "SAGEMAKER",
	"bedrock_agent":                 "BEDROCK",
	"bedrock_knowledge_base":        "BEDROCK",
	"codebuild_project":             "CODEBUILD",
	"codepipeline":                  "CODEPIPELINE",
	"codedeploy_service_role":       "CODEDEPLOY",
	"cloudformation_stack_role":     "CLOUDFORMATION",
	"mwaa_environment":              "MWAA",
	"github_actions_workflow":       "GITHUB_ACTIONS",
	"gitlab_ci_job":                 "GITLAB_CI",
	"terraform_run":                 "TERRAFORM",
	"step_function":                 "STEP_FUNCTIONS",
	"eventbridge_scheduler":         "EVENTBRIDGE",
	"ssm_automation":                "SSM",
	"synthetics_canary":             "SYNTHETICS",
	"iot_role_alias":                "IOT",
	"iot_thing":                     "IOT",
	"greengrass_core":               "GREENGRASS",
	"transfer_server":               "TRANSFER",
	"iam_roles_anywhere_session":    "IAM",
	"saas_vendor_role":              "IAM",
	"aws_service_linked_role":       "AWS_SLR",
}

// intelExplicitAliases are the pipeline's historical discovery spellings.
var intelExplicitAliases = map[string]string{
	"ec2": "ec2_instance", "aws_ec2_instance": "ec2_instance",
	"ecs": "ecs_task", "fargate_task": "ecs_task", "fargate_service": "ecs_task", "ecs_service": "ecs_task",
	"lambda": "lambda_function", "aws_lambda_function": "lambda_function",
	"glue": "glue_job", "aws_glue_job": "glue_job",
	"stepfunctions": "step_function", "stepfunctions_state_machine": "step_function",
	"step_function_state_machine": "step_function", "aws_stepfunctions_state_machine": "step_function",
	"aws_stepfunctions_statemachine": "step_function", "aws_states_state_machine": "step_function",
	"aws_states_statemachine":  "step_function",
	"datasync_agent":           "datasync_task",
	"firehose_delivery_stream": "kinesis_firehose", "kinesis_firehose_delivery_stream": "kinesis_firehose",
	"kinesis_data_firehose":              "kinesis_firehose",
	"kinesis_data_analytics_application": "kinesis_analytics_app",
	"codedeploy_application":             "codedeploy_service_role",
	"cloudformation_stack":               "cloudformation_stack_role",
	"service_linked_role":                "aws_service_linked_role",
	"iam_rolesanywhere_session":          "iam_roles_anywhere_session",
	"roles_anywhere_session":             "iam_roles_anywhere_session",
	"github_actions":                     "github_actions_workflow",
	"gitlab_ci":                          "gitlab_ci_job",
	"terraform":                          "terraform_run",
	"aws_apprunner_service":              "app_runner_service",
	"apprunner_service":                  "app_runner_service",
	"beanstalk_environment":              "elastic_beanstalk_environment",
	"ssm_managed_instance":               "ssm_managed_node",
	"managed_instance":                   "ssm_managed_node",
	"sagemaker_notebook_instance":        "sagemaker_notebook",
}

var (
	intelTokenRE    = regexp.MustCompile(`[^a-z0-9]+`)
	intelAliasIndex = buildIntelAliasIndex()
)

func intelToken(value string) string {
	return strings.Trim(intelTokenRE.ReplaceAllString(strings.ToLower(value), "_"), "_")
}

func buildIntelAliasIndex() map[string]string {
	index := map[string]string{}
	for name := range intelTypes {
		index[intelToken(name)] = name
		index["aws_"+intelToken(name)] = name
	}
	for alias, name := range intelExplicitAliases {
		index[alias] = name
	}
	return index
}

// intelResolveType is nhi_types.resolve_nhi_type: (type name, source_type).
func intelResolveType(identityType string) (string, string, bool) {
	name, ok := intelAliasIndex[intelToken(identityType)]
	if !ok {
		return "", "", false
	}
	return name, intelTypes[name], true
}

// ---------------------------------------------------------------------------
// Port of identity_discovery.py key helpers
// ---------------------------------------------------------------------------

var intelResourceKeys = map[string][]string{
	"ec2_instance":                  {"instance_id", "name"},
	"app_runner_service":            {"service_name", "service", "name"},
	"elastic_beanstalk_environment": {"environment_name", "environment", "name"},
	"glue_crawler":                  {"crawler_name", "name"},
	"emr_cluster":                   {"cluster_name", "cluster", "name"},
	"batch_job":                     {"job_definition", "queue_name", "name"},
	"dms_replication_instance":      {"replication_instance_id", "instance_id", "name"},
	"kinesis_firehose":              {"delivery_stream_name", "stream_name", "name"},
	"kinesis_analytics_app":         {"application_name", "name"},
	"datasync_task":                 {"task_name", "name"},
	"sagemaker_notebook":            {"notebook_name", "name"},
	"sagemaker_training_job":        {"training_job_name", "job_name", "name"},
	"sagemaker_processing_job":      {"processing_job_name", "job_name", "name"},
	"sagemaker_endpoint":            {"endpoint_name", "name"},
	"bedrock_agent":                 {"agent_id", "agent_name", "name"},
	"bedrock_knowledge_base":        {"knowledge_base_id", "knowledge_base_name", "name"},
	"codebuild_project":             {"project_name", "name"},
	"codepipeline":                  {"pipeline_name", "name"},
	"codedeploy_service_role":       {"application_name", "service_role_name", "name"},
	"cloudformation_stack_role":     {"stack_name", "name"},
	"mwaa_environment":              {"environment_name", "name"},
	"github_actions_workflow":       {"repository", "workflow", "name"},
	"gitlab_ci_job":                 {"project_path", "job_name", "name"},
	"terraform_run":                 {"workspace", "organization", "name"},
	"step_function":                 {"state_machine_name", "name"},
	"eventbridge_scheduler":         {"schedule_name", "name"},
	"ssm_automation":                {"document_name", "association_name", "name"},
	"synthetics_canary":             {"canary_name", "name"},
	"iot_role_alias":                {"role_alias_name", "name"},
	"iot_thing":                     {"thing_name", "name"},
	"greengrass_core":               {"core_device_name", "thing_name", "name"},
	"transfer_server":               {"server_name", "name"},
	"iam_roles_anywhere_session":    {"certificate_serial", "workload_name", "name"},
	"saas_vendor_role":              {"vendor_name", "role_name", "name"},
	"aws_service_linked_role":       {"service_name", "name"},
}

var intelEphemeralTypes = map[string]bool{
	"batch_job": true, "sagemaker_training_job": true, "sagemaker_processing_job": true,
	"ssm_automation": true, "terraform_run": true, "iam_roles_anywhere_session": true,
}

var intelRoleKeys = []string{
	"bound_role_arn", "role_arn", "task_role_arn", "execution_role_arn", "function_role_arn",
	"glue_role_arn", "state_machine_role_arn", "stateMachineRoleArn", "executionRoleArn",
	"service_role_arn", "job_role_arn", "serviceRoleArn", "roleArn", "execution_role",
}

// pyAttr is Python's str(attributes.get(key) or ""): falsy values are "".
func pyAttr(attrs map[string]any, key string) string {
	switch v := attrs[key].(type) {
	case string:
		return v
	case float64:
		if v == 0 {
			return ""
		}
		if v == float64(int64(v)) {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		if v {
			return "True"
		}
	}
	return ""
}

func pyFirstAttr(attrs map[string]any, keys ...string) string {
	for _, key := range keys {
		if v := pyAttr(attrs, key); v != "" {
			return v
		}
	}
	return ""
}

// lastARNPart is text.rsplit("/", 1)[-1].
func lastARNPart(value string) string {
	if i := strings.LastIndexByte(value, '/'); i >= 0 {
		return value[i+1:]
	}
	return value
}

func beforeColon(value string) string {
	if i := strings.IndexByte(value, ':'); i >= 0 {
		return value[:i]
	}
	return value
}

func intelCanonicalARN(sourceType, arn string) string {
	switch {
	case sourceType == "LAMBDA" && strings.Contains(arn, ":function:"):
		head, tail, _ := strings.Cut(arn, ":function:")
		return head + ":function:" + beforeColon(tail)
	case sourceType == "STEP_FUNCTIONS" && strings.Contains(arn, ":stateMachine:"):
		head, tail, _ := strings.Cut(arn, ":stateMachine:")
		return head + ":stateMachine:" + beforeColon(tail)
	}
	return arn
}

func intelServerlessName(sourceType, arn string, attrs map[string]any) string {
	switch sourceType {
	case "LAMBDA":
		if v := pyFirstAttr(attrs, "function_name", "name"); v != "" {
			return beforeColon(v)
		}
		if _, tail, ok := strings.Cut(arn, ":function:"); ok {
			return beforeColon(tail)
		}
	case "GLUE":
		if v := pyFirstAttr(attrs, "job_name", "name"); v != "" {
			return v
		}
		if _, tail, ok := strings.Cut(arn, ":job/"); ok {
			head, _, _ := strings.Cut(tail, "/")
			return head
		}
	case "STEP_FUNCTIONS":
		if v := pyFirstAttr(attrs, "state_machine_name", "stateMachineName", "name"); v != "" {
			return beforeColon(v)
		}
		if _, tail, ok := strings.Cut(arn, ":stateMachine:"); ok {
			return beforeColon(tail)
		}
	}
	return ""
}

func intelResourceName(identityType, arn string, attrs map[string]any) string {
	keys, ok := intelResourceKeys[identityType]
	if !ok {
		keys = []string{"name"}
	}
	for _, key := range keys {
		if v := pyAttr(attrs, key); v != "" {
			if strings.HasPrefix(v, "arn:") {
				return beforeColon(lastARNPart(v))
			}
			return beforeColon(v)
		}
	}
	if arn != "" && !intelEphemeralTypes[identityType] {
		return beforeColon(lastARNPart(arn))
	}
	return ""
}

// intelWorkloadKey recomputes the key the pipeline stores the baseline of a
// discovery row under (identity_discovery.normalize -> workload_key).
// sourceType is the pipeline's source_type; key is "" for unknown types.
func intelWorkloadKey(row common.DiscoveryIdentityRow, attrs map[string]any) (sourceType, key string) {
	identityType, sourceType, ok := intelResolveType(row.IdentityType)
	if !ok {
		return "", ""
	}
	account, region := row.AccountID, row.Region
	arn := intelCanonicalARN(sourceType, row.ARN)
	roleARN := pyFirstAttr(attrs, intelRoleKeys...)
	roleName := ""
	if roleARN != "" {
		roleName = lastARNPart(roleARN)
	}

	switch sourceType {
	case "EC2":
		profile := lastARNPart(pyFirstAttr(attrs, "iam_instance_profile_arn", "instance_profile_arn", "profile_arn"))
		if profile == "" {
			profile = "no-profile"
		}
		if roleName == "" {
			roleName = "no-role"
		}
		return sourceType, strings.Join([]string{"ec2", account, region, profile, roleName}, ":")

	case "LAMBDA", "GLUE", "STEP_FUNCTIONS":
		name := intelServerlessName(sourceType, arn, attrs)
		resourceKey := map[string]string{"LAMBDA": "function", "GLUE": "job", "STEP_FUNCTIONS": "state_machine"}[sourceType]
		if name == "" {
			name = lastARNPart(pyAttr(attrs, resourceKey+"_arn"))
		}
		if name == "" {
			name = map[string]string{"LAMBDA": "unknown-function", "GLUE": "unknown-job", "STEP_FUNCTIONS": "unknown-state-machine"}[sourceType]
		}
		return sourceType, strings.Join([]string{strings.ToLower(sourceType), account, region, name}, ":")

	case "ECS":
		cluster := pyFirstAttr(attrs, "cluster_name", "cluster")
		if cluster == "" {
			cluster = lastARNPart(pyAttr(attrs, "cluster_arn"))
		}
		if cluster == "" {
			cluster = "unknown-cluster"
		}
		service := pyFirstAttr(attrs, "service_name", "service")
		if service == "" {
			service = lastARNPart(pyAttr(attrs, "service_arn"))
		}
		if service == "" {
			taskDefinition := lastARNPart(pyAttr(attrs, "task_definition_arn"))
			if i := strings.LastIndexByte(taskDefinition, ':'); i >= 0 {
				taskDefinition = taskDefinition[:i]
			}
			service = taskDefinition
		}
		if service == "" {
			service = "unknown-service"
		}
		role := roleARN
		if role == "" {
			role = "no-role"
		}
		return sourceType, strings.Join([]string{"ecs", account, region, cluster, service, role}, ":")
	}

	name := intelResourceName(identityType, arn, attrs)
	if name == "" {
		name = roleName
	}
	if name == "" {
		name = "unknown-workload"
	}
	return sourceType, strings.Join([]string{strings.ToLower(sourceType), account, region, identityType, name}, ":")
}

// intelRoleContexts are the suffixes the pipeline appends to a key when an
// AWS service assumed one of the identity's roles ("<key>:task",
// "<arn>_execution", ...).
var intelRoleContexts = []string{
	"task", "execution", "job", "crawler", "state_machine", "service", "bound", "role",
	"instance_profile", "managed_node", "pipeline", "session", "service_linked",
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

// rawIdentity is one latest discovery snapshot (identities row) and the
// fleet principals the backend normalized it into.
type rawIdentity struct {
	row     common.DiscoveryIdentityRow
	attrs   map[string]any
	subtype string // the pipeline's NHI type ("" when it does not monitor the type)
	fleet   []int  // indexes into identityMapper.fleet
}

// identityMatch is one discovery identity a baseline belongs to: the
// identities row (raw) and, when the backend fleet has one for the same
// role, the monitored principal (fleet, -1 when none).
type identityMatch struct {
	raw   int
	fleet int
}

// identityMapper maps baseline keys onto the caller's discovery identities.
type identityMapper struct {
	fleet      []common.MonitoredIdentity
	raw        []rawIdentity
	rawByID    map[string]int
	byKey      map[common.MonitoringKey][]int // fleet indexes
	byWorkload map[common.MonitoringKey][]int // fleet indexes
	byARN      map[common.MonitoringKey][]int // fleet indexes
	byIntel    map[common.MonitoringKey][]int // pipeline workload key -> raw indexes
	ecsTasks   map[string][]int               // account + "|" + region -> raw indexes of ECS tasks
}

func ecsScopeKey(account, region string) string {
	return account + "|" + strings.ToLower(region)
}

func newIdentityMapper(fleet []common.MonitoredIdentity, rows []common.DiscoveryIdentityRow) *identityMapper {
	m := &identityMapper{
		fleet:      fleet,
		rawByID:    map[string]int{},
		byKey:      map[common.MonitoringKey][]int{},
		byWorkload: map[common.MonitoringKey][]int{},
		byARN:      map[common.MonitoringKey][]int{},
		byIntel:    map[common.MonitoringKey][]int{},
		ecsTasks:   map[string][]int{},
	}
	for _, row := range rows {
		id := strings.TrimSpace(row.ID)
		if _, duplicate := m.rawByID[id]; duplicate || id == "" {
			continue
		}
		attrs := map[string]any{}
		if len(row.TypeAttributes) > 0 {
			_ = json.Unmarshal(row.TypeAttributes, &attrs)
		}
		subtype, _, _ := intelResolveType(row.IdentityType)
		m.raw = append(m.raw, rawIdentity{row: row, attrs: attrs, subtype: subtype})
		index := len(m.raw) - 1
		m.rawByID[id] = index
		if subtype == "ecs_task" {
			k := ecsScopeKey(row.AccountID, row.Region)
			m.ecsTasks[k] = append(m.ecsTasks[k], index)
		}
		if sourceType, key := intelWorkloadKey(row, attrs); key != "" {
			k := common.MonitoringKey{SourceType: sourceType, IdentityName: key}
			m.byIntel[k] = append(m.byIntel[k], index)
		}
	}
	for i, id := range fleet {
		if r, ok := m.rawByID[strings.TrimSpace(id.DiscoveryIdentityID)]; ok {
			m.raw[r].fleet = append(m.raw[r].fleet, i)
		}
		m.byKey[id.Key] = append(m.byKey[id.Key], i)
		if wk, ok := id.WorkloadMonitoringKey(); ok {
			m.byWorkload[wk] = append(m.byWorkload[wk], i)
		}
		for _, arn := range []string{id.ResourceARN, id.Key.IdentityName} {
			if strings.HasPrefix(arn, "arn:") {
				k := common.MonitoringKey{SourceType: id.Key.SourceType, IdentityName: arn}
				m.byARN[k] = appendUnique(m.byARN[k], i)
			}
		}
	}
	return m
}

// resolution is the result of identityMapper.Resolve.
type resolution struct {
	Matches   []identityMatch
	MatchedBy string
	// Role is the role ARN the key itself names ("" unless it is an ECS
	// event key).
	Role string
	// Context is the pipeline role context the key carries (task,
	// execution, job, service, ...): the role the baseline is for, which
	// identity_credentials.binding_type names (see bindingTypesForContext).
	Context string
}

// Resolve returns the discovery identities the baseline key belongs to
// (restricted to accountID when it is set) and the role it is for.
func (m *identityMapper) Resolve(sourceType, identityName, accountID string) resolution {
	key := common.MonitoringKey{SourceType: sourceType, IdentityName: identityName}
	out := resolution{}
	parsedECS, isECS := workloadtypes.ECSKey{}, false
	if sourceType == "ECS" {
		parsedECS, isECS = workloadtypes.ParseECSKey(identityName)
		if isECS {
			out.Role, out.Context = parsedECS.RoleARN, parsedECS.Context
		}
	}
	fromFleet := func(indexes []int) []identityMatch {
		var found []identityMatch
		for _, i := range indexes {
			if r, ok := m.rawByID[strings.TrimSpace(m.fleet[i].DiscoveryIdentityID)]; ok {
				found = append(found, identityMatch{raw: r, fleet: i})
			}
		}
		return m.inAccount(found, accountID)
	}
	fromRaw := func(indexes []int, context string) []identityMatch {
		var found []identityMatch
		for _, r := range indexes {
			found = append(found, identityMatch{raw: r, fleet: m.preferredFleet(r, out.Role, context)})
		}
		return m.inAccount(found, accountID)
	}
	done := func(found []identityMatch, by string) resolution {
		out.Matches, out.MatchedBy = found, by
		return out
	}

	if found := fromFleet(m.byKey[key]); len(found) > 0 {
		return done(found, MatchIdentityKey)
	}
	if found := fromFleet(m.byWorkload[key]); len(found) > 0 {
		return done(found, MatchWorkloadKey)
	}
	if found := fromFleet(m.byARN[key]); len(found) > 0 {
		return done(found, MatchResourceARN)
	}
	if found := fromRaw(m.byIntel[key], out.Context); len(found) > 0 {
		return done(found, MatchPipelineWorkloadKey)
	}
	for _, context := range intelRoleContexts {
		if trimmed, ok := strings.CutSuffix(identityName, ":"+context); ok {
			if found := fromRaw(m.byIntel[common.MonitoringKey{SourceType: sourceType, IdentityName: trimmed}], context); len(found) > 0 {
				out.Context = context
				return done(found, MatchPipelineWorkloadKey)
			}
		}
		if trimmed, ok := strings.CutSuffix(identityName, "_"+context); ok && strings.HasPrefix(trimmed, "arn:") {
			k := common.MonitoringKey{SourceType: sourceType, IdentityName: trimmed}
			if found := fromFleet(dedupe(append(append([]int{}, m.byKey[k]...), m.byARN[k]...))); len(found) > 0 {
				out.Context = context
				return done(found, MatchResourceARN)
			}
		}
	}
	if isECS {
		if found := fromRaw(m.matchECS(parsedECS), out.Context); len(found) > 0 {
			return done(found, MatchECSTaskRole)
		}
	}
	return out
}

// inAccount drops matches outside accountID and repeated discovery rows.
func (m *identityMapper) inAccount(matches []identityMatch, accountID string) []identityMatch {
	var out []identityMatch
	seen := map[int]bool{}
	for _, match := range matches {
		if seen[match.raw] || (accountID != "" && m.raw[match.raw].row.AccountID != accountID) {
			continue
		}
		seen[match.raw] = true
		out = append(out, match)
	}
	return out
}

// preferredFleet picks the fleet principal of a discovery row for role and
// role context. An ECS task expanded into per-role principals (from
// identity_credentials task_role / execution_role bindings) only matches
// the principal of that role, preferring the one whose role kind is the
// context; other identities have one principal, which is used.
func (m *identityMapper) preferredFleet(r int, role, context string) int {
	candidates := m.raw[r].fleet
	if role != "" {
		best := -1
		for _, i := range candidates {
			if m.fleet[i].RoleARN != role {
				continue
			}
			if context != "" && m.fleet[i].RoleKind == context {
				return i
			}
			if best < 0 {
				best = i
			}
		}
		if best >= 0 {
			return best
		}
	}
	if role == "" && context != "" {
		for _, i := range candidates {
			if m.fleet[i].RoleKind == context {
				return i
			}
		}
	}
	if len(candidates) == 1 {
		id := m.fleet[candidates[0]]
		if role == "" || id.Key.SourceType != "ECS" || id.RoleKind == "" {
			return candidates[0]
		}
	}
	return -1
}

// matchECS finds the ECS tasks (raw indexes) in the key's account and
// region that use the key's role, narrowed by the role's binding (task vs
// execution), then by cluster and then by service when that leaves any.
func (m *identityMapper) matchECS(key workloadtypes.ECSKey) []int {
	var candidates []int
	for _, r := range m.ecsTasks[ecsScopeKey(key.Account, key.Region)] {
		if m.rawRoles(r)[key.RoleARN] {
			candidates = append(candidates, r)
		}
	}
	if bindings := bindingTypesForContext(key.Context); len(bindings) > 0 {
		candidates = narrow(candidates, func(r int) bool {
			kinds := m.ecsRoleBindings(r, key.RoleARN)
			for _, b := range bindings {
				if kinds[b] {
					return true
				}
			}
			return false
		})
	}
	candidates = narrow(candidates, func(r int) bool { return ecsClusterMatches(m.raw[r].attrs, key.Cluster) })
	candidates = narrow(candidates, func(r int) bool { return ecsServiceMatches(m.raw[r].attrs, key.Service) })
	return candidates
}

// ecsRoleBindings is how an ECS discovery row binds role: task_role and/or
// execution_role, from its role attributes, its type_attributes.credentials
// and the fleet principals expanded from identity_credentials.
func (m *identityMapper) ecsRoleBindings(r int, role string) map[string]bool {
	kinds := map[string]bool{}
	attrs := m.raw[r].attrs
	for binding, keys := range map[string][]string{
		"task_role":      {"task_role_arn", "taskRoleArn"},
		"execution_role": {"execution_role_arn", "executionRoleArn"},
	} {
		for _, k := range keys {
			if strings.TrimSpace(pyAttr(attrs, k)) == role {
				kinds[binding] = true
			}
		}
	}
	for _, c := range attributeCredentials(attrs) {
		if c.ARN == role {
			kinds[normalizeBinding(c.Binding)] = true
		}
	}
	for _, i := range m.raw[r].fleet {
		if m.fleet[i].RoleARN == role && m.fleet[i].RoleKind != "" {
			kinds[m.fleet[i].RoleKind+"_role"] = true
		}
	}
	return kinds
}

// bindingTypesForContext maps a pipeline role context (the suffix the
// pipeline puts on a role-specific key, service_resolution.py
// _ROLE_CONTEXT_FIELDS and its per-type defaults) onto the
// identity_credentials.binding_type values that bind such a role, most
// specific first. nil means any binding.
func bindingTypesForContext(context string) []string {
	switch context {
	case "":
		return nil
	case "task":
		return []string{"task_role"}
	case "execution":
		return []string{"execution_role", "function_role", "scheduler_role", "automation_role"}
	case "job", "crawler":
		return []string{"job_role", "service_role"}
	case "state_machine":
		return []string{"execution_role", "service_role", "target_role"}
	case "service", "service_linked":
		return []string{"service_role"}
	case "pipeline":
		return []string{"service_role", "action_role"}
	case "instance_profile", "managed_node":
		return []string{"instance_profile", "instance_role"}
	case "session":
		return []string{"roles_anywhere"}
	case "role", "bound":
		return nil
	}
	return []string{context + "_role"}
}

// rawRoles is every role ARN a discovery row is known to use: its role
// attributes, its type_attributes.credentials array and the principals the
// fleet expanded it into.
func (m *identityMapper) rawRoles(r int) map[string]bool {
	roles := map[string]bool{}
	attrs := m.raw[r].attrs
	for _, k := range append([]string{"taskRoleArn", "iam_role_arn"}, intelRoleKeys...) {
		if v := strings.TrimSpace(pyAttr(attrs, k)); strings.HasPrefix(v, "arn:") {
			roles[v] = true
		}
	}
	for _, credential := range attributeCredentials(attrs) {
		roles[credential.ARN] = true
	}
	for _, i := range m.raw[r].fleet {
		for _, v := range []string{m.fleet[i].RoleARN, m.fleet[i].TaskRoleARN, m.fleet[i].ExecutionRoleARN} {
			if v != "" {
				roles[v] = true
			}
		}
	}
	return roles
}

// RoleFor is the role ARN a baseline mapped to match is for: the role its
// key names, else (EC2) the role whose name ends the key, else the role the
// pipeline itself attributes to the row (identity_discovery._role_arn).
func (m *identityMapper) RoleFor(match identityMatch, sourceType, identityName, keyRole string) string {
	if keyRole != "" {
		return keyRole
	}
	if sourceType == "EC2" && strings.HasPrefix(identityName, "ec2:") {
		roleName := identityName[strings.LastIndexByte(identityName, ':')+1:]
		if roleName != "" && roleName != "no-role" {
			roles := m.rawRoles(match.raw)
			names := make([]string, 0, len(roles))
			for role := range roles {
				names = append(names, role)
			}
			sort.Strings(names)
			for _, role := range names {
				if lastARNPart(role) == roleName {
					return role
				}
			}
		}
	}
	if role := pyFirstAttr(m.raw[match.raw].attrs, intelRoleKeys...); strings.HasPrefix(role, "arn:") {
		return role
	}
	if match.fleet >= 0 {
		return m.fleet[match.fleet].RoleARN
	}
	return ""
}

// attributeCredential is one entry of type_attributes.credentials.
type attributeCredential struct {
	ARN     string
	Binding string // the scanner's binding: TaskRole, ExecutionRole, InstanceProfile, ...
	Kind    string // credential_kind: temporary, long_lived, ...
}

func attributeCredentials(attrs map[string]any) []attributeCredential {
	items, _ := attrs["credentials"].([]any)
	var out []attributeCredential
	for _, item := range items {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		arn := strings.TrimSpace(pyAttr(entry, "identifier"))
		if !strings.HasPrefix(arn, "arn:") {
			continue
		}
		out = append(out, attributeCredential{ARN: arn, Binding: pyAttr(entry, "binding"), Kind: pyAttr(entry, "credential_kind")})
	}
	return out
}

func ecsClusterMatches(attrs map[string]any, cluster string) bool {
	if cluster == "" || cluster == "unknown-cluster" {
		return false
	}
	want := lastARNPart(cluster)
	for _, k := range []string{"cluster_arn", "clusterArn", "cluster", "cluster_name", "clusterName"} {
		v := strings.TrimSpace(pyAttr(attrs, k))
		if v != "" && (v == cluster || lastARNPart(v) == want) {
			return true
		}
	}
	return false
}

func ecsServiceMatches(attrs map[string]any, service string) bool {
	group := pyFirstAttr(attrs, "group", "task_group", "taskGroup")
	if family, ok := strings.CutPrefix(service, "standalone:"); ok {
		if g, ok := strings.CutPrefix(group, "family:"); ok && g == family {
			return true
		}
		for _, k := range []string{"task_definition_family", "task_definition_arn", "taskDefinitionArn", "task_definition", "taskDefinition"} {
			v := lastARNPart(pyAttr(attrs, k))
			if i := strings.LastIndexByte(v, ':'); i >= 0 {
				v = v[:i]
			}
			if v != "" && v == family {
				return true
			}
		}
		return false
	}
	if g, ok := strings.CutPrefix(group, "service:"); ok && g == service {
		return true
	}
	for _, k := range []string{"service_name", "serviceName", "service", "ecs_service_name", "ecsServiceName"} {
		if v := pyAttr(attrs, k); v != "" && lastARNPart(v) == service {
			return true
		}
	}
	return false
}

// narrow keeps the elements matching keep, unless none do.
func narrow(values []int, keep func(int) bool) []int {
	var out []int
	for _, v := range values {
		if keep(v) {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return values
	}
	return out
}

func appendUnique(values []int, v int) []int {
	for _, existing := range values {
		if existing == v {
			return values
		}
	}
	return append(values, v)
}

func dedupe(values []int) []int {
	var out []int
	for _, v := range values {
		out = appendUnique(out, v)
	}
	sort.Ints(out)
	return out
}
