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
 *   cooling    every account is in its post-sync freeze: when the first is free
 *              (the freeze is per account, NHI_SYNC_COOLDOWN_MINUTES; none when unset)
 *   failed     "Sync didn't finish": opens the panel
 *
 */
/** Now, re-read every 15 s while any account is frozen, so countdowns move. */
function useCooldownClock(cooldowns) {
  const [now, setNow] = useState(() => Date.now());
  const latest = Math.max(0, ...Object.values(cooldowns ?? {}).map(Number));
  const frozen = latest > now;
  useEffect(() => {
    /* A freeze just set (or ended) is read at once, then every 15 s. */
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = frozen ? setInterval(tick, 15000) : null;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [frozen, latest]);
  return now;
}

const minutesUntil = (until, now) => Math.max(1, Math.ceil((until - now) / 60000));

export function SyncButton() {
  const { run, cooldowns, untilFor, allCoolingUntil, connected, canScan, openPanel, start } = useSync();
  const now = useCooldownClock(cooldowns);
  const allUntil = allCoolingUntil(connected);
  const cooling = allUntil > now;

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
  return <SyncChooser base={base} cooling={cooling} allUntil={allUntil} untilFor={untilFor} now={now} start={start} openPanel={openPanel} />;
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
function SyncChooser({ base, cooling, allUntil, untilFor, now, start, openPanel }) {
  const workspace = useWorkspace();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const accounts = syncableAccounts(workspace.integration);
  const choose = accounts.length > 1;
  const minutes = minutesUntil(allUntil, now);
  const frozen = accounts.filter((a) => untilFor(a.accountId) > now);
  const ready = accounts.filter((a) => untilFor(a.accountId) <= now);

  /* Every account that is not in its freeze; frozen ones wait their turn. */
  const syncAll = () => {
    setOpen(false);
    if (cooling) openPanel();
    else start(ready.map((a) => a.accountId));
  };

  /* One account: the same sync (read, score, refresh), for that account only. */
  const syncOne = (account) => {
    setOpen(false);
    if (untilFor(account.accountId) > now) openPanel();
    else start([account.accountId]);
  };

  if (!choose) {
    return (
      <button
        type="button"
        onClick={cooling ? openPanel : () => start()}
        className={cn(base, 'border-topbar-line bg-topbar-field text-topbar-ink hover:border-ink-3/45')}
        title={cooling ? `This account was just synced. It can be synced again in ${minutes} min.` : 'Read your AWS accounts, score what is found and refresh every page'}
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
        className="flex max-h-[min(34rem,calc(100dvh-5rem))] w-80 flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-1.5 shadow-[var(--t-shadow-lg)]"
      >
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">What to sync</p>
        <ChooserItem
          icon={Layers}
          title={frozen.length && !cooling ? `All accounts ready (${ready.length} of ${accounts.length})` : `All accounts (${accounts.length})`}
          detail={
            cooling
              ? `Every account was just synced. The first can be synced again in ${minutes} min.`
              : frozen.length
                ? `Reads the ${ready.length} ${ready.length === 1 ? 'account' : 'accounts'} not synced just now; ${frozen.length} ${frozen.length === 1 ? 'waits' : 'wait'} a few minutes.`
                : 'Reads every account, scores what it finds and refreshes every page.'
          }
          disabled={cooling}
          onSelect={syncAll}
        />
        <div className="my-1 border-t border-line" />
        <p className="px-2.5 pt-1 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">One account</p>
        {/* 15 or 20 accounts do not fit the screen: the list scrolls (wheel,
            touch, keys) inside the panel, the "All accounts" row stays put. */}
        <div className="nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {accounts.map((account) => (
          <ChooserItem
            key={account.accountId}
            icon={Server}
            mono
            title={account.accountId}
            detail={
              untilFor(account.accountId) > now
                ? `Just synced. Available again in ${minutesUntil(untilFor(account.accountId), now)} min.`
                : `${account.regions.length} region${account.regions.length === 1 ? '' : 's'}${account.sync.lastSyncedAt ? ` · last synced ${formatRelative(account.sync.lastSyncedAt)}` : ''}`
            }
            disabled={untilFor(account.accountId) > now || account.regions.length === 0}
            onSelect={() => syncOne(account)}
          />
        ))}
        </div>
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
  const { run, cooldowns, untilFor, allCoolingUntil, connected, canScan, openPanel, start } = useSync();
  const now = useCooldownClock(cooldowns);
  const allUntil = allCoolingUntil(connected);
  const cooling = allUntil > now;

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
  const minutes = minutesUntil(allUntil, now);
  /* Every account not in its post-sync freeze. */
  const ready = connected.filter((id) => untilFor(id) <= now);
  return (
    <Button
      variant="secondary"
      icon={RefreshCw}
      onClick={cooling ? openPanel : () => start(ready)}
      title={cooling ? `Every account was just synced. The first can be synced again in ${minutes} min.` : 'Read every connected AWS account, score what is found and refresh every page'}
    >
      {cooling ? `Next sync in ${minutes} min` : 'Sync all accounts'}
    </Button>
  );
}
