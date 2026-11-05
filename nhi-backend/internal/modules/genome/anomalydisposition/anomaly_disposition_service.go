package anomalydisposition

import (
	"context"
	"errors"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/genome/common"
)

// Service implements the disposition write.
type Service struct {
	resolver common.ScopeResolver
	now      func() time.Time
}

// NewService creates the service.
func NewService(resolver common.ScopeResolver) *Service {
	return &Service{resolver: resolver, now: func() time.Time { return time.Now().UTC().Truncate(time.Second) }}
}

// Set changes one alert's status. The alert must belong to an account in the
// caller's scope (an id from another account is "not found", never changed).
// When the reviewer gives a reason it is kept with the alert's feedback row,
// so the reason shows wherever the verdict does.
func (s *Service) Set(ctx context.Context, userID, tenantID, dbName, actor string, alertID int64, disposition string, reason *string) (*Response, error) {
	sc, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, &common.StoreUnavailableError{Op: "resolve tenant scope", Err: err}
	}
	a, err := common.AlertByID(ctx, sc, alertID)
	if err != nil {
		return nil, &common.StoreUnavailableError{Op: "read alert", Err: err}
	}
	if a == nil {
		return nil, common.ErrAnomalyNotFound
	}
	if acct := alertAccount(*a); acct != "" && len(sc.AccountIDs) > 0 && !contains(sc.AccountIDs, acct) {
		return nil, common.ErrAnomalyNotFound
	}
	q := `UPDATE ` + sc.Table("alerts") + ` SET status = $1 WHERE id = $2`
	res, err := sc.DB.ExecContext(ctx, q, disposition, alertID)
	if err != nil {
		return nil, &common.StoreUnavailableError{Op: "update alert status", Err: common.WrapMonitoringErr(ctx, "alert status update", err)}
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, common.ErrAnomalyNotFound
	}
	if reason != nil && strings.TrimSpace(*reason) != "" {
		if acct := alertAccount(*a); acct != "" {
			// Best effort: the status change stands even if the note cannot be kept.
			_, _ = sc.DB.ExecContext(ctx, `INSERT INTO `+sc.Table("alert_feedback")+` AS f
				(account_id, source_type, event_id, decision, approved_for_baseline, reviewer, reason, created_at, updated_at)
				VALUES ($1, $2, $3, 'unknown', false, $4, $5, now(), now())
				ON CONFLICT (account_id, source_type, event_id) DO UPDATE SET reason = EXCLUDED.reason, reviewer = EXCLUDED.reviewer, updated_at = now()`,
				acct, a.Key.SourceType, a.EventID, actor, strings.TrimSpace(*reason))
		}
	}
	return &Response{AlertID: alertID, State: disposition, ChangedBy: actor, ChangedAt: s.now()}, nil
}

func alertAccount(a common.AlertRow) string {
	if p := common.AnomalyAccountID(a, nil); p != nil {
		return *p
	}
	if parts := strings.Split(a.Key.IdentityName, ":"); len(parts) > 5 && parts[0] == "arn" && len(parts[4]) == 12 {
		return parts[4]
	}
	return ""
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

var errBadDisposition = errors.New("disposition must be one of resolved, dismissed, open")
