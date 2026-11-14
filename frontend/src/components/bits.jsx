import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Search, UserRound } from 'lucide-react';
import { useView } from '../data/store';
import { formatDateTime, formatRelative, initialsOf } from '../lib/format';
import { cn } from '../ui/cn';
import { usePopover } from '../lib/hooks';

export const SEVERITY_TONE = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
export const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export function SeverityTag({ severity, size = 'sm', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium tracking-[0.05em] uppercase',
        size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11px]',
        {
          critical: 'bg-critical-soft text-critical',
          high: 'bg-high-soft text-high',
          medium: 'bg-medium-soft text-medium',
          low: 'bg-low-soft text-low',
        }[severity] || 'bg-neutral-soft text-ink-2',
        className,
      )}
    >
      <SeverityGlyph severity={severity} />
      {SEVERITY_LABEL[severity] || severity}
    </span>
  );
}

/* A small dot in the severity colour; the word carries the meaning. */
export function SeverityGlyph({ severity, className }) {
  return <span aria-hidden="true" className={cn('inline-block size-1.5 rounded-full bg-current', { critical: 'text-critical', high: 'text-high', medium: 'text-medium', low: 'text-low' }[severity], className)} />;
}

const STATUS = {
  open: ['Open', 'border-line-strong bg-surface text-ink-2', 'bg-ink-3'],
  in_progress: ['In progress', 'border-info/30 bg-info-soft text-info', 'bg-info'],
  resolved: ['Resolved', 'border-low/30 bg-low-soft text-low', 'bg-low'],
  risk_accepted: ['Risk accepted', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  new: ['New', 'border-critical/30 bg-critical-soft text-critical', 'bg-critical'],
  investigating: ['Investigating', 'border-info/30 bg-info-soft text-info', 'bg-info'],
  false_positive: ['False positive', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  active: ['Active', 'border-low/30 bg-low-soft text-low', 'bg-low'],
  dormant: ['Dormant', 'border-medium/30 bg-medium-soft text-medium', 'bg-medium'],
  stale: ['Stale', 'border-high/30 bg-high-soft text-high', 'bg-high'],
  disabled: ['Disabled', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  expired: ['Expired', 'border-critical/30 bg-critical-soft text-critical', 'bg-critical'],
  revoked: ['Revoked', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  inactive: ['Inactive', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  healthy: ['Healthy', 'border-low/30 bg-low-soft text-low', 'bg-low'],
  attention: ['Needs attention', 'border-high/30 bg-high-soft text-high', 'bg-high'],
  paused: ['Paused', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
  syncing: ['Syncing', 'border-info/30 bg-info-soft text-info', 'bg-info'],
  live: ['Live secret', 'border-critical/30 bg-critical-soft text-critical', 'bg-critical'],
  awaiting_approval: ['Awaiting approval', 'border-medium/30 bg-medium-soft text-medium', 'bg-medium'],
  running: ['Running', 'border-info/30 bg-info-soft text-info', 'bg-info'],
  queued: ['Queued', 'border-info/30 bg-info-soft text-info', 'bg-info'],
  succeeded: ['Succeeded', 'border-low/30 bg-low-soft text-low', 'bg-low'],
  cancelled: ['Cancelled', 'border-line bg-neutral-soft text-ink-3', 'bg-neutral'],
};
export const STATUS_LABEL = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]]));

export function StatusPill({ status, className, pulse = false }) {
  const [label, cls, dot] = STATUS[status] || [status, 'border-line bg-neutral-soft text-ink-2', 'bg-neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', cls.replace(/border-\S+/g, ''), className)}>
      <span className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

/* Jira's own status colours. */
const JIRA = {
  'To Do': 'bg-[#DFE1E6] text-[#42526E] dark:bg-[#2C333A] dark:text-[#B6C2CF]',
  'In Progress': 'bg-[#DEEBFF] text-[#0747A6] dark:bg-[#09326C] dark:text-[#85B8FF]',
  'In Review': 'bg-[#EAE6FF] text-[#403294] dark:bg-[#352C63] dark:text-[#B8ACF6]',
  Done: 'bg-[#E3FCEF] text-[#006644] dark:bg-[#164B35] dark:text-[#7EE2B8]',
};
export function JiraStatus({ status, className }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-[1px] text-[11px] font-bold uppercase tracking-[0.02em]', JIRA[status] || JIRA['To Do'], className)}>{status}</span>;
}
export const PRIORITY_COLOR = { Highest: '#CD1317', High: '#E9494A', Medium: '#E97F33', Low: '#2D8738', Lowest: '#57A55A' };
export function JiraPriority({ priority, withLabel = false }) {
  const up = priority === 'Highest' || priority === 'High';
  const color = PRIORITY_COLOR[priority] || '#E97F33';
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-2" title={`${priority} priority`}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        {priority === 'Medium' ? (
          <path d="M3 5.5h10M3 10.5h10" stroke={color} strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d={up ? 'M3.5 10.5 8 6l4.5 4.5' : 'M3.5 5.5 8 10l4.5-4.5'} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {(priority === 'Highest' || priority === 'Lowest') && <path d={up ? 'M3.5 6.5 8 2l4.5 4.5' : 'M3.5 9.5 8 14l4.5-4.5'} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {withLabel && priority}
    </span>
  );
}
export function JiraTypeIcon({ type, size = 16 }) {
  const color = type === 'Incident' ? '#E5493A' : type === 'Bug' ? '#E5493A' : '#4BADE8';
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-label={type} role="img" className="shrink-0">
      <rect width="16" height="16" rx="3" fill={color} />
      {type === 'Incident' ? <path d="M8 3.5v5.5M8 11.6v.4" stroke="#fff" strokeWidth="2" strokeLinecap="round" /> : <path d="m4.5 8.2 2.3 2.3 4.7-4.9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/* ── People ────────────────────────────────────────────────────────────── */
/* Pastel grounds with ink initials: people are told apart by initials, not loud colour. */
const AVATAR_HUES = [['#E1F3FE', '#1F6C9F'], ['#EDF3EC', '#346538'], ['#FBF3DB', '#8A6100'], ['#FDEBEC', '#9F2F2D'], ['#F1F0ED', '#4B4A47'], ['#F3EEF8', '#6B4A8A'], ['#FBEEE4', '#A4521F']];
function hueFor(ref = '') {
  let h = 0;
  for (let i = 0; i < ref.length; i += 1) h = (h * 31 + ref.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function usePerson(ref) {
  return useView((v) => (ref ? v.personByRef.get(ref) : null));
}

export function Avatar({ person, refId, size = 24, className, ring = false }) {
  const fromStore = usePerson(person ? null : refId);
  const p = person || fromStore;
  const name = refId === 'system' ? 'Corvane' : p?.name || (refId ? 'Teammate' : 'Unassigned');
  if (!p && !refId) {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-3', className)} style={{ width: size, height: size }} title="Unassigned">
        <UserRound aria-hidden="true" style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  if (p?.avatarUrl) {
    return <img src={p.avatarUrl} alt="" title={name} className={cn('shrink-0 rounded-full object-cover', ring && 'ring-2 ring-surface', className)} style={{ width: size, height: size }} />;
  }
  if (refId === 'system') {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded-full bg-brand font-bold text-on-brand', ring && 'ring-2 ring-surface', className)} style={{ width: size, height: size, fontSize: size * 0.42 }} title={name}>
        C
      </span>
    );
  }
  return (
    <span
      title={name}
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold', p?.former && 'opacity-60', ring && 'ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38), background: hueFor(p?.ref || refId)[0], color: hueFor(p?.ref || refId)[1] }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function PersonName({ refId, className, withAvatar = false, size = 20 }) {
  const p = usePerson(refId);
  const name = refId === 'system' ? 'Corvane' : !refId ? 'Unassigned' : p?.name || 'Teammate';
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {withAvatar && <Avatar refId={refId} size={size} />}
      <span className={cn('truncate', !refId && 'text-ink-3', p?.former && 'line-through decoration-ink-3/60')}>{name}</span>
      {p?.isMe && <span className="text-[10.5px] text-ink-3">(you)</span>}
    </span>
  );
}

/** Pick a teammate. Everyone who has signed in is listed first. */
export function PersonPicker({ value, onChange, label = 'Assignee', allowNone = true, size = 'md', className, align = 'start' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const people = useView((v) => v.people);
  const { wrapperRef, triggerRef, panelProps } = usePopover(open, () => setOpen(false));
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);
  const list = useMemo(() => people.filter((p) => !q || `${p.name} ${p.team} ${p.title}`.toLowerCase().includes(q.toLowerCase())), [people, q]);
  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-left text-ink transition-colors hover:border-ink-3/50',
          size === 'sm' ? 'h-8 px-2 text-[12.5px]' : 'h-9.5 px-2.5 text-[13px]',
        )}
      >
        <Avatar refId={value} size={size === 'sm' ? 18 : 20} />
        <PersonName refId={value} className="flex-1" />
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div {...panelProps} className={cn('animate-pop absolute z-[90] mt-1 w-72 overflow-hidden rounded-[12px] border border-line bg-surface shadow-lg', align === 'end' ? 'right-0' : 'left-0')}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden="true" className="size-4 text-ink-3" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a teammate" className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            {allowNone && (
              <li>
                <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2">
                  <Avatar refId={null} size={22} /> Unassigned
                  {!value && <Check aria-hidden="true" className="ml-auto size-4 text-brand" />}
                </button>
              </li>
            )}
            {list.map((p) => (
              <li key={p.ref}>
                <button type="button" role="option" aria-selected={value === p.ref} onClick={() => { onChange(p.ref); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                  <Avatar person={p} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{p.name}{p.isMe && <span className="text-ink-3"> (you)</span>}</span>
                    <span className="block truncate text-[11px] text-ink-3">{p.isViewer ? 'Signed in · ' : ''}{p.team}</span>
                  </span>
                  {value === p.ref && <Check aria-hidden="true" className="size-4 text-brand" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Stacked avatars of the people with this record open right now. */
export function AlsoViewing({ path }) {
  const peers = useView((v) => v.peers);
  const here = peers.filter((p) => p.presence?.path === path);
  if (!here.length) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2 py-1 text-[11.5px] text-ink-2">
      <span className="flex -space-x-1.5">
        {here.slice(0, 4).map((p) => (
          <Avatar key={p.peer} person={{ ref: p.by || p.peer, name: p.profile?.name || 'Teammate', avatarUrl: p.profile?.avatarUrl, color: p.profile?.color }} size={20} ring />
        ))}
      </span>
      {here.length === 1 ? `${here[0].profile?.name || 'A teammate'} is here` : `${here.length} teammates here`}
    </span>
  );
}

export function Time({ at, className, short = false }) {
  if (!at) return <span className={cn('text-ink-3', className)}>Never</span>;
  return (
    <time dateTime={at} title={formatDateTime(at)} className={className}>
      {short ? formatRelative(at).replace(' ago', '') : formatRelative(at)}
    </time>
  );
}

export function RecordLink({ to, children, className }) {
  return (
    <Link to={to} className={cn('font-medium text-brand underline-offset-4 hover:underline', className)}>
      {children}
    </Link>
  );
}

/** A number in a soft ring: posture and risk scores. */
export function ScoreRing({ value, size = 56, stroke = 6, tone, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = tone || (v >= 80 ? 'var(--t-low)' : v >= 65 ? 'var(--t-medium)' : v >= 50 ? 'var(--t-high)' : 'var(--t-critical)');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label || 'Score'} ${v} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--t-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 900ms var(--ease-out-quint)' }} />
      </svg>
      <span className="absolute font-display font-extrabold tracking-[-0.03em] text-ink" style={{ fontSize: size * 0.32 }} data-numeric="">
        {v}
      </span>
    </span>
  );
}

export function RiskBar({ value }) {
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 80 ? 'bg-critical' : v >= 60 ? 'bg-high' : v >= 35 ? 'bg-medium' : 'bg-low';
  return (
    <span className="inline-flex items-center gap-2" title={`Risk ${v} of 100`}>
      <span data-numeric="" className="w-6 text-right text-[12.5px] font-semibold text-ink">{v}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-track">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${v}%` }} />
      </span>
    </span>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">{children}</kbd>;
}

/** A 30-day trend as a thin line, with today's value marked. */
export function MiniBars({ values = [], className }) {
  const W = 72;
  const H = 18;
  const max = Math.max(1, ...values);
  if (!values.some(Boolean)) return <span className={cn('block text-[11px] text-ink-3', className)}>No calls</span>;
  const pts = values.map((v, k) => `${(k / Math.max(1, values.length - 1)) * W},${H - 2 - (v / max) * (H - 4)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--t-ink-3)" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx={W} cy={H - 2 - (values.at(-1) / max) * (H - 4)} r="2" fill="var(--t-ink)" />
    </svg>
  );
}
