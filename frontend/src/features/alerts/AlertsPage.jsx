import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CheckCheck, CircleDot, Dna, FileWarning, Loader2, Send, ShieldAlert, UserPlus, X } from 'lucide-react';
import { fetchAlertActivity, fetchAlerts, fetchAssignees, triageAlerts } from '../../lib/api/alerts';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { genomeRoute } from '../../lib/identityLinks';
import { useAuth } from '../../app/AuthContext';
import { useAccess } from '../../app/useAccess';
import { useWorkspace } from '../../app/WorkspaceContext';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { ListSkeleton } from '../../ui/Skeleton';
import { ClearState, ErrorState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { ScoreShift } from './parts';
import { refreshAlerts } from './useAlertBadge';

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

const SOURCES = {
  posture: { label: 'Posture', icon: ShieldAlert, what: 'Score drop' },
  genome: { label: 'NHI Genome', icon: Dna, what: 'Behaviour anomaly' },
  exposure: { label: 'Credential exposure', icon: FileWarning, what: 'Exposed credential' },
};
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEV = {
  critical: { label: 'Critical', dot: 'bg-critical', text: 'text-critical', soft: 'bg-critical-soft text-critical' },
  high: { label: 'High', dot: 'bg-high', text: 'text-high', soft: 'bg-high-soft text-high' },
  medium: { label: 'Medium', dot: 'bg-medium', text: 'text-medium', soft: 'bg-medium-soft text-medium' },
  low: { label: 'Low', dot: 'bg-low', text: 'text-low', soft: 'bg-low-soft text-low' },
};
const STATUS = {
  open: { label: 'New', tone: 'bg-info-soft text-brand' },
  in_progress: { label: 'In progress', tone: 'bg-medium-soft text-medium' },
  resolved: { label: 'Resolved', tone: 'bg-low-soft text-low' },
  dismissed: { label: 'Dismissed', tone: 'bg-surface-3 text-ink-3' },
};
const QUEUES = [
  { key: 'active', label: 'Needs attention', test: (a) => a.triage.status === 'open' || a.triage.status === 'in_progress' },
  { key: 'mine', label: 'Assigned to me', test: (a, me) => (a.triage.status === 'open' || a.triage.status === 'in_progress') && sameUser(a.triage.assignee, me) },
  { key: 'unassigned', label: 'Unassigned', test: (a) => (a.triage.status === 'open' || a.triage.status === 'in_progress') && !a.triage.assignee },
  { key: 'done', label: 'Closed', test: (a) => a.triage.status === 'resolved' || a.triage.status === 'dismissed' },
];

const sameUser = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
const initials = (name) =>
  String(name || '?')
    .split('@')[0]
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function Avatar({ who, people, size = 22 }) {
  if (!who) return null;
  const person = people.find((p) => sameUser(p.email, who));
  const name = person?.full_name || who;
  return (
    <span
      title={name}
      className="grid shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold text-surface"
      style={{ width: size, height: size, fontSize: size <= 22 ? 9.5 : 11 }}
    >
      {initials(name)}
    </span>
  );
}

const nameOf = (who, people) => people.find((p) => sameUser(p.email, who))?.full_name || who;
const linkOf = (a) => (a.source === 'genome' && a.facts ? `${genomeRoute(a.facts.source_type, a.facts.identity_name)}?tab=anomalies` : a.link);

/* ── One row ────────────────────────────────────────────────────────────── */

function Row({ a, selected, checked, onCheck, onSelect, people, canWork }) {
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;
  const st = STATUS[a.triage.status] ?? STATUS.open;
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn('group relative flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3.5 transition-colors', selected ? 'bg-info-soft/55' : 'hover:bg-surface-2/70')}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
      {canWork && (
        <input
          type="checkbox"
          aria-label={`Select ${a.title}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onCheck}
          className="mt-1 size-3.5 shrink-0 accent-[var(--color-brand)]"
        />
      )}
      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', sev.dot)} title={sev.label} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-[13.5px] text-ink', a.triage.status === 'open' ? 'font-semibold' : 'font-medium')}>{a.subject}</span>
          {a.triage.reopened && <span className="shrink-0 rounded-full bg-high-soft px-1.5 text-[10.5px] font-semibold text-high">Reopened</span>}
          <span className="ml-auto shrink-0 text-[11px] text-ink-3" title={formatDateTime(a.detected_at)}>
            {formatRelative(a.detected_at)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{a.title}</span>
        <span className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-3">
          <src.icon className="size-3.5" />
          <span className="truncate">{src.label}</span>
          {a.triage.status !== 'open' && <span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-semibold', st.tone)}>{st.label}</span>}
          {a.triage.comments > 0 && <span>· {a.triage.comments} {a.triage.comments === 1 ? 'comment' : 'comments'}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            {a.triage.assignee ? <Avatar who={a.triage.assignee} people={people} size={20} /> : <span className="text-[11px] italic">Unassigned</span>}
          </span>
        </span>
      </span>
    </div>
  );
}

/* ── The preview ────────────────────────────────────────────────────────── */

function AssignMenu({ people, current, me, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const workers = people.filter((p) => p.can_work);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 min-w-[180px] items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-left text-[12.5px] hover:border-line-strong disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current ? <Avatar who={current} people={people} /> : <UserPlus className="size-4 text-ink-3" />}
        <span className="min-w-0 flex-1 truncate text-ink">{current ? nameOf(current, people) : 'Unassigned'}</span>
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-[var(--t-shadow-lg)]">
          {me && !sameUser(current, me) && (
            <button type="button" onClick={() => (onPick(me), setOpen(false))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-brand hover:bg-surface-2">
              <UserPlus className="size-3.5" /> Assign to me
            </button>
          )}
          {workers.map((p) => (
            <button
              key={p.email}
              type="button"
              role="option"
              aria-selected={sameUser(current, p.email)}
              onClick={() => (onPick(p.email), setOpen(false))}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
            >
              <Avatar who={p.email} people={people} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{p.full_name || p.email}</span>
                <span className="block truncate text-[11px] text-ink-3">
                  {p.email} · {p.role}
                </span>
              </span>
              {sameUser(current, p.email) && <CheckCheck className="size-3.5 text-brand" />}
            </button>
          ))}
          {current && (
            <button type="button" onClick={() => (onPick(''), setOpen(false))} className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12.5px] text-ink-3 hover:bg-surface-2">
              <X className="size-3.5" /> Unassign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACTIONS = { assigned: 'assigned it to', unassigned: 'unassigned it', status: 'moved it to', comment: 'commented' };

function Preview({ a, people, me, canWork, onChange }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const { notify } = useToast();
  const act = useQuery((signal) => fetchAlertActivity(a.key, signal), [a.key, a.triage.updated_at, a.triage.comments]);
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;

  const change = async (patch, ok) => {
    setBusy(true);
    try {
      await triageAlerts({ keys: [a.key], ...patch });
      if (ok) notify({ variant: 'success', title: ok });
      await onChange();
      act.refetch();
    } catch (e) {
      notify({ variant: 'error', title: 'Not saved', description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-6 pt-5 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', sev.soft)}>{sev.label}</span>
          <span className="flex items-center gap-1.5 text-ink-3">
            <src.icon className="size-3.5" /> {src.what}
          </span>
          <span className="text-ink-3">· detected {formatRelative(a.detected_at)}</span>
          {a.triage.reopened && <span className="rounded-full bg-high-soft px-2 py-0.5 font-semibold text-high">Reopened: it got worse after being closed</span>}
        </div>
        <h2 className="mt-3 text-[18px] leading-snug font-semibold text-ink">{a.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{a.subject}</span>
          {a.subject_type ? ` · ${a.source === 'exposure' ? a.subject_type : identityTypeLabel(a.subject_type)}` : ''}
          {a.account_id ? ` · ${a.account_id}` : ''}
        </p>

        {canWork ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AssignMenu people={people} current={a.triage.assignee} me={me} disabled={busy} onPick={(email) => change({ assignee: email }, email ? `Assigned to ${nameOf(email, people)}` : 'Unassigned')} />
            <div className="flex rounded-[var(--radius-control)] border border-line p-0.5" role="group" aria-label="Status">
              {Object.entries(STATUS).map(([key, s]) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  aria-pressed={a.triage.status === key}
                  onClick={() => a.triage.status !== key && change({ status: key }, `Marked ${s.label.toLowerCase()}`)}
                  className={cn('rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium transition-colors', a.triage.status === key ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2')}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {busy && <Loader2 className="size-4 animate-spin text-ink-3" />}
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-ink-3">
            {a.triage.assignee ? `Assigned to ${nameOf(a.triage.assignee, people)}. ` : ''}Your role can view alerts; an analyst or admin works them.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* What happened */}
        <section className="rounded-[14px] border border-line bg-surface-2/40 p-4">
          {a.source === 'posture' && (
            <>
              <ScoreShift before={a.score_before} now={a.score_now} />
              <p className="mt-2 text-[13px] text-ink-2">{a.summary}</p>
            </>
          )}
          {a.source === 'genome' && (
            <>
              <p className="text-[13px] text-ink-2">
                <span className="font-semibold text-ink">{formatNumber(a.count)}</span> open {a.count === 1 ? 'departure' : 'departures'} from its learned baseline - {a.summary}.
              </p>
              {a.facts?.latest && <p className="mt-2 rounded-[10px] bg-surface px-3 py-2 text-[12.5px] text-ink-2">Latest: {a.facts.latest}</p>}
            </>
          )}
          {a.source === 'exposure' && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-ink-3">Where</dt>
              <dd className="truncate font-mono text-ink">{a.summary}</dd>
              {a.facts?.redacted && (
                <>
                  <dt className="text-ink-3">Value</dt>
                  <dd className="truncate font-mono text-ink-2">{a.facts.redacted}</dd>
                </>
              )}
              {a.facts?.author && (
                <>
                  <dt className="text-ink-3">Committed by</dt>
                  <dd className="truncate text-ink-2">{a.facts.author}</dd>
                </>
              )}
              {a.facts?.verification && (
                <>
                  <dt className="text-ink-3">Verified</dt>
                  <dd className="text-ink-2">{a.facts.verification.toLowerCase().replaceAll('_', ' ')}</dd>
                </>
              )}
            </dl>
          )}
          <Link to={linkOf(a)} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
            {a.source === 'posture' ? 'See exactly why the score dropped' : a.source === 'genome' ? 'Investigate in NHI Genome' : 'Open in Credential exposure'}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </section>

        {/* Activity */}
        <section className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">Activity</h3>
          {canWork && (
            <form
              className="mt-3 flex items-start gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                change({ note: note.trim() }).then(() => setNote(''));
              }}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for the team…"
                rows={2}
                maxLength={4000}
                className="min-h-[44px] flex-1 resize-y rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form.requestSubmit();
                }}
              />
              <Button type="submit" size="sm" variant="primary" icon={Send} disabled={busy || !note.trim()}>
                Post
              </Button>
            </form>
          )}
          <ol className="mt-4 flex flex-col">
            {(act.data ?? []).map((e) => (
              <li key={e.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
                <Avatar who={e.actor} people={people} />
                <span className="min-w-0">
                  <span className="text-[12.5px] text-ink-2">
                    <span className="font-medium text-ink">{nameOf(e.actor, people)}</span> {ACTIONS[e.action] ?? e.action}{' '}
                    {e.action === 'assigned' && <span className="font-medium text-ink">{nameOf(e.detail, people)}</span>}
                    {e.action === 'status' && <span className="font-medium text-ink">{STATUS[e.detail]?.label ?? e.detail}</span>}
                  </span>
                  <span className="ml-1.5 text-[11px] text-ink-3" title={formatDateTime(e.created_at)}>
                    {formatRelative(e.created_at)}
                  </span>
                  {e.action === 'comment' && <p className="mt-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-ink">{e.detail}</p>}
                </span>
              </li>
            ))}
            <li className="flex gap-3 pl-1 text-[12px] text-ink-3">
              <CircleDot className="mt-0.5 size-[22px] shrink-0 p-1" />
              Raised by {src.label} {formatRelative(a.detected_at)}
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

/**
 * Every alert that needs a person, from posture, NHI Genome and credential
 * exposure, in one inbox: take it, assign it, move it, comment, close it.
 */
export default function AlertsPage() {
  const { user } = useAuth();
  const me = user?.email || user?.user_id;
  const { can } = useAccess();
  const canWork = can('alerts.work');
  const { exposureEnabled } = useWorkspace();
  const showExposure = exposureEnabled && can('exposure.view');
  const [params, setParams] = useSearchParams();
  const queue = QUEUES.find((q) => q.key === params.get('queue')) ?? QUEUES[0];
  const [sources, setSources] = useState([]);
  const [sevs, setSevs] = useState([]);
  const [q, setQ] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [mobileDetail, setMobileDetail] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { notify } = useToast();
  const listRef = useRef(null);

  const query = useQuery((signal) => fetchAlerts(signal), []);
  const peopleQuery = useQuery((signal) => fetchAssignees(signal), []);
  const people = peopleQuery.data ?? [];
  const reload = useCallback(async () => {
    await query.refetch();
    refreshAlerts();
  }, [query]);

  const all = useMemo(() => (query.data?.alerts ?? []).filter((a) => showExposure || a.source !== 'exposure'), [query.data, showExposure]);
  const inQueue = useMemo(() => all.filter((a) => queue.test(a, me)), [all, queue, me]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inQueue.filter(
      (a) =>
        (sources.length === 0 || sources.includes(a.source)) &&
        (sevs.length === 0 || sevs.includes(a.severity)) &&
        (!term || [a.subject, a.title, a.summary, a.account_id, a.triage.assignee].some((v) => String(v ?? '').toLowerCase().includes(term))),
    );
  }, [inQueue, sources, sevs, q]);
  const current = shown.find((a) => a.key === selectedKey) ?? shown[0] ?? null;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.key]);

  const counts = useMemo(() => Object.fromEntries(QUEUES.map((qq) => [qq.key, all.filter((a) => qq.test(a, me)).length])), [all, me]);
  const countBy = (field, value) => inQueue.filter((a) => a[field] === value).length;
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const bulk = async (patch, label) => {
    setBulkBusy(true);
    try {
      await triageAlerts({ keys: [...checked], ...patch });
      notify({ variant: 'success', title: `${formatNumber(checked.size)} ${checked.size === 1 ? 'alert' : 'alerts'} ${label}` });
      setChecked(new Set());
      await reload();
    } catch (e) {
      notify({ variant: 'error', title: 'Not saved', description: e?.message });
    } finally {
      setBulkBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.target.closest('textarea, input, [role="listbox"][aria-haspopup]')) return;
    const i = shown.findIndex((a) => a.key === current?.key);
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (shown[i + 1]) setSelectedKey(shown[i + 1].key);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown[i - 1]) setSelectedKey(shown[i - 1].key);
    } else if (e.key === 'x' && current && canWork) {
      setChecked((s) => {
        const n = new Set(s);
        if (n.has(current.key)) n.delete(current.key);
        else n.add(current.key);
        return n;
      });
    }
  };

  /* Counted from what this user can see (exposure alerts drop out when that feature is off). */
  const s = query.data ? { open: all.filter((a) => a.triage.status === 'open').length, active: counts.active } : null;
  const active = s?.active ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Alerts"
        lede={
          s
            ? `${formatNumber(active)} need attention, ${formatNumber(s.open)} not picked up yet. Score drops, behaviour anomalies and exposed credentials, owned and closed in one place.`
            : 'Score drops, behaviour anomalies and exposed credentials, owned and closed in one place.'
        }
      />

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !query.data ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
          <ListSkeleton rows={8} />
        </div>
      ) : (
        <>
          {/* Queues */}
          <nav aria-label="Queues" className="flex flex-wrap gap-1 border-b border-line">
            {QUEUES.map((qq) => (
              <button
                key={qq.key}
                type="button"
                onClick={() => {
                  setParams(qq.key === 'active' ? {} : { queue: qq.key }, { replace: true });
                  setChecked(new Set());
                }}
                aria-current={qq.key === queue.key ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors',
                  qq.key === queue.key ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {qq.label}
                <span data-numeric="" className={cn('rounded-full px-1.5 text-[11px] font-semibold', qq.key === queue.key ? 'bg-ink text-surface' : 'bg-surface-3 text-ink-2')}>
                  {formatNumber(counts[qq.key])}
                </span>
              </button>
            ))}
          </nav>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SOURCES)
              .filter(([k]) => k !== 'exposure' || showExposure)
              .map(([k, src]) => {
                const on = sources.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(sources, setSources, k)}
                    className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                  >
                    <src.icon className="size-3.5" />
                    {src.label}
                    <span data-numeric="" className="font-semibold">
                      {countBy('source', k)}
                    </span>
                  </button>
                );
              })}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            {SEVERITIES.map((k) => {
              const on = sevs.includes(k);
              const n = countBy('severity', k);
              if (!n && !on) return null;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(sevs, setSevs, k)}
                  className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                >
                  <span className={cn('size-1.5 rounded-full', SEV[k].dot)} />
                  {SEV[k].label}
                  <span data-numeric="" className="font-semibold">
                    {n}
                  </span>
                </button>
              );
            })}
            <SearchInput size="sm" value={q} onChange={setQ} placeholder="Search alerts, identities, people…" className="ml-auto w-full sm:w-72" aria-label="Search alerts" />
          </div>

          <section className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface" onKeyDown={onKey}>
            {/* Bulk bar */}
            {checked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ink px-4 py-2.5 text-surface">
                <span className="text-[12.5px] font-semibold">{formatNumber(checked.size)} selected</span>
                <span className="mx-1 h-4 w-px bg-surface/25" />
                {me && (
                  <button type="button" disabled={bulkBusy} onClick={() => bulk({ assignee: me }, 'assigned to you')} className="rounded-md px-2 py-1 text-[12.5px] hover:bg-white/10">
                    Assign to me
                  </button>
                )}
                <select
                  disabled={bulkBusy}
                  value=""
                  onChange={(e) => e.target.value && bulk({ assignee: e.target.value }, `assigned to ${nameOf(e.target.value, people)}`)}
                  className="rounded-md bg-white/10 px-2 py-1 text-[12.5px] text-surface outline-none"
                  aria-label="Assign selected to"
                >
                  <option value="">Assign to…</option>
                  {people.filter((p) => p.can_work).map((p) => (
                    <option key={p.email} value={p.email} className="text-ink">
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={bulkBusy} onClick={() => bulk({ status: 'in_progress' }, 'marked in progress')} className="rounded-md px-2 py-1 text-[12.5px] hover:bg-white/10">
                  In progress
                </button>
                <button type="button" disabled={bulkBusy} onClick={() => bulk({ status: 'resolved' }, 'resolved')} className="rounded-md px-2 py-1 text-[12.5px] hover:bg-white/10">
                  Resolve
                </button>
                <button type="button" disabled={bulkBusy} onClick={() => bulk({ status: 'dismissed' }, 'dismissed')} className="rounded-md px-2 py-1 text-[12.5px] hover:bg-white/10">
                  Dismiss
                </button>
                {bulkBusy && <Loader2 className="size-4 animate-spin" />}
                <button type="button" onClick={() => setChecked(new Set())} className="ml-auto rounded-md p-1 hover:bg-white/10" aria-label="Clear selection">
                  <X className="size-4" />
                </button>
              </div>
            )}

            {shown.length === 0 ? (
              <ClearState
                title={queue.key === 'mine' ? 'Nothing assigned to you' : queue.key === 'done' ? 'Nothing closed yet' : q || sources.length || sevs.length ? 'No alert matches' : 'All clear'}
                description={queue.key === 'active' && !q && !sources.length && !sevs.length ? 'No alert needs attention. New ones appear here after each sync.' : 'Try another queue or filter.'}
              />
            ) : (
              <div className="flex h-[min(76vh,860px)] min-h-[540px]">
                <div
                  ref={listRef}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Alerts"
                  className={cn('min-h-0 w-full shrink-0 overflow-y-auto border-r border-line outline-none lg:block lg:w-[440px]', mobileDetail ? 'hidden' : 'block')}
                >
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 text-[11px] text-ink-3 backdrop-blur">
                    {canWork && (
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        checked={checked.size > 0 && shown.every((a) => checked.has(a.key))}
                        onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((a) => a.key)) : new Set())}
                        className="size-3.5 accent-[var(--color-brand)]"
                      />
                    )}
                    {formatNumber(shown.length)} · worst first
                    <span className="ml-auto hidden gap-1 sm:flex">
                      {['j', 'k', canWork && 'x'].filter(Boolean).map((k) => (
                        <kbd key={k} className="rounded border border-line px-1 font-mono text-[10px]">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                  {shown.map((a) => (
                    <Row
                      key={a.key}
                      a={a}
                      people={people}
                      canWork={canWork}
                      selected={a.key === current?.key}
                      checked={checked.has(a.key)}
                      onCheck={() =>
                        setChecked((cur) => {
                          const n = new Set(cur);
                          if (n.has(a.key)) n.delete(a.key);
                          else n.add(a.key);
                          return n;
                        })
                      }
                      onSelect={() => {
                        setSelectedKey(a.key);
                        setMobileDetail(true);
                      }}
                    />
                  ))}
                </div>
                <div className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', mobileDetail ? 'flex' : 'hidden')}>
                  {mobileDetail && (
                    <button type="button" onClick={() => setMobileDetail(false)} className="border-b border-line px-6 py-2.5 text-left text-[12.5px] font-medium text-brand lg:hidden">
                      ← All alerts
                    </button>
                  )}
                  {current && <Preview key={current.key} a={current} people={people} me={me} canWork={canWork} onChange={reload} />}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
