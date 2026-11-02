package summarycommon

import (
	"context"
	"errors"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

// ScopeResolver is the part of scope.Resolver the service uses.
type ScopeResolver interface {
	Resolve(ctx context.Context, userID, tenantID, dbName string) (*scope.DataScope, error)
}

// TimeWindow is a half-open UTC range [From, To).
type TimeWindow struct {
	From time.Time
	To   time.Time
}

// StoreUnavailableError means the tenant scope or the discovery table could
// not be read, so there is no data at all; the handler maps it to 503.
type StoreUnavailableError struct {
	Op  string
	Err error
}

func (e *StoreUnavailableError) Error() string { return e.Op + ": " + e.Err.Error() }

func (e *StoreUnavailableError) Unwrap() error { return e.Err }

// readOK reports whether a monitoring-table read succeeded; failures are
// logged and leave the dependent fields null/empty (graceful degradation).
func ReadOK(ctx context.Context, op string, err error) bool {
	if err == nil {
		return true
	}
	if IsMonitoringTableMissing(err) {
		logging.FromContext(ctx).Warn("genome: monitoring table not present in the tenant schema", "op", op, "err", err)
	} else {
		logging.FromContext(ctx).Warn("genome read failed, field left empty", "op", op, "err", err, "degraded", true)
	}
	return false
}

// ErrInvalidCursor reports a recent_cursor that was not produced by this
// endpoint; handlers answer 400 VALIDATION_ERROR.
var ErrInvalidCursor = errors.New("cursor is invalid")

// apiOperation is the §10.3 formula event_source + ':' + event_name, with
// the CloudTrail ".amazonaws.com" host suffix of event_source removed so the
// value reads like the contract's examples ("dynamodb:Query").
func ApiOperation(eventSource, eventName string) string {
	return strings.TrimSuffix(strings.TrimSpace(eventSource), ".amazonaws.com") + ":" + strings.TrimSpace(eventName)
}
