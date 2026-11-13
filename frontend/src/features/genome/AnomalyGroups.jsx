import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, Layers, Repeat2 } from 'lucide-react';
import { setAnomalyDisposition } from '../../lib/api/genome';
import { severityMeta } from '../../lib/domain';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { TONE_BG, cn } from '../../ui/cn';
import { dimensionLabel } from './meta';

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
export function Spark({ items, className }) {
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
          className={cn('w-[4px] rounded-full', bar.count ? 'bg-ink-3/60' : 'bg-line')}
          style={{ height: bar.h }}
        />
      ))}
    </span>
  );
}

function rangeText(pattern) {
  if (pattern.min === null || pattern.min === pattern.max) return null;
  return `${formatNumber(pattern.min)} → ${formatNumber(pattern.max)}`;
}

const TIMELINE_DAYS = 30;
const CHART_W = 600;
const CHART_H = 132;

/* A smooth line through the points (Catmull-Rom as cubic Béziers), clamped so
   a curve between two days never dips below zero. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i - 1] ?? points[i];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[i + 1];
    const c1y = Math.min(CHART_H, y1 + (y2 - y0) / 6);
    const c2y = Math.min(CHART_H, y2 - (y3 - y1) / 6);
    d += ` C${x1 + (x2 - x0) / 6},${c1y} ${x2 - (x3 - x1) / 6},${c2y} ${x2},${y2}`;
  }
  return d;
}

const dayLabel = (index) =>
  new Date((Math.floor(Date.now() / DAY_MS) - (TIMELINE_DAYS - 1 - index)) * DAY_MS).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Thirty days of detections as one calm line; critical days carry a red mark. */
function Trend({ days, hover, setHover }) {
  const totals = days.map((d) => Object.values(d).reduce((a, b) => a + b, 0));
  const peak = Math.max(1, ...totals);
  const step = CHART_W / (TIMELINE_DAYS - 1);
  const pts = totals.map((n, i) => [i * step, CHART_H - 6 - (n / peak) * (CHART_H - 22)]);
  const line = smoothPath(pts);
  const peakIndex = totals.indexOf(Math.max(...totals));
  const focus = hover ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        className="block h-[132px] w-full overflow-visible"
        role="img"
        aria-label={`Anomalies detected per day over the last ${TIMELINE_DAYS} days. Peak ${formatNumber(totals[peakIndex])} on ${dayLabel(peakIndex)}.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="anomaly-trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={CHART_W} y1={CHART_H * f} y2={CHART_H * f} stroke="var(--color-line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`} fill="url(#anomaly-trend-fill)" />
        <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {focus !== null && (
          <line x1={pts[focus][0]} x2={pts[focus][0]} y1="0" y2={CHART_H} stroke="var(--color-ink-3)" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
        )}
        {days.map((_, i) => (
          <rect
            key={i}
            x={i * step - step / 2}
            y="0"
            width={step}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {/* Dots sit in HTML so they stay round while the SVG stretches. */}
      {days.map((day, i) =>
        day.CRITICAL || focus === i ? (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface',
              day.CRITICAL ? 'bg-critical' : 'bg-brand',
            )}
            style={{ left: `${(pts[i][0] / CHART_W) * 100}%`, top: `${(pts[i][1] / CHART_H) * 100}%` }}
          />
        ) : null,
      )}
      <div className="mt-2 flex justify-between text-[10.5px] tracking-wide text-ink-3 uppercase">
        <span>{dayLabel(0)}</span>
        <span>{dayLabel(Math.floor(TIMELINE_DAYS / 2))}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/**
 * The first read of the tab: how much is waiting, how much of it is serious,
 * whether it is rising, and where it concentrates. One number, one sentence,
 * one line - colour only where severity is the point.
 */
export function AnomalyOverview({ items, groups, onSeverity, activeSeverities = [] }) {
  const [hover, setHover] = useState(null);
  const stats = useMemo(() => {
    const now = Date.now();
    const today = Math.floor(now / DAY_MS);
    const days = Array.from({ length: TIMELINE_DAYS }, () => ({}));
    const dims = new Map();
    const sev = {};
    let fresh = 0;
    let prior = 0;
    for (const item of items) {
      const at = new Date(item.detected_at).getTime() || 0;
      const s = sevKey(item);
      sev[s] = (sev[s] ?? 0) + 1;
      if (now - at < DAY_MS) fresh += 1;
      else if (now - at < 2 * DAY_MS) prior += 1;
      const index = TIMELINE_DAYS - 1 - (today - Math.floor(at / DAY_MS));
      if (index >= 0 && index < TIMELINE_DAYS) days[index][s] = (days[index][s] ?? 0) + 1;
      dims.set(item.dimension, (dims.get(item.dimension) ?? 0) + 1);
    }
    const top = [...dims.entries()].sort((a, b) => b[1] - a[1])[0];
    const totals = days.map((d) => Object.values(d).reduce((a, b) => a + b, 0));
    const peak = Math.max(0, ...totals);
    return { days, sev, fresh, prior, top, totals, peak, peakIndex: totals.lastIndexOf(peak) };
  }, [items]);

  const total = items.length;
  const severe = (stats.sev.CRITICAL ?? 0) + (stats.sev.HIGH ?? 0);
  const worst = groups[0];
  const trend =
    stats.fresh === stats.prior
      ? 'as many as the day before'
      : stats.fresh > stats.prior
        ? `up from ${formatNumber(stats.prior)} the day before`
        : `down from ${formatNumber(stats.prior)} the day before`;
  const facts = [
    worst && {
      label: 'Most affected',
      value: worst.identity?.display_name || worst.identity?.identity_name,
      detail: `${formatNumber(worst.items.length)} of ${formatNumber(total)}`,
    },
    stats.top && { label: 'Most common departure', value: dimensionLabel(stats.top[0]), detail: `${Math.round((stats.top[1] / total) * 100)}% of all` },
    { label: 'Identities affected', value: formatNumber(groups.length), detail: `${formatNumber(groups.reduce((n, g) => n + g.patterns.filter((p) => p.items.length > 1).length, 0))} repeating patterns` },
  ].filter(Boolean);

  return (
    <section aria-label="Anomaly summary" className="border-b border-line">
      <div className="grid gap-x-10 gap-y-6 px-5 pt-6 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">Waiting for review</p>
          <p className="mt-2 flex items-baseline gap-2.5">
            <span data-numeric="" className="font-display text-[48px] leading-none font-bold tracking-tight text-ink">
              {formatNumber(total)}
            </span>
            <span className="text-[14px] text-ink-2">{total === 1 ? 'anomaly' : 'anomalies'}</span>
          </p>
          <p className="mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-ink-2">
            {severe > 0 ? (
              <>
                <span className="font-semibold text-critical" data-numeric="">
                  {formatNumber(severe)} critical or high
                </span>{' '}
                - start there.{' '}
              </>
            ) : (
              'Nothing critical or high. '
            )}
            <span data-numeric="">{formatNumber(stats.fresh)}</span> new in the last 24 hours, {trend}.
          </p>

          <div className="mt-auto pt-5">
            <span className="flex h-[6px] w-full gap-[3px]" aria-hidden="true">
              {SEVERITY_ORDER.map((s) =>
                stats.sev[s] ? (
                  <span
                    key={s}
                    className={cn('h-full rounded-full', s === 'UNRATED' ? 'bg-neutral' : TONE_BG[severityMeta(s).tone], 'opacity-90')}
                    style={{ flexGrow: stats.sev[s], flexBasis: 0 }}
                  />
                ) : null,
              )}
            </span>
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              {SEVERITY_ORDER.filter((s) => s !== 'UNRATED' && stats.sev[s]).map((s) => {
                const active = activeSeverities.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSeverity?.(active ? [] : [s])}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11.5px] transition-colors',
                      active ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', TONE_BG[severityMeta(s).tone])} />
                    {severityMeta(s).label}
                    <span data-numeric="" className={cn('font-semibold', active ? 'text-surface' : 'text-ink')}>
                      {formatNumber(stats.sev[s])}
                    </span>
                  </button>
                );
              })}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex min-h-[18px] items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">Detected · last {TIMELINE_DAYS} days</p>
            <span aria-live="polite" className="flex items-center gap-1.5 text-[11.5px] text-ink-3" data-numeric="">
              {hover !== null ? (
                <>
                  <span className="font-medium text-ink-2">{dayLabel(hover)}</span>·
                  <span className="font-semibold text-ink">{formatNumber(stats.totals[hover])}</span>
                  {stats.totals[hover] === 1 ? 'anomaly' : 'anomalies'}
                  {stats.days[hover].CRITICAL ? <span className="font-medium text-critical">· {formatNumber(stats.days[hover].CRITICAL)} critical</span> : null}
                </>
              ) : (
                <>
                  Peak <span className="font-semibold text-ink">{formatNumber(stats.peak)}</span> on {dayLabel(stats.peakIndex)}
                  <span className="ml-2 size-[6px] rounded-full bg-critical" /> critical day
                </>
              )}
            </span>
          </div>
          <Trend days={stats.days} hover={hover} setHover={setHover} />
        </div>
      </div>
      <dl className="grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 px-5 py-3.5 sm:px-6">
            <dt className="text-[11px] text-ink-3">{fact.label}</dt>
            <dd className="mt-0.5 flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink" title={fact.value}>
                {fact.value}
              </span>
              <span data-numeric="" className="shrink-0 text-[11.5px] text-ink-3">
                {fact.detail}
              </span>
            </dd>
          </div>
        ))}
      </dl>
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

/* Asking to close every open repeat of a pattern: the confirmation, the
   progress while it runs, and the result. Shared by both anomaly lists. */
export function useCloseMany(onChanged) {
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
