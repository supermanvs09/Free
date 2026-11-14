import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useContainedScroll } from '../lib/hooks';
import { isActiveItem, NAV_GROUPS } from './navigation';
import { IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { useView } from '../data/store';
import { unreadMail, usePersonal } from '../data/personal';
import { AppLogo } from '../components/Logo';
import { SOURCE_PROVIDERS, PROVIDERS } from '../data/world';

const badgeText = (n) => (n > 99 ? '99+' : String(n));

function useBadges() {
  const view = useView();
  const personal = usePersonal();
  return {
    detections: view.detections.filter((d) => d.status === 'new').length,
    exposure: view.exposures.filter((x) => x.status === 'open').length,
    approvals: view.runs.filter((r) => r.status === 'awaiting_approval').length,
    tickets: view.tickets.filter((t) => t.assignee === view.me?.ref && t.status !== 'Done').length,
    mail: unreadMail(view, personal).length,
  };
}

function SidebarLink({ item, onNavigate, badge = 0 }) {
  const { pathname } = useLocation();
  const active = isActiveItem(item, pathname);
  const urgent = item.badge === 'detections' || item.badge === 'exposure';
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-[7px] text-[13px] transition-colors duration-150',
        active ? 'bg-info-soft font-semibold text-brand' : 'font-medium text-ink-2 hover:bg-surface-3 hover:text-ink',
      )}
    >
      <span aria-hidden="true" className={cn('absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-[height,opacity] duration-200', active ? 'h-5 opacity-100' : 'h-2 opacity-0')} />
      <item.icon aria-hidden="true" className="size-[17px] shrink-0 opacity-85" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span aria-label={`${badge} waiting`} className={cn('min-w-[20px] rounded-full px-1.5 py-px text-center text-[10.5px] leading-[16px] font-bold tabular-nums', urgent ? 'bg-critical text-white' : 'bg-surface-3 text-ink-2')}>
          {badgeText(badge)}
        </span>
      )}
    </Link>
  );
}

function RailLink({ item, badge = 0 }) {
  const { pathname } = useLocation();
  const active = isActiveItem(item, pathname);
  return (
    <Link
      to={item.to}
      aria-label={badge > 0 ? `${item.label}, ${badge} waiting` : item.label}
      aria-current={active ? 'page' : undefined}
      className={cn('group relative grid size-10 place-items-center rounded-full transition-colors duration-150', active ? 'bg-brand text-white shadow-[var(--t-shadow-sm)]' : 'text-ink-2 hover:bg-surface-3 hover:text-ink')}
    >
      <item.icon aria-hidden="true" className="size-[19px]" strokeWidth={1.9} />
      {badge > 0 && (
        <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-critical px-1 text-center text-[10px] leading-[18px] font-bold text-white tabular-nums ring-2 ring-surface">
          {badgeText(badge)}
        </span>
      )}
      <span aria-hidden="true" className="pointer-events-none absolute left-full z-50 ml-3 hidden rounded-md bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-surface shadow-lg group-hover:block group-focus-visible:block">
        {item.label}
      </span>
    </Link>
  );
}

/* What feeds the console, at the foot of the rail: one logo per application. */
function ConnectedApps() {
  const connections = useView((v) => v.connections);
  return (
    <Link to="/integrations" className="mx-2.5 mb-3 block rounded-[12px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
      <p className="flex items-center justify-between text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
        Connected
        <span className="flex items-center gap-1 tracking-normal normal-case">
          <span className="size-1.5 rounded-full bg-low" /> Live
        </span>
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {[...SOURCE_PROVIDERS, 'jira', 'email'].map((p) => {
          const n = connections.filter((c) => c.provider === p).length;
          return (
            <span key={p} className={cn('relative', !n && 'opacity-35 grayscale')} title={`${PROVIDERS[p].name}: ${n} connected`}>
              <AppLogo name={PROVIDERS[p].logo} size={23} />
            </span>
          );
        })}
      </div>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const asideRef = useRef(null);
  const badges = useBadges();
  useContainedScroll(asideRef, { scroller: 'nav' });

  const lists = (onNavigate) => (
    <nav aria-label="Primary" className="nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-1">
      {NAV_GROUPS.map((group) => (
        <div key={group.key} className="mb-2.5 last:mb-0">
          {group.key !== 'overview' && <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{group.label}</p>}
          <div className="flex flex-col gap-px">
            {group.items.map((item) => (
              <SidebarLink key={item.to} item={item} onNavigate={onNavigate} badge={item.badge ? badges[item.badge] : 0} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {collapsed ? (
        <aside ref={asideRef} aria-label="Primary navigation" className="fixed top-16 bottom-0 left-3 z-30 hidden w-[56px] flex-col items-center justify-center gap-3 py-4 lg:flex">
          <button type="button" onClick={onToggleCollapse} aria-label="Expand navigation" title="Expand navigation" className="grid size-[48px] shrink-0 place-items-center rounded-full bg-ink text-surface shadow-[var(--t-shadow-lg)] transition-transform hover:scale-[1.04]">
            <PanelLeftOpen aria-hidden="true" className="size-5" />
          </button>
          <nav aria-label="Primary" className="nav-scroll flex min-h-0 flex-col items-center gap-1.5 overflow-y-auto rounded-full border border-line bg-surface px-1.5 py-3 shadow-[var(--t-shadow-lg)]">
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <RailLink key={item.to} item={item} badge={item.badge === 'detections' || item.badge === 'exposure' ? badges[item.badge] : 0} />
            ))}
          </nav>
        </aside>
      ) : (
        <aside ref={asideRef} className="fixed top-16 bottom-0 left-0 z-30 hidden w-[236px] shrink-0 flex-col overscroll-contain border-r border-sidebar-line bg-sidebar lg:flex">
          <div className="flex h-11 shrink-0 items-center gap-2 px-3.5">
            <span className="min-w-0 truncate font-display text-[11.5px] leading-tight font-extrabold tracking-[0.1em] text-ink uppercase">NHI Security</span>
            <button type="button" onClick={onToggleCollapse} aria-label="Collapse navigation" title="Collapse navigation" className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </button>
          </div>
          {lists()}
          <ConnectedApps />
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-50 flex lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={onCloseMobile} className="animate-fade absolute inset-0 bg-[var(--t-overlay)] backdrop-blur-[2px]" />
          <aside className="animate-fade relative flex w-[272px] flex-col border-r border-sidebar-line bg-sidebar shadow-lg" aria-label="Primary navigation">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase">Navigate</span>
              <IconButton icon={X} label="Close navigation" size="sm" onClick={onCloseMobile} />
            </div>
            {lists(onCloseMobile)}
            <ConnectedApps />
          </aside>
        </div>
      )}
    </>
  );
}
