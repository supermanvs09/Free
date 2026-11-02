package updateaccount

import (
	"context"
	"strings"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
)

type UpdateAccountService struct {
	repo *UpdateAccountRepository
}

func NewUpdateAccountService(r *UpdateAccountRepository) *UpdateAccountService {
	return &UpdateAccountService{repo: r}
}

func (s *UpdateAccountService) Update(ctx context.Context, c common.Caller, accountID string, req UpdateAccountRequest) (*domain.Account, error) {
	if err := common.Require(c, domain.PermSettings); err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, c.Actor(), accountID, engine.AccountReq{
		Enabled: req.Enabled, RoleARN: strings.TrimSpace(req.RoleARN), ExternalID: req.ExternalID,
		AllowedActionTypes: req.AllowedActionTypes, EnabledRegions: req.EnabledRegions,
		ApprovalPolicy: req.ApprovalPolicy, GraceDays: req.GraceDays,
	})
}
