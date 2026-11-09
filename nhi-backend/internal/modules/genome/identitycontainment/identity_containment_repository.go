package identitycontainment

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"nhi-backend-api/internal/modules/genome/common"
	"nhi-backend-api/internal/platform/scope"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) EstablishedBaseline(
	ctx context.Context,
	resolved *scope.DataScope,
	keys []common.MonitoringKey,
	accountID string,
) (*BaselineRow, error) {
	if len(keys) == 0 {
		return nil, nil
	}

	sourceTypes, identityNames := common.KeyArrays(keys)

	query := `
		SELECT
			b.source_type,
			b.identity_name,
			b.account_id,
			b.status,
			b.profile_json,
			b.updated_at
		FROM ` + resolved.Table("baselines") + ` b
		` + common.KeyJoin("b") + `
		WHERE b.account_id = $3
		  AND LOWER(b.status) = 'active'
		ORDER BY b.updated_at DESC
		LIMIT 1`

	var row BaselineRow
	var profileJSON []byte

	err := resolved.DB.QueryRowContext(
		ctx,
		query,
		sourceTypes,
		identityNames,
		accountID,
	).Scan(
		&row.SourceType,
		&row.IdentityName,
		&row.AccountID,
		&row.Status,
		&profileJSON,
		&row.UpdatedAt,
	)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}

	if err != nil {
		return nil, common.WrapMonitoringErr(
			ctx,
			"identity containment baseline",
			err,
		)
	}

	row.ProfileJSON = copyRawJSON(profileJSON)

	return &row, nil
}

func (r *Repository) OpenAlerts(
	ctx context.Context,
	resolved *scope.DataScope,
	keys []common.MonitoringKey,
	accountID string,
) ([]AlertRow, error) {
	if len(keys) == 0 {
		return []AlertRow{}, nil
	}

	sourceTypes, identityNames := common.KeyArrays(keys)

	query := `
		SELECT
			a.id,
			a.event_id,
			a.source_type,
			a.identity_name,
			a.account_id,
			a.dimension,
			a.score,
			a.reason,
			a.baseline_value,
			a.observed_value,
			a.identity_metadata,
			a.window_start,
			a.window_end,
			a.status,
			a.created_at
		FROM ` + resolved.Table("alerts") + ` a
		` + common.KeyJoin("a") + `
		WHERE a.account_id = $3
		  AND LOWER(a.status) = 'open'
		ORDER BY
			a.score DESC,
			a.created_at DESC,
			a.id DESC`

	rows, err := resolved.DB.QueryContext(
		ctx,
		query,
		sourceTypes,
		identityNames,
		accountID,
	)
	if err != nil {
		return nil, common.WrapMonitoringErr(
			ctx,
			"identity containment alerts",
			err,
		)
	}
	defer rows.Close()

	alerts := make([]AlertRow, 0)

	for rows.Next() {
		var row AlertRow
		var eventID sql.NullString
		var baselineValue []byte
		var observedValue []byte
		var identityMetadata []byte

		if err := rows.Scan(
			&row.ID,
			&eventID,
			&row.SourceType,
			&row.IdentityName,
			&row.AccountID,
			&row.Dimension,
			&row.Score,
			&row.Reason,
			&baselineValue,
			&observedValue,
			&identityMetadata,
			&row.WindowStart,
			&row.WindowEnd,
			&row.Status,
			&row.CreatedAt,
		); err != nil {
			return nil, common.WrapMonitoringErr(
				ctx,
				"identity containment alerts scan",
				err,
			)
		}

		if eventID.Valid {
			row.EventID = strings.TrimSpace(eventID.String)
		}

		row.BaselineValue = copyRawJSON(baselineValue)
		row.ObservedValue = copyRawJSON(observedValue)
		row.IdentityMetadata = copyRawJSON(identityMetadata)

		alerts = append(alerts, row)
	}

	if err := rows.Err(); err != nil {
		return nil, common.WrapMonitoringErr(
			ctx,
			"identity containment alerts rows",
			err,
		)
	}

	return alerts, nil
}

func copyRawJSON(value []byte) json.RawMessage {
	if len(value) == 0 {
		return nil
	}

	result := make([]byte, len(value))
	copy(result, value)

	return json.RawMessage(result)
}
