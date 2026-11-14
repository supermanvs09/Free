import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Layers, Loader2, RefreshCw, Server } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { FloatingPanel } from '../../ui/Floating';
import { cn } from '../../ui/cn';
import { useSync } from './SyncContext';

const STEP_OF = { start: 1, discovery: 2, posture: 3, refresh: 4 };

/**
 * The scan control in the top bar, where it is on every screen:
 *
 *   idle       "Sync now" (each account's last sync is in its chooser)
 *   running    "Syncing · step 2 of 4": opens the progress panel
 *   cooling    the next sync's countdown (the scanner allows one every 10 minutes)
 *   failed     "Sync didn't finish": opens the panel
 *
 */
export function SyncButton() {
  const { run, cooldownUntil, canScan, openPanel, start } = useSync();
  const [now, setNow] = useState(() => Date.now());
  const cooling = cooldownUntil > now;
  useEffect(() => {
    if (!cooling) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [cooling]);

  const running = run && run.stage !== 'done' && run.stage !== 'failed';
  const failed = run?.stage === 'failed';
  const base = 'hidden h-9 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors sm:flex';

  if (running) {
    return (
      <button type="button" onClick={openPanel} className={cn(base, 'border-brand/40 bg-info-soft text-brand hover:border-brand')} aria-label="Sync in progress. Show progress.">
        <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        <span>{run.slow ? 'Still syncing · large accounts take longer' : `Syncing · step ${STEP_OF[run.stage] ?? 1} of 4`}</span>
      </button>
    );
  }
  if (failed) {
    return (
      <button type="button" onClick={openPanel} className={cn(base, 'border-critical/40 bg-critical-soft text-critical hover:border-critical')}>
        <AlertTriangle aria-hidden="true" className="size-4" />
        <span>Sync didn&apos;t finish</span>
      </button>
    );
  }

  /* No "Synced N ago" beside it: each account's last sync is in the chooser,
     where it is per account and not one misleading time for all of them. */
  if (!canScan) return null;
  return <SyncChooser base={base} cooling={cooling} cooldownUntil={cooldownUntil} now={now} start={start} openPanel={openPanel} />;
}

/** Accounts a sync can read: connected, with regions to read. */
function syncableAccounts(integration) {
  return (integration?.accounts ?? []).filter((account) => account.status === 'connected' && account.connectedAt);
}

/**
 * "Sync now": with one connected account it just syncs; with more it asks
 * which - every account (read, score, refresh every page: the full sync) or
 * one account (the same sync, for that account only).
 */
function SyncChooser({ base, cooling, cooldownUntil, now, start, openPanel }) {
  const workspace = useWorkspace();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const accounts = syncableAccounts(workspace.integration);
  const choose = accounts.length > 1;
  const minutes = Math.ceil((cooldownUntil - now) / 60000);

  const syncAll = () => {
    setOpen(false);
    if (cooling) openPanel();
    else start(accounts.map((a) => a.accountId));
  };

  /* One account: the same sync (read, score, refresh), for that account only. */
  const syncOne = (account) => {
    setOpen(false);
    if (cooling) openPanel();
    else start([account.accountId]);
  };

  if (!choose) {
    return (
      <button
        type="button"
        onClick={cooling ? openPanel : start}
        className={cn(base, 'border-topbar-line bg-topbar-field text-topbar-ink hover:border-ink-3/45')}
        title={cooling ? `A sync can run every 10 minutes. The next one can start in ${minutes} min.` : 'Read your AWS accounts, score what is found and refresh every page'}
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        <span>{cooling ? `Next sync in ${minutes} min` : 'Sync now'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(base, 'border-topbar-line bg-topbar-field text-topbar-ink hover:border-ink-3/45')}
        title="Choose all accounts or one account to sync"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        <span>Sync now</span>
        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <FloatingPanel
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        role="dialog"
        aria-label="Choose what to sync"
        className="w-80 rounded-[var(--radius-panel)] border border-line bg-surface p-1.5 shadow-[var(--t-shadow-lg)]"
      >
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">What to sync</p>
        <ChooserItem
          icon={Layers}
          title={`All accounts (${accounts.length})`}
          detail={
            cooling
              ? `Available again in ${minutes} min - the scanner runs one full sync every 10 minutes.`
              : 'Reads every account, scores what it finds and refreshes every page.'
          }
          disabled={cooling}
          onSelect={syncAll}
        />
        <div className="my-1 border-t border-line" />
        <p className="px-2.5 pt-1 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">One account</p>
        {accounts.map((account) => (
          <ChooserItem
            key={account.accountId}
            icon={Server}
            mono
            title={account.accountId}
            detail={
              cooling
                ? `Available again in ${minutes} min.`
                : `${account.regions.length} region${account.regions.length === 1 ? '' : 's'}${account.sync.lastSyncedAt ? ` · last synced ${formatRelative(account.sync.lastSyncedAt)}` : ''}`
            }
            disabled={cooling || account.regions.length === 0}
            onSelect={() => syncOne(account)}
          />
        ))}
      </FloatingPanel>
    </>
  );
}

function ChooserItem({ icon: Icon, title, detail, disabled, loading, mono, onSelect }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-brand" />
      ) : (
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
      )}
      <span className="min-w-0">
        <span className={cn('block text-[13px] font-medium text-ink', mono && 'font-mono')}>{title}</span>
        <span className="block text-[11.5px] leading-snug text-ink-3">{detail}</span>
      </span>
    </button>
  );
}

/**
 * The same control for a page body (Integrations): one workspace-wide Sync now,
 * with the run's state in its label. Hidden for roles that cannot start one.
 */
export function SyncNowButton() {
  const { run, cooldownUntil, canScan, openPanel, start } = useSync();
  const [now, setNow] = useState(() => Date.now());
  const cooling = cooldownUntil > now;
  useEffect(() => {
    if (!cooling) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [cooling]);

  if (!canScan) return null;
  const running = run && run.stage !== 'done' && run.stage !== 'failed';
  if (running) {
    return (
      <Button variant="secondary" icon={RefreshCw} loading onClick={openPanel} aria-label="Sync in progress. Show progress.">
        Syncing · step {STEP_OF[run.stage] ?? 1} of 4
      </Button>
    );
  }
  if (run?.stage === 'failed') {
    return (
      <Button variant="secondary" icon={AlertTriangle} onClick={openPanel}>
        Sync didn&apos;t finish
      </Button>
    );
  }
  const minutes = Math.ceil((cooldownUntil - now) / 60000);
  return (
    <Button
      variant="secondary"
      icon={RefreshCw}
      onClick={cooling ? openPanel : start}
      title={cooling ? `A sync can run every 10 minutes. The next one can start in ${minutes} min.` : 'Read every connected AWS account, score what is found and refresh every page'}
    >
      {cooling ? `Next sync in ${minutes} min` : 'Sync all accounts'}
    </Button>
  );
}
