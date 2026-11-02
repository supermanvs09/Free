package identityactivity

import (
	"time"

	"nhi-backend-api/internal/modules/posture/common"
)

// GET /identities/{id}/activity?window=30d&mutating=&service=&limit=&cursor=

type IdentityActivityFilter struct {
	Window   common.Window
	Mutating *bool
	Service  string
	Limit    int
	Cursor   string
}

type ActivityEvent struct {
	EventTime time.Time `json:"event_time"`
	Action    string    `json:"action"`
	Service   string    `json:"service"`
	SourceIP  string    `json:"source_ip"`
	Region    string    `json:"region"`
	Mutating  bool      `json:"mutating"`
	ErrorCode *string   `json:"error_code"`
}
