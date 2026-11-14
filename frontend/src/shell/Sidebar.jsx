import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAccess } from '../app/useAccess';
import { useContainedScroll } from '../lib/hooks';
import { isActiveItem, navGroupsFor } from './navigation';
import { useWorkspace } from '../app/WorkspaceContext';
import { IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import { useAlertSummary } from '../features/alerts/useAlertBadge';

const badgeText = (n) => (n > 99 ? '99+' : String(n));

/**
 * Navigation only - no brand, no user chrome, no search: those belong to the
 * top bar. Two short lists with plain headings (Overview, Settings), nothing
 * to open or close. Collapsed, the rail floats beside the content as two
 * pills of larger icons, centred on the screen's height.
 */
function SidebarLink({ item, onNavigate, badge = 0 }) {
  const { pathname } = useLocation();
  const active = isActiveItem(item, pathname);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] transition-colors duration-150',
        active ? 'bg-info-soft font-semibold text-brand' : 'font-medium text-ink-2 hover:bg-surface-3 hover:text-ink',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-[height,opacity] duration-200',
          active ? 'h-5 opacity-100' : 'h-2 opacity-0',
        )}
      />
      <item.icon aria-hidden="true" className="size-[17px] shrink-0 opacity-85" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 && (
        <span
          aria-label={`${badge} new`}
          className="min-w-[20px] rounded-full bg-critical px-1.5 py-px text-center text-[10.5px] leading-[16px] font-bold text-white tabular-nums"
        >
          {badgeText(badge)}
        </span>
      )}
    </Link>
  );
}

/** One icon of the floating rail: a 36px circle, its name on hover and to screen readers. */
function RailLink({ item, badge = 0 }) {
  const { pathname } = useLocation();
  const active = isActiveItem(item, pathname);
  return (
    <Link
      to={item.to}
      aria-label={badge > 0 ? `${item.label}, ${badge} new` : item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative grid size-9 place-items-center rounded-full transition-colors duration-150',
        active ? 'bg-brand text-white shadow-[var(--t-shadow-sm)]' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
      )}
    >
      <item.icon aria-hidden="true" className="size-[17px]" strokeWidth={1.9} />
      {badge > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1.5 min-w-[16px] rounded-full bg-critical px-1 text-center text-[9.5px] leading-[16px] font-bold text-white tabular-nums ring-2 ring-surface"
        >
          {badgeText(badge)}
        </span>
      )}
      {/* A label that appears beside the rail on hover or keyboard focus. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-full z-50 ml-3 hidden rounded-md bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-surface shadow-lg group-hover:block group-focus-visible:block"
      >
        {item.label}
      </span>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { can, role } = useAccess();
  const { exposureEnabled } = useWorkspace();
  const groups = navGroupsFor(can, role, { exposure: exposureEnabled });
  const main = groups.filter((g) => g.key !== 'settings');
  const settings = groups.find((g) => g.key === 'settings');
  const asideRef = useRef(null);
  const alerts = useAlertSummary({ exposure: exposureEnabled && can('exposure.view') });
  const badgeFor = (item) => (item.badge === 'alerts' ? (alerts?.badge ?? 0) : 0);
  /* A wheel over the rail scrolls the rail; it never carries on into the page. */
  useContainedScroll(asideRef, { scroller: 'nav' });

  /* Expanded: Settings follows the last Overview item (Activity) as one
     continuous list, not pinned to the bottom edge. */
  const lists = (onNavigate) => (
    <nav aria-label="Primary" className="nav-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2">
      {groups.map((group) => (
        <div key={group.key} className={cn('mb-3 last:mb-0', group.key === 'settings' && 'mt-1 border-t border-line pt-3')}>
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <SidebarLink key={item.to} item={item} onNavigate={onNavigate} badge={badgeFor(item)} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {collapsed ? (
        /* Floating rail: detached from the edges, two pills, larger icons. */
        <aside
          ref={asideRef}
          aria-label="Primary navigation"
          className="fixed top-16 bottom-0 left-3 z-30 hidden w-[48px] flex-col items-center justify-center gap-2.5 py-4 lg:flex"
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand navigation"
            title="Expand navigation"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[var(--t-shadow-md)] transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <PanelLeftOpen aria-hidden="true" className="size-[17px]" />
          </button>
          <nav
            aria-label="Primary"
            className="flex flex-col items-center gap-1 rounded-full border border-line bg-surface p-1.5 shadow-[var(--t-shadow-md)]"
          >
            {main.flatMap((group) => group.items).map((item) => (
              <RailLink key={item.to} item={item} badge={badgeFor(item)} />
            ))}
          </nav>
          {settings && (
            <div className="flex flex-col items-center gap-1 rounded-full border border-line bg-surface p-1.5 shadow-[var(--t-shadow-md)]">
              {settings.items.map((item) => (
                <RailLink key={item.to} item={item} badge={badgeFor(item)} />
              ))}
            </div>
          )}
        </aside>
      ) : (
        <aside
          ref={asideRef}
          className="fixed top-16 bottom-0 left-0 z-30 hidden w-[232px] shrink-0 flex-col overscroll-contain border-r border-sidebar-line bg-sidebar lg:flex"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 px-3.5">
            <span className="min-w-0 truncate font-display text-[12px] leading-tight font-extrabold tracking-[0.1em] text-ink uppercase">
              NHI Discovery
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse navigation"
              title="Collapse navigation"
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </button>
          </div>
          {lists()}
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onCloseMobile}
            className="animate-fade absolute inset-0 bg-[var(--t-overlay)] backdrop-blur-[2px]"
          />
          <aside className="animate-fade relative flex w-[268px] flex-col border-r border-sidebar-line bg-sidebar shadow-lg" aria-label="Primary navigation">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase">Navigate</span>
              <IconButton icon={X} label="Close navigation" size="sm" onClick={onCloseMobile} />
            </div>
            {lists(onCloseMobile)}
          </aside>
        </div>
      )}
    </>
  );
}
