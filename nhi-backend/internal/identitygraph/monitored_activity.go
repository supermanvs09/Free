package identitygraph

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

// MonitoredKey is how the behaviour pipeline's log_events knows an identity
// (the NHI Genome key): its workload family and its event identity name.
type MonitoredKey struct {
	SourceType string
	EventName  string
}

// MonitoredIdentity is the discovery row a key is derived from.
type MonitoredIdentity struct {
	ID             string
	Name           string
	ARN            string
	IdentityType   string
	AccountID      string
	Region         string
	Status         string
	TypeAttributes []byte
}

// MonitoredActivity reads calls from the same store and with the same rules
// as the NHI Genome pages (log_events, one row per unique event_id, scoped to
// the user's selected accounts). The identity and credential Activity tabs
// use it whenever the identity is a monitored workload, so the calls they
// show and count are the calls Genome shows and counts for that identity;
// identities the pipeline does not watch keep the CloudTrail store.
//
// Implemented in the genome module (summarycommon.InventoryActivity), where
// the key rules and the log_events readers live; this package only sees the
// interface, so there is one definition of "an identity's calls".
type MonitoredActivity interface {
	Enabled() bool
	KeyFor(id MonitoredIdentity) (MonitoredKey, bool)
	Volume(ctx context.Context, accounts []string, key MonitoredKey, start, end time.Time) ([]eventstore.VolumePoint, error)
	Events(ctx context.Context, accounts []string, key MonitoredKey, start, end time.Time, limit int) ([]eventstore.Event, error)
	Total(ctx context.Context, accounts []string, key MonitoredKey, start, end time.Time) (uint64, error)
	Analytics(ctx context.Context, accounts []string, key MonitoredKey, start, end time.Time) ([]eventstore.AnalyticsRow, error)
}

// SetMonitored wires the Genome event store in. nil keeps CloudTrail only.
func (a *ActivityService) SetMonitored(m MonitoredActivity) { a.monitored = m }

func (a *ActivityService) monitoredOn(service string) bool {
	// A service filter has no counterpart on the Genome pages, so a filtered
	// view keeps the CloudTrail store rather than inventing one.
	return a.monitored != nil && a.monitored.Enabled() && strings.TrimSpace(service) == ""
}

// monitoredWindow is the time range the tab asked for, as Genome reads it:
// [start, end) with "now" when the range is open-ended.
func monitoredWindow(tr *ResolvedTimeRange) (time.Time, time.Time) {
	start, end := tr.Start, tr.End
	if end.IsZero() {
		end = time.Now().UTC()
	}
	if start.IsZero() {
		start = end.AddDate(0, 0, -90)
	}
	return start.UTC(), end.UTC()
}

// loadMonitoredIdentities reads the discovery rows the keys are derived from:
// the identity itself, or the identities bound to a credential.
func loadMonitoredIdentities(ctx context.Context, resolved *scope.DataScope, identityID, credentialID string) ([]MonitoredIdentity, error) {
	schema := resolved.QSchema()
	var q string
	var arg string
	if identityID != "" {
		q = fmt.Sprintf(`SELECT i.id::text, COALESCE(i.name, ''), COALESCE(i.arn, ''), COALESCE(i.identity_type, ''),
			COALESCE(i.account_id, ''), COALESCE(i.region, ''), COALESCE(i.status, ''), i.type_attributes
			FROM %s.identities i WHERE i.id::text = $1 AND i.deleted_at IS NULL`, schema)
		arg = identityID
	} else {
		q = fmt.Sprintf(`SELECT DISTINCT i.id::text, COALESCE(i.name, ''), COALESCE(i.arn, ''), COALESCE(i.identity_type, ''),
			COALESCE(i.account_id, ''), COALESCE(i.region, ''), COALESCE(i.status, ''), i.type_attributes
			FROM %[1]s.identity_credentials ic
			JOIN %[1]s.identities i ON i.id::text = ic.identity_id::text AND i.deleted_at IS NULL
			WHERE ic.credential_id::text = $1`, schema)
		arg = credentialID
	}
	rows, err := resolved.DB.QueryContext(ctx, q, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MonitoredIdentity
	for rows.Next() {
		var m MonitoredIdentity
		var attrs sql.RawBytes
		if err := rows.Scan(&m.ID, &m.Name, &m.ARN, &m.IdentityType, &m.AccountID, &m.Region, &m.Status, &attrs); err != nil {
			return nil, err
		}
		m.TypeAttributes = append([]byte(nil), attrs...)
		out = append(out, m)
	}
	return out, rows.Err()
}

type monitoredSubject struct {
	identity MonitoredIdentity
	key      MonitoredKey
}

// monitoredFetch reads everything the tab needs from log_events, for one or
// several monitored identities (a credential's), and merges it.
func (a *ActivityService) monitoredFetch(ctx context.Context, accounts []string, subjects []monitoredSubject, tr *ResolvedTimeRange, p activityPaging) (*activityFetch, map[string]eventstore.Event, error) {
	start, end := monitoredWindow(tr)
	m := a.monitored
	out := &activityFetch{}
	byDay := map[string]uint64{}
	lastBy := map[string]eventstore.Event{} // identity id -> newest event
	want := p.offset() + p.size
	for _, s := range subjects {
		total, err := m.Total(ctx, accounts, s.key, start, end)
		if err != nil {
			return nil, nil, err
		}
		out.total += total
		vol, err := m.Volume(ctx, accounts, s.key, start, end)
		if err != nil {
			return nil, nil, err
		}
		for _, v := range vol {
			byDay[v.Date] += v.Count
		}
		evs, err := m.Events(ctx, accounts, s.key, start, end, want)
		if err != nil {
			return nil, nil, err
		}
		if len(evs) > 0 {
			lastBy[s.identity.ID] = evs[0]
		}
		out.events = append(out.events, evs...)
		rows, err := m.Analytics(ctx, accounts, s.key, start, end)
		if err != nil {
			return nil, nil, err
		}
		out.rows = append(out.rows, rows...)
	}
	for day, n := range byDay {
		out.volume = append(out.volume, eventstore.VolumePoint{Date: day, Count: n})
	}
	sort.Slice(out.volume, func(i, j int) bool { return out.volume[i].Date < out.volume[j].Date })
	sort.SliceStable(out.events, func(i, j int) bool {
		if !out.events[i].EventTime.Equal(out.events[j].EventTime) {
			return out.events[i].EventTime.After(out.events[j].EventTime)
		}
		return out.events[i].EventID > out.events[j].EventID
	})
	from := p.offset()
	if from > len(out.events) {
		from = len(out.events)
	}
	to := from + p.size
	if to > len(out.events) {
		to = len(out.events)
	}
	out.events = out.events[from:to]
	return out, lastBy, nil
}

// monitoredSubjects maps discovery rows to Genome keys, dropping the ones the
// pipeline does not watch.
func (a *ActivityService) monitoredSubjects(rows []MonitoredIdentity) []monitoredSubject {
	var out []monitoredSubject
	for _, r := range rows {
		if key, ok := a.monitored.KeyFor(r); ok {
			out = append(out, monitoredSubject{identity: r, key: key})
		}
	}
	return out
}

// monitoredIdentityActivity answers tab=activity for an identity from
// log_events. ok is false when the identity is not a monitored workload (or
// the store failed), and the caller then uses CloudTrail.
func (a *ActivityService) monitoredIdentityActivity(ctx context.Context, resolved *scope.DataScope, subj *ActivitySubject, tr *ResolvedTimeRange, p activityPaging) (*IdentityActivityResponse, bool) {
	rows, err := loadMonitoredIdentities(ctx, resolved, subj.ID, "")
	if err != nil {
		logging.FromContext(ctx).Warn("monitored activity: identity lookup failed, using CloudTrail", "err", err)
		return nil, false
	}
	subjects := a.monitoredSubjects(rows)
	if len(subjects) == 0 {
		return nil, false
	}
	f, _, err := a.monitoredFetch(ctx, resolved.AccountIDs, subjects, tr, p)
	if err != nil {
		logging.FromContext(ctx).Warn("monitored activity: log_events read failed, using CloudTrail", "err", err)
		return nil, false
	}
	resp := identityActivityFrom(f, tr, p, newEventEnricher(nil))
	resp.ActivityDataAvailable = true
	return resp, true
}

// monitoredCredentialActivity answers tab=activity for a credential from the
// log_events of the monitored identities bound to it.
func (a *ActivityService) monitoredCredentialActivity(ctx context.Context, resolved *scope.DataScope, subj *ActivitySubject, tr *ResolvedTimeRange, p activityPaging) (*ActivityResponse, bool) {
	rows, err := loadMonitoredIdentities(ctx, resolved, "", subj.ID)
	if err != nil {
		logging.FromContext(ctx).Warn("monitored activity: credential bindings lookup failed, using CloudTrail", "err", err)
		return nil, false
	}
	subjects := a.monitoredSubjects(rows)
	if len(subjects) == 0 {
		return nil, false
	}
	f, lastBy, err := a.monitoredFetch(ctx, resolved.AccountIDs, subjects, tr, p)
	if err != nil {
		logging.FromContext(ctx).Warn("monitored activity: log_events read failed, using CloudTrail", "err", err)
		return nil, false
	}
	resp := credentialActivityFrom(f, tr, p, newEventEnricher(nil))
	resp.IdentitiesUsingThisCredential = make([]UsingIdentity, 0, len(subjects))
	for _, s := range subjects {
		u := UsingIdentity{IdentityID: s.identity.ID, Name: s.identity.Name, IdentityType: s.identity.IdentityType, CallerARN: s.identity.ARN}
		if e, ok := lastBy[s.identity.ID]; ok {
			action := e.EventName
			t := e.EventTime
			u.LastAction, u.LastActionTime = &action, &t
			if e.SourceIP != "" {
				ip := e.SourceIP
				u.SourceIP = &ip
			}
		}
		resp.IdentitiesUsingThisCredential = append(resp.IdentitiesUsingThisCredential, u)
	}
	resp.ActivityDataAvailable = true
	return resp, true
}

// MonitoredUsageSource is an ActivitySource that can also say what the
// behaviour pipeline saw one identity do. CloudTrail is matched on credential
// ARNs, but the pipeline attributes an EC2 instance's or a task's calls to
// the workload itself (its workload key), so a role that the pipeline watches
// can read "never used" by ARN while Genome shows thousands of calls.
type MonitoredUsageSource interface {
	// MonitoredUsed lists the successful actions the pipeline attributes to
	// the discovery identity since the given time; nil when it does not watch
	// it or its store is unavailable.
	MonitoredUsed(ctx context.Context, identityID string, since time.Time) []eventstore.UsedPermission
}

var _ MonitoredUsageSource = (*RequestActivity)(nil)

// monitoredUsageEventLimit bounds the newest calls read to date each action.
const monitoredUsageEventLimit = 5000

// MonitoredUsed implements MonitoredUsageSource from the Genome event store:
// every distinct successful (service, action) with its count (from the
// aggregation, so it is exact) and last use (from the newest calls).
func (r *RequestActivity) MonitoredUsed(ctx context.Context, identityID string, since time.Time) []eventstore.UsedPermission {
	m := r.svc.monitored
	if m == nil || !m.Enabled() || identityID == "" || r.resolved == nil || r.resolved.DB == nil {
		return nil
	}
	accounts := r.monitoredAccounts(ctx)
	if len(accounts) == 0 {
		return nil
	}
	ids, err := loadMonitoredIdentities(ctx, r.resolved, identityID, "")
	if err != nil {
		r.fail("monitored identity", err)
		return nil
	}
	end := time.Now().UTC()
	if since.IsZero() || since.After(end) {
		since = end.AddDate(0, 0, -90)
	}
	byAction := map[string]*eventstore.UsedPermission{}
	var order []string
	for _, id := range ids {
		key, ok := m.KeyFor(id)
		if !ok {
			continue
		}
		rows, err := m.Analytics(ctx, accounts, key, since.UTC(), end)
		if err != nil {
			r.fail("monitored usage", err)
			return nil
		}
		for _, row := range rows {
			if row.ErrorCode != "" || row.EventName == "" { // a refused call is not use
				continue
			}
			svc := eventstore.ServiceName(row.EventSource)
			k := strings.ToLower(svc + ":" + row.EventName)
			u, ok := byAction[k]
			if !ok {
				u = &eventstore.UsedPermission{Service: svc, EventSource: row.EventSource, Action: row.EventName}
				byAction[k] = u
				order = append(order, k)
			}
			u.UsageCount += row.Count
			if row.SourceIP != "" && !containsString(u.SourceIPs, row.SourceIP) {
				u.SourceIPs = append(u.SourceIPs, row.SourceIP)
			}
			if row.Region != "" && !containsString(u.Regions, row.Region) {
				u.Regions = append(u.Regions, row.Region)
			}
		}
		// When each action was last seen, from the newest calls.
		if events, err := m.Events(ctx, accounts, key, since.UTC(), end, monitoredUsageEventLimit); err == nil {
			for _, ev := range events {
				if ev.ErrorCode != "" {
					continue
				}
				k := strings.ToLower(eventstore.ServiceName(ev.EventSource) + ":" + ev.EventName)
				if u, ok := byAction[k]; ok && ev.EventTime.After(u.LastUsedAt) {
					u.LastUsedAt = ev.EventTime
					if u.FirstUsedAt.IsZero() || ev.EventTime.Before(u.FirstUsedAt) {
						u.FirstUsedAt = ev.EventTime
					}
				}
			}
		}
	}
	out := make([]eventstore.UsedPermission, 0, len(order))
	for _, k := range order {
		out = append(out, *byAction[k])
	}
	return out
}

// usedActionsOf is the distinct (service, action) pairs of used permissions.
func usedActionsOf(used []eventstore.UsedPermission) []eventstore.UsedAction {
	out := make([]eventstore.UsedAction, 0, len(used))
	for _, u := range used {
		out = append(out, eventstore.UsedAction{Service: u.Service, Action: u.Action})
	}
	return out
}

// monitoredAccounts is the tenant's accounts. Unlike TenantAccounts it does
// not need the CloudTrail store: the Genome store is read on its own.
func (r *RequestActivity) monitoredAccounts(ctx context.Context) []string {
	if v, ok := r.svc.accounts.get(r.tenantID); ok {
		return v
	}
	accounts, err := r.svc.lookup.TenantAccountIDs(ctx, r.resolved.DB, r.resolved.QSchema(), r.tenantID)
	if err != nil {
		r.fail("tenant accounts", err)
		return nil
	}
	r.svc.accounts.set(r.tenantID, accounts)
	return accounts
}
