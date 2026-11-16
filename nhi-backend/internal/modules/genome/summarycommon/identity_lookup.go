package summarycommon

import (
	"context"
	"errors"
	"strings"

	"nhi-backend-api/internal/modules/genome/workloadtypes"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

// MonitoredIdentityLookup resolves the {source_type}/{identity_name} path used
// by the Genome identity endpoints.
//
// The lookup uses the same normalized identities as the dashboard:
//
//  1. Read the latest non-deleted discovery identities.
//  2. Load credential bindings from identity_credentials in one query.
//  3. Normalize each discovery identity.
//  4. Expand ECS task and execution roles into separate monitored identities.
//  5. Deduplicate identities by MonitoringKey.
type MonitoredIdentityLookup struct {
	discovery discoveryReader
	resolver  ScopeResolver
}

// discoveryReader contains the repository methods required by the identity
// lookup.
//
// DashboardSummaryRepository implements this interface.
type discoveryReader interface {
	LatestIdentities(
		ctx context.Context,
		resolved *scope.DataScope,
	) ([]DiscoveryIdentityRow, error)

	IdentityCredentials(
		ctx context.Context,
		resolved *scope.DataScope,
		identityIDs []string,
	) (
		map[string][]IdentityCredentialRow,
		error,
	)

	Baselines(
		ctx context.Context,
		resolved *scope.DataScope,
		f BaselineFilter,
	) ([]BaselineIdentity, error)
}

// NewMonitoredIdentityLookup creates a monitored identity lookup.
func NewMonitoredIdentityLookup(
	discovery *DashboardSummaryRepository,
	resolver ScopeResolver,
) *MonitoredIdentityLookup {
	return &MonitoredIdentityLookup{
		discovery: discovery,
		resolver:  resolver,
	}
}

// ErrIdentityNotFound reports an unknown monitoring identity inside the
// caller's tenant scope.
var ErrIdentityNotFound = errors.New("identity not found")

// resolvedIdentity contains the tenant scope and the identity resolved by an
// identity route.
//
// Baseline is set when the path names a baselines row (the identity list
// links every item by its baseline key): monitoring data is then read by that
// key — log_events by workload_key, baselines and baseline_versions by
// identity_name, alerts by the event identity names of the workload. Identity
// then describes the baseline, completed from its parent discovery identity
// when one is found. Baseline is nil for the older discovery-key paths.
type resolvedIdentity struct {
	Scope    *scope.DataScope
	Identity MonitoredIdentity
	Baseline *BaselineIdentity
}

// eventKeys are the names the baseline's log_events rows can carry
// (BaselineEventKeys): the baseline key, the ARN a serverless key names and,
// outside ECS, the parent resource's ARN. nil without a baseline.
func (r resolvedIdentity) eventKeys() []MonitoringKey {
	if r.Baseline == nil {
		return nil
	}
	var extra []string
	if r.Baseline.Key.SourceType != "ECS" && strings.HasPrefix(r.Identity.ResourceARN, "arn:") {
		extra = append(extra, r.Identity.ResourceARN)
	}
	return BaselineEventKeys(r.Baseline.Key, workloadtypes.ARNPartition(r.Identity.ResourceARN), extra...)
}

// EventName is the {identity_name} the log_events readers filter on (they
// match it against identity_name and workload_key). For a baseline it is the
// first of its event keys that log_events has rows for — the baseline key
// itself for ECS and EC2, the resource ARN for a registered serverless
// identity — else the baseline key; otherwise the discovery identity's event
// name. events may be nil.
func (r resolvedIdentity) EventName(ctx context.Context, events *MonitoringEvents) string {
	if r.Baseline == nil {
		return r.Identity.EventName()
	}
	keys := r.eventKeys()
	if len(keys) > 1 {
		facts, err := events.WorkloadFacts(ctx, r.Accounts(), keys)
		if EventsReadOK(ctx, "identity event name", err) {
			for _, k := range keys {
				if _, ok := facts[k]; ok {
					return k.IdentityName
				}
			}
		}
	}
	return r.Baseline.Key.IdentityName
}

// Accounts are the accounts the identity's monitoring rows live in: the
// baseline's account, else every account of the caller's scope.
func (r resolvedIdentity) Accounts() []string {
	if r.Baseline != nil && r.Baseline.AccountID != "" {
		return []string{r.Baseline.AccountID}
	}
	if r.Scope == nil {
		return nil
	}
	return r.Scope.AccountIDs
}

// BaselineKeys are the keys baselines / baseline_versions rows are looked up
// by, preferred first.
func (r resolvedIdentity) BaselineKeys() []MonitoringKey {
	if r.Baseline != nil {
		return []MonitoringKey{r.Baseline.Key}
	}
	return r.Identity.AllKeys()
}

// AlertKeys are the keys alerts rows are looked up by: the event keys of the
// baseline (or the discovery identity's keys) plus the event identity names
// log_events recorded under them. events may be nil; the names are then
// derived from the keys alone.
func (r resolvedIdentity) AlertKeys(ctx context.Context, events *MonitoringEvents) []MonitoringKey {
	groups := [][]MonitoringKey{r.eventKeys()}
	if r.Baseline == nil {
		groups = nil
		for _, k := range r.Identity.AllKeys() {
			groups = append(groups, []MonitoringKey{k})
		}
	}
	var all []MonitoringKey
	for _, g := range groups {
		all = append(all, g...)
	}
	facts, err := events.WorkloadFacts(ctx, r.Accounts(), all)
	if !EventsReadOK(ctx, "identity alert keys", err) {
		facts = nil
	}
	var out []MonitoringKey
	seen := map[MonitoringKey]struct{}{}
	for _, g := range groups {
		for _, k := range BaselineAlertKeys(g, facts) {
			if _, dup := seen[k]; !dup {
				seen[k] = struct{}{}
				out = append(out, k)
			}
		}
	}
	return out
}

// Resolve finds an identity by its exact source type and identity name.
//
// The identity name is looked up as a baselines key first (the key the
// identity list links every item by: an ECS task role and execution role are
// separate baselines with separate keys). Otherwise it is a discovery key:
// for ECS credential identities the task-role or execution-role ARN, for the
// other families the identity's own key or its workload key.
func (l *MonitoredIdentityLookup) Resolve(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	sourceType string,
	identityName string,
) (
	resolvedIdentity,
	error,
) {
	resolvedScope, err := l.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return resolvedIdentity{}, &StoreUnavailableError{Op: "resolve tenant scope", Err: err}
	}

	sourceType = strings.ToUpper(strings.TrimSpace(sourceType))
	identityName = strings.TrimSpace(identityName)

	baselines, err := l.discovery.Baselines(ctx, resolvedScope, BaselineFilter{SourceType: sourceType, IdentityName: identityName})
	if err != nil && !IsMonitoringTableMissing(err) {
		return resolvedIdentity{}, &StoreUnavailableError{Op: "read baselines", Err: err}
	}

	fleet, fleetErr := l.fleetIn(ctx, resolvedScope)

	if len(baselines) > 0 {
		baseline := baselines[0]
		if fleetErr != nil {
			// The parent discovery identity only completes the description.
			logging.FromContext(ctx).Warn("genome identity parent lookup failed", "err", fleetErr, "degraded", true)
			fleet = nil
		}
		return resolvedIdentity{
			Scope:    resolvedScope,
			Identity: baselineMonitoredIdentity(baseline, fleet),
			Baseline: &baseline,
		}, nil
	}
	if fleetErr != nil {
		return resolvedIdentity{}, fleetErr
	}

	for _, identity := range fleet {
		for _, key := range identity.AllKeys() {
			if !strings.EqualFold(strings.TrimSpace(key.SourceType), sourceType) {
				continue
			}
			if strings.TrimSpace(key.IdentityName) != identityName {
				continue
			}
			return resolvedIdentity{Scope: resolvedScope, Identity: identity}, nil
		}
	}

	return resolvedIdentity{}, ErrIdentityNotFound
}

// baselineMonitoredIdentity describes a baselines row as a monitored
// identity: the key's own facts (account, region, and for ECS the role, role
// kind, cluster and service), completed from the parent discovery identity.
func baselineMonitoredIdentity(b BaselineIdentity, fleet []MonitoredIdentity) MonitoredIdentity {
	name := b.Key.IdentityName
	id := MonitoredIdentity{
		Key:         b.Key,
		WorkloadKey: name,
		AccountID:   b.AccountID,
		Region:      workloadtypes.KeyRegion(name),
		DisplayName: workloadtypes.KeyDisplayName(name),
	}

	ecsKey, isECS := workloadtypes.ParseECSKey(name)
	if b.Key.SourceType == "ECS" && isECS {
		id.Subtype = "ecs_task"
		id.RoleARN = ecsKey.RoleARN
		id.PrincipalARN = ecsKey.RoleARN
		id.RoleName = lastPathSegment(ecsKey.RoleARN)
		id.RoleKind = ecsKey.Context
		switch ecsKey.Context {
		case "task":
			id.RoleType = "ECS_TASK_ROLE"
			id.TaskRoleARN = ecsKey.RoleARN
		case "execution":
			id.RoleType = "ECS_EXECUTION_ROLE"
			id.ExecutionRoleARN = ecsKey.RoleARN
		}
		if strings.HasPrefix(ecsKey.Cluster, "arn:") {
			id.ClusterARN = ecsKey.Cluster
			id.ClusterName = lastPathSegment(ecsKey.Cluster)
		} else {
			id.ClusterName = ecsKey.Cluster
		}
		if family, ok := strings.CutPrefix(ecsKey.Service, "standalone:"); ok {
			id.TaskGroup = "family:" + family
		} else {
			id.ServiceName = ecsKey.Service
			id.TaskGroup = "service:" + ecsKey.Service
		}
	}

	parent, exact := baselineParent(b, ecsKey, isECS, fleet)
	if parent == nil {
		return id
	}
	if exact {
		// The discovery principal of this very baseline: its labels win.
		id.DisplayName = firstNonEmpty(parent.DisplayName, id.DisplayName)
		id.RoleType = firstNonEmpty(parent.RoleType, id.RoleType)
		id.RoleARN = firstNonEmpty(id.RoleARN, parent.RoleARN)
		id.RoleName = firstNonEmpty(id.RoleName, parent.RoleName)
		id.PrincipalARN = firstNonEmpty(id.PrincipalARN, parent.PrincipalARN)
		id.RoleKind = firstNonEmpty(id.RoleKind, parent.RoleKind)
	} else if !isECS {
		id.DisplayName = firstNonEmpty(parent.DisplayName, id.DisplayName)
	}
	id.Subtype = firstNonEmpty(parent.Subtype, id.Subtype)
	id.Status = parent.Status
	id.Region = firstNonEmpty(id.Region, parent.Region)
	id.ServiceName = firstNonEmpty(id.ServiceName, parent.ServiceName)
	id.ClusterName = firstNonEmpty(id.ClusterName, parent.ClusterName)
	id.ClusterARN = firstNonEmpty(id.ClusterARN, parent.ClusterARN)
	id.TaskGroup = firstNonEmpty(id.TaskGroup, parent.TaskGroup)
	id.TaskDefinition = parent.TaskDefinition
	id.InstanceID = parent.InstanceID
	id.DiscoveryIdentityID = parent.DiscoveryIdentityID
	id.ResourceARN = parent.ResourceARN
	return id
}

// baselineParent finds the discovery identity a baseline belongs to: the
// fleet principal whose identity or workload key is the baseline key (exact),
// else, for an ECS key, the task in the key's account and region that uses
// the key's role, preferring the same cluster and role kind.
func baselineParent(b BaselineIdentity, ecsKey workloadtypes.ECSKey, isECS bool, fleet []MonitoredIdentity) (*MonitoredIdentity, bool) {
	for i := range fleet {
		if fleet[i].AccountID != "" && b.AccountID != "" && fleet[i].AccountID != b.AccountID {
			continue
		}
		for _, key := range fleet[i].AllKeys() {
			if strings.EqualFold(key.SourceType, b.Key.SourceType) && key.IdentityName == b.Key.IdentityName {
				return &fleet[i], true
			}
		}
	}
	if !isECS || b.Key.SourceType != "ECS" {
		return nil, false
	}
	clusterName := lastPathSegment(ecsKey.Cluster)
	best, bestScore := -1, -1
	for i := range fleet {
		f := fleet[i]
		if f.Key.SourceType != "ECS" || f.AccountID != ecsKey.Account || !strings.EqualFold(f.Region, ecsKey.Region) {
			continue
		}
		if f.RoleARN != ecsKey.RoleARN && f.TaskRoleARN != ecsKey.RoleARN && f.ExecutionRoleARN != ecsKey.RoleARN {
			continue
		}
		score := 0
		if f.ClusterARN == ecsKey.Cluster || (clusterName != "" && (f.ClusterName == clusterName || lastPathSegment(f.ClusterARN) == clusterName)) {
			score += 2
		}
		if ecsKey.Context != "" && f.RoleKind == ecsKey.Context {
			score++
		}
		if score > bestScore {
			best, bestScore = i, score
		}
	}
	if best < 0 {
		return nil, false
	}
	return &fleet[best], false
}

// Fleet returns every monitored identity inside the caller's tenant scope.
//
// Most discovery rows produce one monitored identity. An ECS task can produce
// two monitored identities:
//
//   - ECS task role
//   - ECS execution role
//
// When multiple discovery snapshots normalize to the same MonitoringKey, the
// most recently seen snapshot wins.
func (l *MonitoredIdentityLookup) Fleet(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
) (
	*scope.DataScope,
	[]MonitoredIdentity,
	error,
) {
	resolvedScope, err := l.resolver.Resolve(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return nil, nil, &StoreUnavailableError{
			Op:  "resolve tenant scope",
			Err: err,
		}
	}

	fleet, err := l.fleetIn(ctx, resolvedScope)
	if err != nil {
		return nil, nil, err
	}
	return resolvedScope, fleet, nil
}

// fleetIn builds the monitored identities of an already resolved scope.
func (l *MonitoredIdentityLookup) fleetIn(
	ctx context.Context,
	resolvedScope *scope.DataScope,
) ([]MonitoredIdentity, error) {
	rows, err := l.discovery.LatestIdentities(
		ctx,
		resolvedScope,
	)
	if err != nil {
		return nil, &StoreUnavailableError{
			Op:  "read discovery identities",
			Err: err,
		}
	}

	identityIDs := uniqueDiscoveryIdentityIDsForLookup(
		rows,
	)

	credentialsByIdentity, err :=
		l.discovery.IdentityCredentials(
			ctx,
			resolvedScope,
			identityIDs,
		)
	if err != nil {
		return nil, &StoreUnavailableError{
			Op:  "read identity credentials",
			Err: err,
		}
	}

	fleet := make(
		[]MonitoredIdentity,
		0,
		len(rows),
	)

	index := make(
		map[MonitoringKey]int,
		len(rows),
	)

	seen := make(
		map[MonitoringKey]*DiscoveryIdentityRow,
		len(rows),
	)

	for rowIndex := range rows {
		row := rows[rowIndex]

		baseIdentity, ok := NormalizeDiscoveryRow(
			row,
		)
		if !ok {
			continue
		}

		identityID := strings.TrimSpace(row.ID)

		credentials :=
			credentialsByIdentity[identityID]

		// An ECS task's task and execution roles are also listed in its
		// type_attributes.credentials; they fill bindings identity_credentials
		// lacks, so both role principals exist.
		if baseIdentity.Subtype == "ecs_task" {
			credentials = mergeCredentialRows(
				credentials,
				ECSCredentialsFromAttributes(row.TypeAttributes),
			)
		}

		identities := ExpandCredentialIdentities(
			baseIdentity,
			credentials,
		)

		for _, identity := range identities {
			key := normalizeLookupMonitoringKey(
				identity.Key,
			)

			if key.SourceType == "" ||
				key.IdentityName == "" {
				continue
			}

			identity.Key = key

			existingIndex, duplicate :=
				index[key]

			if duplicate {
				currentRow := seen[key]

				if newerSnapshot(
					row,
					currentRow,
				) {
					fleet[existingIndex] =
						identity

					seen[key] =
						&rows[rowIndex]
				}

				continue
			}

			index[key] = len(fleet)
			seen[key] = &rows[rowIndex]

			fleet = append(
				fleet,
				identity,
			)
		}
	}

	return fleet, nil
}

// uniqueDiscoveryIdentityIDsForLookup returns the unique discovery identity
// IDs used to load identity_credentials in one query.
func uniqueDiscoveryIdentityIDsForLookup(
	rows []DiscoveryIdentityRow,
) []string {
	identityIDs := make(
		[]string,
		0,
		len(rows),
	)

	seen := make(
		map[string]struct{},
		len(rows),
	)

	for _, row := range rows {
		identityID := strings.TrimSpace(
			row.ID,
		)

		if identityID == "" {
			continue
		}

		if _, duplicate :=
			seen[identityID]; duplicate {
			continue
		}

		seen[identityID] = struct{}{}

		identityIDs = append(
			identityIDs,
			identityID,
		)
	}

	return identityIDs
}

// normalizeLookupMonitoringKey normalizes a monitoring key before using it as
// a map key.
//
// Source type values are normalized to uppercase. Identity names remain
// case-sensitive because ARN resource names and workload-key components can
// be case-sensitive.
func normalizeLookupMonitoringKey(
	key MonitoringKey,
) MonitoringKey {
	return MonitoringKey{
		SourceType: strings.ToUpper(
			strings.TrimSpace(
				key.SourceType,
			),
		),
		IdentityName: strings.TrimSpace(
			key.IdentityName,
		),
	}
}

// newerSnapshot reports whether candidate was seen more recently than the
// discovery row currently associated with a MonitoringKey.
func newerSnapshot(
	candidate DiscoveryIdentityRow,
	current *DiscoveryIdentityRow,
) bool {
	if current == nil {
		return true
	}

	if candidate.LastSeenAt == nil {
		return false
	}

	if current.LastSeenAt == nil {
		return true
	}

	return candidate.LastSeenAt.After(
		*current.LastSeenAt,
	)
}

// APIBasePath is where the Genome API is mounted.
const APIBasePath = "/api/v1/genome"

// EventsReadOK reports whether a ClickHouse monitoring-event read succeeded.
//
// ClickHouse failures degrade gracefully. A failed read leaves dependent
// response fields empty instead of failing the PostgreSQL-backed endpoint.
// A not-configured monitoring-event store is expected and is not logged.
func EventsReadOK(
	ctx context.Context,
	op string,
	err error,
) bool {
	if err == nil {
		return true
	}

	if !errors.Is(
		err,
		ErrMonitoringEventsNotConfigured,
	) {
		logging.FromContext(ctx).Warn(
			"monitoring clickhouse read failed, field left null",
			"op",
			op,
			"err",
			err,
			"degraded",
			true,
		)
	}

	return false
}

// mergeCredentialRows returns existing followed by the discovered rows whose
// (binding_type, credential ARN) existing does not already have.
func mergeCredentialRows(existing, discovered []IdentityCredentialRow) []IdentityCredentialRow {
	out := make([]IdentityCredentialRow, 0, len(existing)+len(discovered))
	seen := make(map[string]struct{}, len(existing)+len(discovered))
	add := func(c IdentityCredentialRow) {
		c.BindingType = strings.ToLower(strings.TrimSpace(c.BindingType))
		c.CredentialARN = strings.TrimSpace(c.CredentialARN)
		if c.BindingType == "" || c.CredentialARN == "" {
			return
		}
		key := c.BindingType + ":" + c.CredentialARN
		if _, dup := seen[key]; dup {
			return
		}
		seen[key] = struct{}{}
		out = append(out, c)
	}
	for _, c := range existing {
		add(c)
	}
	for _, c := range discovered {
		add(c)
	}
	return out
}
