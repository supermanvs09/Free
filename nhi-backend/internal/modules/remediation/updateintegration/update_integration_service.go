package updateintegration

import (
	"context"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type UpdateIntegrationService struct {
	repo *UpdateIntegrationRepository
}

func NewUpdateIntegrationService(r *UpdateIntegrationRepository) *UpdateIntegrationService {
	return &UpdateIntegrationService{repo: r}
}

func (s *UpdateIntegrationService) Update(ctx context.Context, c common.Caller, typ string, req UpdateIntegrationRequest) (*domain.Integration, error) {
	if err := common.Require(c, domain.PermSettings); err != nil {
		return nil, err
	}
	if len(req.Config) == 0 {
		return nil, &common.ParamError{Field: "config", Message: "config is required (a JSON object)"}
	}
	return s.repo.Update(ctx, c.Actor(), typ, engine.IntegrationReq{
		Enabled: req.Enabled, Config: req.Config, SecretRef: strings.TrimSpace(req.SecretRef),
	})
}
