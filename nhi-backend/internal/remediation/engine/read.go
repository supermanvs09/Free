package engine

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

// Credential returns the new access key of a rotation once. Only the user who
// triggered the execution (or an admin) may take it.
func (s *Service) Credential(ctx context.Context, actor domain.Actor, execID string) (map[string]string, error) {
	st, err := s.Store(ctx, actor.TenantID)
	if err != nil {
		return nil, err
	}
	ex, err := st.GetExecution(ctx, execID)
	if isStoreNotFound(err) {
		return nil, notFoundErr("execution")
	}
	if err != nil {
		return nil, err
	}
	if ex.TriggeredBy != actor.UserID && actor.Role != domain.RoleAdmin {
		return nil, forbidden("only the user who started the execution can take the new key")
	}
	v, ok := s.oneTime.Take(execID)
	if !ok {
		return nil, &Error{Status: 410, Code: "gone", Message: "the new key was already shown or has expired; it is not stored anywhere"}
	}
	return v, nil
}

// DashboardURL is DASHBOARD_BASE_URL (links in e-mails, Jira tickets and the fix view).
func (s *Service) DashboardURL() string { return s.cfg.Dashboard.BaseURL }

// OneClickAvailable says whether a One-click plan can be made for the action on this target
// of the account and, when not, why. It uses the same checks as POST /plans; AWS is not called.
func (s *Service) OneClickAvailable(ctx context.Context, st *store.Store, accountID string, act *domain.Action, targetARN string) (bool, string) {
	acct, err := AccountFor(ctx, st, accountID)
	if err != nil {
		return false, err.Error()
	}
	prov, _ := s.prov.Get(act.Platform)
	return s.oneClickEligible(acct, act, prov, regionFromARN(targetARN))
}
