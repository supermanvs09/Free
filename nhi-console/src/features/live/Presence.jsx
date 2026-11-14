import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { usePopover } from '../../lib/hooks';
import { initialsOf } from '../../lib/format';
import { roleMeta } from '../../lib/roles';
import { NAV_GROUPS, PROFILE_ITEMS } from '../../shell/navigation';
import { clientId, getPeople, getSyncStatus, onRemoteChange, setPresencePath, subscribePeople, subscribeSyncStatus } from '../../lib/local/state';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';

const PLACES = [...NAV_GROUPS.flatMap((g) => g.items), ...PROFILE_ITEMS];
function placeOf(path = '') {
  const hit = PLACES.filter((p) => [p.to, ...(p.match ?? [])].some((m) => path === m || path.startsWith(`${m}/`))).sort((a, b) => b.to.length - a.to.length)[0];
  return hit?.label ?? (path.startsWith('/settings') ? 'Settings' : 'the console');
}

/* A stable colour per person, from the brand's accent family. */
const HUES = [212, 262, 168, 24, 330, 190, 42, 286];
function hueOf(email = '') {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

function Avatar({ person, size = 'md', ring = true }) {
  const hue = hueOf(person.email);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-7 text-[10.5px]' : 'size-8 text-[11px]',
        ring && 'ring-2 ring-[var(--t-topbar,#fff)]',
      )}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 52%), hsl(${(hue + 40) % 360} 70% 44%))` }}
    >
      {initialsOf(person.name || person.email)}
    </span>
  );
}

/** People on the workspace right now (one row per person, however many tabs). */
function usePeopleHere(myEmail) {
  const raw = useSyncExternalStore(subscribePeople, getPeople);
  return useMemo(() => {
    const me = clientId();
    const byEmail = new Map();
    for (const p of raw) {
      if (!p.email || p.cid === me) continue;
      if (p.email === myEmail) continue;
      const prev = byEmail.get(p.email);
      if (!prev || (p.since ?? 0) > (prev.since ?? 0)) byEmail.set(p.email, p);
    }
    return [...byEmail.values()].sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
  }, [raw, myEmail]);
}

/**
 * The live strip in the top bar: whether this console is connected to the
 * shared workspace, and who else is in it and where.
 */
export function PresenceBar() {
  const { user } = useAuth();
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const people = usePeopleHere(user?.email?.toLowerCase());
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { wrapperRef, triggerRef, panelProps } = usePopover(open, () => setOpen(false));

  if (status === 'local') return null;
  const live = status === 'live';
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;

  return (
    <div ref={wrapperRef} className="relative hidden shrink-0 sm:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={live ? `${people.length ? `${people.length} other ${people.length === 1 ? 'person' : 'people'} online` : 'Only you online'}. Changes appear for everyone as they happen.` : 'Reconnecting'}
        className="flex h-10 items-center gap-2 rounded-full px-1.5 transition-colors hover:bg-topbar-hover"
      >
        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', live ? 'text-low' : 'text-medium')}>
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--t-low)] opacity-60" />}
            <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-[var(--t-low)]' : 'bg-[var(--t-medium)]')} />
          </span>
          {live ? 'Live' : 'Reconnecting'}
        </span>
        {shown.length > 0 && (
          <span className="flex -space-x-2">
            {shown.map((p) => (
              <Avatar key={p.email} person={p} />
            ))}
            {extra > 0 && <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2 ring-2 ring-[var(--t-topbar,#fff)]">+{extra}</span>}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Who is online" {...panelProps} className="animate-pop absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-lg">
          <div className="border-b border-line bg-surface-2 px-3.5 py-3">
            <p className="text-[13px] font-semibold text-ink">{live ? 'Live workspace' : 'Reconnecting…'}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
              {live ? 'Everything anyone changes here - users, verdicts, plans, alerts and settings - appears for everyone at once.' : 'Changes you make are kept and sent the moment the connection is back.'}
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {people.length === 0 && <li className="px-2.5 py-3 text-[12.5px] text-ink-3">No one else is here right now. Share this address with your team to work together.</li>}
            {people.map((p) => (
              <li key={p.email}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (p.path) navigate(p.path);
                  }}
                  className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span className="relative">
                    <Avatar person={p} ring={false} />
                    <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[var(--t-low)] ring-2 ring-[var(--t-surface,#fff)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.name || p.email}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {p.role ? `${roleMeta(p.role).label} · ` : ''}on {placeOf(p.path)}
                    </span>
                  </span>
                  <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* What other people did, as it happens: read from the audit entries their
   changes add to the shared log. */
const QUIET = new Set(['auth.login', 'auth.logout', 'auth.refresh', 'export.csv']);

export function LiveActivity() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setPresencePath(location.pathname);
  }, [location.pathname]);

  useEffect(
    () =>
      onRemoteChange(({ ops }) => {
        const mine = user?.email?.toLowerCase();
        const entries = ops
          .filter((op) => op.op === 'ins' && op.path?.length === 1 && op.path[0] === 'audit' && op.value?.actor)
          .map((op) => op.value)
          /* Changes to this person's own account are announced by AuthContext. */
          .filter((e) => e.actor?.toLowerCase() !== mine && !QUIET.has(e.action) && e.target?.toLowerCase() !== mine);
        if (!entries.length) return;
        const first = entries[0];
        notify({
          variant: first.outcome === 'failure' ? 'warning' : 'info',
          title: first.actor_name || first.actor,
          description: entries.length > 1 ? `${first.summary} · and ${entries.length - 1} more` : first.summary,
          duration: 6000,
          action: first.screen && first.screen !== location.pathname ? { label: 'View', onSelect: () => navigate(first.screen) } : null,
        });
      }),
    [user?.email, notify, navigate, location.pathname],
  );

  return null;
}
