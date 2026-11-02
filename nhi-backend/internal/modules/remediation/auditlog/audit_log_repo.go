package auditlog

import (
	"context"

	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type AuditLogRepository struct {
	core *engine.Service
}

func NewAuditLogRepository(core *engine.Service) *AuditLogRepository {
	return &AuditLogRepository{core: core}
}

// List reads remediation_audit_log, newest first.
func (r *AuditLogRepository) List(ctx context.Context, tenantID, planID string, limit int) ([]domain.AuditEvent, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	evs, err := st.ListAudit(ctx, planID, limit)
	if evs == nil && err == nil {
		evs = []domain.AuditEvent{}
	}
	return evs, err
}
