package humanidentities

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/modules/posture/identitychecks"
	"nhi-backend-api/internal/modules/posture/identityposture"
	"nhi-backend-api/internal/platform/scope"
)

// HumanPosture is GET /human-identities/{id}/posture: the person's posture
// score and every check, read from the same posture tables as the non-human
// Posture tab. Scored is false when the posture engine has no row for them.
type HumanPosture struct {
	Scored            bool                             `json:"scored"`
	PostureIdentityID *string                          `json:"posture_identity_id"`
	Posture           *identityposture.IdentityPosture `json:"posture"`
	Checks            []identitychecks.IdentityCheck   `json:"checks"`
}

var (
	postureRepo = identityposture.NewIdentityPostureRepository()
	checksRepo  = identitychecks.NewIdentityChecksRepository()
)

// GetPosture finds the person's posture row by ARN (or, for a person without
// one, by user name among human rows) and returns its score card and checks.
func (s *HumanIdentityService) GetPosture(ctx context.Context, userID, tenantID, dbName, id, window string) (*HumanPosture, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	w, ok := common.ParseWindow(window)
	if !ok {
		return nil, errInvalidWindow
	}
	arn, name, err := s.repo.PostureRef(ctx, resolved, id)
	if err != nil {
		return nil, err
	}
	out := &HumanPosture{Checks: []identitychecks.IdentityCheck{}}
	pid, err := postureIdentityID(ctx, resolved, arn, name)
	if err != nil || pid == "" {
		return out, err
	}
	posture, err := postureRepo.Get(ctx, resolved, pid, w)
	if errors.Is(err, common.ErrRecordNotFound) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	checks, err := checksRepo.Get(ctx, resolved, pid, identitychecks.IdentityChecksFilter{Status: identitychecks.ChecksAll})
	if err != nil && !errors.Is(err, common.ErrRecordNotFound) {
		return nil, err
	}
	if checks != nil {
		out.Checks = checks
	}
	out.Scored, out.PostureIdentityID, out.Posture = true, &pid, posture
	return out, nil
}

var errInvalidWindow = errors.New("window must be one of the posture windows, e.g. 30d")

// postureIdentityID is the posture engine's id for the person: an exact ARN
// match first, else a human row with the same name. "" when not scored.
func postureIdentityID(ctx context.Context, s *scope.DataScope, arn, name string) (string, error) {
	q := fmt.Sprintf(`SELECT identity_id FROM %s
		WHERE tenant_id = $1
		  AND ((NULLIF($2, '') IS NOT NULL AND identity_arn = $2)
		    OR (NULLIF($3, '') IS NOT NULL AND identity_name = $3 AND upper(COALESCE(identity_class, '')) IN ('HUMAN', 'HI')))
		ORDER BY (identity_arn = $2) DESC
		LIMIT 1`, s.Table(common.TIdentityPosture))
	var id string
	err := s.DB.QueryRowContext(ctx, q, s.TenantID, arn, name).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) || common.IsUndefinedTable(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("find posture identity: %w", err)
	}
	return id, nil
}
