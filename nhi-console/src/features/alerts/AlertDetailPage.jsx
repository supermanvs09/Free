import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCode2,
  Fingerprint,
  GitCommitVertical,
  KeyRound,
  Network,
  Radius,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag as TagIcon,
  UserRound,
  Wrench,
} from 'lucide-react';
import { fetchIdentityAlert } from '../../lib/api/alerts';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { bandFor } from '../../lib/posture';
import { severityMeta } from '../../lib/domain';
import { Button } from '../../ui/Button';
import { CopyableValue } from '../../ui/Copyable';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { dropSeverity } from './parts';

/*
 * Score drop: one identity, this sync against the sync before its score
 * started to fall. Everything on the page comes from one server answer
 * (`/api/v1/alerts/identities/:id`), which the Alerts list reads too, so the
 * "from" and "to", the points per check and the chart always agree.
 */

const SEV_BAR = { CRITICAL: 'bg-critical', HIGH: 'bg-high', MEDIUM: 'bg-medium', LOW: 'bg-low' };
const SEV_TEXT = { CRITICAL: 'text-critical', HIGH: 'text-high', MEDIUM: 'text-medium', LOW: 'text-low' };
const BAND_TEXT = { low: 'text-low', medium: 'text-medium', high: 'text-high', critical: 'text-critical' };
const CHANGE_ICON = { permission: KeyRound, credential: KeyRound, trust_edge: Network, identity: TagIcon, binding: Network };
const TRIGGER = {
  change: { icon: GitCommitVertical, label: 'Changed in AWS' },
  time: { icon: CalendarClock, label: 'Threshold passed' },
  scan: { icon: FileCode2, label: 'Found by code scanning' },
  activity: { icon: Activity, label: 'Seen in activity' },
};

/* Who made a change, from the CloudTrail caller: the role behind an assumed-role session, or the user. */
const callerOf = (arn) => {
  const text = String(arn ?? '');
  return text.includes('assumed-role/') ? text.split('assumed-role/')[1].split('/')[0] : text.split('/').pop();
};
const shortDate = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ── Score across syncs ─────────────────────────────────────────────────── */

function SyncChart({ series, fromId, toId }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 190;
  const PAD = { l: 30, r: 12, t: 14, b: 24 };
  const n = series.length;
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (s) => PAD.t + (1 - Math.max(0, Math.min(100, s)) / 100) * (H - PAD.t - PAD.b);
  const step = series.map((p, i) => `${i ? `L${x(i)},${y(series[i - 1].score)} ` : 'M'}${i ? '' : `${x(0)},`}${i ? `L${x(i)},${y(p.score)}` : `${y(p.score)}`}`).join(' ');
  const fromIdx = series.findIndex((p) => p.scan_id === fromId);
  const toIdx = series.findIndex((p) => p.scan_id === toId);
  const focus = hover ?? toIdx;
  const zones = [
    { from: 100, to: 80, cls: 'fill-low/[0.06]' },
    { from: 80, to: 60, cls: 'fill-medium/[0.06]' },
    { from: 60, to: 40, cls: 'fill-high/[0.07]' },
    { from: 40, to: 0, cls: 'fill-critical/[0.07]' },
  ];
  const ticks = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Score at every sync · last 10 days</p>
        <p className="text-[12px] text-ink-3" data-numeric="">
          {shortDate(series[focus].at)} · <span className={cn('font-semibold', BAND_TEXT[bandFor(series[focus].score).tone])}>{series[focus].score}</span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[190px] w-full"
        role="img"
        aria-label={`Score at each sync, from ${series[fromIdx]?.score} at the previous sync to ${series[toIdx]?.score} now`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))));
        }}
      >
        {zones.map((z) => (
          <rect key={z.from} x={PAD.l} width={W - PAD.l - PAD.r} y={y(z.from)} height={y(z.to) - y(z.from)} className={z.cls} />
        ))}
        {[80, 60, 40].map((s) => (
          <g key={s}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(s)} y2={y(s)} stroke="var(--color-line)" strokeDasharray="3 5" />
            <text x={PAD.l - 6} y={y(s) + 3.5} textAnchor="end" className="fill-ink-3 text-[9.5px]">
              {s}
            </text>
          </g>
        ))}
        {fromIdx >= 0 && toIdx >= 0 && (
          <rect x={x(fromIdx)} width={x(toIdx) - x(fromIdx)} y={PAD.t} height={H - PAD.t - PAD.b} className="fill-brand/[0.05]" />
        )}
        <path d={step} fill="none" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinejoin="round" />
        {series.map((p, i) => (
          <circle key={p.scan_id} cx={x(i)} cy={y(p.score)} r={i === focus ? 4 : 1.6} className={i === focus ? 'fill-brand' : 'fill-ink-3/50'} />
        ))}
        {[
          [fromIdx, 'Previous sync'],
          [toIdx, 'This sync'],
        ].map(([i, label]) =>
          i >= 0 ? (
            <g key={label}>
              <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-brand)" strokeOpacity="0.45" strokeDasharray="2 3" />
              <circle cx={x(i)} cy={y(series[i].score)} r="5" className="fill-surface" stroke="var(--color-brand)" strokeWidth="2" />
              <text x={i === toIdx ? x(i) - 6 : x(i) + 6} y={PAD.t + 10} textAnchor={i === toIdx ? 'end' : 'start'} className="fill-brand text-[10px] font-semibold">
                {label} · {series[i].score}
              </text>
            </g>
          ) : null,
        )}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-ink-3 text-[9.5px]">
            {new Date(series[i].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Kpi({ label, value, hint, tone, icon: Icon }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        {Icon && <Icon aria-hidden="true" className="size-3.5" />}
        {label}
      </p>
      <p data-numeric="" className={cn('mt-1 text-[22px] leading-none font-semibold tracking-[-0.02em]', tone ?? 'text-ink')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

function Card({ title, lede, right, children, className }) {
  return (
    <section className={cn('rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {lede && <p className="mt-0.5 text-[12px] text-ink-3">{lede}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function DiffValue({ value }) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-3 italic">none</span>;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return <span>{shortDate(value)}</span>;
  return <span className="font-mono">{String(value)}</span>;
}

function CheckCard({ c, index, identityId, changeById }) {
  const [open, setOpen] = useState(index < 2);
  const sev = severityMeta(c.severity);
  const trig = TRIGGER[c.trigger] ?? TRIGGER.change;
  const change = c.change_id ? changeById.get(c.change_id) : null;
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-surface-2/50">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2" data-numeric="">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{c.title}</span>
            <Tag tone={sev.tone} size="sm" dot>
              {sev.label}
            </Tag>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">{c.pillar_name}</span>
          </span>
          <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{c.detail}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <trig.icon aria-hidden="true" className="size-3.5" /> {trig.label}
            </span>
            <span className="inline-flex items-center gap-1" title={formatDateTime(c.flagged_by.completed_at)}>
              <Clock3 aria-hidden="true" className="size-3.5" /> Flagged by the sync on {shortDate(c.flagged_by.completed_at)}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span data-numeric="" className={cn('block text-[20px] leading-none font-semibold', SEV_TEXT[c.severity] ?? 'text-critical')}>
            −{c.points}
          </span>
          <span className="mt-1 block text-[11px] text-ink-3">{c.share_pct}% of the drop</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn('mt-1 size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-3 px-5 pb-5 pl-14 lg:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-surface-2/50 px-3.5 py-3">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">How it started</p>
            {change ? (
              <>
                <p className="mt-1 text-[12.5px] font-medium text-ink">{change.summary}</p>
                {Object.entries(change.details ?? {}).map(([field, v]) => (
                  <p key={field} className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                    <span className="text-ink-3">{field}</span>
                    <span className="rounded bg-critical-soft/60 px-1.5 line-through decoration-critical/60">
                      <DiffValue value={v?.before} />
                    </span>
                    <ArrowRight aria-hidden="true" className="size-3 text-ink-3" />
                    <span className="rounded bg-low-soft/70 px-1.5">
                      <DiffValue value={v?.after} />
                    </span>
                  </p>
                ))}
                {change.cloudtrail && (
                  <p className="mt-1.5 text-[11.5px] text-ink-3">
                    <span className="font-mono">{change.cloudtrail.event_name}</span> by{' '}
                    <span className="font-mono">{callerOf(change.cloudtrail.caller_arn)}</span> from{' '}
                    <span className="font-mono">{change.cloudtrail.source_ip}</span> · {formatRelative(change.cloudtrail.event_time)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[12.5px] text-ink-2">{c.trigger_text ?? 'Detected by the posture evaluation at this sync.'}</p>
            )}
          </div>
          <div className="rounded-[10px] border border-line px-3.5 py-3">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Why it matters · how to fix</p>
            {c.why && <p className="mt-1 text-[12.5px] text-ink-2">{c.why}</p>}
            {c.fix && (
              <p className="mt-1.5 flex gap-1.5 text-[12.5px] text-ink">
                <Wrench aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand" /> {c.fix}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button as={Link} to={`/remediation/findings/${encodeURIComponent(c.finding_id)}`} size="sm" variant="primary" icon={Wrench}>
                Fix this
              </Button>
              <Button as={Link} to={`/posture/${encodeURIComponent(identityId)}`} size="sm" variant="ghost">
                Posture record
              </Button>
              {c.compliance?.length > 0 && <span className="text-[11px] text-ink-3">{c.compliance.slice(0, 2).join(' · ')}</span>}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

export function AlertDetailPage() {
  const { id } = useParams();
  const query = useQuery((signal) => fetchIdentityAlert(id, signal), [id]);
  const d = query.data;
  const [showOld, setShowOld] = useState(false);
  const changeById = useMemo(() => new Map((d?.inventory_changes ?? []).map((c) => [c.change_id, c])), [d]);

  const back = (
    <Button as={Link} to="/alerts" variant="secondary" size="sm" icon={ArrowLeft}>
      Alerts
    </Button>
  );

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorState error={query.error} onRetry={query.refetch} title={query.error?.status === 404 ? 'That identity is not in the accounts and regions you selected' : undefined} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <DetailSkeleton rows={8} />
      </div>
    );
  }

  const delta = d.score_now - d.score_before;
  const lost = -delta;
  const drop = dropSeverity(delta, d.band_before, d.band_now);
  const bandBefore = bandFor(d.score_before);
  const bandNow = bandFor(d.score_now);
  const top = d.new_failing_checks[0];
  const changeDriven = d.new_failing_checks.filter((c) => c.trigger === 'change').length;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero: who, how far, between which syncs. */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={drop.tone} size="sm" dot>
                {drop.label}
              </Tag>
              <Tag tone={bandBefore.tone} size="sm">
                {bandBefore.label}
              </Tag>
              <ArrowRight aria-hidden="true" className="size-3.5 text-ink-3" />
              <Tag tone={bandNow.tone} size="sm">
                {bandNow.label}
              </Tag>
            </div>
            <h1 className="mt-3 flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.015em] text-ink">
              <ProviderIcon provider={d.provider} size={20} />
              <span className="truncate font-mono">{d.identity_name}</span>
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {identityTypeLabel(d.identity_type)} · {d.account_name} ({d.account_id}) · {d.region}
              {d.environment ? ` · ${d.environment}` : ''}
            </p>

            <div className="mt-5 flex items-end gap-4">
              <div>
                <p className="text-[11px] text-ink-3">Previous sync</p>
                <p data-numeric="" className={cn('text-[34px] leading-none font-semibold tracking-[-0.03em]', BAND_TEXT[bandBefore.tone])}>
                  {d.score_before}
                </p>
              </div>
              <ArrowRight aria-hidden="true" className="mb-2 size-5 text-ink-3" />
              <div>
                <p className="text-[11px] text-ink-3">This sync</p>
                <p data-numeric="" className={cn('text-[48px] leading-none font-semibold tracking-[-0.03em]', BAND_TEXT[bandNow.tone])}>
                  {d.score_now}
                </p>
              </div>
              <span data-numeric="" className="mb-1.5 rounded-full bg-critical-soft px-2.5 py-1 text-[13px] font-semibold text-critical">
                −{lost} points
              </span>
            </div>
            <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-ink-2">
              {d.new_failing_checks.length === 0
                ? 'No new failing checks between these syncs.'
                : `${d.new_failing_checks.length} new ${d.new_failing_checks.length === 1 ? 'problem' : 'problems'} since the previous sync${top ? `; the biggest, ${top.title.toLowerCase()}, cost ${top.points} points` : ''}. ${changeDriven ? `${changeDriven} came from ${changeDriven === 1 ? 'a change' : 'changes'} made in AWS.` : 'None came from a change made in AWS.'}`}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-2/70 px-3 py-2 text-[12px] text-ink-2">
              <CalendarClock aria-hidden="true" className="size-3.5 text-ink-3" />
              <span title={formatDateTime(d.previous_sync.completed_at)}>{shortDate(d.previous_sync.completed_at)}</span>
              <span className="h-px w-6 bg-ink-3/50" aria-hidden="true" />
              <span className="text-ink-3">{d.syncs_between} syncs between</span>
              <span className="h-px w-6 bg-ink-3/50" aria-hidden="true" />
              <span title={formatDateTime(d.this_sync.completed_at)}>{shortDate(d.this_sync.completed_at)}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {top && (
                <Button as={Link} to={`/remediation/findings/${encodeURIComponent(top.finding_id)}`} variant="primary" size="sm" icon={Wrench}>
                  Fix the biggest problem
                </Button>
              )}
              <Button as={Link} to={`/identities/${encodeURIComponent(d.discovery_id)}`} variant="secondary" size="sm" icon={Fingerprint}>
                Open identity
              </Button>
              <Button as={Link} to={`/access-graph?focus=${encodeURIComponent(d.discovery_id)}`} variant="ghost" size="sm" icon={Network}>
                Access graph
              </Button>
            </div>
          </div>
          <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">
            <SyncChart series={d.series} fromId={d.previous_sync.scan_id} toId={d.this_sync.scan_id} />
          </div>
        </div>
      </section>

      {/* KPIs, all from the same answer. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={ShieldAlert} label="New failing checks" value={formatNumber(d.new_failing_checks.length)} hint={`worth ${d.points_new} points`} tone={d.new_failing_checks.length ? 'text-critical' : undefined} />
        <Kpi icon={Clock3} label="Still failing from before" value={formatNumber(d.still_failing_checks.length)} hint={`${d.checks_failed} of ${d.checks_evaluated} checks failing now`} />
        <Kpi icon={CheckCircle2} label="No longer counted" value={formatNumber(d.no_longer_counted.length)} hint="Accepted or suppressed since" tone={d.no_longer_counted.length ? 'text-low' : undefined} />
        <Kpi icon={GitCommitVertical} label="Changed in AWS" value={formatNumber(d.inventory_changes.length)} hint="Between these syncs" />
        <Kpi
          icon={Radius}
          label="Blast radius now"
          value={d.blast ? d.blast.score.toFixed(1) : '-'}
          hint={d.blast ? `${formatNumber(d.blast.resources)} resources · ${formatNumber(d.blast.sensitive)} sensitive` : undefined}
          tone={d.blast && d.blast.score >= 8 ? 'text-critical' : d.blast && d.blast.score >= 6.5 ? 'text-high' : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={`What cost the ${lost} points`}
            lede={
              d.points_new > lost
                ? `These checks are worth ${d.points_new} points together; the score cannot go below 4, so it fell by ${lost}. Biggest first, with how each started and the fix.`
                : 'Each check that started failing between the two syncs, biggest first: how it started, why it matters, and the fix.'
            }
          >
            {d.new_failing_checks.length > 0 ? (
              <>
                <div className="px-5 pt-4">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Share of the drop per check">
                    {d.new_failing_checks.map((c) => (
                      <span key={c.rule_id} className={cn('h-full border-r-2 border-surface last:border-r-0', SEV_BAR[c.severity] ?? 'bg-critical')} style={{ width: `${c.share_pct}%` }} title={`${c.title}: −${c.points}`} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
                    {d.new_failing_checks.map((c, i) => (
                      <span key={c.rule_id} data-numeric="">
                        {String(i + 1).padStart(2, '0')} · {c.share_pct}%
                      </span>
                    ))}
                  </div>
                </div>
                <ol className="mt-2">
                  {d.new_failing_checks.map((c, i) => (
                    <CheckCard key={c.rule_id} c={c} index={i} identityId={d.identity_id} changeById={changeById} />
                  ))}
                </ol>
              </>
            ) : (
              <div className="p-5">
                <EmptyState compact icon={ShieldCheck} title="No new failing checks" description="The score did not fall between these syncs." />
              </div>
            )}
          </Card>

          <Card title="Changed in AWS between these syncs" lede={`Everything about ${d.identity_name} and the credentials it uses that a sync recorded as different, newest first.`}>
            {d.inventory_changes.length ? (
              <ol className="relative px-5 py-4">
                <span aria-hidden="true" className="absolute top-6 bottom-6 left-[31px] w-px bg-line" />
                {d.inventory_changes.map((c) => {
                  const Icon = CHANGE_ICON[c.entity_type] ?? GitCommitVertical;
                  const linked = d.new_failing_checks.find((x) => x.change_id === c.change_id);
                  return (
                    <li key={c.change_id} className="relative flex gap-3 py-2.5">
                      <span className={cn('relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border bg-surface', linked ? 'border-critical/40 text-critical' : 'border-line text-ink-3')}>
                        <Icon aria-hidden="true" className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
                          {c.summary}
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3 uppercase">{c.change_type.toLowerCase()}</span>
                          {linked && (
                            <Tag tone="critical" size="sm">
                              −{linked.points} · {linked.title}
                            </Tag>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-ink-3">
                          {c.entity_name} · {shortDate(c.detected_at)}
                          {c.cloudtrail ? (
                            <>
                              {' '}· <span className="font-mono">{c.cloudtrail.event_name}</span> by <span className="font-mono">{callerOf(c.cloudtrail.caller_arn)}</span> from{' '}
                              <span className="font-mono">{c.cloudtrail.source_ip}</span>
                            </>
                          ) : null}
                        </p>
                        {Object.entries(c.details ?? {}).map(([field, v]) => (
                          <p key={field} className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-2">
                            <span className="text-ink-3">{field}</span>
                            <span className="rounded bg-critical-soft/50 px-1.5">
                              <DiffValue value={v?.before} />
                            </span>
                            <ArrowRight aria-hidden="true" className="size-3 text-ink-3" />
                            <span className="rounded bg-low-soft/60 px-1.5">
                              <DiffValue value={v?.after} />
                            </span>
                          </p>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="flex items-start gap-3 px-5 py-4">
                <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <p className="text-[12.5px] text-ink-2">
                  Nothing about this identity or its credentials changed in AWS between these syncs. The drop comes from checks that crossed a threshold with time
                  {d.new_failing_checks.some((c) => c.trigger === 'scan') ? ' or from code scanning' : ''}: see <b>How it started</b> on each check above.
                </p>
              </div>
            )}
          </Card>

          {d.still_failing_checks.length > 0 && (
            <Card
              title="Still failing from before"
              lede="Already counted at the previous sync, so not part of this drop - but still costing points."
              right={
                <Button variant="ghost" size="sm" onClick={() => setShowOld((v) => !v)}>
                  {showOld ? 'Hide' : `Show ${d.still_failing_checks.length}`}
                </Button>
              }
            >
              {showOld && (
                <ul className="divide-y divide-line">
                  {d.still_failing_checks.map((c) => (
                    <li key={c.rule_id} className="flex items-center gap-3 px-5 py-3">
                      <span className={cn('size-2 shrink-0 rounded-full', SEV_BAR[c.severity])} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-ink">{c.title}</span>
                        <span className="block truncate text-[11.5px] text-ink-3">
                          {c.pillar_name} · failing since {shortDate(c.failing_since)}
                        </span>
                      </span>
                      <span data-numeric="" className="text-[13px] font-semibold text-ink-2">
                        −{c.points}
                      </span>
                      <Link to={`/remediation/findings/${encodeURIComponent(c.finding_id)}`} className="text-[12px] font-medium text-brand hover:underline">
                        Fix
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card title="Score by area" lede="Points lost per area, previous sync → this sync.">
            <ul className="flex flex-col gap-3 px-5 py-4">
              {d.pillars.map((p) => {
                const max = Math.max(40, ...d.pillars.map((x) => x.points_lost_now));
                return (
                  <li key={p.pillar}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className={cn(p.new_points ? 'font-medium text-ink' : 'text-ink-2')}>{p.name}</span>
                      <span data-numeric="" className="text-[12px] text-ink-3">
                        −{p.points_lost_before} → <span className={cn('font-semibold', p.new_points ? 'text-critical' : 'text-ink-2')}>−{p.points_lost_now}</span>
                      </span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className="h-full bg-ink-3/45" style={{ width: `${(p.points_lost_before / max) * 100}%` }} />
                      <span className="h-full bg-critical" style={{ width: `${(p.new_points / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-ink-3/45" /> before
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-critical" /> new at this sync
              </span>
            </p>
          </Card>

          <Card title="Identity">
            <dl className="flex flex-col gap-2.5 px-5 py-4 text-[12.5px]">
              <div>
                <dt className="text-[11px] text-ink-3">ARN</dt>
                <dd className="mt-0.5 min-w-0">
                  <CopyableValue value={d.identity_arn} mono />
                </dd>
              </div>
              {d.owner && (
                <div className="flex items-start gap-2">
                  <UserRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                  <dd className="min-w-0">
                    <span className="block text-ink">{d.owner.name ?? d.owner.email}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {d.owner.team ? `${d.owner.team} · ` : ''}
                      {d.owner.email}
                    </span>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Account</dt>
                <dd className="text-right text-ink">
                  {d.account_name} <span className="font-mono text-[11.5px] text-ink-3">{d.account_id}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Region</dt>
                <dd className="font-mono text-ink">{d.region}</dd>
              </div>
            </dl>
            <nav className="flex flex-col border-t border-line">
              {[
                [`/identities/${encodeURIComponent(d.discovery_id)}`, Fingerprint, 'Open identity'],
                [`/identities/${encodeURIComponent(d.discovery_id)}?tab=blast`, Radius, 'Blast radius'],
                [`/access-graph?focus=${encodeURIComponent(d.discovery_id)}`, Network, 'Access graph'],
                [`/posture/${encodeURIComponent(d.identity_id)}`, ShieldCheck, 'Posture record'],
              ].map(([to, Icon, label]) => (
                <Link key={label} to={to} className="flex items-center gap-2.5 border-b border-line px-5 py-2.5 text-[12.5px] text-ink-2 last:border-b-0 hover:bg-surface-2/60 hover:text-ink">
                  <Icon aria-hidden="true" className="size-3.5 text-ink-3" />
                  <span className="flex-1">{label}</span>
                  <ArrowRight aria-hidden="true" className="size-3.5 text-ink-3" />
                </Link>
              ))}
            </nav>
          </Card>

          {d.no_longer_counted.length > 0 && (
            <Card title="No longer counted" lede="Accepted or suppressed since the previous sync.">
              <ul className="divide-y divide-line">
                {d.no_longer_counted.map((c) => (
                  <li key={c.rule_id} className="px-5 py-2.5 text-[12.5px]">
                    <span className="block text-ink">{c.title}</span>
                    <span className="block text-[11.5px] text-ink-3">
                      {c.status.toLowerCase()}
                      {c.by ? ` by ${c.by}` : ''} · {formatRelative(c.at)} · +{c.points} back
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

export default AlertDetailPage;
