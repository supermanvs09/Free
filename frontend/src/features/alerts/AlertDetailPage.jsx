import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Fingerprint, GitCommitVertical, ShieldCheck, Wrench } from 'lucide-react';
import { fetchIdentityAlert } from '../../lib/api/alerts';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { bandFor } from '../../lib/posture';
import { severityMeta } from '../../lib/domain';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { CopyableValue } from '../../ui/Copyable';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { ScoreShift, actorOf, dropSeverity, shortRef } from './parts';

const TONE_BG = { low: 'bg-low', medium: 'bg-medium', high: 'bg-high', critical: 'bg-critical' };

/* ── Score trend: the drop as the last segment of the line ──────────────── */

function Trend({ points, beforeAt }) {
  const [hover, setHover] = useState(null);
  if (points.length < 2) return null;
  const W = 520;
  const H = 150;
  const xs = points.map((p) => Date.parse(p.at));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const x = (t) => ((t - x0) / Math.max(1, x1 - x0)) * W;
  const y = (s) => H - 8 - (Math.max(0, Math.min(100, s)) / 100) * (H - 16);
  const pts = points.map((p, i) => [x(xs[i]), y(p.score)]);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const cut = beforeAt ? points.findIndex((p) => Date.parse(p.at) > Date.parse(beforeAt)) : points.length - 1;
  const dropFrom = cut > 0 ? cut - 1 : points.length - 2;
  const focus = hover ?? points.length - 1;
  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between text-[11.5px] text-ink-3">
        <span className="font-semibold tracking-[0.12em] uppercase">Score over time</span>
        <span data-numeric="">
          {formatDateTime(points[focus].at)} · <span className="font-semibold text-ink">{points[focus].score}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[150px] w-full overflow-visible" onMouseLeave={() => setHover(null)} role="img" aria-label="Score over time, ending with the drop">
        {[80, 60, 40].map((s) => (
          <g key={s}>
            <line x1="0" x2={W} y1={y(s)} y2={y(s)} stroke="var(--color-line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--color-brand)" fillOpacity="0.06" />
        <path d={line} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path
          d={`M${pts[dropFrom][0]},${pts[dropFrom][1]} L${pts[points.length - 1][0]},${pts[points.length - 1][1]}`}
          fill="none"
          stroke="var(--color-critical)"
          strokeWidth="2.4"
          vectorEffect="non-scaling-stroke"
        />
        {pts.map(([px], i) => (
          <rect key={i} x={px - W / points.length / 2} y="0" width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {[dropFrom, points.length - 1].map((i) => (
        <span
          key={i}
          className={cn('pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', i === points.length - 1 ? 'bg-critical' : 'bg-ink-3')}
          style={{ left: `${(pts[i][0] / W) * 100}%`, top: `calc(${(pts[i][1] / H) * 150}px + 26px)` }}
        />
      ))}
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
        <span>{formatDateTime(points[0].at)}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

/* ── Where the points went: a staircase from the old score to the new ───── */

function Waterfall({ before, now, steps }) {
  const explained = steps.reduce((n, s) => n + (Number(s.points) || 0), 0);
  const rest = before - now - explained;
  const rows = [...steps.map((s) => ({ ...s, kind: 'check' })), ...(rest !== 0 ? [{ title: rest > 0 ? 'Other recalculated checks' : 'Checks that improved', points: rest, kind: 'rest' }] : [])];
  let level = before;
  return (
    <ol className="flex flex-col">
      <li className="grid grid-cols-[minmax(0,1.4fr)_minmax(120px,1.6fr)_52px] items-center gap-4 py-2.5">
        <span className="text-[13px] text-ink-2">Score at the previous sync</span>
        <span className="relative h-2.5 rounded-full bg-track">
          <span className="absolute inset-y-0 left-0 rounded-full bg-ink-3/40" style={{ width: `${before}%` }} />
        </span>
        <span data-numeric="" className="text-right text-[14px] font-semibold text-ink">
          {before}
        </span>
      </li>
      {rows.map((r, i) => {
        const from = level;
        level -= Number(r.points) || 0;
        const lo = Math.max(0, Math.min(from, level));
        const hi = Math.min(100, Math.max(from, level));
        const sev = severityMeta(r.severity);
        return (
          <li key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(120px,1.6fr)_52px] items-center gap-4 border-t border-line py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] leading-snug font-medium text-ink" title={r.description || r.title}>
                {r.title}
              </span>
              {r.kind === 'check' && (
                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                  {r.severity && (
                    <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
                      <span className={cn('size-1.5 rounded-full', TONE_BG[sev.tone] ?? 'bg-ink-3')} />
                      {sev.label}
                    </span>
                  )}
                  {r.detail}
                </span>
              )}
            </span>
            <span className="relative h-2.5 rounded-full bg-track">
              <span className="absolute inset-y-0 left-0 rounded-full bg-ink-3/15" style={{ width: `${lo}%` }} />
              <span className={cn('absolute inset-y-0 rounded-full', r.points > 0 ? 'bg-critical' : 'bg-low')} style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` }} />
            </span>
            <span data-numeric="" className={cn('text-right text-[14px] font-semibold', r.points > 0 ? 'text-critical' : 'text-low')}>
              {r.points > 0 ? `−${r.points}` : `+${-r.points}`}
            </span>
          </li>
        );
      })}
      <li className="grid grid-cols-[minmax(0,1.4fr)_minmax(120px,1.6fr)_52px] items-center gap-4 border-t border-line-strong py-2.5">
        <span className="text-[13px] font-semibold text-ink">Score now</span>
        <span className="relative h-2.5 rounded-full bg-track">
          <span className={cn('absolute inset-y-0 left-0 rounded-full', TONE_BG[bandFor(now).tone])} style={{ width: `${now}%` }} />
        </span>
        <span data-numeric="" className="text-right font-display text-[16px] font-bold text-ink">
          {now}
        </span>
      </li>
    </ol>
  );
}

/* ── One cause, with the AWS change behind it ───────────────────────────── */

function ChangeItem({ c }) {
  const by = actorOf(c.details);
  const added = [...(c.details?.added ?? []), ...(c.details?.added_principals ?? [])];
  const removed = [...(c.details?.removed ?? []), ...(c.details?.removed_principals ?? [])];
  return (
    <li className="relative pb-5 pl-7 last:pb-0">
      <span aria-hidden="true" className="absolute top-1.5 left-[7px] h-full w-px bg-line last:hidden" />
      <span aria-hidden="true" className="absolute top-1 left-0 grid size-[15px] place-items-center rounded-full border border-line-strong bg-surface">
        <span className="size-[5px] rounded-full bg-ink-2" />
      </span>
      <p className="text-[13.5px] font-medium text-ink">{c.summary || `${c.change_type} ${c.entity_type}`}</p>
      <p className="mt-0.5 text-[12px] text-ink-3">
        {by ? <>by <span className="font-medium text-ink-2">{by}</span> · </> : null}
        <span title={formatDateTime(c.detected_at)}>{formatRelative(c.detected_at)}</span>
        {c.entity_arn ? <> · <span className="font-mono">{c.entity_arn.split(':').pop()}</span></> : null}
      </p>
      {(added.length > 0 || removed.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {added.map((v) => (
            <span key={`+${v}`} className="rounded-md border border-critical/25 bg-critical-soft/60 px-2 py-0.5 font-mono text-[11px] text-critical">
              + {shortRef(v)}
            </span>
          ))}
          {removed.map((v) => (
            <span key={`-${v}`} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-3 line-through">
              {shortRef(v)}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function FindingCard({ f }) {
  const sev = severityMeta(f.severity);
  const evidence = f.evidence && typeof f.evidence === 'object' ? Object.entries(f.evidence).slice(0, 4) : [];
  return (
    <article className="rounded-[12px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Tag size="sm" tone={sev.tone} dot>
            {sev.label}
          </Tag>
          <h4 className="mt-2 text-[14px] font-semibold text-ink">{f.title}</h4>
        </div>
        <Button as={Link} to={`/remediation/findings/${f.finding_id}`} size="sm" variant="primary" icon={Wrench}>
          Fix it
        </Button>
      </div>
      {f.risk_explanation && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{f.risk_explanation}</p>}
      {evidence.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[12px] sm:grid-cols-[auto_minmax(0,1fr)]">
          {evidence.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k.replaceAll('_', ' ')}</dt>
              <dd className="min-w-0 truncate font-mono text-ink-2" title={String(v)}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {f.remediation && (
        <p className="mt-3 text-[12.5px] text-ink-2">
          <span className="font-semibold text-ink">How to fix: </span>
          {f.remediation}
        </p>
      )}
    </article>
  );
}

/**
 * The full answer to "why did this identity's score drop": from what to what,
 * where every point went, what changed in AWS to cause it, and how to fix it.
 */
export default function AlertDetailPage() {
  const { id } = useParams();
  const query = useQuery((signal) => fetchIdentityAlert(id, signal), [id]);
  const a = query.data;
  const [showOld, setShowOld] = useState(false);

  const header = useMemo(() => {
    if (!a) return null;
    const dropped = a.score_before != null && a.score_before > a.score_now;
    return { dropped, delta: dropped ? a.score_now - a.score_before : 0, sev: dropSeverity(a.score_now - (a.score_before ?? a.score_now), a.band_before, a.band_now) };
  }, [a]);

  const back = (
    <Button as={Link} to="/alerts" variant="secondary" icon={ArrowLeft}>
      Alerts
    </Button>
  );

  if (query.isError && !a) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Score drop" actions={back} />
        {query.error?.status === 404 ? (
          <EmptyState icon={Fingerprint} title="No score for this identity" description="It is outside the accounts you are viewing, or posture has not scored it yet." action={back} />
        ) : (
          <ErrorState error={query.error} onRetry={query.refetch} />
        )}
      </div>
    );
  }
  if (!a) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Score drop" actions={back} />
        <DetailSkeleton rows={9} />
      </div>
    );
  }

  const fellBand = a.band_before && a.band_before.toLowerCase() !== String(a.band_now).toLowerCase();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span className="font-mono">{a.identity_name}</span>}
        lede={`${identityTypeLabel(a.identity_type)} in account ${a.account_name ? `${a.account_name} (${a.account_id})` : a.account_id}${a.region ? `, ${a.region}` : ''}`}
        actions={
          <>
            {back}
            {a.discovery_id && (
              <Button as={Link} to={`/identities/${a.discovery_id}`} variant="secondary" icon={Fingerprint}>
                Open identity
              </Button>
            )}
            <Button as={Link} to={`/posture/${encodeURIComponent(a.identity_id)}`} variant="secondary" icon={ShieldCheck}>
              Posture record
            </Button>
          </>
        }
        meta={a.identity_arn ? <CopyableValue value={a.identity_arn} /> : null}
      />

      {/* Verdict */}
      <section className="animate-rise grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-between gap-6 p-6 sm:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {header.dropped && (
                <Tag tone={header.sev.tone} size="sm" dot>
                  {header.sev.label}
                </Tag>
              )}
              {fellBand && (
                <Tag size="sm">
                  {bandFor(a.score_before).label} → {bandFor(a.score_now).label}
                </Tag>
              )}
            </div>
            <div className="mt-5">
              {a.score_before != null ? <ScoreShift before={a.score_before} now={a.score_now} size="lg" /> : <span className="font-display text-[40px] font-bold">{a.score_now}</span>}
            </div>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink">
              {header.dropped ? (
                <>
                  <span className="font-semibold">{a.identity_name}</span> lost{' '}
                  <span className="font-semibold text-critical">{formatNumber(-header.delta)} points</span> at the sync{' '}
                  <span title={formatDateTime(a.detected_at)}>{formatRelative(a.detected_at)}</span>
                  {a.new_failing_checks.length > 0
                    ? ` - ${a.new_failing_checks.length === 1 ? 'one check' : `${a.new_failing_checks.length} checks`} started failing${a.inventory_changes.length ? ' after a change in AWS' : ''}.`
                    : '.'}
                </>
              ) : (
                <>The score did not drop at the latest sync.</>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 border-t border-line pt-4 text-[12px]">
            <div>
              <dt className="text-ink-3">Checks failing</dt>
              <dd data-numeric="" className="mt-0.5 text-[16px] font-semibold text-ink">
                {formatNumber(a.checks_failed)}
                <span className="text-[12px] font-normal text-ink-3"> / {formatNumber(a.checks_evaluated)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">New since last sync</dt>
              <dd data-numeric="" className={cn('mt-0.5 text-[16px] font-semibold', a.new_failing_checks.length ? 'text-critical' : 'text-ink')}>
                {formatNumber(a.new_failing_checks.length)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Previous sync</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-ink" title={a.before_at ? formatDateTime(a.before_at) : undefined}>
                {a.before_at ? formatRelative(a.before_at) : '-'}
              </dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-line bg-surface-2/40 p-6 sm:p-7 lg:border-t-0 lg:border-l">
          {a.timeline.length > 1 ? <Trend points={a.timeline} beforeAt={a.before_at} /> : <p className="text-[12.5px] text-ink-3">Not enough history yet to draw a trend.</p>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Where the points went */}
        {a.score_before != null && header.dropped && (
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
            <h2 className="text-[15px] font-semibold text-ink">Where the {formatNumber(-header.delta)} points went</h2>
            <p className="mt-1 text-[12.5px] text-ink-3">Each check that started failing since the previous sync, and what it cost.</p>
            <div className="mt-4">
              <Waterfall before={a.score_before} now={a.score_now} steps={a.new_failing_checks} />
            </div>
          </section>
        )}

        {/* What changed in AWS */}
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <GitCommitVertical className="size-4 text-ink-3" />
            What changed in AWS
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-3">Changes to this identity and the credentials it uses since the previous sync.</p>
          {a.inventory_changes.length === 0 ? (
            <p className="mt-4 rounded-[10px] border border-dashed border-line px-4 py-5 text-center text-[12.5px] text-ink-3">
              No configuration change was recorded. The drop comes from checks re-evaluated against existing settings or activity.
            </p>
          ) : (
            <ol className="mt-5">
              {a.inventory_changes.map((c, i) => (
                <ChangeItem key={i} c={c} />
              ))}
            </ol>
          )}
        </section>
      </div>

      {a.new_findings.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">New findings to fix</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {a.new_findings.map((f) => (
              <FindingCard key={f.finding_id} f={f} />
            ))}
          </div>
        </section>
      )}

      {a.still_failing_checks.length > 0 && (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface">
          <button type="button" onClick={() => setShowOld((v) => !v)} aria-expanded={showOld} className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left">
            <span>
              <span className="text-[14px] font-semibold text-ink">Already failing before this sync</span>
              <span className="ml-2 text-[12.5px] text-ink-3">
                {formatNumber(a.still_failing_checks.length)} {a.still_failing_checks.length === 1 ? 'check' : 'checks'} · not part of this drop
              </span>
            </span>
            {showOld ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronRight className="size-4 text-ink-3" />}
          </button>
          {showOld && (
            <ul className="divide-y divide-line border-t border-line">
              {a.still_failing_checks.map((c) => (
                <li key={c.rule_id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{c.title}</span>
                    {c.failing_since && <span className="text-[11.5px] text-ink-3">failing since {formatRelative(c.failing_since)}</span>}
                  </span>
                  <span data-numeric="" className="shrink-0 text-[12.5px] font-semibold text-ink-2">
                    −{c.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
