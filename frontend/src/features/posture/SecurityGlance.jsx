import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { fetchIdentityChecks, postureRoute, resolvePostureIdentity } from '../../lib/api/posture';
import { useQuery } from '../../lib/hooks/useQuery';
import { severityMeta } from '../../lib/domain';
import { formatNumber } from '../../lib/format';
import { identityRoute } from '../../lib/identityLinks';
import { SectionLabel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { TONE_BG, cn } from '../../ui/cn';
import { BlastGlance } from '../blast/BlastGlance';
import { BandTag, ScoreRing, formatScore } from './parts';

const SHOWN = 4;

/**
 * Its posture in a few lines: score, band and the failing checks that cost
 * the most - the same score and checks as the Posture tab, not a second
 * opinion. `candidates` are the ARNs to look the posture identity up by, in
 * order (an identity's own ARN; for a credential its own, then the ARNs of
 * the identities bound to it).
 */
function PostureGlance({ candidates, postureLink, missing }) {
  const key = candidates.filter(Boolean).join('|');
  const header = useQuery(
    async (signal) => {
      for (const arn of candidates.filter(Boolean)) {
        const found = await resolvePostureIdentity({ arn }, signal);
        if (found) return found;
      }
      return null;
    },
    [key],
  );
  const id = header.data?.identity_id;
  const checks = useQuery((signal) => fetchIdentityChecks(id, { status: 'failed' }, signal), [id], { enabled: Boolean(id) });

  if (header.isLoading && !header.data) return <DetailSkeleton rows={3} />;
  if (header.isError) return <p className="mt-1.5 text-[12px] text-ink-3">Posture could not be read right now.</p>;
  if (!header.data) {
    return <p className="mt-1.5 text-[12px] text-ink-3">{missing ?? 'Posture has not scored this identity yet. Identities are scored after each discovery scan.'}</p>;
  }

  const h = header.data;
  const failing = (checks.data?.checks ?? []).slice().sort((a, b) => (Number(b.points_if_fixed) || 0) - (Number(a.points_if_fixed) || 0));
  const link = postureLink ?? postureRoute(h.identity_id);
  return (
    <div className="mt-1.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <ScoreRing score={h.score} band={h.band} grade={h.grade} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <BandTag score={h.score} band={h.band} />
            <span className="text-[12px] text-ink-3" data-numeric="">
              {checks.data ? `${formatNumber(failing.length)} failing ${failing.length === 1 ? 'check' : 'checks'}` : ''}
            </span>
          </span>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">Score {formatScore(h.score)} of 100</span>
        </span>
      </div>
      {checks.isLoading && !checks.data ? (
        <DetailSkeleton rows={2} />
      ) : failing.length === 0 ? (
        <p className="text-[12px] text-low">Every check that applies passes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {failing.slice(0, SHOWN).map((c) => (
            <li key={c.rule_id} className="flex items-start gap-2.5 py-1.5">
              <span className={cn('mt-[6px] size-1.5 shrink-0 rounded-full', TONE_BG[severityMeta(c.severity).tone] ?? 'bg-ink-3')} title={severityMeta(c.severity).label} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-ink">{c.title}</span>
                {c.detail && <span className="block truncate text-[11px] text-ink-3" title={c.detail}>{c.detail}</span>}
              </span>
              {Number(c.points_if_fixed) > 0 && (
                <span data-numeric="" className="shrink-0 text-[12px] font-semibold text-low" title="Points it earns back when fixed">
                  +{formatScore(c.points_if_fixed)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link to={link} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
        {failing.length > SHOWN ? `All ${formatNumber(failing.length)} failing checks and how to fix them` : 'Posture and how to fix it'}
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * The Overview's "at a glance": its posture and its blast radius, read from
 * the same services as the Posture and Blast radius tabs so the three never
 * disagree. Replaces the discovery scan's own OK / needs-a-look list.
 */
export function SecurityGlance({ identityId, arn, candidates, missing, compact = false }) {
  return (
    <div className={cn('grid gap-4', !compact && 'lg:grid-cols-2')}>
      <section className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-4">
        <SectionLabel>Posture</SectionLabel>
        <PostureGlance candidates={candidates ?? [arn]} missing={missing} postureLink={identityId ? identityRoute(identityId, 'posture') : undefined} />
      </section>
      <section className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-4">
        <SectionLabel>If it is taken over</SectionLabel>
        <BlastGlance identityId={identityId} arn={arn} />
      </section>
    </div>
  );
}
