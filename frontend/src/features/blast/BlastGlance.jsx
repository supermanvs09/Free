import { Link } from 'react-router-dom';
import { ArrowUpRight, Lock } from 'lucide-react';
import { fetchBlastRadius, fetchIdentitySubjects } from '../../lib/api/blastRadius';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatNumber } from '../../lib/format';
import { identityRoute } from '../../lib/identityLinks';
import { DetailSkeleton } from '../../ui/Skeleton';
import { cn } from '../../ui/cn';
import { CATEGORIES, categoryOf, summarize } from './blastModel';

const RISK_TEXT = { CRITICAL: 'text-critical', HIGH: 'text-high', MEDIUM: 'text-medium', LOW: 'text-low' };
const RISK_BAR = { CRITICAL: 'bg-critical', HIGH: 'bg-high', MEDIUM: 'bg-medium', LOW: 'bg-low' };
const tail = (arn) => String(arn ?? '').split(':').slice(5).join(':').split('/').filter(Boolean).pop() || arn;

/**
 * "If this is taken over": the blast radius in a few lines, for the access
 * graph's side panel. An identity is traced through what it signs in with
 * (its role first); a role or user credential is its own subject.
 */
export function BlastGlance({ identityId, arn }) {
  const subject = useQuery(
    async (signal) => {
      if (identityId) {
        const subjects = await fetchIdentitySubjects(identityId, signal);
        if (subjects[0]?.arn) return subjects[0].arn;
      }
      return arn && arn.includes(':iam::') ? arn : null;
    },
    [identityId, arn],
  );
  const target = subject.data;
  const blast = useQuery((signal) => fetchBlastRadius(target, {}, signal), [target], { enabled: Boolean(target) });

  if (subject.isLoading || (target && blast.isLoading)) return <DetailSkeleton rows={3} />;
  if (!target) return <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">No role or key on record, so there is nothing to trace.</p>;
  if (blast.isError || !blast.data) {
    return (
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
        {blast.error?.status === 404
          ? 'Not traced: no permission data for its role in the accounts and regions you are viewing.'
          : 'Could not be computed right now.'}
      </p>
    );
  }

  const r = blast.data;
  const s = summarize(r);
  const top = [...s.resources].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 3);
  const score = Number(r.blast_radius_score ?? 0);

  return (
    <div className="mt-1.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span data-numeric="" className={cn('text-[22px] leading-none font-semibold', RISK_TEXT[r.risk_level] ?? 'text-ink')}>
          {score.toFixed(1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block h-1.5 overflow-hidden rounded-full bg-track">
            <span className={cn('block h-full rounded-full', RISK_BAR[r.risk_level] ?? 'bg-ink-3')} style={{ width: `${Math.min(100, score * 10)}%` }} />
          </span>
          <span className="mt-1 block text-[11px] text-ink-3">of 10 · {String(r.risk_level ?? 'none').toLowerCase()} blast radius</span>
        </span>
      </div>
      <p className="text-[12px] leading-snug text-ink-2">
        {s.total === 0 ? (
          'No policy lets it reach a resource or another role.'
        ) : (
          <>
            Can reach{' '}
            <span className="font-semibold text-ink" data-numeric="">
              {formatNumber(s.total)} {s.total === 1 ? 'resource' : 'resources'}
            </span>
            {s.roles ? ` and become ${formatNumber(s.roles)} ${s.roles === 1 ? 'role' : 'roles'}` : ''}
            {s.accounts.size ? `, in ${formatNumber(s.accounts.size)} other ${s.accounts.size === 1 ? 'account' : 'accounts'}` : ''}.
          </>
        )}
      </p>
      {s.total > 0 && (
        <dl className="grid grid-cols-2 gap-1.5">
          {CATEGORIES.filter((c) => s.byCategory[c.key]).map((c) => (
            <div key={c.key} className="rounded-[8px] border border-line px-2.5 py-1.5">
              <dt className="truncate text-[10.5px] text-ink-3">{c.label}</dt>
              <dd data-numeric="" className={cn('text-[14px] font-semibold', c.key === 'secrets' ? 'text-critical' : 'text-ink')}>
                {formatNumber(s.byCategory[c.key])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {top.length > 0 && (
        <ul className="flex flex-col gap-1">
          {top.map((res) => (
            <li key={res.arn} className="flex min-w-0 items-center gap-2 text-[11.5px]">
              {categoryOf(res) === 'secrets' ? <Lock className="size-3 shrink-0 text-critical" /> : <span className="size-3 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-ink" title={res.arn}>
                {tail(res.arn)}
              </span>
              <span data-numeric="" className="shrink-0 text-ink-3">
                {Number(res.score).toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {identityId && (
        <Link to={identityRoute(identityId, 'blast')} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">
          Full blast radius and how to shrink it <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}
