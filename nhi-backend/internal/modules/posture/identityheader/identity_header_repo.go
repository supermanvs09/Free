package identityheader

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

type IdentityHeaderRepository struct{}

func NewIdentityHeaderRepository() *IdentityHeaderRepository {
	return &IdentityHeaderRepository{}
}

// Get implements GET /identities/{id}: the page header, read from
// ispm_identity_posture by primary key. Badges stay null when the scanner did
// not collect the attribute.
func (r *IdentityHeaderRepository) Get(ctx context.Context, s *scope.DataScope, id string) (*IdentityHeader, error) {
	if err := common.Need(s); err != nil {
		return nil, err
	}
	q := fmt.Sprintf(`SELECT identity_id, COALESCE(identity_name, ''), COALESCE(identity_arn, ''), COALESCE(identity_type, ''),
			functional_class, COALESCE(account_id, ''), COALESCE(account_name, ''), COALESCE(region, ''),
			score, COALESCE(band, ''), COALESCE(grade, ''), mfa_enabled, console_access, COALESCE(open_alerts, 0)
		FROM %s WHERE tenant_id = $1 AND identity_id = $2`, s.Table(common.TIdentityPosture))
	h := &IdentityHeader{}
	var class sql.NullString
	var score sql.NullFloat64
	var mfa, console sql.NullBool
	var alerts sql.NullInt64
	err := s.DB.QueryRowContext(ctx, q, s.TenantID, id).Scan(&h.IdentityID, &h.Name, &h.ARN, &h.Type, &class,
		&h.Account.ID, &h.Account.Name, &h.Region, &score, &h.Band, &h.Grade, &mfa, &console, &alerts)
	if errors.Is(err, sql.ErrNoRows) || common.IsUndefinedTable(err) { // not scored yet
		return nil, common.ErrRecordNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load identity header: %w", err)
	}
	h.FunctionalClass = common.NullStr(class)
	h.Score = common.NullFloat(score)
	h.Badges = IdentityBadges{MFAEnabled: common.NullBool(mfa), ConsoleAccess: common.NullBool(console)}
	h.Counts.OpenAlerts = common.IntVal(alerts)

	// credentials: the BOUND_TO edges that start at this identity
	cq := fmt.Sprintf(`SELECT count(DISTINCT target_arn)::int FROM %s
		WHERE tenant_id = $1 AND source_arn = $2 AND edge_type = 'BOUND_TO'`, s.Table(common.TAccessEdges))
	if h.ARN != "" {
		if err := s.DB.QueryRowContext(ctx, cq, s.TenantID, h.ARN).Scan(&h.Counts.Credentials); err != nil {
			if !common.IsUndefinedTable(err) {
				return nil, fmt.Errorf("count bound credentials: %w", err)
			}
		}
	}
	return h, nil
}
