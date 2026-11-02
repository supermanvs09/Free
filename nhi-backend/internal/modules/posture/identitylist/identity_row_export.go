package identitylist

import (
	"nhi-backend-api/internal/modules/posture/common"
)

func (row IdentityRow) ToExport() common.ExportRow {
	account := row.AccountName
	if account == "" {
		account = row.AccountID
	}
	e := common.ExportRow{
		IdentityID:        row.IdentityID,
		Name:              row.Name,
		Type:              row.Type,
		Account:           account,
		Score:             common.NullFloat(row.Score),
		Band:              row.Band,
		Grade:             row.Grade,
		ChecksFailed:      common.IntVal(row.Failed),
		FailedCritical:    common.IntVal(row.Critical),
		FailedHigh:        common.IntVal(row.High),
		FailedMedium:      common.IntVal(row.Medium),
		FailedLow:         common.IntVal(row.Low),
		CredentialAgeDays: common.NullInt(row.CredAgeDays),
		Change:            common.NullFloat(row.Change),
		OpenAlerts:        common.IntVal(row.OpenAlerts),
	}
	if row.Class.Valid {
		e.FunctionalClass = row.Class.String
	}
	if row.WeakestPillar.Valid {
		e.WeakestPillar = row.WeakestPillar.String
	}
	if row.CredType.Valid {
		e.CredentialType = row.CredType.String
	}
	return e
}
