package awsintegration

import (
	"context"
	"errors"
	"fmt"
	"html"
	"sort"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/awsconnect"
	"nhi-backend-api/internal/platform/logging"
)

// The "Receive your events" check watches the central event queue instead of
// peeking once: a rule created a minute ago may not have delivered anything
// yet, and a quiet region may take a while to make a call. Every few seconds
// it reads the queue again and notes which regions events from the account
// have arrived from, until it has seen every region it expects (the customer's
// regions, plus us-east-1 where IAM and STS deliver their global events) or
// its time runs out. Its progress is saved on the account, so the page shows
// it live and nobody has to keep the request open.

// AWSMailer sends the approval notice (mailer.Mailer in production).
type AWSMailer interface {
	Configured() bool
	To() []string
	Send(ctx context.Context, subject, html, text string) error
}

const (
	defaultEventPoll = 7 * time.Second
	minEventPoll     = 5 * time.Second
	maxEventPoll     = 10 * time.Second
	defaultEventWait = 15 * time.Minute
	pollTimeout      = 15 * time.Second
	// IAM and STS are global services: their events are delivered in us-east-1.
	globalEventsRegion = "us-east-1"
)

type watchKey struct{ tenant, account string }

// watchEntry is one running watch; its pointer tells it from a newer one.
type watchEntry struct{ cancel context.CancelFunc }

// watching reports whether this process runs the events check of an account.
func (s *AWSIntegrationService) watching(tenantID, accountID string) bool {
	_, ok := s.watches.Load(watchKey{tenantID, accountID})
	return ok
}

// expectedRegions is every region events should arrive from.
func expectedRegions(regions []string) []AWSCheckRegion {
	seen := map[string]bool{}
	var out []AWSCheckRegion
	for _, r := range regions {
		if r == "" || r == globalRegion || seen[r] {
			continue
		}
		seen[r] = true
		out = append(out, AWSCheckRegion{Region: r})
	}
	if !seen[globalEventsRegion] {
		out = append(out, AWSCheckRegion{Region: globalEventsRegion, Global: true})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Region < out[j].Region })
	return out
}

func (s *AWSIntegrationService) pollInterval() time.Duration {
	if s.testPoll > 0 {
		return s.testPoll
	}
	d := s.opts.EventPollInterval
	if d <= 0 {
		d = defaultEventPoll
	}
	if d < minEventPoll {
		d = minEventPoll
	}
	if d > maxEventPoll {
		d = maxEventPoll
	}
	return d
}

func (s *AWSIntegrationService) waitLimit() time.Duration {
	if s.opts.EventWaitLimit > 0 {
		return s.opts.EventWaitLimit
	}
	return defaultEventWait
}

// startWatch marks the events check running and starts its watcher. Returns
// the check as it now reads.
func (s *AWSIntegrationService) startWatch(caller AWSCaller, p awsconnect.Platform, settings *AWSTenantSettings, rec AWSAccountRecord) AWSCheck {
	now := s.now().UTC()
	deadline := now.Add(s.waitLimit())
	check := AWSCheck{
		Key: AWSCheckEvents, Label: "Events arrive from each region", State: AWSCheckRunning,
		Message:   "Watching for events from your account. One event from any of the listed regions is enough; this usually takes a few minutes.",
		Regions:   expectedRegions(rec.Regions),
		StartedAt: &now, Deadline: &deadline,
	}
	key := watchKey{caller.TenantID, rec.AccountID}
	ctx, cancel := context.WithDeadline(context.Background(), deadline.Add(30*time.Second))
	entry := &watchEntry{cancel: cancel}
	// A new check replaces one already running for the same account.
	if prev, loaded := s.watches.Swap(key, entry); loaded {
		prev.(*watchEntry).cancel()
	}
	logging.FromContext(ctx).Info("aws integration: events watch started", "tenant_id", caller.TenantID, "account_id", rec.AccountID,
		"regions", rec.Regions, "deadline", deadline, "poll_every", s.pollInterval())
	go s.watch(ctx, entry, key, caller, p, settings, rec, check)
	return check
}

func (s *AWSIntegrationService) watch(ctx context.Context, entry *watchEntry, key watchKey, caller AWSCaller, p awsconnect.Platform,
	settings *AWSTenantSettings, rec AWSAccountRecord, check AWSCheck) {
	defer func() {
		// Only the current watch clears its slot (a newer one may have replaced it).
		s.watches.CompareAndDelete(key, entry)
		entry.cancel()
		if r := recover(); r != nil {
			logging.FromContext(ctx).Error("aws integration: events watch panicked", "tenant_id", caller.TenantID, "account_id", rec.AccountID, "panic", r)
		}
	}()
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	ticker := time.NewTicker(s.pollInterval())
	defer ticker.Stop()
	failures := 0
	for {
		pollCtx, pollCancel := context.WithTimeout(ctx, pollTimeout)
		poll, err := s.events.PollEvents(pollCtx, p, rec.AccountID)
		pollCancel()
		if ctx.Err() != nil && !errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return // replaced by a newer check, or the service is stopping
		}
		switch {
		case err != nil:
			failures++
			if errors.Is(err, awsconnect.ErrPlatformCredentials) {
				logCheckError(ctx, caller.TenantID, rec.AccountID, AWSCheckEvents, err)
			} else {
				log.Warn("aws integration: events watch, queue read failed", "err", err, "failures", failures)
			}
			if errors.Is(err, awsconnect.ErrPlatformCredentials) || failures >= 5 {
				if failures >= 5 {
					log.Error("aws integration: events watch gave up after repeated queue read failures; check NHI_AWS_EVENT_QUEUE_URL and the queue's permissions", "err", err)
				}
				platformError(&check, err)
				s.finishWatch(caller, settings, rec, check, false)
				return
			}
		default:
			failures = 0
			check.Scanned += poll.Seen
			at := s.now().UTC()
			for i := range check.Regions {
				if n := poll.Regions[check.Regions[i].Region]; n > 0 {
					check.Regions[i].Events += n
					if !check.Regions[i].Seen {
						check.Regions[i].Seen = true
						check.Regions[i].FirstSeenAt = &at
						log.Info("aws integration: events watch, first event from region", "region", check.Regions[i].Region, "events", n)
					}
				}
			}
		}
		seen, missing := regionSplit(check.Regions)
		// One region delivering is enough: the forwarding works. Regions not
		// heard from yet are named, not held against the account.
		if len(seen) > 0 {
			msg := "Events are arriving from " + strings.Join(seen, ", ") + "."
			if len(missing) > 0 {
				msg += " Not yet from " + strings.Join(missing, ", ") + ": a region with no API activity sends nothing until something happens there."
			}
			pass(&check, msg)
			check.Fix = ""
			s.finishWatch(caller, settings, rec, check, true)
			return
		}
		if !s.now().Before(*check.Deadline) {
			if len(seen) > 0 {
				check.State = AWSCheckWarn
				check.Message = fmt.Sprintf("Events arrive from %s. None yet from %s: a region with no API activity sends nothing, or its rule is missing.",
					strings.Join(seen, ", "), strings.Join(missing, ", "))
				check.Fix = "Create the rule nhi-forward-activity in " + strings.Join(missing, ", ") + ", then Check again"
				s.finishWatch(caller, settings, rec, check, true)
				return
			}
			fail(&check, fmt.Sprintf("No event from this account reached us in %s.", humanMinutes(s.waitLimit())),
				"Check the EventBridge rule (target: our event bus, role NHIEventBridgeForwardRole) in each region, then Check again")
			s.finishWatch(caller, settings, rec, check, false)
			return
		}
		if len(seen) > 0 {
			check.Message = fmt.Sprintf("Events arrive from %s. Still waiting for %s.", strings.Join(seen, ", "), strings.Join(missing, ", "))
		}
		saveCtx, saveCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := s.saveEventsCheck(saveCtx, caller.Schema, rec, check); err != nil {
			log.Warn("aws integration: events watch, saving progress failed", "err", err)
		}
		saveCancel()
		select {
		case <-ctx.Done():
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				continue // the loop's own deadline test concludes it
			}
			return
		case <-ticker.C:
		}
	}
}

func regionSplit(regions []AWSCheckRegion) (seen, missing []string) {
	for _, r := range regions {
		if r.Seen {
			seen = append(seen, r.Region)
		} else {
			missing = append(missing, r.Region)
		}
	}
	return seen, missing
}

func humanMinutes(d time.Duration) string {
	m := int(d.Round(time.Minute) / time.Minute)
	if m <= 1 {
		return "a minute"
	}
	return fmt.Sprintf("%d minutes", m)
}

// platformError reports a failure on our side in words that do not send the
// customer to change their setup.
func platformError(c *AWSCheck, err error) {
	c.State, c.Fix = AWSCheckError, ""
	if errors.Is(err, awsconnect.ErrPlatformCredentials) {
		c.Message = "Our platform could not sign in to AWS to read its event queue (its own credentials were refused). This is on our side, not in your account; we have been alerted. Try again later."
		return
	}
	c.Message = "We could not read our event queue just now. Try again in a few minutes."
}

// saveEventsCheck writes the events check into the account's checks.
func (s *AWSIntegrationService) saveEventsCheck(ctx context.Context, schema string, rec AWSAccountRecord, check AWSCheck) error {
	checks := append([]AWSCheck(nil), rec.Checks...)
	for i := range checks {
		if checks[i].Key == AWSCheckEvents {
			checks[i] = check
		}
	}
	return s.store.SaveChecks(ctx, schema, rec.AccountID, checks)
}

// finishWatch concludes the check. ok: every region (or, at the time limit,
// some) delivered. A first connection then waits for approval; an account
// already approved is connected (or stays connected) at once.
func (s *AWSIntegrationService) finishWatch(caller AWSCaller, settings *AWSTenantSettings, rec AWSAccountRecord, check AWSCheck, ok bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID)
	checks := append([]AWSCheck(nil), rec.Checks...)
	for i := range checks {
		if checks[i].Key == AWSCheckEvents {
			checks[i] = check
		}
	}
	rec.Checks = checks
	seenRegions, missingRegions := regionSplit(check.Regions)
	logChecks(ctx, "aws integration: events watch finished", rec.AccountID, []AWSCheck{check}, "tenant_id", caller.TenantID,
		"ok", ok, "regions_seen", seenRegions, "regions_missing", missingRegions, "messages_scanned", check.Scanned)
	current, err := s.store.GetAccount(ctx, caller.Schema, rec.AccountID)
	if err != nil || current == nil {
		log.Warn("aws integration: events watch finished but the account is gone", "err", err)
		return
	}
	approved := current.Approval.Status == ApprovalApproved || (current.Approval.Status == "" && current.ConnectedAt != nil)
	if !ok || approved {
		status := AWSStatusPending
		if ok {
			status = AWSStatusConnected
		}
		rec.Status = status
		saved, queued, err := s.store.SaveVerification(ctx, caller.TenantID, caller.Schema, rec)
		if err != nil {
			log.Error("aws integration: saving the finished check failed", "err", err)
			return
		}
		log.Info("aws integration: account status after the events check", "status", saved.Status, "sync_queued", queued, "already_approved", approved)
		return
	}
	seen, _ := regionSplit(check.Regions)
	events := map[string]any{
		"regions_seen": seen, "regions": check.Regions, "messages_scanned": check.Scanned,
		"started_at": check.StartedAt, "finished_at": s.now().UTC(),
	}
	domain := ""
	if settings != nil {
		domain = settings.Domain
	}
	id, _, err := s.store.RequestApproval(ctx, ApprovalRequest{
		TenantID: caller.TenantID, Schema: caller.Schema, Domain: domain, Account: rec, Events: events, RequestedBy: caller.Actor,
	})
	if err != nil {
		log.Error("aws integration: recording the approval request failed", "err", err)
		return
	}
	log.Info("aws integration: connection waits for approval", "approval_id", id)
	s.notifyApprovers(ctx, id, caller, domain, rec, check)
}

// notifyApprovers e-mails the platform admins. The outcome is recorded on the
// request either way, so the Approvals page can say whether mail went out.
func (s *AWSIntegrationService) notifyApprovers(ctx context.Context, id int64, caller AWSCaller, domain string, rec AWSAccountRecord, check AWSCheck) {
	log := logging.FromContext(ctx).With("tenant_id", caller.TenantID, "account_id", rec.AccountID, "approval_id", id)
	// Mailers that can say which provider they use and why they cannot send.
	type described interface {
		Provider() string
		Problem() string
	}
	if d, ok := s.mailer.(described); ok && s.mailer != nil {
		log = log.With("provider", d.Provider())
	}
	if s.mailer == nil || !s.mailer.Configured() {
		why := "set EMAIL_FROM, SES_REGION and CONNECTION_APPROVAL_EMAILS"
		if d, ok := s.mailer.(described); ok && s.mailer != nil && d.Problem() != "" {
			why = d.Problem()
		}
		log.Warn("aws integration: approval e-mail not sent: " + why)
		_ = s.store.SetApprovalEmail(ctx, id, "not_configured", why)
		return
	}
	subject, htmlBody, text := approvalEmail(caller, domain, rec, check)
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		sendCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		err = s.mailer.Send(sendCtx, subject, htmlBody, text)
		cancel()
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
	}
	if err != nil {
		log.Error("aws integration: approval e-mail failed", "err", err, "to", s.mailer.To())
		_ = s.store.SetApprovalEmail(context.Background(), id, "failed", err.Error())
		return
	}
	log.Info("aws integration: approval e-mail sent", "to", s.mailer.To())
	_ = s.store.SetApprovalEmail(context.Background(), id, "sent", "")
}

// approvalReviewHint: the onboarding tool runs on the approver's own machine,
// so the e-mail says where to look instead of linking to it.
const approvalReviewHint = "Review it in the tenant-onboarding tool on your computer: Approvals tab (it lists every waiting request from the database)."

func approvalEmail(caller AWSCaller, domain string, rec AWSAccountRecord, check AWSCheck) (subject, htmlBody, text string) {
	workspace := caller.Schema
	if domain != "" {
		workspace = domain
	}
	seen, missing := regionSplit(check.Regions)
	subject = fmt.Sprintf("Approval needed: AWS account %s for %s", rec.AccountID, workspace)
	lines := []string{
		"A new AWS connection passed every check and waits for your approval.",
		"",
		"Workspace:   " + workspace + " (" + caller.Schema + ")",
		"AWS account: " + rec.AccountID,
		"Role:        " + rec.RoleARN,
		"Regions:     " + strings.Join(rec.Regions, ", "),
		"Events from: " + strings.Join(seen, ", "),
		"Requested by " + caller.Actor,
	}
	if len(missing) > 0 {
		lines = append(lines, "No events yet from: "+strings.Join(missing, ", "))
	}
	lines = append(lines, "", approvalReviewHint)
	text = strings.Join(lines, "\n")
	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(`<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">`)
	b.WriteString(`<p>A new AWS connection passed every check and waits for your approval.</p><table cellpadding="4" style="border-collapse:collapse">`)
	for _, row := range [][2]string{
		{"Workspace", workspace + " (" + caller.Schema + ")"}, {"AWS account", rec.AccountID}, {"Role", rec.RoleARN},
		{"Regions", strings.Join(rec.Regions, ", ")}, {"Events from", strings.Join(seen, ", ")}, {"Requested by", caller.Actor},
	} {
		b.WriteString(`<tr><td style="color:#64748b">` + esc(row[0]) + `</td><td><b>` + esc(row[1]) + `</b></td></tr>`)
	}
	b.WriteString(`</table>`)
	if len(missing) > 0 {
		b.WriteString(`<p style="color:#b45309">No events yet from ` + esc(strings.Join(missing, ", ")) + `.</p>`)
	}
	b.WriteString(`<p>` + esc(approvalReviewHint) + `</p>`)
	b.WriteString(`</div>`)
	return subject, b.String(), text
}
