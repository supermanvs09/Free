package identitybaseline

import (
	"context"
	"encoding/json"
	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/modules/genome/identitydrift"
	"nhi-backend-api/internal/platform/scope"
	"strings"
)

// Service implements:
//
// GET /api/v1/genome/identities/{source_type}/{identity_name}/baseline
//
// The exact key supplied in the request is checked first. This is important
// for credential-specific ECS identities because the dashboard returns the
// normalized key stored in the baselines table.
//
// Only baselines with status active are returned. If an inactive row exists
// under a canonical role ARN, the service continues checking the normalized
// workload key for an active row.
type Service struct {
	lookup    *common.MonitoredIdentityLookup
	repo      *Repository
	driftRepo *identitydrift.Repository
}

// NewService creates the identity baseline service.
func NewService(
	lookup *common.MonitoredIdentityLookup,
	repo *Repository,
	driftRepo *identitydrift.Repository,
) *Service {
	return &Service{
		lookup:    lookup,
		repo:      repo,
		driftRepo: driftRepo,
	}
}

// Params contains the parsed baseline endpoint query parameters.
type Params struct {
	VersionsLimit int
}

// GetBaseline returns the active baseline associated with the requested
// normalized identity key.
//
// The method uses the following lookup order:
//
//  1. Exact source_type and identity_name received from the route.
//  2. Canonical identity and workload fallback keys from the discovery fleet.
//  3. Only baseline rows having status active are accepted.
//
// The exact key under which the active baseline is found is then used for
// profile, daily statistics, version history, and future model-confidence
// lookup.
func (s *Service) GetBaseline(
	ctx context.Context,
	userID string,
	tenantID string,
	dbName string,
	sourceType string,
	identityName string,
	params Params,
) (*Response, error) {
	sourceType = strings.ToUpper(
		strings.TrimSpace(sourceType),
	)

	identityName = strings.TrimSpace(
		identityName,
	)

	if sourceType == "" || identityName == "" {
		return nil, common.ErrIdentityNotFound
	}

	// Fleet resolves the tenant scope and provides any canonical or workload
	// keys that can be reconstructed from discovery data.
	resolvedScope, fleet, err := s.lookup.Fleet(
		ctx,
		userID,
		tenantID,
		dbName,
	)
	if err != nil {
		return nil, err
	}

	requestedKey := common.MonitoringKey{
		SourceType:   sourceType,
		IdentityName: identityName,
	}

	// The exact requested key receives the highest preference.
	keys := []common.MonitoringKey{
		requestedKey,
	}

	// If the requested key belongs to an identity in the discovery fleet,
	// append that identity's canonical and workload keys as fallbacks.
	for _, identity := range fleet {
		if !identityContainsKey(
			identity,
			requestedKey,
		) {
			continue
		}

		keys = append(
			keys,
			identity.AllKeys()...,
		)

		break
	}

	keys = uniquePreferredKeys(keys)

	response := &Response{
		ModelConfidencePercent:   nil,
		ModelConfidenceAvailable: false,
		Dimensions:               []DimensionSummary{},
		Versions:                 []Version{},
	}

	// Check candidate keys individually. Repository.Baseline returns the first
	// existing row for the supplied keys, regardless of status. Querying one
	// key at a time prevents an inactive canonical role row from hiding an
	// active ECS task-role or execution-role workload row.
	baselineRow, err := s.activeBaseline(
		ctx,
		resolvedScope,
		keys,
	)
	if err != nil {
		if budgetErr := common.BudgetExceeded(
			ctx,
			"identity baseline",
		); budgetErr != nil {
			return nil, budgetErr
		}

		return nil, err
	}

	if baselineRow == nil {
		return nil, common.ErrIdentityNotFound
	}

	// All dependent reads must use the key under which the active baseline was
	// actually found.
	activeKey := baselineRow.Key

	activeKeys := []common.MonitoringKey{
		activeKey,
	}

	// Keep future model-confidence support. Until the research pipeline
	// supplies a value, the response remains:
	//
	// model_confidence_percent: null
	// model_confidence_available: false
	if s.driftRepo != nil {
		drift, driftErr := s.driftRepo.Latest(
			ctx,
			resolvedScope,
			activeKeys,
		)

		if common.ReadOK(
			"identity baseline model confidence",
			driftErr,
		) &&
			drift != nil &&
			drift.ModelConfidence != nil {
			response.ModelConfidencePercent =
				drift.ModelConfidence

			response.ModelConfidenceAvailable = true
		}
	}

	response.Status = common.OptionalString(
		baselineRow.Status,
	)

	response.RequiredDays = common.IntPtr(
		baselineRow.RequiredDays,
	)

	response.BuiltDays = common.IntPtr(
		baselineRow.BuiltDays,
	)

	response.DaysRemaining = common.IntPtr(
		baselineRow.DaysRemaining,
	)

	if baselineRow.FirstSeenDate != nil {
		firstSeenDate :=
			baselineRow.FirstSeenDate.Format(
				"2006-01-02",
			)

		response.FirstSeenDate = &firstSeenDate
	}

	response.ActiveSince =
		baselineRow.ActiveSince

	updatedAt := baselineRow.UpdatedAt
	response.UpdatedAt = &updatedAt

	// Return baselines.profile_json exactly as stored in PostgreSQL.
	if len(baselineRow.Profile) > 0 {
		response.Profile = json.RawMessage(
			append(
				[]byte(nil),
				baselineRow.Profile...,
			),
		)
	}

	// Data points come from daily_stats.event_count and must use the active
	// baseline's actual monitoring key.
	dataPoints, dataPointsErr := s.repo.DataPoints(
		ctx,
		resolvedScope,
		activeKey,
		baselineRow.RequiredDays,
	)

	if common.ReadOK(
		"identity baseline data points",
		dataPointsErr,
	) {
		response.DataPoints = &dataPoints
	}

	// Version history must also use the key under which the active baseline
	// was found.
	versions, versionsErr := s.repo.Versions(
		ctx,
		resolvedScope,
		activeKeys,
		params.VersionsLimit,
	)

	if common.ReadOK(
		"identity baseline versions",
		versionsErr,
	) {
		for _, versionRow := range versions {
			version := Version{
				Version: versionRow.Version,
				PublishedAt: versionRow.
					PublishedAt,
			}

			if len(versionRow.Profile) > 0 {
				version.Profile = json.RawMessage(
					append(
						[]byte(nil),
						versionRow.Profile...,
					),
				)
			}

			response.Versions = append(
				response.Versions,
				version,
			)
		}
	}

	if budgetErr := common.BudgetExceeded(
		ctx,
		"identity baseline",
	); budgetErr != nil {
		return nil, budgetErr
	}

	return response, nil
}

// activeBaseline checks candidate monitoring keys in preference order.
//
// The historical helper name is retained for compatibility. Despite the name,
// both active and inactive baseline rows are returned exactly as stored.
func (s *Service) activeBaseline(
	ctx context.Context,
	resolvedScope *scope.DataScope,
	keys []common.MonitoringKey,
) (*BaselineRow, error) {
	for _, key := range keys {
		row, err := s.repo.Baseline(
			ctx,
			resolvedScope,
			[]common.MonitoringKey{key},
		)
		if err != nil {
			return nil, err
		}
		if row != nil {
			return row, nil
		}
	}
	return nil, nil
}

// identityContainsKey reports whether the requested monitoring key belongs to
// one of the normalized identity's canonical or workload keys.
func identityContainsKey(
	identity common.MonitoredIdentity,
	requested common.MonitoringKey,
) bool {
	requestedSourceType := strings.ToUpper(
		strings.TrimSpace(
			requested.SourceType,
		),
	)

	requestedIdentityName := strings.TrimSpace(
		requested.IdentityName,
	)

	for _, key := range identity.AllKeys() {
		keySourceType := strings.ToUpper(
			strings.TrimSpace(
				key.SourceType,
			),
		)

		keyIdentityName := strings.TrimSpace(
			key.IdentityName,
		)

		if keySourceType != requestedSourceType {
			continue
		}

		if keyIdentityName != requestedIdentityName {
			continue
		}

		return true
	}

	return false
}

// uniquePreferredKeys normalizes and deduplicates monitoring keys while
// preserving their original preference order.
func uniquePreferredKeys(
	keys []common.MonitoringKey,
) []common.MonitoringKey {
	output := make(
		[]common.MonitoringKey,
		0,
		len(keys),
	)

	seen := make(
		map[common.MonitoringKey]struct{},
		len(keys),
	)

	for _, key := range keys {
		key.SourceType = strings.ToUpper(
			strings.TrimSpace(
				key.SourceType,
			),
		)

		key.IdentityName = strings.TrimSpace(
			key.IdentityName,
		)

		if key.SourceType == "" ||
			key.IdentityName == "" {
			continue
		}

		if _, duplicate := seen[key]; duplicate {
			continue
		}

		seen[key] = struct{}{}

		output = append(
			output,
			key,
		)
	}

	return output
}
