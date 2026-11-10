package emailsync

import (
	"context"

	"nhi-backend-api/internal/modules/remediation/common"
	"nhi-backend-api/internal/remediation/domain"
)

type EmailSyncService struct {
	repo *EmailSyncRepository
}

func NewEmailSyncService(r *EmailSyncRepository) *EmailSyncService {
	return &EmailSyncService{repo: r}
}

// Get returns the status of the e-mail sync; limit is how many pending events to list.
func (s *EmailSyncService) Get(ctx context.Context, c common.Caller, limit int) (*EmailSyncStatus, error) {
	if err := common.Require(c, domain.PermRead); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, c.TenantID, common.ClampLimit(limit, defaultLimit, maxLimit))
}
