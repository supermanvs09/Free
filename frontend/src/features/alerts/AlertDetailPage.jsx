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
import { changeStory } from '../changes/story';

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
      <p className="text-[13.5px] font-medium text-ink">
        {changeStory({
          entityType: String(c.entity_type ?? '').toLowerCase(),
          changeType: String(c.change_type ?? '').toUpperCase(),
          name: c.entity_name || '',
          arn: c.entity_arn || '',
          details: c.details ?? {},
        }) ??
          (c.summary || `${c.change_type} ${c.entity_type}`)}
      </p>
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

/* ── The causes: one share bar, then each cause with its own fix ───────── */

const SEV_TEXT = { low: 'text-low', medium: 'text-medium', high: 'text-high', critical: 'text-critical' };

/** The drop as one bar split by cause: how much of it each one explains. */
function ShareBar({ causes, rest, total }) {
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label="How much of the drop each cause explains">
        {causes.map((c, i) => (
          <span
            key={c.rule_id}
            title={`${String(i + 1).padStart(2, '0')} ${c.title}: −${c.points}`}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', TONE_BG[severityMeta(c.severity).tone] ?? 'bg-ink-3')}
            style={{ flexGrow: c.points, flexBasis: 0, opacity: 1 - i * 0.12 }}
          />
        ))}
        {rest > 0 && <span title={`Other recalculated checks: −${rest}`} className="h-full rounded-r-full bg-ink-3/30" style={{ flexGrow: rest, flexBasis: 0 }} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        {causes.map((c, i) => (
          <span key={c.rule_id} className="flex items-center gap-1.5">
            <span className="font-mono text-ink-2">{String(i + 1).padStart(2, '0')}</span>
            <span data-numeric="">{Math.round((c.points / total) * 100)}%</span>
          </span>
        ))}
        {rest > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ink-3/40" /> other checks <span data-numeric="">{Math.round((rest / total) * 100)}%</span>
          </span>
        )}
      </div>
    </div>
  );
}

function Evidence({ evidence }) {
  const rows = evidence && typeof evidence === 'object' ? Object.entries(evidence).slice(0, 4) : [];
  if (!rows.length) return null;
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-[auto_minmax(0,1fr)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k.replaceAll('_', ' ')}</dt>
          <dd className="min-w-0 truncate font-mono text-ink-2" title={String(v)}>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One cause: what failed, what it cost, and - when posture raised a finding for it - how to fix it. */
function Cause({ c, n, total, finding, postureLink }) {
  const sev = severityMeta(c.severity);
  return (
    <li className="animate-rise group relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 border-t border-line py-6 first:border-t-0 first:pt-2" style={{ animationDelay: `${n * 70}ms` }}>
      <span aria-hidden="true" className="pt-0.5 font-mono text-[13px] font-medium text-ink-3 transition-colors group-hover:text-ink">
        {String(n + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[15.5px] leading-snug font-semibold tracking-[-0.01em] text-balance text-ink">{c.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
              {c.severity && (
                <span className="flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', TONE_BG[sev.tone] ?? 'bg-ink-3')} />
                  {sev.label}
                </span>
              )}
              {c.category && <span>{c.severity ? '· ' : ''}{c.category.replaceAll('_', ' ')}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span data-numeric="" className={cn('block font-display text-[26px] leading-none font-bold tracking-tight', SEV_TEXT[sev.tone] ?? 'text-ink')}>
              −{formatNumber(c.points)}
            </span>
            {total > 0 && (
              <span data-numeric="" className="mt-1 block text-[11px] text-ink-3">
                {Math.round((c.points / total) * 100)}% of the drop
              </span>
            )}
          </div>
        </div>
        {c.detail && <p className="mt-3 max-w-[64ch] text-[13.5px] leading-relaxed text-ink-2">{c.detail}</p>}

        {finding ? (
          <div className="mt-4 rounded-[12px] bg-surface-2/70 p-4 transition-colors group-hover:bg-surface-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-ink-3">The finding posture raised</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">{finding.title}</p>
              </div>
              <Button as={Link} to={`/remediation/findings/${finding.finding_id}`} size="sm" variant="primary" icon={Wrench}>
                Fix it
              </Button>
            </div>
            {finding.risk_explanation && <p className="mt-2 max-w-[64ch] text-[12.5px] leading-relaxed text-ink-2">{finding.risk_explanation}</p>}
            <Evidence evidence={finding.evidence} />
            {finding.remediation && (
              <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">How to fix · </span>
                {finding.remediation}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-ink-3">
            No remediation finding for this check yet.{' '}
            <Link to={postureLink} className="font-medium text-brand hover:underline">
              See it in the posture record
            </Link>
          </p>
        )}
      </div>
    </li>
  );
}

function RailLink({ to, icon: Icon, children }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2 active:translate-y-px">
      <Icon className="size-4 text-ink-3 transition-colors group-hover:text-brand" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * The full answer to "why did this identity's score drop", read top to
 * bottom: the verdict, the causes ranked by what they cost (each with its own
 * fix), and beside them the evidence - what changed in AWS and who did it.
 */
export default function AlertDetailPage() {
  const { id } = useParams();
  const query = useQuery((signal) => fetchIdentityAlert(id, signal), [id]);
  const a = query.data;
  const [showOld, setShowOld] = useState(false);

  const view = useMemo(() => {
    if (!a) return null;
    const dropped = a.score_before != null && a.score_before > a.score_now;
    const total = dropped ? a.score_before - a.score_now : 0;
    /* The posture service's own reasons (drop_reasons) are the causes when it
       gives them; each is matched to its check by title, when one carries it,
       for the severity, detail and fix. Otherwise: checks that started failing. */
    const checks = [...a.new_failing_checks, ...a.still_failing_checks];
    const byTitle = (text) => checks.find((c) => String(c.title).trim().toLowerCase() === String(text).trim().toLowerCase());
    const reasons = (a.drop_reasons ?? []).map((r) => ({ ...(byTitle(r.text) ?? {}), rule_id: byTitle(r.text)?.rule_id ?? r.text, title: r.text, points: r.points || byTitle(r.text)?.points || 0 }));
    const causes = (reasons.length ? reasons : [...a.new_failing_checks]).sort((x, y) => (Number(y.points) || 0) - (Number(x.points) || 0));
    const explained = causes.reduce((n, c) => n + (Number(c.points) || 0), 0);
    /* A finding belongs to a cause when it names the same rule - exact, not inferred. */
    const findingOf = (c) => a.new_findings.find((f) => (c.finding_id && f.finding_id === c.finding_id) || (f.rule_id && f.rule_id === c.rule_id));
    const linked = new Set(causes.map(findingOf).filter(Boolean).map((f) => f.finding_id));
    /* Nothing new failed: the score fell because problems it already had now
       count for more. Those problems are then the answer, biggest first. */
    const existing = [...a.still_failing_checks].filter((c) => !reasons.some((r) => r.rule_id === c.rule_id)).sort((x, y) => (Number(y.points) || 0) - (Number(x.points) || 0));
    return {
      dropped,
      total,
      causes,
      rescored: dropped && causes.length === 0,
      existing,
      rest: Math.max(0, total - explained),
      findingOf,
      orphans: a.new_findings.filter((f) => !linked.has(f.finding_id)),
      sev: dropSeverity(a.score_now - (a.score_before ?? a.score_now), a.band_before, a.band_now),
    };
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
  const postureLink = `/posture/${encodeURIComponent(a.identity_id)}`;
  /* Our own sentence, in plain words: the scanner's why_this_score names
     rules and point arithmetic, which is not what a reader needs first. */
  const problems = (n) => `${formatNumber(n)} ${n === 1 ? 'problem' : 'problems'}`;
  const sentence = !view.dropped
    ? 'The score did not drop at the latest sync.'
    : view.causes.length > 0
      ? a.drop_reasons?.length
        ? `The score fell from ${a.score_before} to ${a.score_now}. ${view.causes.length === 1 ? 'The reason' : `${problems(view.causes.length)}; the biggest`}: ${view.causes[0].title}.`
        : `The score fell from ${a.score_before} to ${a.score_now} because ${problems(view.causes.length)} appeared at the latest sync${a.inventory_changes.length ? ', after a change in AWS' : ''}. The biggest: ${view.causes[0].title}.`
      : `The score fell from ${a.score_before} to ${a.score_now}, but nothing new went wrong. ${view.existing.length ? `The ${problems(view.existing.length)} this identity already had now count for more` : 'Problems it already had now count for more'}${a.score_now === 0 ? ', and together they cost more than the whole score, so it is at 0' : ''}.`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<span className="font-mono">{a.identity_name}</span>}
        lede={`${identityTypeLabel(a.identity_type)} in account ${a.account_name ? `${a.account_name} (${a.account_id})` : a.account_id}${a.region ? `, ${a.region}` : ''}`}
        actions={back}
      />

      {/* The verdict */}
      <section
        aria-label="Verdict"
        className="animate-rise relative overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-[var(--t-shadow-sm)] ring-1 ring-line"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_140%_at_0%_0%,var(--color-critical-soft),transparent_60%)] opacity-80" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {view.dropped && (
                <Tag tone={view.sev.tone} size="sm" dot>
                  {view.sev.label}
                </Tag>
              )}
              {fellBand && (
                <Tag size="sm">
                  {bandFor(a.score_before).label} → {bandFor(a.score_now).label}
                </Tag>
              )}
              <span className="text-[12px] text-ink-3" title={formatDateTime(a.detected_at)}>
                at the sync {formatRelative(a.detected_at)}
              </span>
              {a.ack_at && (
                <Tag tone="low" size="sm" dot>
                  Acknowledged{a.ack_by ? ` by ${a.ack_by}` : ''} {formatRelative(a.ack_at)}
                </Tag>
              )}
            </div>
            <div className="mt-6">{a.score_before != null ? <ScoreShift before={a.score_before} now={a.score_now} size="lg" /> : <span className="font-display text-[40px] font-bold">{a.score_now}</span>}</div>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed font-medium tracking-[-0.005em] text-pretty text-ink">{sentence}</p>
            <dl className="mt-auto flex flex-wrap gap-x-8 gap-y-3 pt-7 text-[12px]">
              <div>
                <dt className="text-ink-3">Checks failing</dt>
                <dd data-numeric="" className="mt-0.5 text-[15px] font-semibold text-ink">
                  {formatNumber(a.checks_failed)}
                  <span className="text-[12px] font-normal text-ink-3"> of {formatNumber(a.checks_evaluated)}</span>
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">New at this sync</dt>
                <dd data-numeric="" className={cn('mt-0.5 text-[15px] font-semibold', view.causes.length ? 'text-critical' : 'text-ink')}>
                  {formatNumber(view.causes.length)}
                </dd>
              </div>
              <div>
                {/* A drop the posture service flagged is measured by it, not
                    against our history: say when it flagged it instead. */}
                <dt className="text-ink-3">{a.drop_alert ? 'Flagged by posture' : 'Compared with'}</dt>
                <dd className="mt-0.5 text-[13px] font-medium text-ink" title={formatDateTime(a.drop_alert ? a.detected_at : a.before_at)}>
                  {a.drop_alert ? formatRelative(a.detected_at) : a.before_at ? `the sync ${formatRelative(a.before_at)}` : '-'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-[14px] bg-surface/70 p-5 ring-1 ring-line backdrop-blur-sm">
            {a.timeline.length > 1 ? <Trend points={a.timeline} beforeAt={a.before_at} /> : <p className="text-[12.5px] text-ink-3">Not enough history yet to draw a trend.</p>}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        {/* The causes */}
        <section aria-label="Causes" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-ink">
                {view.rescored ? 'Why the score fell' : view.dropped ? `What cost the ${formatNumber(view.total)} points` : 'What is failing'}
              </h2>
              <p className="mt-1 text-[13px] text-ink-3">
                {view.rescored
                  ? 'Nothing started failing at this sync. These problems were already there and now cost more points. Fixing them raises the score, biggest first.'
                  : a.drop_reasons?.length
                    ? 'What the posture service counted against this drop, biggest first.'
                    : 'Problems that appeared at this sync, biggest first. Each one says how to fix it.'}
              </p>
            </div>
          </div>
          {view.dropped && !view.rescored && (
            <div className="mt-5">
              <ShareBar causes={view.causes} rest={view.rest} total={view.total} />
            </div>
          )}
          {view.causes.length > 0 ? (
            <ol className="mt-4">
              {view.causes.map((c, i) => (
                <Cause key={c.rule_id} c={c} n={i} total={view.total} finding={view.findingOf(c)} postureLink={postureLink} />
              ))}
            </ol>
          ) : view.rescored && view.existing.length > 0 ? (
            <ol className="mt-4">
              {view.existing.map((c, i) => (
                <Cause key={c.rule_id} c={c} n={i} total={0} finding={null} postureLink={postureLink} />
              ))}
            </ol>
          ) : (
            <p className="mt-5 rounded-[12px] bg-surface-2/70 px-4 py-5 text-[13px] text-ink-2">
              {view.dropped ? 'Nothing started failing at this sync; problems it already had now cost more points.' : 'Nothing is failing for this identity.'}
            </p>
          )}
          {view.rest > 0 && !view.rescored && (
            <p className="mt-2 border-t border-line pt-4 text-[12.5px] text-ink-3">
              The other <span className="font-semibold text-ink-2">{formatNumber(view.rest)} {view.rest === 1 ? 'point' : 'points'}</span> came from problems that were already there and now cost more.
            </p>
          )}

          {view.orphans.length > 0 && (
            <section className="mt-8">
              <h3 className="text-[14px] font-semibold text-ink">Other new findings</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {view.orphans.map((f) => (
                  <li key={f.finding_id} className="flex items-center gap-3 rounded-[12px] bg-surface-2/70 px-4 py-3">
                    <span className={cn('size-1.5 shrink-0 rounded-full', TONE_BG[severityMeta(f.severity).tone] ?? 'bg-ink-3')} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.title}</span>
                    <Button as={Link} to={`/remediation/findings/${f.finding_id}`} size="sm" variant="secondary" icon={Wrench}>
                      Fix it
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.covered_checks?.length > 0 && (
            <section className="mt-8 border-t border-line pt-4">
              <h3 className="text-[13.5px] font-semibold text-ink">Covered by another check</h3>
              <p className="mt-1 text-[12px] text-ink-3">Failing, but already counted under the check named in each line.</p>
              <ul className="mt-2 divide-y divide-line">
                {a.covered_checks.map((c) => (
                  <li key={c.rule_id} className="py-3">
                    <span className="block text-[13px] text-ink">{c.title}</span>
                    {c.detail && <span className="block text-[12px] text-ink-3">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.still_failing_checks.length > 0 && !view.rescored && (
            <section className="mt-8 border-t border-line pt-2">
              <button type="button" onClick={() => setShowOld((v) => !v)} aria-expanded={showOld} className="flex w-full items-center justify-between gap-3 rounded-[10px] py-3 text-left transition-colors hover:text-ink">
                <span>
                  <span className="text-[13.5px] font-semibold text-ink">Already failing before this sync</span>
                  <span className="ml-2 text-[12.5px] text-ink-3">
                    {formatNumber(a.still_failing_checks.length)} {a.still_failing_checks.length === 1 ? 'check' : 'checks'} · not part of this drop
                  </span>
                </span>
                <ChevronDown className={cn('size-4 text-ink-3 transition-transform duration-200', showOld && 'rotate-180')} />
              </button>
              {showOld && (
                <ul className="animate-fade divide-y divide-line">
                  {a.still_failing_checks.map((c) => (
                    <li key={c.rule_id} className="flex items-center justify-between gap-4 py-3">
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
        </section>

        {/* The evidence */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-20">
          <section className="rounded-[var(--radius-panel)] bg-surface p-5 ring-1 ring-line">
            <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <GitCommitVertical className="size-4 text-ink-3" />
              Changed in AWS
            </h2>
            <p className="mt-1 text-[12px] text-ink-3">Since the previous sync, on this identity and the credentials it uses.</p>
            {a.inventory_changes.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-ink-3">Nothing about this identity or its credentials changed in AWS since the previous sync.</p>
            ) : (
              <ol className="mt-5">
                {a.inventory_changes.map((c, i) => (
                  <ChangeItem key={i} c={c} />
                ))}
              </ol>
            )}
          </section>

          <section className="overflow-hidden rounded-[var(--radius-panel)] bg-surface ring-1 ring-line">
            <div className="px-4 pt-4 pb-3">
              <h2 className="text-[13.5px] font-semibold text-ink">Identity</h2>
              {a.identity_arn && (
                <div className="mt-2">
                  <CopyableValue value={a.identity_arn} />
                </div>
              )}
              {a.credential_arn && a.credential_arn !== a.identity_arn && (
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  runs as <span className="font-mono text-ink-2">{shortRef(a.credential_arn)}</span>
                </p>
              )}
            </div>
            <nav aria-label="Open elsewhere" className="divide-y divide-line border-t border-line">
              {a.discovery_id && (
                <>
                  <RailLink to={`/identities/${encodeURIComponent(a.discovery_id)}`} icon={Fingerprint}>
                    Open identity
                  </RailLink>
                </>
              )}
              <RailLink to={postureLink} icon={ShieldCheck}>
                Posture record
              </RailLink>
            </nav>
          </section>
        </aside>
      </div>
    </div>
  );
}
