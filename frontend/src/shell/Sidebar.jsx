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
const URGENT = new Set(['detections', 'exposure']);

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
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-[6px] px-2.5 py-[6px] text-[13px] transition-colors duration-150',
        active ? 'bg-surface-3 font-medium text-ink' : 'text-ink-2 hover:bg-surface-3/70 hover:text-ink',
      )}
    >
      <item.icon aria-hidden="true" className={cn('size-[17px] shrink-0', active ? 'text-ink' : 'text-ink-3')} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span aria-label={`${badge} waiting`} className={cn('min-w-[20px] rounded-full px-1.5 text-center text-[11px] leading-[18px] font-medium tabular-nums', URGENT.has(item.badge) ? 'bg-critical-soft text-critical' : 'text-ink-3')}>
          {badgeText(badge)}
        </span>
      )}
    </Link>
  );
}

/* Collapsed: a slim fixed rail. Icons only, groups split by hairlines, names on hover. */
function RailLink({ item, badge = 0 }) {
  const { pathname } = useLocation();
  const active = isActiveItem(item, pathname);
  return (
    <Link
      to={item.to}
      aria-label={badge > 0 ? `${item.label}, ${badge} waiting` : item.label}
      aria-current={active ? 'page' : undefined}
      className={cn('group relative grid size-9 place-items-center rounded-[8px] transition-colors duration-150', active ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:bg-surface-3/70 hover:text-ink')}
    >
      <item.icon aria-hidden="true" className="size-[18px]" />
      {badge > 0 && <span aria-hidden="true" className={cn('absolute top-1.5 right-1.5 size-1.5 rounded-full', URGENT.has(item.badge) ? 'bg-critical' : 'bg-ink-3')} />}
      <span aria-hidden="true" className="pointer-events-none absolute left-full z-50 ml-2.5 hidden items-center gap-2 rounded-[6px] bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-surface group-hover:flex group-focus-visible:flex">
        {item.label}
        {badge > 0 && <span className="opacity-70">{badgeText(badge)}</span>}
      </span>
    </Link>
  );
}

function ConnectedApps() {
  const connections = useView((v) => v.connections);
  return (
    <Link to="/integrations" className="mx-2.5 mb-3 block rounded-[8px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
      <p className="flex items-center justify-between text-[11px] font-medium text-ink-3">
        Connected sources
        <span className="flex items-center gap-1.5 text-ink-3">
          <span className="size-1.5 rounded-full bg-low" /> Live
        </span>
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {[...SOURCE_PROVIDERS, 'jira', 'email'].map((p) => {
          const n = connections.filter((c) => c.provider === p).length;
          return (
            <span key={p} className={cn(!n && 'opacity-35 grayscale')} title={`${PROVIDERS[p].name}: ${n} connected`}>
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
        <div key={group.key} className="mb-3 last:mb-0">
          {group.key !== 'overview' && <p className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-ink-3">{group.label}</p>}
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
        <aside ref={asideRef} aria-label="Primary navigation" className="fixed top-16 bottom-0 left-0 z-30 hidden w-[60px] flex-col items-center border-r border-sidebar-line bg-sidebar py-2.5 lg:flex">
          <button type="button" onClick={onToggleCollapse} aria-label="Expand navigation" title="Expand navigation" className="mb-1 grid size-9 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
            <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
          </button>
          <nav aria-label="Primary" className="nav-scroll flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto">
            {NAV_GROUPS.map((g, k) => (
              <div key={g.key} className="flex flex-col items-center gap-0.5">
                {k > 0 && <span aria-hidden="true" className="my-1.5 h-px w-6 bg-line" />}
                {g.items.map((item) => (
                  <RailLink key={item.to} item={item} badge={item.badge ? badges[item.badge] : 0} />
                ))}
              </div>
            ))}
          </nav>
        </aside>
      ) : (
        <aside ref={asideRef} className="fixed top-16 bottom-0 left-0 z-30 hidden w-[236px] shrink-0 flex-col overscroll-contain border-r border-sidebar-line bg-sidebar lg:flex">
          <div className="flex h-11 shrink-0 items-center gap-2 px-4">
            <span className="min-w-0 truncate text-[12px] font-semibold text-ink">NHI Security</span>
            <button type="button" onClick={onToggleCollapse} aria-label="Collapse navigation" title="Collapse navigation" className="ml-auto grid size-7 shrink-0 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </button>
          </div>
          {lists()}
          <ConnectedApps />
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-50 flex lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={onCloseMobile} className="animate-fade absolute inset-0 bg-[var(--t-overlay)]" />
          <aside className="animate-fade relative flex w-[272px] flex-col border-r border-sidebar-line bg-sidebar" aria-label="Primary navigation">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[12px] font-medium text-ink-3">Navigate</span>
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
