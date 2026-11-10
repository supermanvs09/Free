package common

import (
	"context"
	"strings"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/scope"
)

type IdentityCredentialRow struct {
	IdentityID    string
	BindingType   string
	BindingSource string
	CredentialARN string
	IsPrimary     bool
}

func IdentityCredentials(
	ctx context.Context,
	resolved *scope.DataScope,
	identityIDs []string,
) (
	map[string][]IdentityCredentialRow,
	error,
) {
	output := make(
		map[string][]IdentityCredentialRow,
	)

	if len(identityIDs) == 0 {
		return output, nil
	}

	query := `
		SELECT
			credential.identity_id::text,
			COALESCE(credential.binding_type, ''),
			COALESCE(credential.binding_source, ''),
			COALESCE(credential.credential_arn, ''),
			COALESCE(credential.is_primary, false)
		FROM ` + resolved.Table("identity_credentials") + ` AS credential
		WHERE credential.identity_id::text =
		      ANY($1::text[])
		  AND credential.binding_type IN (
		      'task_role',
		      'execution_role'
		  )
		  AND NULLIF(
		      TRIM(credential.credential_arn),
		      ''
		  ) IS NOT NULL
		ORDER BY
			credential.identity_id,
			credential.is_primary DESC,
			credential.binding_type,
			credential.credential_arn`

	rows, err := resolved.DB.QueryContext(
		ctx,
		query,
		pq.Array(identityIDs),
	)
	if err != nil {
		return nil, WrapMonitoringErr(
			ctx,
			"identity credentials",
			err,
		)
	}
	defer rows.Close()

	for rows.Next() {
		var row IdentityCredentialRow

		if err := rows.Scan(
			&row.IdentityID,
			&row.BindingType,
			&row.BindingSource,
			&row.CredentialARN,
			&row.IsPrimary,
		); err != nil {
			return nil, WrapMonitoringErr(
				ctx,
				"identity credentials",
				err,
			)
		}

		row.IdentityID = strings.TrimSpace(
			row.IdentityID,
		)

		row.BindingType = strings.ToLower(
			strings.TrimSpace(
				row.BindingType,
			),
		)

		row.BindingSource = strings.TrimSpace(
			row.BindingSource,
		)

		row.CredentialARN = strings.TrimSpace(
			row.CredentialARN,
		)

		if row.IdentityID == "" ||
			row.CredentialARN == "" {
			continue
		}

		output[row.IdentityID] = append(
			output[row.IdentityID],
			row,
		)
	}

	if err := rows.Err(); err != nil {
		return nil, WrapMonitoringErr(
			ctx,
			"identity credentials",
			err,
		)
	}

	return output, nil
}
