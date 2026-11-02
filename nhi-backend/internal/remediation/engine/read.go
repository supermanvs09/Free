package engine

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
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
