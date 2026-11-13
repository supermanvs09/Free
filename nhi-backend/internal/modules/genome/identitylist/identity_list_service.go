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
	"nhi-backend-api/internal/platform/database"
	"nhi-backend-api/internal/platform/scope"
)

// Service implements GET /api/v1/genome/identities.
//
// The list shows only identities the behaviour pipeline has a baselines row
// for (learning or active), in the caller's accounts. Each row is mapped to
// the discovery identities it belongs to — the identities row plus the
// credentials row (IAM role) the baseline is for, joined through
// identity_credentials — see "Baseline -> discovery identity mapping" below.
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
		if isGhostECSBaseline(row) {
			continue
		}
		entry := newListEntry(mapper, row)
		if _, mapped := entry.primary(); !mapped && entry.region != "" && !regions[entry.region] {
			continue // an unmapped baseline outside the caller's selected regions
		}
		if !matchesFilters(entry, params) {
			continue
		}
		entries = append(entries, entry)
	}

	var (
		risk     map[common.MonitoringKey]common.IdentityRiskSnapshotRow
		lastSeen map[common.MonitoringKey]time.Time
	)

	switch params.Sort {
	case SortRiskDesc:
		risk = s.riskFor(ctx, resolvedScope, entries)
	case SortLastSeenDesc:
		lastSeen = s.lastSeenFor(ctx, entries)
	}

	for index := range entries {
		if row, ok := bestRisk(risk, entries[index]); ok {
			entries[index].score = row.RiskScore
		}
		entries[index].lastSeen = latestSeen(lastSeen, entries[index])
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
	if lastSeen == nil {
		lastSeen = s.lastSeenFor(ctx, entries)
	}

	s.attachCredentials(ctx, resolvedScope, entries)

	openAlerts, alertsErr := s.repo.OpenAlertCounts(ctx, resolvedScope, listKeys(entries))
	alertsOK := common.ReadOK("identity list open alerts", alertsErr)

	response := &Response{ActivityKnown: lastSeen != nil, Items: make([]Item, 0, len(entries))}
	for _, entry := range entries {
		item := buildItem(entry)

		if row, ok := bestRisk(risk, entry); ok {
			item.Risk = RiskSnapshot{
				Score:    row.RiskScore,
				Severity: common.OptionalString(row.Severity),
				Status:   common.OptionalString(row.ScoreStatus),
			}
		}
		item.LastSeen = latestSeen(lastSeen, entry)

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

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

// mappedIdentity is one discovery identity of an entry.
type mappedIdentity struct {
	raw         rawIdentity
	fleet       *common.MonitoredIdentity // nil: no fleet principal for this role
	role        string                    // role ARN the baseline is for ("" unknown)
	roleFromKey bool                      // role is named by the baseline key itself (ECS)
	credential  *Credential               // filled for the page by attachCredentials
}

type listEntry struct {
	row         BaselineRow
	matches     []mappedIdentity // primary first
	matchedBy   string
	keyRole     string                 // role the baseline key names (ECS)
	context     string                 // role context of the key (task, execution, ...)
	extraKeys   []common.MonitoringKey // pipeline event-identity names (alerts / risk)
	sortID      string
	displayName string
	region      string
	score       *int
	lastSeen    *time.Time
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
	for _, match := range res.Matches {
		mapped := mappedIdentity{
			raw:         mapper.raw[match.raw],
			role:        mapper.RoleFor(match, row.Key.SourceType, row.Key.IdentityName, res.Role),
			roleFromKey: res.Role != "",
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

	if alertKey, ok := ecsEventIdentityKey(row.Key); ok {
		entry.extraKeys = append(entry.extraKeys, alertKey)
	}
	// Alerts and risk of non-ECS identities are stored under the
	// identity's canonical ARN, which the fleet may not have (dedupe).
	if row.Key.SourceType != "ECS" {
		for _, match := range entry.matches {
			if arn := intelCanonicalARN(row.Key.SourceType, match.raw.row.ARN); strings.HasPrefix(arn, "arn:") {
				entry.extraKeys = append(entry.extraKeys, common.MonitoringKey{SourceType: row.Key.SourceType, IdentityName: arn})
			}
		}
	}

	entry.displayName = row.Key.IdentityName
	entry.region = keyRegion(row.Key.IdentityName)
	if primary, ok := entry.primary(); ok {
		display := primary.raw.row.Name
		if primary.fleet != nil {
			display = common.FirstNonEmpty(primary.fleet.DisplayName, display)
		}
		entry.displayName = common.FirstNonEmpty(display, primary.raw.row.ARN, row.Key.IdentityName)
		entry.region = common.FirstNonEmpty(primary.raw.row.Region, entry.region)
	}
	return entry
}

func (e listEntry) primary() (mappedIdentity, bool) {
	if len(e.matches) == 0 {
		return mappedIdentity{}, false
	}
	return e.matches[0], true
}

// fleetIdentities are the matched principals the backend fleet has.
func (e listEntry) fleetIdentities() []common.MonitoredIdentity {
	var out []common.MonitoredIdentity
	for _, m := range e.matches {
		if m.fleet != nil {
			out = append(out, *m.fleet)
		}
	}
	return out
}

// keys is the baseline key, the pipeline's event-identity names and every
// mapped principal's keys, unique.
func (e listEntry) keys() []common.MonitoringKey {
	out := []common.MonitoringKey{e.row.Key}
	seen := map[common.MonitoringKey]struct{}{e.row.Key: {}}
	add := func(key common.MonitoringKey) {
		if _, duplicate := seen[key]; !duplicate {
			seen[key] = struct{}{}
			out = append(out, key)
		}
	}
	for _, key := range e.extraKeys {
		add(key)
	}
	for _, identity := range e.fleetIdentities() {
		for _, key := range identity.AllKeys() {
			add(key)
		}
	}
	return out
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
	values := []string{row.Key.IdentityName, entry.displayName}
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

// ---------------------------------------------------------------------------
// Credentials (identity_credentials -> credentials)
// ---------------------------------------------------------------------------

// attachCredentials resolves, for the page's entries only, the credential
// each mapped identity's baseline is for. Failures leave credentials with
// only what type_attributes and the baseline key say.
func (s *Service) attachCredentials(ctx context.Context, resolvedScope *scope.DataScope, entries []listEntry) {
	var ids, arns []string
	seenID, seenARN := map[string]bool{}, map[string]bool{}
	for _, entry := range entries {
		for i, m := range entry.matches {
			if i == MaxDiscoveryPerItem {
				break
			}
			if id := strings.TrimSpace(m.raw.row.ID); id != "" && !seenID[id] {
				seenID[id] = true
				ids = append(ids, id)
			}
			if arn := m.raw.row.ARN; arn != "" && !seenARN[arn] {
				seenARN[arn] = true
				arns = append(arns, arn)
			}
		}
	}
	if len(ids) == 0 {
		return
	}

	bindings, err := s.repo.CredentialBindings(ctx, resolvedScope, ids, arns)
	if !common.ReadOK("identity list credential bindings", err) {
		bindings = nil
	}
	byIdentityID, byIdentityARN := map[string][]CredentialBinding{}, map[string][]CredentialBinding{}
	for _, b := range bindings {
		if b.IdentityID != "" {
			byIdentityID[b.IdentityID] = append(byIdentityID[b.IdentityID], b)
		}
		if b.IdentityARN != "" {
			byIdentityARN[b.IdentityARN] = append(byIdentityARN[b.IdentityARN], b)
		}
	}

	var credentialARNs, credentialIDs []string
	seenCredential := map[string]bool{}
	addCredential := func(list *[]string, v string) {
		if v != "" && !seenCredential[v] {
			seenCredential[v] = true
			*list = append(*list, v)
		}
	}
	for _, entry := range entries {
		for _, m := range entry.matches {
			addCredential(&credentialARNs, m.role)
		}
	}
	for _, b := range bindings {
		addCredential(&credentialARNs, b.CredentialARN)
		if b.CredentialARN == "" {
			addCredential(&credentialIDs, b.CredentialID)
		}
	}
	credentials, err := s.repo.Credentials(ctx, resolvedScope, credentialARNs, credentialIDs)
	if !common.ReadOK("identity list credentials", err) {
		credentials = map[string]CredentialRow{}
	}

	for e := range entries {
		for i := range entries[e].matches {
			if i == MaxDiscoveryPerItem {
				break
			}
			m := &entries[e].matches[i]
			candidates := byIdentityID[strings.TrimSpace(m.raw.row.ID)]
			if len(candidates) == 0 {
				candidates = byIdentityARN[m.raw.row.ARN]
			}
			m.credential = chooseCredential(*m, entries[e].context, candidates, credentials)
		}
	}
}

// chooseCredential picks the credential the baseline is for, from the
// identity's identity_credentials bindings:
//
//  1. the key names the role (ECS event keys): the binding of that role,
//     preferring the binding_type of the key's role context;
//  2. the key carries a role context (":task", ":execution", ":job", ...):
//     the binding whose binding_type is that context's
//     (bindingTypesForContext), e.g. execution -> execution_role;
//  3. a role inferred from type_attributes: the binding of that role;
//  4. otherwise the identity's primary binding.
//
// With no matching binding row, a known role is still reported, with its
// binding taken from type_attributes.credentials or the key's context.
func chooseCredential(m mappedIdentity, context string, bindings []CredentialBinding, credentials map[string]CredentialRow) *Credential {
	credentialARN := func(b CredentialBinding) string {
		if b.CredentialARN != "" {
			return b.CredentialARN
		}
		return credentials[b.CredentialID].ARN
	}
	types := bindingTypesForContext(context)
	rank := func(b CredentialBinding) int {
		for i, t := range types {
			if b.BindingType == t {
				return i
			}
		}
		return len(types)
	}
	// best is the lowest-rank binding accepted by keep; ties keep the
	// repository order (primary first, then most recently updated).
	best := func(keep func(CredentialBinding) bool) *CredentialBinding {
		var chosen *CredentialBinding
		for i := range bindings {
			if !keep(bindings[i]) {
				continue
			}
			if chosen == nil || rank(bindings[i]) < rank(*chosen) {
				chosen = &bindings[i]
			}
		}
		return chosen
	}
	ofRole := func(b CredentialBinding) bool { return m.role != "" && credentialARN(b) == m.role }
	ofContext := func(b CredentialBinding) bool { return rank(b) < len(types) }

	var chosen *CredentialBinding
	switch {
	case m.roleFromKey:
		chosen = best(ofRole)
	case len(types) > 0:
		if chosen = best(ofContext); chosen == nil {
			chosen = best(ofRole)
		}
	case m.role != "":
		chosen = best(ofRole)
	case len(bindings) > 0:
		chosen = &bindings[0]
	}

	out := &Credential{}
	switch {
	case chosen != nil:
		out.ARN = credentialARN(*chosen)
		out.BindingType = common.OptionalString(chosen.BindingType)
		out.BindingSource = common.OptionalString(chosen.BindingSource)
		primary := chosen.IsPrimary
		out.IsPrimary = &primary
	case m.role != "":
		out.ARN = m.role
		source := "type_attributes"
		bindingType := ""
		for _, c := range attributeCredentials(m.raw.attrs) {
			if c.ARN == m.role {
				bindingType = normalizeBinding(c.Binding)
				break
			}
		}
		if bindingType == "" && len(types) > 0 {
			bindingType, source = types[0], "baseline_key"
		}
		out.BindingType = common.OptionalString(bindingType)
		out.BindingSource = &source
	default:
		return nil
	}
	if out.ARN == "" {
		return nil
	}
	if c, ok := credentials[out.ARN]; ok {
		out.CredentialID = common.OptionalString(c.ID)
		out.Name = common.OptionalString(c.Name)
		out.CredentialType = common.OptionalString(c.CredentialType)
		out.Status = common.OptionalString(c.Status)
		out.PrivilegeLevel = common.OptionalString(c.PrivilegeLevel)
		out.LastUsedAt = c.LastUsedAt
	}
	if out.Name == nil {
		out.Name = common.OptionalString(lastARNPart(out.ARN))
	}
	return out
}

// normalizeBinding maps the scanner's type_attributes binding names onto
// identity_credentials.binding_type values.
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
	item := Item{
		ID:           entry.sortID,
		SourceType:   row.Key.SourceType,
		IdentityName: row.Key.IdentityName,
		DisplayName:  entry.displayName,
		WorkloadKey:  row.Key.IdentityName,
		AccountID:    row.AccountID,
		Region:       common.OptionalString(entry.region),
		Baseline: BaselineSummary{
			Status:        common.OptionalString(row.Status),
			BuiltDays:     common.IntPtr(row.BuiltDays),
			RequiredDays:  common.IntPtr(row.RequiredDays),
			DaysRemaining: common.IntPtr(row.DaysRemaining),
			ActiveSince:   row.ActiveSince,
			UpdatedAt:     row.UpdatedAt,
		},
		Mapping: Mapping{
			Status:         MappingUnmapped,
			DiscoveryCount: len(entry.matches),
		},
		DiscoveryIdentities: make([]DiscoveryIdentity, 0, min(len(entry.matches), MaxDiscoveryPerItem)),
		// The baseline panel looks the requested key up first, so it gets
		// the baselines row's own key.
		Links: Links{Baseline: common.IdentityLinksFor(row.Key.SourceType, row.Key.IdentityName).Baseline},
	}
	if row.FirstSeenDate != nil {
		day := row.FirstSeenDate.Format(time.DateOnly)
		item.Baseline.FirstSeenDate = &day
	}

	primary, ok := entry.primary()
	if !ok {
		return item
	}
	item.Mapping.Status = MappingMapped
	item.Mapping.MatchedBy = common.OptionalString(entry.matchedBy)
	item.NHIIdentityType = nhiIdentityType(primary)
	item.Status = common.OptionalString(primary.raw.row.Status)
	item.InventoryID = common.OptionalString(primary.raw.row.ID)
	item.ResourceARN = common.OptionalString(primary.raw.row.ARN)
	item.Credential = primary.credential
	item.RoleARN = common.OptionalString(primary.role)
	if primary.credential != nil {
		item.RoleARN = common.OptionalString(primary.credential.ARN)
	}
	if primary.fleet != nil {
		f := primary.fleet
		item.ServiceName = common.OptionalString(f.ServiceName)
		item.PrincipalARN = common.OptionalString(f.PrincipalARN)
		item.RoleKind = common.OptionalString(common.FirstNonEmpty(f.RoleKind, entry.context))
		item.RoleType = common.OptionalString(f.RoleType)
		item.ClusterARN = common.OptionalString(f.ClusterARN)
		// Activity, genome and timeline resolve the identity through the
		// discovery fleet, so they use the fleet key.
		links := common.IdentityLinksFor(f.Key.SourceType, f.Key.IdentityName)
		item.Links.Activity, item.Links.Genome, item.Links.Timeline = &links.Activity, &links.Genome, &links.Timeline
	}

	if item.RoleKind == nil {
		item.RoleKind = common.OptionalString(entry.context)
	}

	for i, m := range entry.matches {
		if i == MaxDiscoveryPerItem {
			break
		}
		identity := DiscoveryIdentity{
			InventoryID:     m.raw.row.ID,
			ARN:             m.raw.row.ARN,
			Name:            common.OptionalString(m.raw.row.Name),
			IdentityType:    m.raw.row.IdentityType,
			NHIIdentityType: common.OptionalString(nhiIdentityType(m)),
			AccountID:       m.raw.row.AccountID,
			Region:          common.OptionalString(m.raw.row.Region),
			Status:          common.OptionalString(m.raw.row.Status),
			LastSeenAt:      m.raw.row.LastSeenAt,
			Credential:      m.credential,
		}
		if m.fleet != nil {
			identity.GenomeKey = &GenomeKey{SourceType: m.fleet.Key.SourceType, IdentityName: m.fleet.Key.IdentityName}
		}
		item.DiscoveryIdentities = append(item.DiscoveryIdentities, identity)
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
// Risk, last seen, keys
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

func (s *Service) lastSeenFor(
	ctx context.Context,
	entries []listEntry,
) map[common.MonitoringKey]time.Time {
	// nil (not empty) when the events store cannot be read: last_seen is then
	// unknown, which the console must not read as "no activity".
	if s.events == nil {
		return nil
	}
	seen := map[common.MonitoringKey]struct{}{}
	keys := make([]common.MonitoringKey, 0, len(entries))
	for _, entry := range entries {
		for _, identity := range entry.fleetIdentities() {
			key := identity.EventKey()
			if _, duplicate := seen[key]; duplicate {
				continue
			}
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return map[common.MonitoringKey]time.Time{}
	}
	lastSeen, err := s.events.LastSeenByIdentity(ctx, keys)
	if !common.EventsReadOK("identity list last seen", err) {
		return nil
	}
	if lastSeen == nil {
		lastSeen = map[common.MonitoringKey]time.Time{}
	}
	return lastSeen
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

// latestSeen is the most recent last_seen among the entry's principals.
func latestSeen(lastSeen map[common.MonitoringKey]time.Time, entry listEntry) *time.Time {
	var latest *time.Time
	for _, identity := range entry.fleetIdentities() {
		if seenAt, ok := lastSeen[identity.EventKey()]; ok {
			if latest == nil || seenAt.After(*latest) {
				t := seenAt.UTC()
				latest = &t
			}
		}
	}
	return latest
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
	"step_function_state_machine": "step_function", "states_state_machine": "step_function",
	"state_machine": "step_function", "aws_stepfunctions_state_machine": "step_function",
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
	"eventbridge_scheduler":         {"schedule_name", "name"},
	"ssm_managed_node":              {"managed_instance_id", "instance_id", "name"},
	"ssm_automation":                {"document_name", "association_name", "name"},
	"synthetics_canary":             {"canary_name", "name"},
	"iot_role_alias":                {"role_alias_name", "name"},
	"iot_thing":                     {"thing_name", "name"},
	"greengrass_core":               {"core_device_name", "thing_name", "name"},
	"transfer_server":               {"server_id", "server_name", "name"},
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
// ECS event keys
// ---------------------------------------------------------------------------

type ecsEventKey struct {
	Account, Region, Cluster, Service, RoleARN, Context string
}

// parseECSEventKey splits
// ecs:<account>:<region>:<cluster>:<service>:<role-arn>[:<context>], where
// cluster may itself be an ARN and service may be "standalone:<family>".
func parseECSEventKey(key string) (ecsEventKey, bool) {
	rest, ok := strings.CutPrefix(key, "ecs:")
	if !ok {
		return ecsEventKey{}, false
	}
	parts := strings.SplitN(rest, ":", 3)
	if len(parts) < 3 || parts[0] == "" {
		return ecsEventKey{}, false
	}
	out := ecsEventKey{Account: parts[0], Region: parts[1]}
	remainder := parts[2]
	roleAt := strings.LastIndex(remainder, ":arn:")
	if roleAt < 0 {
		return ecsEventKey{}, false
	}
	tail := remainder[roleAt+1:]
	out.RoleARN = tail
	if i := strings.LastIndexByte(tail, ':'); i >= 0 && strings.Contains(tail[:i], ":role/") {
		out.RoleARN, out.Context = tail[:i], tail[i+1:]
	}
	if !strings.Contains(out.RoleARN, ":role/") {
		return ecsEventKey{}, false
	}
	head := remainder[:roleAt]
	if strings.HasPrefix(head, "arn:") {
		segments := strings.SplitN(head, ":", 7)
		if len(segments) < 7 {
			return ecsEventKey{}, false
		}
		out.Cluster, out.Service = strings.Join(segments[:6], ":"), segments[6]
	} else {
		cluster, service, found := strings.Cut(head, ":")
		if !found {
			return ecsEventKey{}, false
		}
		out.Cluster, out.Service = cluster, service
	}
	return out, true
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
	parsedECS, isECS := ecsEventKey{}, false
	if sourceType == "ECS" {
		parsedECS, isECS = parseECSEventKey(identityName)
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
func (m *identityMapper) matchECS(key ecsEventKey) []int {
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

// keyRegion is the region embedded in a pipeline key or ARN ("" if none).
func keyRegion(identityName string) string {
	parts := strings.SplitN(identityName, ":", 5)
	if strings.HasPrefix(identityName, "arn:") {
		if len(parts) >= 4 {
			return parts[3]
		}
		return ""
	}
	if len(parts) >= 3 {
		return parts[2]
	}
	return ""
}

// ecsEventIdentityKey is the name the pipeline stores the alerts and
// identity_risk_scores of an ECS baseline under (ecs_metadata.py
// ecs_identity_keys): "<service|standalone:family>_<role-name>_<context>".
// Only event-form keys (with a role context) have one.
func ecsEventIdentityKey(key common.MonitoringKey) (common.MonitoringKey, bool) {
	if key.SourceType != "ECS" {
		return common.MonitoringKey{}, false
	}
	parsed, ok := parseECSEventKey(key.IdentityName)
	if !ok || parsed.Context == "" || parsed.Service == "" {
		return common.MonitoringKey{}, false
	}
	return common.MonitoringKey{
		SourceType:   "ECS",
		IdentityName: parsed.Service + "_" + lastARNPart(parsed.RoleARN) + "_" + parsed.Context,
	}, true
}

// isGhostECSBaseline reports a baselines row the pipeline writes for every
// discovered ECS task under its discovery-form key
// (ecs:<account>:<region>:<cluster>:<service>:<role-arn|no-role>, no role
// context). ECS training always lands on the event-form key that ends in
// ":task" or ":execution", so such a row never learns anything; it is hidden
// unless it somehow has built days.
func isGhostECSBaseline(row BaselineRow) bool {
	if row.Key.SourceType != "ECS" || row.BuiltDays > 0 || !strings.HasPrefix(row.Key.IdentityName, "ecs:") {
		return false
	}
	last := row.Key.IdentityName[strings.LastIndexByte(row.Key.IdentityName, ':')+1:]
	return last == "no-role" || strings.HasPrefix(last, "role/")
}
