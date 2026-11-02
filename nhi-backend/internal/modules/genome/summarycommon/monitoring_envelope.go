package summarycommon

import (
	"time"
)

// MonitoringEnvelope is the success body (§1.5).
type MonitoringEnvelope struct {
	Data any            `json:"data"`
	Meta MonitoringMeta `json:"meta"`
}

// MonitoringMeta is the §1.5 meta block.
type MonitoringMeta struct {
	RequestID   string    `json:"request_id"`
	GeneratedAt time.Time `json:"generated_at"`
	NextCursor  *string   `json:"next_cursor"`
}

// MonitoringError is the §1.5 error body.
type MonitoringError struct {
	Error MonitoringErrorDetail `json:"error"`
}

// MonitoringErrorDetail describes one failure.
type MonitoringErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

// Error codes, in the contract's UPPER_SNAKE style (e.g. IDENTITY_NOT_FOUND).
const (
	MonitoringCodeValidation       = "VALIDATION_ERROR"
	MonitoringCodeUnauthorized     = "UNAUTHORIZED"
	MonitoringCodeInternal         = "INTERNAL_ERROR"
	MonitoringCodeStoreUnavailable = "STORE_UNAVAILABLE"
	MonitoringCodeIdentityNotFound = "IDENTITY_NOT_FOUND" // 404: unknown (source_type, identity_name) in scope
)

// DashboardIdentityRef is the identity block of §10.2 embedded in rows:
// id = source_type + ":" + identity_name (API formula), display_name from
// the normalizer.
type DashboardIdentityRef struct {
	ID           string `json:"id"`
	SourceType   string `json:"source_type"`
	IdentityName string `json:"identity_name"`
	DisplayName  string `json:"display_name"`
}
