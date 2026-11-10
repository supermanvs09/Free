package identitygraph

import (
	"context"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/identitygraph/eventstore"
)

// ActivitySource is the CloudTrail-derived data the repositories merge into
// their Postgres results. Keys are identity ARNs, credential ARNs or access
// key IDs; the implementation matches them against caller, session issuer and
// access key in ClickHouse, inside the tenant's accounts.
//
// Implementations never return errors. When ClickHouse is off or a query
// fails they return empty results and report it through Available/Degraded,
// so callers always get a complete Postgres-only response.
type ActivitySource interface {
	// Available reports that ClickHouse is configured and usable.
	Available() bool
	// Degraded reports that a ClickHouse query failed during this request, so
	// the activity figures may be incomplete.
	Degraded() bool
	// LastSeen returns the most recent event time per key; keys with no events
	// are absent.
	LastSeen(ctx context.Context, keys []string) map[string]time.Time
	// Creators returns the creator ARN per resource ARN; unknown ARNs are absent.
	Creators(ctx context.Context, arns []string) map[string]string
	// UsedActionSets returns the distinct successful actions per key since the
	// given time (zero: no lower bound).
	UsedActionSets(ctx context.Context, keys []string, since time.Time) map[string][]eventstore.UsedAction
	// UsedPermissions returns the successful actions seen for any of the keys
	// since the given time, with first/last use, counts, source IPs and regions.
	UsedPermissions(ctx context.Context, keys []string, since time.Time) []eventstore.UsedPermission
	// AccessEdges returns the resources successfully called by any of the keys
	// between since and until (a zero until means now), with call counts.
	AccessEdges(ctx context.Context, keys []string, since, until time.Time) []eventstore.AccessEdge
	// AccountVolume returns events per UTC day since the given time in those
	// of the accounts that belong to the tenant; ok is false when the query
	// could not run or failed.
	AccountVolume(ctx context.Context, accounts []string, since time.Time) (points []eventstore.VolumePoint, ok bool)
}

// UsageWindowDays is the look-back for "what did this credential actually use":
// permission utilisation, used-vs-granted and the trust summary.
const UsageWindowDays = 90

// usageSince returns the start of the usage window relative to now.
func UsageSince(now time.Time) time.Time { return now.AddDate(0, 0, -UsageWindowDays) }

// noActivity is the ActivitySource used when ClickHouse is not wired in.
type NoActivity struct{}

func (NoActivity) Available() bool                                         { return false }
func (NoActivity) Degraded() bool                                          { return false }
func (NoActivity) LastSeen(context.Context, []string) map[string]time.Time { return nil }
func (NoActivity) Creators(context.Context, []string) map[string]string    { return nil }
func (NoActivity) UsedActionSets(context.Context, []string, time.Time) map[string][]eventstore.UsedAction {
	return nil
}
func (NoActivity) UsedPermissions(context.Context, []string, time.Time) []eventstore.UsedPermission {
	return nil
}
func (NoActivity) AccountVolume(context.Context, []string, time.Time) ([]eventstore.VolumePoint, bool) {
	return nil, false
}
func (NoActivity) AccessEdges(context.Context, []string, time.Time, time.Time) []eventstore.AccessEdge {
	return nil
}

// orNoActivity lets every repository treat a nil source as "no activity data".
func OrNoActivity(src ActivitySource) ActivitySource {
	if src == nil {
		return NoActivity{}
	}
	return src
}

// latestOf returns the newest time among the given keys, or nil.
func LatestOf(seen map[string]time.Time, keys []string) *time.Time {
	var best *time.Time
	for _, k := range keys {
		if t, ok := seen[k]; ok && (best == nil || t.After(*best)) {
			tt := t
			best = &tt
		}
	}
	return best
}

// wholeDaysSince returns floor((now - t) / 24h), the same rounding the old
// SQL used for idle_days, or nil when t is nil.
func WholeDaysSince(t *time.Time, now time.Time) *int {
	if t == nil {
		return nil
	}
	d := int(now.Sub(*t).Hours() / 24)
	if d < 0 {
		d = 0
	}
	return &d
}

// distinctUsedCount counts the distinct (service, action) pairs used across
// the given keys.
func DistinctUsedCount(sets map[string][]eventstore.UsedAction, keys []string) int {
	seen := map[string]struct{}{}
	for _, k := range keys {
		for _, a := range sets[k] {
			seen[strings.ToLower(a.Service)+":"+strings.ToLower(a.Action)] = struct{}{}
		}
	}
	return len(seen)
}

// splitGrantedAction separates a granted permission such as "s3:GetObject"
// into service and action; the service falls back to the entry's own service
// field when the action carries no prefix.
func splitGrantedAction(service, action string) (string, string) {
	service, action = strings.ToLower(strings.TrimSpace(service)), strings.ToLower(strings.TrimSpace(action))
	if i := strings.Index(action, ":"); i >= 0 {
		if service == "" {
			service = action[:i]
		}
		action = action[i+1:]
	}
	return service, action
}

// globMatch reports whether s matches pattern, where '*' matches any run of
// characters and '?' any single character (IAM action wildcard rules).
func globMatch(pattern, s string) bool {
	p, n := []rune(pattern), []rune(s)
	pi, si, star, mark := 0, 0, -1, 0
	for si < len(n) {
		switch {
		case pi < len(p) && (p[pi] == '?' || p[pi] == n[si]):
			pi++
			si++
		case pi < len(p) && p[pi] == '*':
			star, mark = pi, si
			pi++
		case star >= 0:
			pi = star + 1
			mark++
			si = mark
		default:
			return false
		}
	}
	for pi < len(p) && p[pi] == '*' {
		pi++
	}
	return pi == len(p)
}

// matchGranted reports whether a used (service, event name) is covered by a
// granted permission, honouring wildcards such as "s3:Get*" or "*".
func matchGranted(grantedService, grantedAction, usedService, usedAction string) bool {
	gs, ga := splitGrantedAction(grantedService, grantedAction)
	if gs != "" && gs != "*" && !globMatch(gs, strings.ToLower(usedService)) {
		return false
	}
	if ga == "" {
		return false
	}
	return globMatch(ga, strings.ToLower(usedAction))
}

// usageFor folds every used action that a granted permission covers into one
// answer: whether it was used, when last, and from which source IPs.
func usageFor(grantedService, grantedAction string, used []eventstore.UsedPermission) (bool, *time.Time, []string) {
	var last *time.Time
	ips := map[string]struct{}{}
	matched := false
	for _, u := range used {
		if !matchGranted(grantedService, grantedAction, u.Service, u.Action) {
			continue
		}
		matched = true
		if last == nil || u.LastUsedAt.After(*last) {
			t := u.LastUsedAt
			last = &t
		}
		for _, ip := range u.SourceIPs {
			if ip != "" {
				ips[ip] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(ips))
	for ip := range ips {
		out = append(out, ip)
	}
	sort.Strings(out)
	return matched, last, out
}

// GrantedAction is one allowed (service, action) entry of
// effective_permissions.permissions; the action may carry wildcards.
type GrantedAction struct{ Service, Action string }

// GrantedActionsFrom reads the allowed entries of effective_permissions rows
// (Deny entries are left out: they allow nothing).
func GrantedActionsFrom(entries []map[string]interface{}) []GrantedAction {
	str := func(m map[string]interface{}, keys ...string) string {
		for _, k := range keys {
			if v, ok := m[k].(string); ok && v != "" {
				return v
			}
		}
		return ""
	}
	out := make([]GrantedAction, 0, len(entries))
	for _, e := range entries {
		if strings.EqualFold(str(e, "effect", "Effect"), "deny") {
			continue
		}
		if a := str(e, "action", "Action"); a != "" {
			out = append(out, GrantedAction{Service: str(e, "service", "Service"), Action: a})
		}
	}
	return out
}

// UsedGrantedCount counts the distinct actions CloudTrail saw under keys that
// an allowed entry covers. A call no entry allows (sts:GetCallerIdentity needs
// no permission; a policy not in effective_permissions) is not "a granted
// action used": counting it made the summary report allowed actions as used
// while every one of them was listed as never used. With no entries to match
// against (only a granted_count) every distinct action counts, as before.
func UsedGrantedCount(sets map[string][]eventstore.UsedAction, keys []string, granted []GrantedAction) int {
	if len(granted) == 0 {
		return DistinctUsedCount(sets, keys)
	}
	seen := map[string]struct{}{}
	for _, k := range keys {
		for _, a := range sets[k] {
			id := strings.ToLower(a.Service) + ":" + strings.ToLower(a.Action)
			if _, ok := seen[id]; ok {
				continue
			}
			for _, g := range granted {
				if matchGranted(g.Service, g.Action, a.Service, a.Action) {
					seen[id] = struct{}{}
					break
				}
			}
		}
	}
	return len(seen)
}
