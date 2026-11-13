import { NavLink, useLocation } from 'react-router-dom';
import { Fingerprint, KeyRound } from 'lucide-react';
import { cn } from '../ui/cn';

/**
 * Title strip. Full-bleeds to the content edges so it reads as shell rather
 * than as a card, and hosts the screen's primary actions plus (optionally) its
 * view tabs - the console pattern of breadcrumb → title → views → work area.
 */
export function PageHeader({ title, lede, actions, sections, tabs, meta, className }) {
  return (
    <header
      className={cn(
        '-mx-3 -mt-4 border-b border-line bg-surface px-3 pt-4 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1760px]">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3.5">
          <div className="min-w-0">
            <h1 className="text-[21px] leading-tight font-extrabold tracking-[-0.026em] text-ink sm:text-[23px]">
              {title}
            </h1>
            {lede && (
              <p className="mt-1.5 max-w-2xl text-balance text-[12.5px] leading-relaxed text-ink-2">
                {lede}
              </p>
            )}
          </div>
          {/* Allowed to wrap and shrink: three actions at 360px would otherwise
              push the page wider than the viewport. */}
          {actions && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
          )}
        </div>
        {/* Sub-page tabs sit on the header's edge when nothing follows; with
            views or a note below them, they get their own rule. */}
        {sections && (tabs || meta) ? <div className="mb-3 border-b border-line">{sections}</div> : sections}
        {meta && <div className="pb-3.5">{meta}</div>}
        {tabs}
      </div>
    </header>
  );
}

/**
 * The sub-pages of one screen as link tabs (Discovery: Identities and
 * Credentials). Real links, so each keeps its own address, filters and
 * history; the sliding underline marks the one open.
 */
export function SectionTabs({ items, label }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-[13.5px] whitespace-nowrap transition-colors',
              active ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-3 hover:text-ink',
            )}
          >
            {item.icon && <item.icon aria-hidden="true" className={cn('size-4', active ? 'text-brand' : '')} />}
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Discovery's two tabs: what acts in the accounts, and what it signs in with. */
export const DISCOVERY_SECTIONS = [
  { to: '/identities', label: 'Identities', icon: Fingerprint },
  { to: '/credentials', label: 'Credentials', icon: KeyRound },
];

export function DiscoveryTabs() {
  return <SectionTabs items={DISCOVERY_SECTIONS} label="Discovery" />;
}
