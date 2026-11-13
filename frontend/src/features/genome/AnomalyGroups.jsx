import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, ChevronDown, ChevronRight, Layers, Repeat2 } from 'lucide-react';
import { setAnomalyDisposition } from '../../lib/api/genome';
import { severityMeta } from '../../lib/domain';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { TONE_BG, cn } from '../../ui/cn';
import { dimensionLabel, sourceTypeLabel } from './meta';

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNRATED'];
const DAY_MS = 86400000;
const SPARK_DAYS = 14;

const sevKey = (item) => {
  const s = String(item.severity ?? '').toUpperCase();
  return SEVERITY_ORDER.includes(s) ? s : 'UNRATED';
};

const numbersIn = (text) => (String(text ?? '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/* "640 was observed outside the stored baseline" and "641 was observed…"
   are the same departure repeating: the numbers are the measurement, the
   rest is the pattern. */
const patternText = (text) => String(text ?? '').replace(/-?\d+(?:\.\d+)?/g, '#');

/**
 * Anomalies folded twice: by identity, then by repeating pattern (same
 * departure type, same wording apart from the numbers). A volume rule that
 * raises one anomaly per period as a count climbs reads as one line with how
 * often it fired and the range it climbed through, instead of hundreds of
 * near-identical rows.
 */
export function groupAnomalies(items) {
  const identities = new Map();
  for (const item of items) {
    const idKey = `${item.identity?.source_type}|${item.identity?.identity_name}`;
    let group = identities.get(idKey);
    if (!group) {
      group = { key: idKey, identity: item.identity, items: [], patterns: new Map(), sev: {}, last: 0, open: 0 };
      identities.set(idKey, group);
    }
    group.items.push(item);
    const sev = sevKey(item);
    group.sev[sev] = (group.sev[sev] ?? 0) + 1;
    const at = new Date(item.detected_at).getTime() || 0;
    group.last = Math.max(group.last, at);
    if (String(item.state).toLowerCase() === 'open') group.open += 1;

    const pKey = `${item.dimension}|${patternText(item.what_changed)}`;
    let pattern = group.patterns.get(pKey);
    if (!pattern) {
      pattern = { key: pKey, dimension: item.dimension, text: item.what_changed, items: [], min: null, max: null, first: at, last: at, worst: 'UNRATED' };
      group.patterns.set(pKey, pattern);
    }
    pattern.items.push(item);
    for (const n of numbersIn(item.what_changed)) {
      pattern.min = pattern.min === null ? n : Math.min(pattern.min, n);
      pattern.max = pattern.max === null ? n : Math.max(pattern.max, n);
    }
    if (at >= pattern.last) {
      pattern.last = at;
      pattern.text = item.what_changed; // the newest wording stands for the pattern
    }
    pattern.first = Math.min(pattern.first, at);
    if (SEVERITY_ORDER.indexOf(sev) < SEVERITY_ORDER.indexOf(pattern.worst)) pattern.worst = sev;
  }
  const rank = (g) => SEVERITY_ORDER.map((s) => g.sev[s] ?? 0);
  return [...identities.values()]
    .map((g) => ({
      ...g,
      patterns: [...g.patterns.values()].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.worst) - SEVERITY_ORDER.indexOf(b.worst) || b.items.length - a.items.length || b.last - a.last,
      ),
    }))
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length - 1; i += 1) if (ra[i] !== rb[i]) return rb[i] - ra[i];
      return b.items.length - a.items.length || b.last - a.last;
    });
}

/** Anomalies per day over the last two weeks, as a small bar sparkline. */
function Spark({ items, className }) {
  const bars = useMemo(() => {
    const end = Math.floor(Date.now() / DAY_MS);
    const counts = new Array(SPARK_DAYS).fill(0);
    for (const item of items) {
      const day = Math.floor(new Date(item.detected_at).getTime() / DAY_MS);
      const index = SPARK_DAYS - 1 - (end - day);
      if (index >= 0 && index < SPARK_DAYS) counts[index] += 1;
    }
    const max = Math.max(1, ...counts);
    return counts.map((count) => ({ count, h: count === 0 ? 2 : 4 + Math.round((count / max) * 20) }));
  }, [items]);
  return (
    <span className={cn('flex h-6 items-end gap-[2px]', className)} aria-label={`Raised per day over the last ${SPARK_DAYS} days`} role="img">
      {bars.map((bar, index) => (
        <span
          key={index}
          title={`${formatNumber(bar.count)} on day ${index + 1} of ${SPARK_DAYS}`}
          className={cn('w-[4px] rounded-[1px]', bar.count ? 'bg-brand/70' : 'bg-line')}
          style={{ height: bar.h }}
        />
      ))}
    </span>
  );
}

/** Share of each severity, as one segmented bar. */
function SeverityBar({ sev, total }) {
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-track" aria-hidden="true">
      {SEVERITY_ORDER.map((s) =>
        sev[s] ? (
          <span key={s} className={cn('h-full', s === 'UNRATED' ? 'bg-neutral' : TONE_BG[severityMeta(s).tone])} style={{ width: `${(sev[s] / total) * 100}%` }} />
        ) : null,
      )}
    </span>
  );
}

function SeverityCounts({ sev }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
      {SEVERITY_ORDER.filter((s) => sev[s]).map((s) => (
        <span key={s} className="flex items-center gap-1 text-ink-3">
          <span className={cn('size-1.5 rounded-full', s === 'UNRATED' ? 'bg-neutral' : TONE_BG[severityMeta(s).tone])} />
          <span data-numeric="" className="font-semibold text-ink-2">
            {formatNumber(sev[s])}
          </span>
          {s === 'UNRATED' ? 'unrated' : severityMeta(s).label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

function rangeText(pattern) {
  if (pattern.min === null || pattern.min === pattern.max) return null;
  return `${formatNumber(pattern.min)} → ${formatNumber(pattern.max)}`;
}

const TIMELINE_DAYS = 30;

/**
 * What the reader needs before the list: how much is open, how much is
 * severe, how much is new, how many identities it touches, and whether it is
 * rising. Severity tiles filter the list.
 */
function AnomalyOverview({ items, groups, onSeverity }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const today = Math.floor(now / DAY_MS);
    const days = Array.from({ length: TIMELINE_DAYS }, () => ({}));
    const dims = new Map();
    let severe = 0;
    let fresh = 0;
    let prior = 0;
    for (const item of items) {
      const at = new Date(item.detected_at).getTime() || 0;
      const sev = sevKey(item);
      if (sev === 'CRITICAL' || sev === 'HIGH') severe += 1;
      if (now - at < DAY_MS) fresh += 1;
      else if (now - at < 2 * DAY_MS) prior += 1;
      const index = TIMELINE_DAYS - 1 - (today - Math.floor(at / DAY_MS));
      if (index >= 0 && index < TIMELINE_DAYS) days[index][sev] = (days[index][sev] ?? 0) + 1;
      dims.set(item.dimension, (dims.get(item.dimension) ?? 0) + 1);
    }
    const totals = days.map((d) => Object.values(d).reduce((a, b) => a + b, 0));
    const top = [...dims.entries()].sort((a, b) => b[1] - a[1])[0];
    return { days, totals, peak: Math.max(1, ...totals), severe, fresh, prior, top };
  }, [items]);

  const total = items.length;
  const worst = groups[0];
  const tiles = [
    {
      label: 'Critical or high',
      value: stats.severe,
      hint: total ? `${Math.round((stats.severe / total) * 100)}% of these` : null,
      tone: stats.severe ? 'text-critical' : 'text-ink',
      onClick: stats.severe && onSeverity ? () => onSeverity(['CRITICAL', 'HIGH']) : null,
    },
    {
      label: 'New in 24 hours',
      value: stats.fresh,
      hint: stats.fresh === stats.prior ? 'same as the day before' : `${stats.fresh > stats.prior ? 'up' : 'down'} from ${formatNumber(stats.prior)} the day before`,
    },
    { label: 'Identities affected', value: groups.length, hint: worst ? `most: ${worst.identity?.display_name || worst.identity?.identity_name}` : null },
    {
      label: 'Most common departure',
      text: stats.top ? dimensionLabel(stats.top[0]) : '-',
      hint: stats.top ? `${formatNumber(stats.top[1])} of ${formatNumber(total)}` : null,
    },
  ];

  return (
    <section aria-label="Anomaly summary" className="grid gap-3 border-b border-line p-3 sm:p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <dl className="grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => {
          const body = (
            <>
              <dt className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{tile.label}</dt>
              <dd className={cn('mt-1 truncate font-display font-bold leading-none text-ink', tile.text ? 'text-[15px]' : 'text-[24px]', tile.tone)} data-numeric="">
                {tile.text ?? formatNumber(tile.value)}
              </dd>
              {tile.hint && <dd className="mt-1.5 truncate text-[11.5px] text-ink-3" title={tile.hint}>{tile.hint}</dd>}
            </>
          );
          return tile.onClick ? (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onClick}
              title="Show only critical and high"
              className="rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-critical/40 hover:bg-critical-soft/40"
            >
              {body}
            </button>
          ) : (
            <div key={tile.label} className="rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-3">
              {body}
            </div>
          );
        })}
      </dl>
      <div className="flex min-w-0 flex-col rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Detected per day</p>
          <span className="flex flex-wrap gap-x-2.5 text-[10.5px] text-ink-3">
            {SEVERITY_ORDER.slice(0, 4).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={cn('size-1.5 rounded-full', TONE_BG[severityMeta(s).tone])} />
                {severityMeta(s).label}
              </span>
            ))}
          </span>
        </div>
        <div className="mt-2 flex min-h-[84px] flex-1 items-end gap-[3px]" role="img" aria-label={`Anomalies detected per day over the last ${TIMELINE_DAYS} days, by severity`}>
          {stats.days.map((day, index) => {
            const n = stats.totals[index];
            const date = new Date((Math.floor(Date.now() / DAY_MS) - (TIMELINE_DAYS - 1 - index)) * DAY_MS);
            return (
              <span
                key={index}
                title={`${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${formatNumber(n)}`}
                className="flex flex-1 flex-col-reverse overflow-hidden rounded-[2px]"
                style={{ height: n ? `${Math.max(6, (n / stats.peak) * 100)}%` : '2px' }}
              >
                {n === 0 ? (
                  <span className="h-full bg-line" />
                ) : (
                  SEVERITY_ORDER.map((s) =>
                    day[s] ? <span key={s} className={s === 'UNRATED' ? 'bg-neutral' : TONE_BG[severityMeta(s).tone]} style={{ height: `${(day[s] / n) * 100}%` }} /> : null,
                  )
                )}
              </span>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
          <span>{TIMELINE_DAYS} days ago</span>
          <span>Today</span>
        </div>
      </div>
    </section>
  );
}

/* Close many anomalies at once, a few requests at a time. */
async function closeMany(items, disposition, onProgress) {
  const queue = [...items];
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await setAnomalyDisposition(item.id, { disposition, reason: 'Closed together with its repeating pattern' });
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { failed };
}

function PatternRow({ pattern, onOpen, canAct, onClose }) {
  const count = pattern.items.length;
  const latest = pattern.items.reduce((a, b) => (new Date(b.detected_at) > new Date(a.detected_at) ? b : a));
  const open = pattern.items.filter((item) => String(item.state).toLowerCase() === 'open');
  const meta = severityMeta(pattern.worst === 'UNRATED' ? '' : pattern.worst);
  const range = rangeText(pattern);
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <button type="button" onClick={() => onOpen(latest, pattern)} className="group flex min-w-0 items-start gap-3 text-left">
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] border',
            count > 1 ? 'border-brand/25 bg-info-soft text-brand' : 'border-line bg-surface-2 text-ink-3',
          )}
        >
          {count > 1 ? <Repeat2 aria-hidden="true" className="size-4" /> : <Layers aria-hidden="true" className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink group-hover:text-brand">{dimensionLabel(pattern.dimension)}</span>
            {pattern.worst !== 'UNRATED' && (
              <Tag size="sm" tone={meta.tone} dot>
                {meta.label}
              </Tag>
            )}
            {count > 1 && (
              <span data-numeric="" className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                ×{formatNumber(count)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-2" title={pattern.text}>
            {count > 1 && range ? `Repeating as the measure moved ${range}` : pattern.text}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">
            {count > 1 ? (
              <>
                First {formatRelative(new Date(pattern.first).toISOString())} · latest{' '}
                <span title={formatDateTime(latest.detected_at)}>{formatRelative(latest.detected_at)}</span>
              </>
            ) : (
              <span title={formatDateTime(latest.detected_at)}>Detected {formatRelative(latest.detected_at)}</span>
            )}
          </span>
        </span>
      </button>
      <span className="flex items-center gap-3 sm:justify-end">
        {count > 1 && <Spark items={pattern.items} />}
        <Button size="sm" variant="secondary" onClick={() => onOpen(latest, pattern)}>
          {count > 1 ? 'Review latest' : 'Review'}
        </Button>
        {count > 1 && open.length > 0 && canAct && (
          <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => onClose(pattern, open)}>
            Close {formatNumber(open.length)}
          </Button>
        )}
      </span>
    </li>
  );
}

function IdentityGroup({ group, expanded, onToggle, onOpen, canAct, onClose }) {
  const total = group.items.length;
  const repeating = group.patterns.filter((p) => p.items.length > 1).length;
  return (
    <li className={cn('overflow-hidden rounded-[var(--radius-panel)] border bg-surface transition-colors', expanded ? 'border-line-strong shadow-sm' : 'border-line')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="grid w-full gap-3 px-4 py-3.5 text-left hover:bg-surface-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-3">
          {expanded ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-3" /> : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-3" />}
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink" title={group.identity?.identity_name}>
              {group.identity?.display_name || group.identity?.identity_name}
            </span>
            <span className="block truncate text-[11.5px] text-ink-3">
              {sourceTypeLabel(group.identity?.source_type, group.identity?.identity_name)} · {formatNumber(group.patterns.length)}{' '}
              {group.patterns.length === 1 ? 'pattern' : 'patterns'}
              {repeating ? `, ${formatNumber(repeating)} repeating` : ''}
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <SeverityBar sev={group.sev} total={total} />
          <SeverityCounts sev={group.sev} />
        </span>
        <Spark items={group.items} className="hidden md:flex" />
        <span className="flex items-baseline gap-1.5 sm:justify-end">
          <span data-numeric="" className="font-display text-[22px] leading-none font-bold text-ink">
            {formatNumber(total)}
          </span>
          <span className="text-[11.5px] text-ink-3">
            {total === 1 ? 'anomaly' : 'anomalies'}
            <span className="block" title={formatDateTime(new Date(group.last).toISOString())}>
              latest {formatRelative(new Date(group.last).toISOString())}
            </span>
          </span>
        </span>
      </button>
      {expanded && (
        <ul className="animate-fade divide-y divide-line border-t border-line bg-surface-2/40">
          {group.patterns.map((pattern) => (
            <PatternRow key={pattern.key} pattern={pattern} onOpen={onOpen} canAct={canAct} onClose={onClose} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* Asking to close every open repeat of a pattern: the confirmation, the
   progress while it runs, and the result. Shared by both anomaly lists. */
function useCloseMany(onChanged) {
  const [closing, setClosing] = useState(null); // { pattern, open }
  const [progress, setProgress] = useState(null);
  const { notify } = useToast();

  const run = async (disposition) => {
    const { open } = closing;
    setProgress(0);
    const { failed } = await closeMany(open, disposition, setProgress);
    setProgress(null);
    setClosing(null);
    notify(
      failed
        ? { variant: 'error', title: `${formatNumber(open.length - failed)} closed, ${formatNumber(failed)} failed`, description: 'Try the rest again.' }
        : { variant: 'success', title: `${formatNumber(open.length)} ${disposition === 'resolved' ? 'resolved' : 'dismissed'}`, description: 'They no longer count as open.' },
    );
    onChanged?.();
  };

  const modal = (
    <Modal
      open={Boolean(closing)}
      onClose={() => progress === null && setClosing(null)}
      title={closing ? `Close ${formatNumber(closing.open.length)} repeats of “${dimensionLabel(closing.pattern.dimension)}”?` : ''}
      description="Resolve if it has been dealt with; dismiss if it needs nothing. A new occurrence is raised again as usual."
      footer={
        progress !== null ? (
          <span data-numeric="" className="text-[12.5px] text-ink-2">
            Closing {formatNumber(progress)} of {formatNumber(closing?.open.length ?? 0)}…
          </span>
        ) : (
          <>
            <Button onClick={() => setClosing(null)}>Cancel</Button>
            <Button icon={Archive} onClick={() => run('dismissed')}>
              Dismiss all
            </Button>
            <Button variant="primary" icon={CheckCircle2} onClick={() => run('resolved')}>
              Resolve all
            </Button>
          </>
        )
      }
    />
  );
  return { ask: (pattern, open) => setClosing({ pattern, open }), modal };
}

/** One identity's anomalies as repeating patterns (the identity page's tab). */
export function AnomalyPatterns({ items, onOpen, canAct, onChanged }) {
  const patterns = useMemo(() => groupAnomalies(items)[0]?.patterns ?? [], [items]);
  const { ask, modal } = useCloseMany(onChanged);
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
        {patterns.map((pattern) => (
          <PatternRow key={pattern.key} pattern={pattern} onOpen={onOpen} canAct={canAct} onClose={ask} />
        ))}
      </ul>
      {modal}
    </>
  );
}

/** The grouped view of the Anomalies tab. */
export function AnomalyGroups({ items, onOpen, canAct, onChanged, emptyState, onSeverity }) {
  const groups = useMemo(() => groupAnomalies(items), [items]);
  /* null until the reader toggles a row: the first (worst) identity starts open. */
  const [expanded, setExpanded] = useState(null);
  const [shown, setShown] = useState(20);
  const { ask, modal } = useCloseMany(onChanged);

  const firstKey = groups[0]?.key;
  const isOpen = (key) => (expanded ? expanded.has(key) : key === firstKey);
  const toggle = (key) =>
    setExpanded((current) => {
      const next = new Set(current ?? (firstKey ? [firstKey] : []));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (groups.length === 0) return emptyState;
  return (
    <>
      <AnomalyOverview items={items} groups={groups} onSeverity={onSeverity} />
      <ul className="flex flex-col gap-2.5 p-3 sm:p-4">
        {groups.slice(0, shown).map((group) => (
          <IdentityGroup
            key={group.key}
            group={group}
            expanded={isOpen(group.key)}
            onToggle={() => toggle(group.key)}
            onOpen={onOpen}
            canAct={canAct}
            onClose={ask}
          />
        ))}
      </ul>
      {groups.length > shown && (
        <div className="flex justify-center border-t border-line p-3">
          <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + 20)}>
            Show {formatNumber(Math.min(20, groups.length - shown))} more identities
          </Button>
        </div>
      )}
      {modal}
    </>
  );
}
