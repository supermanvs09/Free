package summarycommon

import (
	"context"
	"errors"
	"log/slog"
	"nhi-backend-api/internal/modules/genome/registry"
	"slices"
	"strings"

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

// resolvedIdentity contains the tenant scope and normalized monitored
// identity resolved by an identity route.
type resolvedIdentity struct {
	Scope    *scope.DataScope
	Identity MonitoredIdentity
}

// Resolve finds an identity by its exact source type and identity name.
//
// For ECS credential identities, identityName is the IAM role ARN:
//
//   - task role ARN
//   - execution role ARN
//
// The workload-specific baseline key remains available through AllKeys().
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
	resolvedScope, fleet, err := l.Fleet(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return resolvedIdentity{}, err
	}

	sourceType = strings.TrimSpace(sourceType)
	identityName = strings.TrimSpace(identityName)

	for _, identity := range fleet {
		for _, key := range identity.AllKeys() {
			if !strings.EqualFold(
				strings.TrimSpace(key.SourceType),
				sourceType,
			) {
				continue
			}

			if strings.TrimSpace(key.IdentityName) !=
				identityName {
				continue
			}

			return resolvedIdentity{
				Scope:    resolvedScope,
				Identity: identity,
			}, nil
		}
	}

	return resolvedIdentity{}, ErrIdentityNotFound
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

	rows, err := l.discovery.LatestIdentities(
		ctx,
		resolvedScope,
	)
	if err != nil {
		return nil, nil, &StoreUnavailableError{
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
		return nil, nil, &StoreUnavailableError{
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

	attachRegistryAliases(ctx, resolvedScope, fleet)
	return resolvedScope, fleet, nil
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

// attachRegistryAliases adds the keys the behaviour pipeline monitors each
// identity under, when they are not keys this backend derives: the
// identity's discovery id, and every nhi_genome_identities row matched to it
// (see package registry). A registry that cannot be read only costs the
// aliases.
func attachRegistryAliases(ctx context.Context, s *scope.DataScope, fleet []MonitoredIdentity) {
	cands := make([]registry.Candidate, len(fleet))
	for i, id := range fleet {
		keys := []string{id.Key.IdentityName}
		if id.WorkloadKey != "" {
			keys = append(keys, id.WorkloadKey)
		}
		cands[i] = registry.Candidate{SourceType: id.Key.SourceType, Keys: keys, DiscoveryID: id.DiscoveryIdentityID,
			ResourceARN: id.ResourceARN, RoleARN: id.RoleARN, InstanceID: id.InstanceID}
		if d := strings.TrimSpace(id.DiscoveryIdentityID); d != "" && d != id.Key.IdentityName {
			fleet[i].Aliases = append(fleet[i].Aliases, MonitoringKey{SourceType: id.Key.SourceType, IdentityName: d})
		}
	}
	rows, err := registry.Load(ctx, s)
	if err != nil {
		slog.Default().Info("genome: identity registry unavailable", "err", err)
		return
	}
	for _, a := range registry.Match(rows, cands) {
		k := MonitoringKey{SourceType: a.SourceType, IdentityName: a.IdentityName}
		if !slices.Contains(fleet[a.Index].Aliases, k) {
			fleet[a.Index].Aliases = append(fleet[a.Index].Aliases, k)
		}
	}
}
