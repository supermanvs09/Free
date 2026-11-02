package identityevents

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/identitygraph/eventstore"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/scope"
)

// ErrEventNotFound is returned by the detail section when the event does not
// exist or does not belong to this identity and tenant.
var ErrEventNotFound = errors.New("event not found")

// sessionGap is the idle time after which the same caller starts a new session.
const sessionGap = 30 * time.Minute

// eventStore is what the Identity Event Graph needs from ClickHouse. It is
// satisfied by *chrepo.Repository and faked in tests.
type eventStore interface {
	EventsPage(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter, limit, offset int) ([]eventstore.Event, error)
	CountFiltered(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) (uint64, error)
	EventByID(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, eventID string) (*eventstore.Event, error)
	CredentialUsage(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) ([]eventstore.CredentialUsageRow, error)
	ResourceAccess(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) ([]eventstore.ResourceRow, uint64, error)
	Heatmap(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) ([]eventstore.HeatCell, error)
	SessionEvents(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) ([]eventstore.SessionEvent, bool, error)
	ErrorSummary(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) (*eventstore.ErrorSummaryResult, error)
	CrossAccount(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter, homeAccount string) ([]eventstore.CrossAccountRow, uint64, error)
	IPStats(ctx context.Context, sub eventstore.Subject, sc eventstore.Scope, f eventstore.EventFilter) ([]eventstore.IPRow, uint64, error)
}

var _ eventStore = (*eventstore.Repository)(nil)

// grantLookup resolves the policy statement behind an event for one credential.
type grantLookup func(ctx context.Context, credentialID, service, eventName string) (*identitygraph.PermissionSourceResponse, error)

// IdentityEventsService implements GET /api/v1/identities/{id}/events.
type IdentityEventsService struct {
	repo     *IdentityEventsRepository
	resolver *scope.Resolver
	activity *identitygraph.ActivityService
}

func NewIdentityEventsService(repo *IdentityEventsRepository, resolver *scope.Resolver, activity *identitygraph.ActivityService) *IdentityEventsService {
	return &IdentityEventsService{repo: repo, resolver: resolver, activity: activity}
}

// Get returns the requested section. When ClickHouse is disabled or a query
// fails the section is returned empty with data_available=false, never as an
// error: Postgres data is still served by the rest of the API.
func (s *IdentityEventsService) Get(ctx context.Context, userID, tenantID, dbName string, q IdentityEventsQuery) (interface{}, error) {
	tr, err := ResolveEventsRange(q.TimeRange, q.StartDate, q.EndDate)
	if err != nil {
		return nil, err
	}
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	ident, err := s.repo.LoadEventContext(ctx, resolved, q.IdentityID)
	if err != nil {
		return nil, err
	}

	env := &eventsEnv{
		ctx:   ctx,
		ident: ident,
		q:     q,
		tr:    tr,
		grant: func(ctx context.Context, credentialID, service, eventName string) (*identitygraph.PermissionSourceResponse, error) {
			return s.repo.GrantFor(ctx, resolved, credentialID, service, eventName)
		},
	}
	if req := s.activity.ForRequest(ctx, resolved); req.Available() {
		env.store = s.activity.Ch
		env.accounts = req.TenantAccounts(ctx)
	}
	return env.run(ctx)
}

// eventsEnv holds everything one request needs, so the section logic can be
// tested without a database.
type eventsEnv struct {
	ctx      context.Context // the request, so log lines carry its id
	store    eventStore      // nil when ClickHouse is unavailable
	accounts []string        // the tenant's accounts: the isolation boundary
	ident    *EventsContext
	q        IdentityEventsQuery
	tr       *identitygraph.ResolvedTimeRange
	grant    grantLookup

	byARN       map[string]EventsCredential
	byAccessKey map[string]EventsCredential
	failed      bool
	mu          sync.Mutex
}

func (e *eventsEnv) run(ctx context.Context) (interface{}, error) {
	e.index()
	switch e.q.Section {
	case EventsSectionTimeline:
		return e.timeline(ctx), nil
	case EventsSectionDetail:
		return e.detail(ctx)
	case EventsSectionCredentials:
		return e.credentials(ctx), nil
	case EventsSectionResources:
		return e.resources(ctx), nil
	case EventsSectionHeatmap:
		return e.heatmap(ctx), nil
	case EventsSectionSessions:
		return e.sessions(ctx), nil
	case EventsSectionErrors:
		return e.errorsSection(ctx), nil
	case EventsSectionCrossAccount:
		return e.crossAccount(ctx), nil
	case EventsSectionIPs:
		return e.ips(ctx), nil
	}
	return nil, fmt.Errorf("unsupported events section %q", e.q.Section)
}

// index builds the in-memory credential lookups (performance rule 1: the
// credentials are loaded once, then every event is enriched from memory).
func (e *eventsEnv) index() {
	e.byARN = map[string]EventsCredential{}
	e.byAccessKey = map[string]EventsCredential{}
	for _, c := range e.ident.Credentials {
		if c.ARN != "" {
			e.byARN[c.ARN] = c
		}
		if strings.EqualFold(c.Type, "access_key") && c.Name != "" {
			e.byAccessKey[c.Name] = c
		}
	}
}

// match finds the credential an event used: its session issuer, then the
// caller ARN, then the access key.
func (e *eventsEnv) match(issuerARN, callerARN, accessKeyID string) (EventsCredential, bool) {
	if c, ok := e.byARN[issuerARN]; ok && issuerARN != "" {
		return c, true
	}
	if c, ok := e.byARN[callerARN]; ok && callerARN != "" {
		return c, true
	}
	if c, ok := e.byAccessKey[accessKeyID]; ok && accessKeyID != "" {
		return c, true
	}
	return EventsCredential{}, false
}

// subject returns the keys that identify this identity in CloudTrail: its ARN,
// its bound credentials' ARNs and its access key ids. When a credential filter
// is given it must be one of them; otherwise nothing can match, and an empty
// subject makes every query return nothing.
func (e *eventsEnv) subject() eventstore.Subject {
	keys := []string{e.ident.ARN}
	known := map[string]bool{e.ident.ARN: true}
	for _, c := range e.ident.Credentials {
		keys = append(keys, c.ARN)
		known[c.ARN] = true
		if strings.EqualFold(c.Type, "access_key") {
			keys = append(keys, c.Name)
		}
	}
	if cred := e.q.Credential; cred != "" && !known[cred] {
		return eventstore.NewSubject()
	}
	return eventstore.NewSubject(keys...)
}

func (e *eventsEnv) scope() eventstore.Scope {
	return eventstore.Scope{Accounts: e.accounts, Start: e.tr.Start, End: e.tr.End, Service: e.q.Service}
}

func (e *eventsEnv) filter() eventstore.EventFilter {
	f := eventstore.EventFilter{
		Action: e.q.Action, Resource: e.q.Resource, SourceIP: e.q.SourceIP, Credential: e.q.Credential,
		Result: e.q.Result, ReadWrite: e.q.ReadWrite,
	}
	if f.Result == "all" {
		f.Result = ""
	}
	if f.ReadWrite == "all" {
		f.ReadWrite = ""
	}
	return f
}

// fail records a ClickHouse failure; the section is then served empty.
func (e *eventsEnv) reqCtx() context.Context {
	if e.ctx == nil {
		return context.Background()
	}
	return e.ctx
}

func (e *eventsEnv) fail(what string, err error) {
	msg := err.Error()
	if len(msg) > 300 { // ClickHouse errors echo the whole query
		msg = msg[:300] + "..."
	}
	logging.FromContext(e.reqCtx()).Warn("identity events section failed, serving it empty", "what", what, "err", msg, "degraded", true)
	e.mu.Lock()
	e.failed = true
	e.mu.Unlock()
}

// available reports whether event data can be trusted for this response.
func (e *eventsEnv) available() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.store != nil && !e.failed
}

func (e *eventsEnv) identityRef() IdentityEventsIdentity {
	return IdentityEventsIdentity{
		ID: e.ident.ID, Name: e.ident.Name, IdentityType: e.ident.IdentityType, AccountID: e.ident.AccountID,
	}
}

func (e *eventsEnv) pagination(total int) IdentityEventsPagination {
	pages := 0
	if total > 0 {
		pages = (total + e.q.PageSize - 1) / e.q.PageSize
	}
	return IdentityEventsPagination{Page: e.q.Page, PageSize: e.q.PageSize, TotalCount: total, TotalPages: pages}
}

func (e *eventsEnv) core(ev eventstore.Event) IdentityEventCore {
	c := IdentityEventCore{
		EventID: ev.EventID, EventTime: fmtEventTime(ev.EventTime), EventName: ev.EventName,
		EventSource: ev.EventSource, Service: eventstore.ServiceName(ev.EventSource), AWSRegion: ev.Region,
		ResourceARN: ev.ResourceARN, ResourceType: ev.ResourceType, ResourceName: eventsResourceName(ev.ResourceARN),
		SourceIP: ev.SourceIP, UserAgent: ev.UserAgent, IsReadOnly: ev.IsReadOnly,
		ErrorCode: ev.ErrorCode, ErrorMessage: ev.ErrorMessage, Status: "success",
		CallerARN: ev.CallerARN, CallerType: ev.CallerType, SessionIssuerARN: ev.SessionIssuerARN,
		AccessKeyID: ev.AccessKeyID,
	}
	if ev.ErrorCode != "" {
		c.Status = "error"
	}
	if cred, ok := e.match(ev.SessionIssuerARN, ev.CallerARN, ev.AccessKeyID); ok {
		c.CredentialName, c.CredentialType, c.BindingType = cred.Name, cred.Type, cred.BindingType
	}
	return c
}

// ───────────────────────── timeline ─────────────────────────

func (e *eventsEnv) timeline(ctx context.Context) *IdentityEventsTimelineResponse {
	resp := &IdentityEventsTimelineResponse{
		Section: EventsSectionTimeline, Identity: e.identityRef(), TimeRange: e.tr.Label,
		Events: []IdentityTimelineEvent{},
	}
	if e.store == nil {
		resp.Pagination = e.pagination(0)
		return resp
	}
	var rows []eventstore.Event
	var total uint64
	var wg identitygraph.PanicGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		var err error
		rows, err = e.store.EventsPage(ctx, e.subject(), e.scope(), e.filter(), e.q.PageSize, (e.q.Page-1)*e.q.PageSize)
		if err != nil {
			e.fail("timeline", err)
		}
	}()
	go func() {
		defer wg.Done()
		var err error
		total, err = e.store.CountFiltered(ctx, e.subject(), e.scope(), e.filter())
		if err != nil {
			e.fail("timeline count", err)
		}
	}()
	wg.Wait()

	resp.DataAvailable = e.available()
	if !resp.DataAvailable {
		resp.Pagination = e.pagination(0)
		return resp
	}
	for _, ev := range rows {
		resp.Events = append(resp.Events, IdentityTimelineEvent{
			IdentityEventCore: e.core(ev), IsCrossAccount: isCrossAccount(ev.ResourceARN, e.ident.AccountID),
		})
	}
	resp.TotalEvents = int(total)
	resp.Pagination = e.pagination(int(total))
	return resp
}

// ───────────────────────── detail ─────────────────────────

func (e *eventsEnv) detail(ctx context.Context) (*IdentityEventsDetailResponse, error) {
	resp := &IdentityEventsDetailResponse{Section: EventsSectionDetail}
	if e.store == nil {
		return resp, nil
	}
	// The event is looked up through the same subject and tenant filter as every
	// other section, with no time bound, so an id from another identity or
	// tenant is simply "not found".
	ev, err := e.store.EventByID(ctx, e.subject(), eventstore.Scope{Accounts: e.accounts}, e.q.EventID)
	if err != nil {
		e.fail("detail", err)
		return resp, nil
	}
	if ev == nil {
		return nil, ErrEventNotFound
	}
	resp.DataAvailable = true
	resp.Event = e.core(*ev)

	cred, matched := e.match(ev.SessionIssuerARN, ev.CallerARN, ev.AccessKeyID)
	var used uint64
	var grant *identitygraph.PermissionSourceResponse
	var wg identitygraph.PanicGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		sc := eventstore.Scope{Accounts: e.accounts, Start: time.Now().UTC().Add(-90 * 24 * time.Hour)}
		f := eventstore.EventFilter{Action: ev.EventName}
		n, err := e.store.CountFiltered(ctx, e.subject(), sc, f)
		if err != nil {
			e.fail("detail usage count", err)
			return
		}
		used = n
	}()
	go func() {
		defer wg.Done()
		// effective_permissions is read only here (performance rule 3).
		if !matched || cred.ID == "" || e.grant == nil {
			return
		}
		g, err := e.grant(ctx, cred.ID, eventstore.ServiceName(ev.EventSource), ev.EventName)
		if err != nil {
			logging.FromContext(ctx).Warn("identity events permission source failed", "err", err)
			return
		}
		grant = g
	}()
	wg.Wait()

	if grant != nil && grant.Matched {
		resp.PermissionSource = &IdentityEventPermissionSource{
			PolicyName: grant.PolicySource, PolicyType: grant.PolicyType, StatementEffect: grant.Effect,
			ResourceScope: grant.ResourceARN, UsedCount90d: used,
		}
	}
	return resp, nil
}

// ───────────────────────── credentials ─────────────────────────

func (e *eventsEnv) credentials(ctx context.Context) *IdentityEventsCredentialsResponse {
	resp := &IdentityEventsCredentialsResponse{
		Section: EventsSectionCredentials, TimeRange: e.tr.Label,
		CredentialsUsed: []IdentityEventsCredentialUsed{},
	}
	if e.store == nil {
		return resp
	}
	rows, err := e.store.CredentialUsage(ctx, e.subject(), e.scope(), e.filter())
	if err != nil {
		e.fail("credentials", err)
		return resp
	}
	resp.DataAvailable = true
	for _, r := range rows {
		item := IdentityEventsCredentialUsed{
			CredentialARN: r.Key, EventCount: r.Count, FirstUsed: fmtEventTime(r.First), LastUsed: fmtEventTime(r.Last),
			ActionsPerformed: nonNil(r.Actions), UniqueResourcesCount: r.UniqueResources,
		}
		// A credential Postgres does not know (for example a role assumed from
		// another account) is still listed, with blank name/type/binding.
		var cred EventsCredential
		var ok bool
		if r.Kind == "access_key" {
			cred, ok = e.byAccessKey[r.Key]
		} else {
			cred, ok = e.byARN[r.Key]
		}
		if ok {
			item.CredentialARN, item.CredentialName = cred.ARN, cred.Name
			item.CredentialType, item.BindingType = cred.Type, cred.BindingType
		}
		resp.CredentialsUsed = append(resp.CredentialsUsed, item)
	}
	return resp
}

// ───────────────────────── resources ─────────────────────────

func (e *eventsEnv) resources(ctx context.Context) *IdentityEventsResourcesResponse {
	resp := &IdentityEventsResourcesResponse{
		Section: EventsSectionResources, TimeRange: e.tr.Label,
		ResourcesAccessed: []IdentityEventsResource{},
	}
	if e.store == nil {
		return resp
	}
	rows, total, err := e.store.ResourceAccess(ctx, e.subject(), e.scope(), e.filter())
	if err != nil {
		e.fail("resources", err)
		return resp
	}
	resp.DataAvailable = true
	resp.TotalResources = total
	for _, r := range rows {
		resp.ResourcesAccessed = append(resp.ResourcesAccessed, IdentityEventsResource{
			ResourceARN: r.ARN, ResourceName: eventsResourceName(r.ARN), ResourceType: r.Type,
			AccountID: arnAccount(r.ARN), Actions: nonNil(r.Actions),
			ReadCount: r.Reads, WriteCount: r.Writes, ErrorCount: r.Errors,
			FirstAccess: fmtEventTime(r.First), LastAccess: fmtEventTime(r.Last),
			IsCrossAccount: isCrossAccount(r.ARN, e.ident.AccountID),
		})
	}
	return resp
}

// ───────────────────────── heatmap ─────────────────────────

func (e *eventsEnv) heatmap(ctx context.Context) *IdentityEventsHeatmapResponse {
	resp := &IdentityEventsHeatmapResponse{
		Section: EventsSectionHeatmap, TimeRange: e.tr.Label, Heatmap: []IdentityEventsHeatCell{},
	}
	if e.store == nil {
		return resp
	}
	cells, err := e.store.Heatmap(ctx, e.subject(), e.scope(), e.filter())
	if err != nil {
		e.fail("heatmap", err)
		return resp
	}
	resp.DataAvailable = true
	for _, c := range cells {
		resp.Heatmap = append(resp.Heatmap, IdentityEventsHeatCell{Action: c.Action, Hour: int(c.Hour), Count: c.Count})
	}
	return resp
}

// ───────────────────────── sessions ─────────────────────────

func (e *eventsEnv) sessions(ctx context.Context) *IdentityEventsSessionsResponse {
	resp := &IdentityEventsSessionsResponse{
		Section: EventsSectionSessions, TimeRange: e.tr.Label, Sessions: []IdentityEventsSession{},
	}
	if e.store == nil {
		return resp
	}
	rows, truncated, err := e.store.SessionEvents(ctx, e.subject(), e.scope(), e.filter())
	if err != nil {
		e.fail("sessions", err)
		return resp
	}
	resp.DataAvailable = true
	resp.Truncated = truncated
	resp.Sessions = buildSessions(rows, e)
	resp.TotalSessions = len(resp.Sessions)
	return resp
}

// buildSessions groups events by caller ARN and starts a new session whenever
// the same caller is idle for more than sessionGap. Events must be ordered by
// caller, then time (as SessionEvents returns them). Newest session first.
func buildSessions(rows []eventstore.SessionEvent, e *eventsEnv) []IdentityEventsSession {
	out := []IdentityEventsSession{}
	type acc struct {
		first, last time.Time
		caller      string
		issuer      string
		key         string
		n           int
		services    map[string]bool
		actions     map[string]bool
		ips         map[string]bool
	}
	var cur *acc
	flush := func() {
		if cur == nil {
			return
		}
		s := IdentityEventsSession{
			SessionName: eventsSessionName(cur.caller), StartTime: fmtEventTime(cur.first), EndTime: fmtEventTime(cur.last),
			DurationMinutes: int(cur.last.Sub(cur.first).Minutes()), EventCount: cur.n,
			Services: sortedKeys(cur.services), Actions: sortedKeys(cur.actions), SourceIPs: sortedKeys(cur.ips),
			CredentialARN: cur.issuer,
		}
		if cred, ok := e.match(cur.issuer, cur.caller, cur.key); ok {
			s.CredentialName, s.CredentialARN = cred.Name, cred.ARN
		}
		out = append(out, s)
		cur = nil
	}
	for _, r := range rows {
		if cur == nil || r.CallerARN != cur.caller || r.EventTime.Sub(cur.last) > sessionGap {
			flush()
			cur = &acc{
				first: r.EventTime, caller: r.CallerARN, issuer: r.SessionIssuerARN, key: r.AccessKeyID,
				services: map[string]bool{}, actions: map[string]bool{}, ips: map[string]bool{},
			}
		}
		cur.last = r.EventTime
		cur.n++
		cur.services[eventstore.ServiceName(r.EventSource)] = true
		cur.actions[r.EventName] = true
		if r.SourceIP != "" {
			cur.ips[r.SourceIP] = true
		}
	}
	flush()
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartTime > out[j].StartTime })
	return out
}

// ───────────────────────── errors ─────────────────────────

func (e *eventsEnv) errorsSection(ctx context.Context) *IdentityEventsErrorsResponse {
	resp := &IdentityEventsErrorsResponse{
		Section: EventsSectionErrors, TimeRange: e.tr.Label,
		Summary: IdentityEventsErrorSummary{ByErrorCode: map[string]uint64{}},
		Events:  []IdentityEventsErrorEvent{},
	}
	resp.Pagination = e.pagination(0)
	if e.store == nil {
		return resp
	}
	// This section is about failures: result and read_write are not applied.
	f := e.filter()
	f.Result, f.ReadWrite = "error", ""

	var sum *eventstore.ErrorSummaryResult
	var rows []eventstore.Event
	var wg identitygraph.PanicGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		var err error
		sum, err = e.store.ErrorSummary(ctx, e.subject(), e.scope(), f)
		if err != nil {
			e.fail("error summary", err)
		}
	}()
	go func() {
		defer wg.Done()
		var err error
		rows, err = e.store.EventsPage(ctx, e.subject(), e.scope(), f, e.q.PageSize, (e.q.Page-1)*e.q.PageSize)
		if err != nil {
			e.fail("error events", err)
		}
	}()
	wg.Wait()

	resp.DataAvailable = e.available()
	if !resp.DataAvailable || sum == nil {
		return resp
	}
	resp.Summary.TotalErrors = sum.TotalErrors
	for _, c := range sum.ByCode {
		resp.Summary.ByErrorCode[c.Code] = c.Count
	}
	if a := sum.MostDeniedAct; a != nil {
		resp.Summary.MostDeniedAction = &IdentityEventsDeniedAction{
			Action: eventstore.ServiceName(a.EventSource) + ":" + a.EventName, Count: a.Count,
		}
	}
	if r := sum.MostDeniedRes; r != nil {
		resp.Summary.MostDeniedResource = &IdentityEventsDeniedResource{
			ResourceARN: r.ARN, ResourceName: eventsResourceName(r.ARN), Count: r.Count,
		}
	}
	for _, ev := range rows {
		c := e.core(ev)
		resp.Events = append(resp.Events, IdentityEventsErrorEvent{
			EventTime: c.EventTime, EventName: c.EventName, Service: c.Service, ResourceARN: c.ResourceARN,
			ResourceName: c.ResourceName, ErrorCode: c.ErrorCode, ErrorMessage: c.ErrorMessage,
			CredentialName: c.CredentialName, SourceIP: c.SourceIP, AWSRegion: c.AWSRegion,
		})
	}
	resp.Pagination = e.pagination(int(sum.TotalErrors))
	return resp
}

// ───────────────────────── cross_account ─────────────────────────

func (e *eventsEnv) crossAccount(ctx context.Context) *IdentityEventsCrossAccountResponse {
	resp := &IdentityEventsCrossAccountResponse{
		Section: EventsSectionCrossAccount, TimeRange: e.tr.Label, IdentityAccount: e.ident.AccountID,
		CrossAccountActivity: []IdentityEventsCrossAccountItem{},
	}
	if e.store == nil {
		return resp
	}
	rows, total, err := e.store.CrossAccount(ctx, e.subject(), e.scope(), e.filter(), e.ident.AccountID)
	if err != nil {
		e.fail("cross account", err)
		return resp
	}
	resp.DataAvailable = true
	resp.TotalCrossAccountEvents = total
	for _, r := range rows {
		resp.CrossAccountActivity = append(resp.CrossAccountActivity, IdentityEventsCrossAccountItem{
			TargetAccountID: r.TargetAccount, TargetResourceARN: r.ResourceARN,
			TargetResourceName: eventsResourceName(r.ResourceARN), Actions: nonNil(r.Actions),
			EventCount: r.Count, LastSeen: fmtEventTime(r.LastSeen),
		})
	}
	return resp
}

// ───────────────────────── ips ─────────────────────────

func (e *eventsEnv) ips(ctx context.Context) *IdentityEventsIPsResponse {
	resp := &IdentityEventsIPsResponse{
		Section: EventsSectionIPs, TimeRange: e.tr.Label, IPs: []IdentityEventsIP{},
	}
	if e.store == nil {
		return resp
	}
	rows, total, err := e.store.IPStats(ctx, e.subject(), e.scope(), e.filter())
	if err != nil {
		e.fail("ips", err)
		return resp
	}
	resp.DataAvailable = true
	resp.TotalUniqueIPs = total
	for _, r := range rows {
		internal, kind := classifyIP(r.IP)
		resp.IPs = append(resp.IPs, IdentityEventsIP{
			SourceIP: r.IP, EventCount: r.Count, FirstSeen: fmtEventTime(r.First), LastSeen: fmtEventTime(r.Last),
			IsInternal: internal, Kind: kind,
		})
	}
	return resp
}

// ───────────────────────── helpers ─────────────────────────

// fmtEventTime formats a time as the API documents it: UTC, second precision.
func fmtEventTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format("2006-01-02T15:04:05Z")
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// arnAccount returns the 12-digit AWS account id of an ARN, or "" when the ARN
// has none (S3 buckets, for example) or is not an ARN.
func arnAccount(arn string) string {
	parts := strings.SplitN(arn, ":", 6)
	if len(parts) < 6 || parts[0] != "arn" {
		return ""
	}
	acct := parts[4]
	if len(acct) != 12 {
		return ""
	}
	for _, r := range acct {
		if r < '0' || r > '9' {
			return ""
		}
	}
	return acct
}

// isCrossAccount is true when the resource lives in a different account than
// the identity. A resource ARN without an account is never cross-account.
func isCrossAccount(resourceARN, homeAccount string) bool {
	acct := arnAccount(resourceARN)
	return acct != "" && homeAccount != "" && acct != homeAccount
}

// eventsResourceName derives a display name from a resource ARN: the whole
// resource part for S3 ("bucket/key"), otherwise its last path segment.
func eventsResourceName(arn string) string {
	if arn == "" {
		return ""
	}
	parts := strings.SplitN(arn, ":", 6)
	if len(parts) < 6 || parts[0] != "arn" {
		return arn
	}
	resource := parts[5]
	if parts[2] == "s3" {
		return resource
	}
	if i := strings.LastIndexAny(resource, "/:"); i >= 0 && i < len(resource)-1 {
		return resource[i+1:]
	}
	return resource
}

// eventsSessionName is the last path segment of a caller ARN
// (arn:aws:sts::1:assumed-role/role/SESSION → SESSION); a service principal or
// anything that is not an ARN is returned as is.
func eventsSessionName(callerARN string) string {
	if !strings.HasPrefix(callerARN, "arn:") {
		return callerARN
	}
	if i := strings.LastIndex(callerARN, "/"); i >= 0 && i < len(callerARN)-1 {
		return callerARN[i+1:]
	}
	return callerARN
}

// classifyIP says whether an address is internal (RFC 1918 private ranges, or
// the IPv6 equivalent) and what kind of value it is. CloudTrail also records
// AWS service principals in this field; those are external, not an IP.
func classifyIP(s string) (internal bool, kind string) {
	ip := net.ParseIP(strings.TrimSpace(s))
	if ip == nil {
		if strings.HasSuffix(strings.ToLower(s), ".amazonaws.com") {
			return false, "aws_service"
		}
		return false, "unknown"
	}
	if ip.IsPrivate() {
		return true, "private"
	}
	return false, "public"
}
