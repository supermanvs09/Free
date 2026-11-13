package identitygraph

import (
	"context"
	"strings"
	"time"

	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/scope"
)

// roleSessionLimit bounds the sessions listed (the total is still counted).
const roleSessionLimit = 100

// RoleSessionsResponse is tab=sessions of a role credential: a role has no
// secret to rotate or expire; what matters is who opens sessions on it.
type RoleSessionsResponse struct {
	Tab                   string            `json:"tab"`
	TimeRange             string            `json:"time_range"`
	ActivityDataAvailable bool              `json:"activity_data_available"`
	Assumers              []RoleAssumerItem `json:"assumers"`
	Sessions              []RoleSessionItem `json:"sessions"`
	SessionsTotal         uint64            `json:"sessions_total"`
	// HoursUTC is the number of sessions started in each UTC hour of the day.
	HoursUTC [24]uint64 `json:"hours_utc"`
}

type RoleAssumerItem struct {
	ARN        string `json:"arn"`
	Name       string `json:"name"`
	Kind       string `json:"kind"` // iam_user | role_session | aws_service | root | other
	IdentityID string `json:"identity_id,omitempty"`
	// LongLivedKey: the assumer signed with a permanent IAM user access key
	// (AKIA…), so a leaked key is a standing path into this role.
	LongLivedKey   bool      `json:"long_lived_key"`
	AccessKeyID    string    `json:"access_key_id,omitempty"`
	Sessions       uint64    `json:"sessions"`
	FirstAssumedAt time.Time `json:"first_assumed_at"`
	LastAssumedAt  time.Time `json:"last_assumed_at"`
}

type RoleSessionItem struct {
	SessionName string    `json:"session_name"`
	CallerARN   string    `json:"caller_arn"`
	SourceIP    string    `json:"source_ip,omitempty"`
	StartedAt   time.Time `json:"started_at"`
	LastCallAt  time.Time `json:"last_call_at"`
	Calls       uint64    `json:"calls"`
}

// IsRoleARN reports whether arn names an IAM role.
func IsRoleARN(arn string) bool { return strings.Contains(arn, ":role/") }

// RoleSessions builds tab=sessions from CloudTrail. Like the activity tab it
// never fails: without CloudTrail the lists are empty and
// activity_data_available is false.
func (a *ActivityService) RoleSessions(ctx context.Context, resolved *scope.DataScope, subj *ActivitySubject, tr *ResolvedTimeRange) *RoleSessionsResponse {
	resp := &RoleSessionsResponse{Tab: "sessions", TimeRange: tr.Label, Assumers: []RoleAssumerItem{}, Sessions: []RoleSessionItem{}}
	req := a.ForRequest(ctx, resolved)
	if !req.Available() || subj == nil || !IsRoleARN(subj.ARN) {
		return resp
	}
	accounts := req.TenantAccounts(ctx)
	if len(accounts) == 0 {
		resp.ActivityDataAvailable = !req.Degraded()
		return resp
	}
	var lookup *IdentityLookup
	var wg PanicGroup
	wg.Add(1)
	go func() { defer wg.Done(); lookup = a.loadLookup(ctx, resolved, accounts) }()
	res, err := a.Ch.RoleSessions(ctx, subj.ARN, eventstore.Scope{Accounts: accounts, Start: tr.Start, End: tr.End}, roleSessionLimit)
	wg.Wait()
	if err != nil {
		req.fail("role sessions", err)
		return resp
	}
	resp.ActivityDataAvailable = !req.Degraded()
	if res == nil {
		return resp
	}
	byARN := map[string]LookupIdentity{}
	if lookup != nil {
		for _, i := range lookup.Identities {
			byARN[i.ARN] = i
		}
	}
	for _, r := range res.Assumers {
		it := RoleAssumerItem{
			ARN: r.CallerARN, Name: arnLastSegment(r.CallerARN), Kind: assumerKind(r.CallerARN, r.CallerType),
			LongLivedKey: strings.HasPrefix(r.AccessKeyID, "AKIA"), AccessKeyID: r.AccessKeyID,
			Sessions: r.Sessions, FirstAssumedAt: r.First, LastAssumedAt: r.Last,
		}
		if i, ok := byARN[r.CallerARN]; ok {
			it.IdentityID, it.Name = i.ID, i.Name
		}
		resp.Assumers = append(resp.Assumers, it)
	}
	for _, s := range res.Sessions {
		resp.Sessions = append(resp.Sessions, RoleSessionItem{
			SessionName: arnLastSegment(s.CallerARN), CallerARN: s.CallerARN, SourceIP: s.SourceIP,
			StartedAt: s.Start, LastCallAt: s.End, Calls: s.Calls,
		})
	}
	resp.SessionsTotal, resp.HoursUTC = res.Total, res.Hours
	return resp
}

func assumerKind(arn, callerType string) string {
	switch {
	case callerType == "IAMUser" || strings.Contains(arn, ":user/"):
		return "iam_user"
	case callerType == "AssumedRole" || strings.Contains(arn, ":assumed-role/"):
		return "role_session"
	case callerType == "AWSService" || strings.HasSuffix(arn, ".amazonaws.com"):
		return "aws_service"
	case callerType == "Root" || strings.HasSuffix(arn, ":root"):
		return "root"
	}
	return "other"
}
