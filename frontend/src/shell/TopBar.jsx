import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, LogOut, Menu, Moon, RefreshCw, ScrollText, Search, Sun, UsersRound } from 'lucide-react';
import { useThemeMode } from '../app/ThemeContext';
import { usePopover } from '../lib/hooks';
import { BrandLockup, BrandMark } from './Brand';
import { actions, personName, recordPath, signOut, useView } from '../data/store';
import { notificationsFor, setPersonal, usePersonal } from '../data/personal';
import { Avatar, Time } from '../components/bits';
import { cn } from '../ui/cn';

const iconButton = 'relative grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] text-topbar-muted transition-colors hover:bg-topbar-hover hover:text-topbar-ink';

/* Everyone else with the console open right now. */
function Presence() {
  const peers = useView((v) => v.peers);
  const mode = useView((v) => v.mode);
  const unique = [...new Map(peers.map((p) => [p.by || p.peer, p])).values()];
  if (mode !== 'shared' && !unique.length) return null;
  return (
    <div className="hidden items-center gap-2 md:flex" title={unique.length ? unique.map((p) => p.profile?.name || 'Teammate').join(', ') : 'Only you right now'}>
      <span className="flex -space-x-2">
        {unique.slice(0, 4).map((p) => (
          <Avatar key={p.peer} person={{ ref: p.by || p.peer, name: p.profile?.name || 'Teammate', avatarUrl: p.profile?.avatarUrl, color: p.profile?.color }} size={28} ring />
        ))}
      </span>
      <span className="flex items-center gap-1.5 text-[12px] text-topbar-muted">
        <span className="relative size-2 rounded-full bg-low">
          <span className="absolute inset-0 animate-ping rounded-full bg-low opacity-50" />
        </span>
        {unique.length ? `${unique.length} online` : 'Live'}
      </span>
    </div>
  );
}

function SyncControl() {
  const run = useView((v) => v.runs.find((r) => r.kind === 'sync' && (r.status === 'running' || r.status === 'queued')));
  const last = useView((v) => v.connections.filter((c) => c.lastSyncAt).map((c) => c.lastSyncAt).sort().at(-1));
  const [busy, setBusy] = useState(false);
  if (run) {
    const pct = Math.round(((run.step + (run.fraction || 0)) / run.steps.length) * 100);
    return (
      <Link to="/integrations" className="hidden h-9 items-center gap-2.5 rounded-[var(--radius-control)] border border-info/30 bg-info-soft px-3 text-[12.5px] font-medium text-info sm:flex" title={run.steps[run.step]}>
        <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
        <span className="max-w-40 truncate">{run.startedBy === undefined ? 'Syncing' : `${personName(run.startedBy).split(' ')[0]} is syncing`}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-info/20">
          <span className="block h-full rounded-full bg-info transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </span>
        <span data-numeric="">{pct}%</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        await actions.startSync();
        setBusy(false);
      }}
      title={last ? `Last sync ${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sync now'}
      className="hidden h-9 items-center gap-2 rounded-[var(--radius-control)] border border-topbar-line bg-topbar-field px-3 text-[12.5px] font-medium text-topbar-ink transition-colors hover:border-ink-3/45 sm:flex"
    >
      <RefreshCw aria-hidden="true" className={cn('size-4', busy && 'animate-spin')} />
      Sync now
    </button>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('mine');
  const view = useView();
  const personal = usePersonal();
  const navigate = useNavigate();
  const { wrapperRef, triggerRef, panelProps } = usePopover(open, () => setOpen(false));
  const all = notificationsFor(view).slice(0, 60);
  const mine = all.filter((a) => (a.recipients || []).includes(view.me?.ref));
  const seenAt = Date.parse(personal.notificationsSeenAt || 0);
  const unread = all.filter((a) => !a.seed && a.actor !== view.me?.ref && Date.parse(a.at) > seenAt && ((a.recipients || []).includes(view.me?.ref) || ['created', 'connected', 'approved', 'joined'].includes(a.verb))).length;
  const list = tab === 'mine' ? mine : all;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setTimeout(() => setPersonal({ notificationsSeenAt: new Date().toISOString() }), 1500);
        }}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        className={iconButton}
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-[17px] rounded-full bg-critical px-1 text-center text-[10px] leading-[17px] font-bold text-white ring-2 ring-topbar">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div {...panelProps} className="animate-pop absolute right-0 z-50 mt-2 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <p className="text-[14px] font-semibold text-ink">Notifications</p>
            <div className="ml-auto flex rounded-lg bg-surface-3 p-0.5 text-[12px]">
              {[['mine', 'For you'], ['all', 'Everything']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-md px-2.5 py-1 font-medium', tab === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-3')}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 && (
              <li className="px-4 py-10 text-center text-[12.5px] text-ink-3">
                <CheckCheck aria-hidden="true" className="mx-auto mb-2 size-5" />
                Nothing for you yet. When someone assigns you work, mentions you or moves your Jira issue, it lands here.
              </li>
            )}
            {list.map((a) => {
              const fresh = !a.seed && Date.parse(a.at) > seenAt && a.actor !== view.me?.ref;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(recordPath(a.target));
                    }}
                    className="flex w-full items-start gap-2.5 border-b border-line/70 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Avatar refId={a.actor} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug text-ink-2">
                        <span className="font-semibold text-ink">{personName(a.actor, view)}</span> {a.verb} <span className="text-ink">{a.text}</span>
                      </span>
                      <Time at={a.at} className="mt-0.5 block text-[11px] text-ink-3" />
                    </span>
                    {fresh && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="New" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link to="/audit-log" onClick={() => setOpen(false)} className="border-t border-line bg-surface-2 px-3.5 py-2 text-center text-[12.5px] font-medium text-brand hover:underline">
            See the full audit log
          </Link>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onOpenNav, onOpenCommand }) {
  const me = useView((v) => v.me);
  const role = useView((v) => v.people.find((p) => p.isMe)?.role);
  const navigate = useNavigate();
  const { theme, setPreference } = useThemeMode();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const [menuOpen, setMenuOpen] = useState(false);
  const { wrapperRef: menuRef, triggerRef, panelProps } = usePopover(menuOpen, () => setMenuOpen(false));

  return (
    <header className="topbar-surface fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 border-b border-topbar-line px-3 sm:px-4 lg:px-5">
      <button type="button" onClick={onOpenNav} aria-label="Open navigation" className={cn(iconButton, 'lg:hidden')}>
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <Link to="/overview" aria-label="Deep Algorithms - dashboard" className="shrink-0 rounded px-1">
        <span className="hidden sm:block"><BrandLockup height={32} /></span>
        <span className="block sm:hidden"><BrandMark size={30} /></span>
      </Link>
      <span aria-hidden="true" className="mx-2 hidden h-6 w-px bg-topbar-line md:block" />
      <span className="hidden min-w-0 truncate text-[12.5px] font-medium text-topbar-muted md:block">
        Corvane <span className="text-topbar-muted/60">/</span> <span className="text-topbar-ink">Production estate</span>
      </span>

      <div aria-hidden="true" className="flex-1" />
      <Presence />
      <SyncControl />

      <button type="button" onClick={onOpenCommand} className="hidden h-9 min-w-0 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] border border-topbar-line bg-topbar-field px-3 text-left text-[13px] text-topbar-muted transition-[background-color,border-color] duration-150 hover:border-ink-3/45 hover:text-topbar-ink lg:flex lg:w-52 xl:w-64">
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search identities, issues…</span>
        <kbd className="shrink-0 rounded border border-topbar-line bg-topbar px-1.5 py-0.5 font-mono text-[10.5px]">⌘K</kbd>
      </button>
      <button type="button" onClick={onOpenCommand} aria-label="Search" className={cn(iconButton, 'lg:hidden')}>
        <Search aria-hidden="true" className="size-5" />
      </button>

      <Notifications />

      <button type="button" onClick={() => setPreference(nextTheme)} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`} className={iconButton}>
        {nextTheme === 'light' ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${me?.name || 'you'}`}
          className={cn('grid size-10 shrink-0 place-items-center rounded-full transition-[box-shadow] duration-150', menuOpen ? 'ring-2 ring-brand/45' : 'hover:ring-2 hover:ring-line-strong')}
        >
          <Avatar refId={me?.ref} size={34} />
        </button>
        {menuOpen && (
          <div role="menu" {...panelProps} className="animate-pop absolute right-0 z-50 mt-1 w-72 overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-surface shadow-lg">
            <div className="flex items-start gap-3 border-b border-line bg-surface-2 px-3.5 py-3.5">
              <Avatar refId={me?.ref} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{me?.name}</span>
                {me?.email && <span className="mt-0.5 block truncate text-[12px] text-ink-3">{me.email}</span>}
                <span className="mt-1.5 inline-flex rounded-full border border-brand/25 bg-info-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand capitalize">{role || 'admin'}</span>
              </span>
            </div>
            <div className="border-b border-line p-1">
              {[
                ['/settings/team', UsersRound, 'Team & roles'],
                ['/audit-log', ScrollText, 'Audit log'],
              ].map(([to, Icon, label]) => (
                <Link key={to} role="menuitem" to={to} onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              ))}
            </div>
            <div className="p-1">
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                  navigate('/overview', { replace: true });
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-critical-soft hover:text-critical"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
