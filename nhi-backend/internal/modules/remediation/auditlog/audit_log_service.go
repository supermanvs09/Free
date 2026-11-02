package auditlog

import (
	"context"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type AuditLogService struct {
	repo *AuditLogRepository
}

func NewAuditLogService(r *AuditLogRepository) *AuditLogService {
	return &AuditLogService{repo: r}
}

func (s *AuditLogService) List(ctx context.Context, c common.Caller, q AuditQuery) ([]domain.AuditEvent, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	if q.PlanID != "" && !common.UUIDRegex.MatchString(q.PlanID) {
		return nil, &common.ParamError{Field: "plan_id", Message: "plan_id must be a UUID"}
	}
	return s.repo.List(ctx, c.TenantID, strings.ToLower(q.PlanID), common.ClampLimit(q.Limit, defaultLimit, maxLimit))
}
