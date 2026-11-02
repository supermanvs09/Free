package auditlog

// GET /remediation/audit?plan_id=&limit= (every role)
//
// The append-only remediation audit trail of the tenant, or of one plan.
// The answer is { "data": [domain.AuditEvent] }.

// AuditQuery is the filter; both fields are optional.
type AuditQuery struct {
	PlanID string
	Limit  int // default 200, maximum 1000
}

const (
	defaultLimit = 200
	maxLimit     = 1000
)
