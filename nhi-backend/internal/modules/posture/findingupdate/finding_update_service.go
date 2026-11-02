package findingupdate

import (
	"context"
	"fmt"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/posture/common"
	"nhi-backend-api/internal/platform/scope"
)

// Bounds on the free-text fields.
const (
	maxReasonLen   = 1000
	maxAssigneeLen = 254
	maxNoteLen     = 2000
)

type FindingUpdateService struct {
	common.Base
	repo *FindingUpdateRepository
}

func NewFindingUpdateService(r *FindingUpdateRepository, resolver *scope.Resolver) *FindingUpdateService {
	return &FindingUpdateService{Base: common.NewBase(resolver), repo: r}
}

// Update applies PATCH /findings/{id}.
//
// Rules: only analyst / admin may write; status may be ACCEPTED, SUPPRESSED
// (needs a future suppressed_until) or OPEN — RESOLVED is set only by the
// engine; ACCEPTED needs accepted_reason; every change is written to
// ispm_finding_history with the caller as actor.
func (s *FindingUpdateService) Update(ctx context.Context, c common.Caller, u FindingUpdate) (*common.Envelope, error) {
	if !c.CanWrite() {
		return nil, common.ErrForbidden
	}
	if err := validateFindingUpdate(&u.Request, time.Now()); err != nil {
		return nil, err
	}
	resolved, err := s.Tenant(ctx, c)
	if err != nil {
		return nil, err
	}
	u.Actor = c.UserID
	data, err := s.repo.Update(ctx, resolved, u)
	if err != nil {
		return nil, fmt.Errorf("update finding: %w", err)
	}
	return s.Envelope(ctx, resolved, data, nil, "", true)
}

func validateFindingUpdate(r *FindingUpdateRequest, now time.Time) error {
	if r.Status == nil && r.AcceptedReason == nil && r.SuppressedUntil == nil && r.AssignedTo == nil && r.Note == nil {
		return &common.ParamError{Message: "send at least one of status, assigned_to or note"}
	}
	if r.AcceptedReason != nil && len(*r.AcceptedReason) > maxReasonLen {
		return &common.ParamError{Field: "accepted_reason", Message: fmt.Sprintf("accepted_reason must be at most %d characters", maxReasonLen)}
	}
	if r.AssignedTo != nil && len(*r.AssignedTo) > maxAssigneeLen {
		return &common.ParamError{Field: "assigned_to", Message: fmt.Sprintf("assigned_to must be at most %d characters", maxAssigneeLen)}
	}
	if r.Note != nil && len(*r.Note) > maxNoteLen {
		return &common.ParamError{Field: "note", Message: fmt.Sprintf("note must be at most %d characters", maxNoteLen)}
	}

	status := ""
	if r.Status != nil {
		status = strings.ToUpper(strings.TrimSpace(*r.Status))
		*r.Status = status
	}
	switch status {
	case "":
		if r.AcceptedReason != nil {
			return &common.ParamError{Field: "accepted_reason", Message: "accepted_reason is only valid together with status ACCEPTED"}
		}
		if r.SuppressedUntil != nil {
			return &common.ParamError{Field: "suppressed_until", Message: "suppressed_until is only valid together with status SUPPRESSED"}
		}
	case FindingAccepted:
		if r.AcceptedReason == nil || strings.TrimSpace(*r.AcceptedReason) == "" {
			return &common.ParamError{Field: "accepted_reason", Message: "accepted_reason is required with status ACCEPTED"}
		}
		if r.SuppressedUntil != nil {
			return &common.ParamError{Field: "suppressed_until", Message: "suppressed_until is only valid with status SUPPRESSED"}
		}
	case FindingSuppressed:
		if r.SuppressedUntil == nil || !r.SuppressedUntil.After(now) {
			return &common.ParamError{Field: "suppressed_until", Message: "status SUPPRESSED requires a suppressed_until in the future"}
		}
		if r.AcceptedReason != nil {
			return &common.ParamError{Field: "accepted_reason", Message: "accepted_reason is only valid with status ACCEPTED"}
		}
	case FindingOpen:
		if r.AcceptedReason != nil || r.SuppressedUntil != nil {
			return &common.ParamError{Field: "status", Message: "accepted_reason and suppressed_until cannot be sent with status OPEN"}
		}
	case FindingResolved:
		return &common.ParamError{Field: "status", Message: "RESOLVED is set only by the engine"}
	default:
		return &common.ParamError{Field: "status", Message: "status must be ACCEPTED, SUPPRESSED or OPEN"}
	}
	return nil
}
