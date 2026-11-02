// Package worker runs the background loops of the remediator: the execution
// queue, housekeeping, the Jira sync and the e-mail outbox.
package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"nhi-backend-api/internal/platform/config"
	"nhi-backend-api/internal/platform/secrets"
	"nhi-backend-api/internal/remediation/domain"
	"nhi-backend-api/internal/remediation/engine"
	"nhi-backend-api/internal/remediation/jira"
	"nhi-backend-api/internal/remediation/notify"
	"nhi-backend-api/internal/remediation/store"
)

type Worker struct {
	cfg     *config.RemediationConfig
	svc     *engine.Service
	jira    *jira.Syncer
	secrets *secrets.Resolver
	log     *slog.Logger
	sem     chan struct{}
	wg      sync.WaitGroup
}

func New(cfg *config.RemediationConfig, svc *engine.Service, sec *secrets.Resolver, log *slog.Logger) *Worker {
	return &Worker{cfg: cfg, svc: svc, jira: jira.NewSyncer(sec, log), secrets: sec, log: log,
		sem: make(chan struct{}, cfg.Worker.Concurrency)}
}

// Run blocks until ctx is cancelled, then waits for running executions.
func (w *Worker) Run(ctx context.Context) {
	loops := []struct {
		name  string
		every time.Duration
		fn    func(context.Context)
	}{
		{"executions", w.cfg.Worker.ExecutionPoll, w.pollExecutions},
		{"reconcile", w.cfg.Worker.ReconcileEvery, w.reconcile},
		{"jira", w.cfg.Worker.JiraSyncEvery, w.syncJira},
		{"notifications", w.cfg.Worker.NotifyEvery, w.sendMail},
		{"digest", time.Hour, w.digest},
	}
	var loopWG sync.WaitGroup
	for _, l := range loops {
		l := l
		loopWG.Add(1)
		go func() {
			defer loopWG.Done()
			t := time.NewTicker(l.every)
			defer t.Stop()
			l.fn(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					l.fn(ctx)
				}
			}
		}()
	}
	loopWG.Wait()
	w.log.Info("waiting for running executions")
	w.wg.Wait()
}

// pollExecutions starts due executions, at most Concurrency at the same time.
func (w *Worker) pollExecutions(ctx context.Context) {
	for _, st := range w.svc.Stores(ctx) {
		for {
			select {
			case w.sem <- struct{}{}:
			default:
				return // all slots busy
			}
			ex := w.svc.Claim(ctx, st)
			if ex == nil {
				<-w.sem
				break
			}
			w.wg.Add(1)
			go func(st *store.Store, ex *domain.Execution) {
				defer w.wg.Done()
				defer func() { <-w.sem }()
				// a running change finishes even when the service is stopping
				w.svc.RunExecution(context.WithoutCancel(ctx), st, ex)
			}(st, ex)
		}
	}
}

func (w *Worker) reconcile(ctx context.Context) {
	w.svc.EachTenant(ctx, w.svc.Reconcile)
}

func (w *Worker) syncJira(ctx context.Context) {
	w.svc.EachTenant(ctx, func(ctx context.Context, st *store.Store) error { return w.jira.SyncTenant(ctx, st) })
}

// sender builds the e-mail sender and settings of a tenant (SMTP first, then SES).
func (w *Worker) sender(ctx context.Context, st *store.Store) (notify.Sender, notify.Config, error) {
	for _, typ := range []string{"SMTP", "SES"} {
		integ, err := st.GetIntegration(ctx, typ)
		if err != nil || !integ.Enabled {
			continue
		}
		cfg, err := notify.ParseConfig(integ.Config)
		if err != nil {
			return nil, cfg, err
		}
		if typ == "SES" {
			region := cfg.Region
			if region == "" {
				region = w.cfg.AWS.Region
			}
			s, err := notify.NewSES(ctx, region)
			return s, cfg, err
		}
		pw := ""
		if integ.SecretRef != "" {
			if pw, err = w.secrets.Get(ctx, integ.SecretRef); err != nil {
				return nil, cfg, err
			}
		}
		port := cfg.Port
		if port == 0 {
			port = 587
		}
		return &notify.SMTP{Host: cfg.Host, Port: port, Username: cfg.Username, Password: pw, TLS: cfg.TLS}, cfg, nil
	}
	return nil, notify.Config{}, fmt.Errorf("no e-mail integration is enabled")
}

// sendMail drains the outbox with retries; a mail outage never blocks a remediation.
func (w *Worker) sendMail(ctx context.Context) {
	for _, st := range w.svc.Stores(ctx) {
		var sender notify.Sender
		var cfg notify.Config
		for i := 0; i < 20; i++ {
			n, err := st.ClaimNotification(ctx)
			if err != nil {
				break
			}
			if sender == nil {
				if sender, cfg, err = w.sender(ctx, st); err != nil {
					_ = st.NotificationFailed(ctx, n.ID, n.Attempts, w.cfg.Worker.MaxNotifyRetries, err.Error())
					break
				}
			}
			if err := sender.Send(ctx, cfg.From, n.Recipients, n.Subject, n.BodyHTML, n.BodyText); err != nil {
				_ = st.NotificationFailed(ctx, n.ID, n.Attempts, w.cfg.Worker.MaxNotifyRetries, err.Error())
				w.log.Warn("send mail", "id", n.ID, "err", err)
				continue
			}
			_ = st.NotificationSent(ctx, n.ID)
			plan := ""
			if n.PlanID != nil {
				plan = *n.PlanID
			}
			st.Audit(ctx, plan, "", "", domain.EvEmailSent, "system", map[string]any{"type": n.Type, "recipients": len(n.Recipients)})
		}
	}
}

// digest queues the daily list of new Critical findings.
func (w *Worker) digest(ctx context.Context) {
	if !w.cfg.Worker.DigestEnabled || time.Now().UTC().Hour() != w.cfg.Worker.DigestHourUTC {
		return
	}
	w.svc.EachTenant(ctx, func(ctx context.Context, st *store.Store) error {
		return w.svc.QueueDigest(ctx, st)
	})
}
