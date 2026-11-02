package listplans

// GET /remediation/plans (every role)

// ListPlansQuery is the filter of the plan list. Every field is optional.
type ListPlansQuery struct {
	Status    string
	AccountID string
	FindingID string
	BatchID   string
	TargetARN string
	Limit     int // default 50, maximum 200
	Offset    int
}

const (
	defaultLimit = 50
	maxLimit     = 200
)
