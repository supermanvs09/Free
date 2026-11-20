package identitygraph

import (
	"context"
	"sync"
	"time"

	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

const (
	activityPageSize    = 50  // default events per page
	maxActivityPageSize = 100 // events per page, upper bound (1000 per request overall)
	activityTopN        = 10
	activityPeakHours   = 5
)

// activityFetch is everything the activity tabs need from ClickHouse.
type activityFetch struct {
	volume  []eventstore.VolumePoint
	events  []eventstore.Event
	total   uint64
	errors  []eventstore.Event
	rows    []eventstore.AnalyticsRow
	callers []eventstore.CallerUsage // credential tab only
}

// fetchActivity runs the activity queries concurrently over the given
// tenant accounts and the requested window. The first error wins and is
// returned with a nil result; callers then answer with an empty,
// "unavailable" tab.
func (a *ActivityService) fetchActivity(ctx context.Context, accounts []string, keys []string, tr *ResolvedTimeRange, p activityPaging, service string, withCallers bool, credentialARN string) (*activityFetch, error) {
	sc := eventstore.Scope{Accounts: accounts, Start: tr.Start, End: tr.End, Service: service}
	sub := eventstore.NewSubject(keys...)
	out := &activityFetch{}

	var (
		wg       PanicGroup
		mu       sync.Mutex
		firstErr error
	)
	run := func(fn func() error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fn(); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
			}
		}()
	}
	ch := a.Ch
	run(func() (err error) { out.volume, err = ch.VolumeChart(ctx, sub, sc); return })
	run(func() (err error) { out.events, err = ch.ActivityEvents(ctx, sub, sc, p.size, p.offset()); return })
	run(func() (err error) { out.total, err = ch.CountEvents(ctx, sub, sc); return })
	run(func() (err error) { out.errors, err = ch.ErrorEvents(ctx, sub, sc, activityPageSize); return })
	run(func() (err error) { out.rows, err = ch.AnalyticsRows(ctx, sub, sc); return })
	if withCallers {
		run(func() (err error) { out.callers, err = ch.IdentitiesUsingCredential(ctx, credentialARN, sc); return })
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	return out, nil
}

// activityPaging is the requested page of the events table.
type activityPaging struct{ page, size int }

func (p activityPaging) offset() int { return (p.page - 1) * p.size }

// normalizePaging applies the defaults and bounds (page >= 1, 1..100 per page).
func normalizePaging(page, size int) activityPaging {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = activityPageSize
	}
	if size > maxActivityPageSize {
		size = maxActivityPageSize
	}
	return activityPaging{page: page, size: size}
}

// loadLookup reads the identity/credential map used to name events. It runs
// next to the ClickHouse fetch; a failure only costs the friendly names.
func (a *ActivityService) loadLookup(ctx context.Context, resolved *scope.DataScope, accounts []string) *IdentityLookup {
	l, err := a.lookup.Load(ctx, resolved.DB, resolved.QSchema(), accounts)
	if err != nil {
		logging.FromContext(ctx).Warn("identity lookup for activity events failed, showing raw callers", "err", err)
		return nil
	}
	return l
}

// IdentityActivity builds tab=activity for an identity from ClickHouse. It
// never fails: when CloudTrail cannot be read the tab is empty and
// activity_data_available is false.
func (a *ActivityService) IdentityActivity(ctx context.Context, resolved *scope.DataScope, subj *ActivitySubject, tr *ResolvedTimeRange, service string, page, pageSize int) *IdentityActivityResponse {
	p := normalizePaging(page, pageSize)
	resp := emptyIdentityActivity(tr, p)
	req := a.ForRequest(ctx, resolved)
	if !req.Available() || subj == nil {
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
	f, err := a.fetchActivity(ctx, accounts, subj.Keys, tr, p, service, false, "")
	wg.Wait()
	if err != nil {
		req.fail("identity activity", err)
		return resp
	}
	resp = identityActivityFrom(f, tr, p, newEventEnricher(lookup))
	resp.ActivityDataAvailable = !req.Degraded()
	return resp
}

// CredentialActivity builds tab=activity for a credential, including which
// identities used it (callers resolved back to Postgres identities).
func (a *ActivityService) CredentialActivity(ctx context.Context, resolved *scope.DataScope, subj *ActivitySubject, tr *ResolvedTimeRange, service string, page, pageSize int) *ActivityResponse {
	p := normalizePaging(page, pageSize)
	resp := emptyCredentialActivity(tr, p)
	req := a.ForRequest(ctx, resolved)
	if !req.Available() || subj == nil {
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
	f, err := a.fetchActivity(ctx, accounts, subj.Keys, tr, p, service, true, subj.ARN)
	wg.Wait()
	if err != nil {
		req.fail("credential activity", err)
		return resp
	}
	enr := newEventEnricher(lookup)
	resp = credentialActivityFrom(f, tr, p, enr)
	resp.IdentitiesUsingThisCredential = resolveCallers(f.callers, subj.ARN, lookup)
	resp.ActivityDataAvailable = !req.Degraded()
	return resp
}

// resolveCallers maps CloudTrail callers of a credential back to identities.
// Unmatched callers are kept and identified by their raw ARN.
func resolveCallers(callers []eventstore.CallerUsage, credentialARN string, lookup *IdentityLookup) []UsingIdentity {
	out := make([]UsingIdentity, 0, len(callers))
	resolver := NewIdentityResolver(lookup)
	byID := map[string]LookupIdentity{}
	if lookup != nil {
		for _, i := range lookup.Identities {
			byID[i.ID] = i
		}
	}
	for _, c := range callers {
		out = append(out, usingIdentityFrom(c, resolver.Resolve(ResolveInput{
			CallerARN: c.CallerARN, SessionIssuerARN: credentialARN, SourceIP: c.SourceIP,
		}), byID))
	}
	return out
}

// eventEnricher names the principal behind each CloudTrail event using the
// resolver over a lookup map that was loaded once for the request.
type eventEnricher struct {
	resolver *IdentityResolver
	creds    map[string]LookupCredential
	idents   map[string]LookupIdentity
}

func newEventEnricher(l *IdentityLookup) *eventEnricher {
	if l == nil {
		return nil
	}
	e := &eventEnricher{
		resolver: NewIdentityResolver(l),
		creds:    make(map[string]LookupCredential, len(l.Credentials)),
		idents:   make(map[string]LookupIdentity, len(l.Identities)),
	}
	for _, c := range l.Credentials {
		e.creds[c.ID] = c
	}
	for _, i := range l.Identities {
		e.idents[i.ID] = i
	}
	return e
}

// principal returns who made the call. A nil enricher (lookup unavailable)
// still reports the raw caller; unmatched events are never dropped.
func (e *eventEnricher) principal(ev eventstore.Event) EventPrincipal {
	p := EventPrincipal{CallerARN: ev.CallerARN, CallerType: strPtr(ev.CallerType)}
	if e == nil {
		return p
	}
	m := e.resolver.Resolve(ResolveInput{
		CallerARN: ev.CallerARN, SessionIssuerARN: ev.SessionIssuerARN,
		AccessKeyID: ev.AccessKeyID, SourceIP: ev.SourceIP,
	})
	if c, ok := e.creds[m.CredentialID]; ok && m.CredentialID != "" {
		id, name := c.ID, c.Name
		p.CredentialID, p.CredentialName = &id, &name
		p.Terminated = m.CredentialTerminated
	}
	if i, ok := e.idents[m.IdentityID]; ok && m.IdentityID != "" {
		id, name := i.ID, i.Name
		p.IdentityID, p.IdentityName = &id, &name
		p.Terminated = m.IdentityTerminated
	}
	return p
}

func usingIdentityFrom(c eventstore.CallerUsage, m Match, byID map[string]LookupIdentity) UsingIdentity {
	u := UsingIdentity{
		CallerARN:      c.CallerARN,
		Name:           arnLastSegment(c.CallerARN),
		IdentityType:   "unknown",
		SourceIP:       strPtr(c.SourceIP),
		LastAction:     strPtr(c.LastAction),
		LastActionTime: timePtr(c.LastActionTime),
	}
	if i, ok := byID[m.IdentityID]; ok && m.IdentityID != "" {
		u.IdentityID, u.Name, u.IdentityType, u.Terminated = i.ID, i.Name, i.Type, m.IdentityTerminated
	}
	return u
}

// ── pure mapping from fetched rows to API shapes ───────────────────────────

func emptyIdentityActivity(tr *ResolvedTimeRange, p activityPaging) *IdentityActivityResponse {
	return &IdentityActivityResponse{
		Tab: "activity", TimeRange: tr.Label,
		VolumeChart:  []VolumePoint{},
		RecentEvents: []IdentityRecentEvent{},
		ErrorEvents:  []IdentityErrorEvent{},
		Analytics: IdentityActivityAnalytics{
			SourceIPs: []IPPct{}, ActiveRegions: []RegionCnt{},
			TopServices: []ServicePct{}, TopActions: []IdentityActionCount{},
			PeakHours: []IdentityHourCount{}, UsagePattern: "Dormant",
		},
		EventsPagination: EventsPagination{Page: p.page, PageSize: p.size},
	}
}

func emptyCredentialActivity(tr *ResolvedTimeRange, p activityPaging) *ActivityResponse {
	return &ActivityResponse{
		Tab: "activity", TimeRange: tr.Label,
		VolumeChart:                   []VolumePoint{},
		RecentEvents:                  []RecentEvent{},
		IdentitiesUsingThisCredential: []UsingIdentity{},
		ErrorEvents:                   []IdentityErrorEvent{},
		Analytics: ActivityAnalytics{
			SourceIPs: []IPPct{}, ActiveRegions: []RegionCnt{},
			TopServices: []ServicePct{}, TopActions: []IdentityActionCount{},
			PeakHours: []IdentityHourCount{}, UsagePattern: "Dormant",
		},
		EventsPagination: EventsPagination{Page: p.page, PageSize: p.size},
	}
}

func identityActivityFrom(f *activityFetch, tr *ResolvedTimeRange, p activityPaging, enr *eventEnricher) *IdentityActivityResponse {
	resp := emptyIdentityActivity(tr, p)
	resp.VolumeChart = volumePoints(f.volume)
	for _, e := range f.events {
		resp.RecentEvents = append(resp.RecentEvents, IdentityRecentEvent{
			EventPrincipal: enr.principal(e),
			EventTime:      timePtr(e.EventTime), EventName: e.EventName, Service: eventstore.ServiceName(e.EventSource),
			ResourceARN: strPtr(e.ResourceARN), SourceIP: strPtr(e.SourceIP), Region: strPtr(e.Region),
			UserAgent: strPtr(e.UserAgent), ErrorCode: strPtr(e.ErrorCode), RequestID: strPtr(e.EventID),
		})
	}
	for _, e := range f.errors {
		resp.ErrorEvents = append(resp.ErrorEvents, errorEventFrom(e, enr))
	}
	a := ProcessActivityAnalytics(f.rows)
	resp.Analytics = IdentityActivityAnalytics{
		SourceIPs:           ipPcts(a.SourceIPs),
		ActiveRegions:       regionCounts(a.ActiveRegions),
		TopServices:         servicePcts(a.TopServices),
		TopActions:          actionCounts(a.TopActions),
		ErrorRatePct:        a.ErrorRatePct,
		AccessDeniedRatePct: a.AccessDeniedRatePct,
		PeakHours:           hourCounts(a.PeakHours),
		UsagePattern:        usagePatternFor(f.volume, tr),
	}
	resp.EventsPagination = pagination(f.total, p)
	return resp
}

func credentialActivityFrom(f *activityFetch, tr *ResolvedTimeRange, p activityPaging, enr *eventEnricher) *ActivityResponse {
	resp := emptyCredentialActivity(tr, p)
	resp.VolumeChart = volumePoints(f.volume)
	for _, e := range f.events {
		resp.RecentEvents = append(resp.RecentEvents, RecentEvent{
			EventPrincipal: enr.principal(e),
			EventTime:      timePtr(e.EventTime), EventName: e.EventName, Service: eventstore.ServiceName(e.EventSource),
			ResourceARN: strPtr(e.ResourceARN), SourceIP: strPtr(e.SourceIP), Region: strPtr(e.Region),
			UserAgent: strPtr(e.UserAgent), ErrorCode: strPtr(e.ErrorCode), EventCount: 1, RequestID: strPtr(e.EventID),
		})
	}
	for _, e := range f.errors {
		resp.ErrorEvents = append(resp.ErrorEvents, errorEventFrom(e, enr))
	}
	a := ProcessActivityAnalytics(f.rows)
	resp.Analytics = ActivityAnalytics{
		SourceIPs:           ipPcts(a.SourceIPs),
		ActiveRegions:       regionCounts(a.ActiveRegions),
		TopServices:         servicePcts(a.TopServices),
		UsagePattern:        usagePatternFor(f.volume, tr),
		ErrorRatePct:        a.ErrorRatePct,
		TopActions:          actionCounts(a.TopActions),
		AccessDeniedRatePct: a.AccessDeniedRatePct,
		PeakHours:           hourCounts(a.PeakHours),
	}
	resp.EventsPagination = pagination(f.total, p)
	return resp
}

func errorEventFrom(e eventstore.Event, enr *eventEnricher) IdentityErrorEvent {
	return IdentityErrorEvent{
		EventPrincipal: enr.principal(e),
		EventTime:      timePtr(e.EventTime), EventName: e.EventName, Service: eventstore.ServiceName(e.EventSource),
		ResourceARN: strPtr(e.ResourceARN), SourceIP: strPtr(e.SourceIP),
		ErrorCode: strPtr(e.ErrorCode), ErrorMessage: strPtr(e.ErrorMessage),
	}
}

func volumePoints(in []eventstore.VolumePoint) []VolumePoint {
	out := make([]VolumePoint, 0, len(in))
	for _, p := range in {
		out = append(out, VolumePoint{Date: p.Date, Count: int(p.Count)})
	}
	return out
}

func ipPcts(in []PctItem) []IPPct {
	out := []IPPct{}
	for i, it := range in {
		if i >= activityTopN {
			break
		}
		out = append(out, IPPct{IP: it.Key, Pct: it.Pct})
	}
	return out
}

func servicePcts(in []PctItem) []ServicePct {
	out := make([]ServicePct, 0, len(in))
	for _, it := range in {
		out = append(out, ServicePct{Service: it.Key, Pct: it.Pct, Count: int(it.Count)})
	}
	return out
}

func regionCounts(in []CountItem) []RegionCnt {
	out := make([]RegionCnt, 0, len(in))
	for _, it := range in {
		out = append(out, RegionCnt{Region: it.Key, Count: int(it.Count)})
	}
	return out
}

func actionCounts(in []CountItem) []IdentityActionCount {
	out := []IdentityActionCount{}
	for i, it := range in {
		if i >= activityTopN {
			break
		}
		out = append(out, IdentityActionCount{Action: it.Key, Count: int(it.Count)})
	}
	return out
}

func hourCounts(in []HourItem) []IdentityHourCount {
	out := []IdentityHourCount{}
	for i, it := range in {
		if i >= activityPeakHours {
			break
		}
		out = append(out, IdentityHourCount{Hour: it.Hour, Count: int(it.Count)})
	}
	return out
}

func pagination(total uint64, p activityPaging) EventsPagination {
	t := int(total)
	return EventsPagination{
		Page: p.page, PageSize: p.size, TotalCount: t,
		TotalPages: (t + p.size - 1) / p.size,
	}
}

// usagePatternFor labels how evenly activity is spread over the window. For
// "all" the window starts at the first active day rather than a century ago.
func usagePatternFor(volume []eventstore.VolumePoint, tr *ResolvedTimeRange) string {
	rangeDays := tr.Days
	if tr.Label == "all" && len(volume) > 0 {
		if first, err := time.Parse("2006-01-02", volume[0].Date); err == nil {
			rangeDays = int(tr.End.Sub(first).Hours()/24) + 1
		}
	}
	return ActivityUsagePattern(len(volume), rangeDays)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	v := t
	return &v
}

// arnLastSegment is the display name for a caller that matched no identity.
func arnLastSegment(arn string) string {
	for i := len(arn) - 1; i >= 0; i-- {
		if arn[i] == '/' || arn[i] == ':' {
			if i == len(arn)-1 {
				return arn
			}
			return arn[i+1:]
		}
	}
	return arn
}
