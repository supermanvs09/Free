package emailsync

import (
	"context"
	"errors"
	"net/http"
	"time"

	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/store"
)

type EmailSyncRepository struct {
	core *engine.Service
}

func NewEmailSyncRepository(core *engine.Service) *EmailSyncRepository {
	return &EmailSyncRepository{core: core}
}

func toEvent(h store.HistoryEvent) SyncEvent {
	return SyncEvent{EventID: h.ID, FindingID: h.FindingID, Action: h.Action, NewValue: h.NewValue, Reason: h.Reason,
		RuleID: h.RuleID, Severity: h.Severity, Title: h.Title, Identity: h.Identity, AccountID: h.AccountID,
		FindingStatus: h.Status, At: h.CreatedAt}
}

// Get reads ispm_email_sync (the engine's cursor) and the finding history around it. Read only.
func (r *EmailSyncRepository) Get(ctx context.Context, tenantID string, limit int) (*EmailSyncStatus, error) {
	st, err := r.core.Store(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	sync, err := st.GetEmailSync(ctx)
	if errors.Is(err, store.ErrNoEmailSyncTable) {
		return nil, &engine.Error{Status: http.StatusNotFound, Code: "not_found",
			Message: "ispm_email_sync does not exist in this tenant's schema: the rule engine creates it"}
	}
	if err != nil {
		return nil, err
	}

	out := &EmailSyncStatus{TenantID: st.TenantID, Pending: []SyncEvent{}}
	var at *time.Time
	id := ""
	if sync != nil {
		out.CursorAt, out.CursorID, out.UpdatedAt = sync.CursorAt, sync.CursorID, sync.UpdatedAt
		at, id = sync.CursorAt, sync.CursorID
		if id != "" {
			ev, err := st.HistoryEventByID(ctx, id)
			if err != nil {
				return nil, err
			}
			if ev != nil {
				e := toEvent(*ev)
				out.LastEvent = &e
			}
		}
	}
	pending, err := st.HistoryAfter(ctx, at, id, limit)
	if err != nil {
		return nil, err
	}
	for _, h := range pending {
		out.Pending = append(out.Pending, toEvent(h))
	}
	if out.PendingCount, err = st.CountHistoryAfter(ctx, at, id); err != nil {
		return nil, err
	}
	return out, nil
}
