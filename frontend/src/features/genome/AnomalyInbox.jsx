import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Dna, Repeat2 } from 'lucide-react';
import { severityMeta } from '../../lib/domain';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { genomeRoute } from '../../lib/identityLinks';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { AnomalyOverview, groupAnomalies, useCloseMany } from './AnomalyGroups';
import { dimensionLabel, sourceTypeLabel } from './meta';

const DAY = 86400000;
const SEV_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const TONE_RING = { critical: 'text-critical', high: 'text-high', medium: 'text-medium', low: 'text-low', neutral: 'text-ink-3' };
const TONE_BAR = { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium', low: 'bg-low', neutral: 'bg-ink-3' };

/**
 * Investigation priority, 0-10, the way UEBA consoles rank entities: how bad
 * the worst departure is, how many different ways the identity departed, how
 * much, and how recently. Returned with the reasons that produced it, so the
 * number is never a mystery.
 */
function priorityOf(group) {
  const worst = Math.max(0, ...group.items.map((i) => SEV_WEIGHT[String(i.severity).toUpperCase()] ?? 0));
  const kinds = new Set(group.items.map((i) => i.dimension)).size;
  const recent = Date.now() - group.last < DAY;
  /* Severity carries most of it (max 6); breadth, volume and recency refine the
     order among equally severe identities (max 1.5, 1.5, 1). Only an identity
     that is critical, broad, busy and current reaches 10. */
  const raw = worst * 1.5 + Math.min(1.5, (kinds - 1) * 0.4) + Math.min(1.5, Math.log10(group.items.length + 1) * 0.75) + (recent ? 1 : 0);
  const score = Math.round(Math.min(10, raw) * 10) / 10;
  const reasons = [];
  if (worst) reasons.push(`${severityMeta(Object.keys(SEV_WEIGHT).find((k) => SEV_WEIGHT[k] === worst)).label} departure`);
  if (kinds > 1) reasons.push(`${kinds} kinds of departure`);
  reasons.push(`${formatNumber(group.items.length)} ${group.items.length === 1 ? 'event' : 'events'}`);
  if (recent) reasons.push('active in the last 24 hours');
  const tone = score >= 8 ? 'critical' : score >= 6 ? 'high' : score >= 4 ? 'medium' : 'low';
  return { score, reasons, tone };
}

function PriorityRing({ score, tone, size = 40 }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-label={`Priority ${score} of 10`}>
      <svg width={size} height={size} className={cn('-rotate-90', TONE_RING[tone])}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 10) * c} ${c}`} />
      </svg>
      <span data-numeric="" className={cn('absolute font-display font-bold text-ink', size >= 48 ? 'text-[15px]' : 'text-[12px]')}>
        {score >= 10 ? '10' : score.toFixed(1)}
      </span>
    </span>
  );
}

const dayLabel = (t) => {
  const d = Math.floor((Date.now() - t) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const numbersIn = (text) => (String(text ?? '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/* ── The selected identity ──────────────────────────────────────────────── */

function Investigation({ group, priority, onOpen, canAct, onClose, onBack }) {
  const worst = group.patterns[0];
  const worstSev = severityMeta(worst?.worst === 'UNRATED' ? '' : worst?.worst);
  const kinds = new Set(group.items.map((i) => i.dimension)).size;
  /* Patterns on a timeline, newest first, under day headings. */
  const byDay = useMemo(() => {
    const sorted = [...group.patterns].sort((a, b) => b.last - a.last);
    const out = [];
    for (const p of sorted) {
      const label = dayLabel(p.last);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(p);
    }
    return out;
  }, [group]);
  const latest = group.items.reduce((a, b) => (new Date(b.detected_at) > new Date(a.detected_at) ? b : a));
  const name = group.identity?.display_name || group.identity?.identity_name;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-6 pt-5 pb-5">
        {onBack && (
          <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1.5 text-[12.5px] font-medium text-brand lg:hidden">
            <ArrowLeft className="size-3.5" /> All identities
          </button>
        )}
        <div className="flex items-start gap-4">
          <PriorityRing score={priority.score} tone={priority.tone} size={52} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-semibold text-ink" title={group.identity?.identity_name}>
              {name}
            </h3>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{sourceTypeLabel(group.identity?.source_type, group.identity?.identity_name)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {group.identity?.monitored !== false && (
              <Button as={Link} to={genomeRoute(group.identity?.source_type, group.identity?.identity_name)} size="sm" variant="secondary" icon={Dna}>
                Genome
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => onOpen(latest, worst)}>
              Review latest
            </Button>
          </div>
        </div>
        <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
          Departed from its baseline in{' '}
          <span className="font-semibold text-ink">
            {kinds} {kinds === 1 ? 'way' : 'ways'}
          </span>
          {worst ? (
            <>
              {' '}- most seriously <span className={cn('font-semibold', TONE_RING[worstSev.tone])}>{dimensionLabel(worst.dimension).toLowerCase()}</span>
            </>
          ) : null}
          . Latest <span title={formatDateTime(latest.detected_at)}>{formatRelative(latest.detected_at)}</span>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-ink-3">Ranked by</span>
          {priority.reasons.map((r) => (
            <span key={r} className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-ink-2">
              {r}
            </span>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {byDay.map((day) => (
          <section key={day.label} className="mb-6 last:mb-0">
            <h4 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{day.label}</h4>
            <ol className="relative flex flex-col gap-3 border-l border-line pl-5">
              {day.items.map((p) => {
                const sev = severityMeta(p.worst === 'UNRATED' ? '' : p.worst);
                const open = p.items.filter((i) => String(i.state).toLowerCase() === 'open');
                const nums = p.items.flatMap((i) => numbersIn(i.what_changed));
                const moved = p.items.length > 1 && nums.length ? `${formatNumber(Math.min(...nums))} → ${formatNumber(Math.max(...nums))}` : null;
                const newest = p.items.reduce((a, b) => (new Date(b.detected_at) > new Date(a.detected_at) ? b : a));
                return (
                  <li key={p.key} className="relative">
                    <span aria-hidden="true" className={cn('absolute top-4 -left-[25px] size-[9px] rounded-full ring-4 ring-surface', TONE_BAR[sev.tone] ?? 'bg-ink-3')} />
                    <article className="rounded-[12px] border border-line bg-surface p-4 transition-shadow hover:shadow-[var(--t-shadow-sm)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{dimensionLabel(p.dimension)}</span>
                        {p.worst !== 'UNRATED' && (
                          <Tag size="sm" tone={sev.tone} dot>
                            {sev.label}
                          </Tag>
                        )}
                        {p.items.length > 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                            <Repeat2 className="size-3" /> ×{formatNumber(p.items.length)}
                          </span>
                        )}
                        <span className="ml-auto text-[11.5px] text-ink-3" title={formatDateTime(newest.detected_at)}>
                          {new Date(p.last).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{p.text}</p>
                      {p.items.length > 1 && (
                        <p className="mt-1 text-[12px] text-ink-3">
                          Repeated since {formatRelative(new Date(p.first).toISOString())}
                          {moved ? ` · the measure moved ${moved}` : ''}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onOpen(newest, p)}>
                          {p.items.length > 1 ? 'Review latest' : 'Review'}
                        </Button>
                        {p.items.length > 1 && open.length > 0 && canAct && (
                          <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => onClose(p, open)}>
                            Close {formatNumber(open.length)}
                          </Button>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ── The inbox ──────────────────────────────────────────────────────────── */

/**
 * Anomalies as an investigation inbox: identities ranked by priority on the
 * left (j / k to move), the selected one's story on the right.
 */
export function AnomalyInbox({ items, onOpen, canAct, onChanged, emptyState, onSeverity, activeSeverities }) {
  const groups = useMemo(() => groupAnomalies(items), [items]);
  const ranked = useMemo(
    () =>
      groups
        .map((g) => ({ group: g, priority: priorityOf(g) }))
        .sort((a, b) => b.priority.score - a.priority.score || b.group.last - a.group.last),
    [groups],
  );
  const [selectedKey, setSelectedKey] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const { ask, modal } = useCloseMany(onChanged);
  const listRef = useRef(null);
  const current = ranked.find((r) => r.group.key === selectedKey) ?? ranked[0];

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [current?.group.key]);

  if (ranked.length === 0) return emptyState;

  const onKey = (e) => {
    const i = ranked.findIndex((r) => r.group.key === current.group.key);
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedKey(ranked[Math.min(ranked.length - 1, i + 1)].group.key);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedKey(ranked[Math.max(0, i - 1)].group.key);
    }
  };

  return (
    <>
      <AnomalyOverview items={items} onSeverity={onSeverity} activeSeverities={activeSeverities} />
      <div className="flex h-[min(78vh,880px)] min-h-[560px]">
        <div
          ref={listRef}
          role="listbox"
          aria-label="Identities with anomalies, highest priority first"
          tabIndex={0}
          onKeyDown={onKey}
          className={cn('min-h-0 w-full shrink-0 overflow-y-auto border-r border-line outline-none lg:block lg:w-[360px]', mobileDetail ? 'hidden' : 'block')}
        >
          <p className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 py-2.5 text-[11px] text-ink-3 backdrop-blur">
            {formatNumber(ranked.length)} {ranked.length === 1 ? 'identity' : 'identities'} · highest priority first ·{' '}
            <kbd className="rounded border border-line px-1 font-mono text-[10px]">j</kbd>{' '}
            <kbd className="rounded border border-line px-1 font-mono text-[10px]">k</kbd>
          </p>
          {ranked.map(({ group, priority }) => {
            const selected = group.key === current.group.key;
            const top = group.patterns[0];
            return (
              <button
                key={group.key}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setSelectedKey(group.key);
                  setMobileDetail(true);
                }}
                className={cn(
                  'relative flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition-colors',
                  selected ? 'bg-info-soft/60' : 'hover:bg-surface-2/70',
                )}
              >
                {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
                <PriorityRing score={priority.score} tone={priority.tone} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{group.identity?.display_name || group.identity?.identity_name}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{formatRelative(new Date(group.last).toISOString())}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-2">
                    {top ? dimensionLabel(top.dimension) : ''}
                    {top && top.items.length > 1 ? ` ×${formatNumber(top.items.length)}` : ''}
                    {group.patterns.length > 1 ? <span className="text-ink-3"> · +{group.patterns.length - 1} more</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', mobileDetail ? 'flex' : 'hidden')}>
          <Investigation
            key={current.group.key}
            group={current.group}
            priority={current.priority}
            onOpen={onOpen}
            canAct={canAct}
            onClose={ask}
            onBack={() => setMobileDetail(false)}
          />
        </div>
      </div>
      {modal}
    </>
  );
}
