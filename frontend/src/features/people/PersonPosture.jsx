import { useState } from 'react';
import { CheckCircle2, CircleAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { fetchHumanPosture } from '../../lib/api/humanIdentities';
import { severityMeta } from '../../lib/domain';
import { formatNumber, formatRelative, titleCaseEnum } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { SectionLabel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { BandTag, ScoreRing } from '../posture/parts';

const SHOW = [
  { value: 'failing', label: 'Failing' },
  { value: 'passing', label: 'Passing' },
  { value: 'all', label: 'All' },
];

const failing = (c) => String(c.status).toUpperCase() === 'FAIL';

/**
 * The person's posture, from GET /human-identities/{id}/posture: the score,
 * why it is that score, the pillars, and every check with its fix and the
 * points it would win back, failing first.
 */
export function PersonPosture({ id }) {
  const query = useQuery((signal) => fetchHumanPosture(id, {}, signal), [id]);
  const [show, setShow] = useState('failing');
  const d = query.data;

  if (query.isError && !d) return <ErrorState compact error={query.error} onRetry={query.refetch} title="Posture could not be loaded" />;
  if (!d) return <DetailSkeleton rows={5} />;
  if (!d.scored) {
    return (
      <EmptyState
        compact
        icon={ShieldQuestion}
        title="Not scored yet"
        description="The posture engine has no score for this person. It appears after the next posture scan that includes their account."
      />
    );
  }

  const p = d.posture;
  const checks = [...d.checks].sort((a, b) => Number(failing(b)) - Number(failing(a)) || (b.points_if_fixed ?? 0) - (a.points_if_fixed ?? 0));
  const shown = checks.filter((c) => (show === 'all' ? true : show === 'failing' ? failing(c) : !failing(c)));
  const failCount = checks.filter(failing).length;
  const pillars = (p.pillars ?? []).filter((x) => x.evaluated > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Score" className="flex flex-wrap items-center gap-5 rounded-[var(--radius-control)] border border-line bg-surface-2 p-4">
        <ScoreRing score={p.score} band={p.band} grade={p.grade} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BandTag score={p.score} band={p.band} />
            <span className="text-[12.5px] text-ink-3">
              {formatNumber(p.checks_failed)} of {formatNumber(p.checks_evaluated)} checks failing
            </span>
          </div>
          {p.why_this_score && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{p.why_this_score}</p>}
        </div>
        {p.after_every_fix?.delta > 0 && (
          <div className="text-right">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">If every fix is made</p>
            <p className="mt-0.5 text-[18px] font-bold text-low" data-numeric="">
              +{formatNumber(p.after_every_fix.delta)}
            </p>
          </div>
        )}
      </section>

      {pillars.length > 0 && (
        <div>
          <SectionLabel>By area</SectionLabel>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {pillars.map((x) => (
              <li key={x.pillar} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
                <span className="min-w-0 truncate text-[12.5px] text-ink">{x.name || titleCaseEnum(x.pillar)}</span>
                <span className="shrink-0 text-[12px] text-ink-3">
                  {x.failing > 0 ? <span className="font-semibold text-high">{formatNumber(x.failing)} failing</span> : 'All pass'}
                  {Number.isFinite(x.score) ? ` · ${formatNumber(Math.round(x.score))}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>
            Checks <span className="font-normal text-ink-3">{formatNumber(checks.length)}</span>
          </SectionLabel>
          <SegmentedControl label="Show checks" options={SHOW} value={show} onChange={setShow} />
        </div>
        {shown.length === 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <ShieldCheck aria-hidden="true" className="size-4 text-low" />
            {show === 'failing' ? 'No failing check. Every evaluated check passes.' : 'No check in this view.'}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {shown.map((c) => (
              <CheckRow key={c.rule_id} check={c} />
            ))}
          </ul>
        )}
        {show === 'failing' && failCount > 0 && failCount < checks.length && (
          <p className="mt-2 text-[11.5px] text-ink-3">{formatNumber(checks.length - failCount)} more checks pass.</p>
        )}
      </div>
    </div>
  );
}

function CheckRow({ check: c }) {
  const fail = failing(c);
  const covered = String(c.status).toUpperCase() === 'COVERED';
  const sev = severityMeta(c.severity);
  return (
    <li className={cn('rounded-[var(--radius-control)] border px-3 py-2.5', fail ? 'border-high/30 bg-high-soft/30' : 'border-line')}>
      <div className="flex items-start gap-2.5">
        {fail ? (
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-high" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-ink">{c.title || c.rule_id}</p>
          {c.detail && <p className="mt-0.5 text-[12px] [overflow-wrap:anywhere] text-ink-2">{c.detail}</p>}
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {titleCaseEnum(c.pillar)}
            {fail && c.failing_since ? ` · failing since ${formatRelative(c.failing_since)}` : ''}
            {covered ? ' · covered by another control' : ''}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {c.severity && (
            <Tag tone={sev.tone} size="sm" dot>
              {sev.label}
            </Tag>
          )}
          {fail && c.points_if_fixed > 0 && <span className="text-[11.5px] font-semibold text-low">+{formatNumber(c.points_if_fixed)} if fixed</span>}
        </span>
      </div>
    </li>
  );
}
