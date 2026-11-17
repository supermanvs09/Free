package awsintegration

import (
	"os"
	"strconv"
	"strings"
)

// SyncCooldownMinutes is NHI_SYNC_COOLDOWN_MINUTES: after an account is
// synced, how many minutes before it can be synced again. Empty, 0 or not a
// number means no wait. It applies to each account on its own: syncing one
// account never holds back another. The console enforces it; the scan
// service may still answer "wait" on its own, which the console shows.
func SyncCooldownMinutes() int {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv("NHI_SYNC_COOLDOWN_MINUTES")))
	if err != nil || n < 0 {
		return 0
	}
	if n > 24*60 { // a day at most: anything longer is a typo
		return 24 * 60
	}
	return n
}
