package jira

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"nhi-backend-api/internal/platform/secrets"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/store"
)

var severityRank = map[string]int{"Critical": 4, "High": 3, "Medium": 2, "Low": 1}

// planEvents are the remediation events that become a ticket comment.
var planEvents = map[string]string{
	domain.EvSubmitted:  "Remediation plan submitted for approval",
	domain.EvApproved:   "Remediation plan approved",
	domain.EvRejected:   "Remediation plan rejected",
	domain.EvExecQueued: "Remediation execution scheduled",
	domain.EvVerified:   "Remediation applied and verified",
	domain.EvFailed:     "Remediation failed",
	domain.EvRolledBack: "Remediation rolled back",
	domain.EvMarkedDone: "Fix marked as done manually",
	domain.EvCancelled:  "Remediation plan cancelled",
}

type Syncer struct {
	secrets   *secrets.Resolver
	log       *slog.Logger
	newClient func(Config, string) *Client
}

func NewSyncer(sec *secrets.Resolver, log *slog.Logger) *Syncer {
	return &Syncer{secrets: sec, log: log, newClient: NewClient}
}

// SyncTenant reads engine finding-history rows after the cursor and mirrors
// them into Jira. The cursor advances only after an event was handled, so a
// failure retries the same event next time (tickets are idempotent: one per finding).
func (y *Syncer) SyncTenant(ctx context.Context, st *store.Store) error {
	integ, err := st.GetIntegration(ctx, "JIRA")
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil
		}
		return err
	}
	if !integ.Enabled {
		return nil
	}
	cfg, err := ParseConfig(integ.Config)
	if err != nil {
		st.SetIntegrationError(ctx, integ.ID, err.Error())
		return err
	}
	token, err := y.secrets.Get(ctx, integ.SecretRef)
	if err != nil {
		st.SetIntegrationError(ctx, integ.ID, err.Error())
		return err
	}
	c := y.newClient(cfg, token)

	cursorAt, cursorID, auditCursor := integ.CursorAt, integ.CursorID, integ.AuditCursor
	var syncErr error
	events, err := st.HistoryAfter(ctx, cursorAt, cursorID, 200)
	if err != nil {
		return err
	}
	for _, ev := range events {
		if syncErr = y.handle(ctx, st, c, cfg, integ, ev); syncErr != nil {
			break
		}
		t := ev.CreatedAt
		cursorAt, cursorID = &t, ev.ID
	}
	if syncErr == nil {
		auditCursor, syncErr = y.commentPlanEvents(ctx, st, c, auditCursor)
	}
	if syncErr == nil {
		y.recheckClosed(ctx, st, c, cfg)
	}
	msg := ""
	if syncErr != nil {
		msg = syncErr.Error()
		y.log.Warn("jira sync", "tenant", st.TenantID, "err", syncErr)
	}
	if err := st.SaveJiraCursor(ctx, integ.ID, cursorAt, cursorID, auditCursor, msg); err != nil {
		return err
	}
	return syncErr
}

func (y *Syncer) handle(ctx context.Context, st *store.Store, c *Client, cfg Config, integ *domain.Integration, ev store.HistoryEvent) error {
	t, terr := st.GetTicket(ctx, ev.FindingID)
	hasTicket := terr == nil
	switch ev.Action {
	case "OPENED":
		if hasTicket || severityRank[ev.Severity] < severityRank[cfg.MinSeverity] {
			return nil
		}
		return y.createTicket(ctx, st, c, cfg, integ, ev)
	case "RESOLVED":
		if !hasTicket || t.State == "CLOSED" {
			return nil
		}
		return y.close(ctx, st, c, t, cfg.DoneTransition, "Resolved by the ISPM scan: the finding is no longer detected.", ev.Action)
	case "REOPENED":
		if !hasTicket || t.State == "OPEN" {
			return nil
		}
		return y.reopen(ctx, st, c, t, cfg.ReopenTransition, "The finding is detected again by the ISPM scan.", ev.Action)
	case "ACCEPTED", "SUPPRESSED":
		if !hasTicket || t.State == "CLOSED" {
			return nil
		}
		reason := ev.Reason
		if reason == "" {
			reason = "no reason given"
		}
		return y.close(ctx, st, c, t, cfg.WontDoTransition, fmt.Sprintf("Finding %s in ISPM: %s", strings.ToLower(ev.Action), reason), ev.Action)
	}
	return nil
}

func (y *Syncer) createTicket(ctx context.Context, st *store.Store, c *Client, cfg Config, integ *domain.Integration, ev store.HistoryEvent) error {
	fs, err := st.GetFindings(ctx, []string{ev.FindingID})
	if err != nil || len(fs) == 0 {
		return err
	}
	f := fs[0]
	desc := []string{
		f.Title,
		fmt.Sprintf("Identity: %s (%s)   Account: %s   Rule: %s - %s   Severity: %s", f.IdentityName, f.IdentityType, f.AccountID, f.RuleID, f.RuleName, f.Severity),
		f.Description,
		"Evidence: " + string(f.Evidence),
	}
	if f.Remediation != "" {
		desc = append(desc, "Recommended fix: "+f.Remediation)
	}
	if plans, err := st.ListPlans(ctx, store.PlanFilter{FindingID: f.ID, Limit: 1}); err == nil && len(plans) > 0 {
		p := plans[0]
		desc = append(desc, fmt.Sprintf("Remediation plan %s (%s, %s): %s", p.ID, p.ActionType, p.Mode, p.Status))
		if p.ScoreGain != nil {
			desc = append(desc, fmt.Sprintf("Score impact: +%.1f points for the identity", *p.ScoreGain))
		}
		desc = append(desc, "Guided steps: "+string(p.Steps))
	}
	// the account's own Jira project (accounts.jira_project_key), else the configured one
	project := ""
	if a, err := st.GetAccount(ctx, f.AccountID); err == nil {
		project = strings.TrimSpace(a.JiraProjectKey)
	}
	due := f.FirstSeen.AddDate(0, 0, cfg.SLADays[f.Severity])
	if cfg.SLADays[f.Severity] == 0 {
		due = time.Time{}
	}
	issue, err := c.CreateIssue(ctx, NewIssue{
		Summary: fmt.Sprintf("[ISPM %s] %s", f.Severity, f.Title), Description: desc, Severity: f.Severity,
		Labels: []string{strings.ToLower(f.RuleID)}, DueDate: due, ProjectKey: project,
	})
	if err != nil {
		return err
	}
	if err := st.InsertTicket(ctx, domain.TicketLink{FindingID: f.ID, IntegID: integ.ID, ExternalKey: issue.Key, ExternalID: issue.ID, URL: issue.URL}, ev.Action); err != nil {
		return err
	}
	st.Audit(ctx, "", "", "", domain.EvTicketCreated, "system", map[string]any{"finding_id": f.ID, "ticket": issue.Key})
	return nil
}

func (y *Syncer) close(ctx context.Context, st *store.Store, c *Client, t *domain.TicketLink, transition, comment, event string) error {
	if err := c.Transition(ctx, t.ExternalKey, transition); err != nil {
		if !errors.Is(err, ErrNoTransition) {
			return err
		}
		comment += " (the workflow has no transition \"" + transition + "\": close the ticket by hand)"
	}
	if err := c.AddComment(ctx, t.ExternalKey, comment); err != nil {
		return err
	}
	return st.SetTicketState(ctx, t.FindingID, "CLOSED", event, "")
}

func (y *Syncer) reopen(ctx context.Context, st *store.Store, c *Client, t *domain.TicketLink, transition, comment, event string) error {
	if err := c.Transition(ctx, t.ExternalKey, transition); err != nil {
		if !errors.Is(err, ErrNoTransition) {
			return err
		}
		comment += " (the workflow has no transition \"" + transition + "\": reopen the ticket by hand)"
	}
	if err := c.AddComment(ctx, t.ExternalKey, comment); err != nil {
		return err
	}
	return st.SetTicketState(ctx, t.FindingID, "OPEN", event, "")
}

// commentPlanEvents adds the remediation lifecycle to the tickets of the findings a plan fixes.
func (y *Syncer) commentPlanEvents(ctx context.Context, st *store.Store, c *Client, after int64) (int64, error) {
	evs, err := st.AuditAfter(ctx, after, 200)
	if err != nil {
		return after, err
	}
	cursor := after
	for _, e := range evs {
		text, ok := planEvents[e.Event]
		if ok && e.PlanID != nil {
			if p, err := st.GetPlan(ctx, *e.PlanID); err == nil {
				tickets, err := st.TicketsForFindings(ctx, p.FindingIDs)
				if err != nil {
					return cursor, err
				}
				for _, t := range tickets {
					msg := fmt.Sprintf("%s (%s on %s, plan %s, by %s)", text, p.ActionType, p.TargetARN, p.ID, e.Actor)
					if err := c.AddComment(ctx, t.ExternalKey, msg); err != nil {
						return cursor, err
					}
				}
			}
		}
		cursor = e.ID
	}
	return cursor, nil
}

// recheckClosed handles a ticket closed by hand while its finding is still
// open: reopen it or leave a comment (reopen_if_closed_manually).
func (y *Syncer) recheckClosed(ctx context.Context, st *store.Store, c *Client, cfg Config) {
	ts, err := st.TicketsToCheck(ctx, 20)
	if err != nil {
		return
	}
	for i := range ts {
		t := ts[i]
		cat, err := c.StatusCategory(ctx, t.ExternalKey)
		st.MarkTicketChecked(ctx, t.FindingID)
		if err != nil || cat != "done" {
			continue
		}
		// our state says CLOSED and so does Jira, but the finding is OPEN again or never resolved
		if cfg.ReopenIfClosedManual {
			_ = y.reopen(ctx, st, c, &t, cfg.ReopenTransition, "This ticket was closed, but the ISPM finding is still open. Reopened.", "REOPENED")
		} else {
			_ = c.AddComment(ctx, t.ExternalKey, "This ticket is closed, but the ISPM finding is still open.")
		}
	}
}
