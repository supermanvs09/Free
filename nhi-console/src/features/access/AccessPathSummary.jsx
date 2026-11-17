import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronRight, Crown, FileText, KeyRound, Route, ShieldAlert, UserCircle } from 'lucide-react';
import { fetchAccessPath } from '../../lib/api/response';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatNumber, formatRelative } from '../../lib/format';
import { cn } from '../../ui/cn';

/**
 * The access chain of the starting point, in one line and in the order it
 * flows: the identity -> what it runs as -> the policies attached there (or
 * directly to it) -> what those policies reach. Then the one question that
 * matters most: can it get administrator access, and how.
 *
 * Every box is a button that selects the same box in the graph below, so the
 * summary is a way into the picture rather than a second copy of it.
 */
export function AccessPathSummary({ identityId, onSelect, onShowPath, onFocus, present }) {
  const query = useQuery((signal) => fetchAccessPath(identityId, signal), [identityId], { enabled: Boolean(identityId) });
  const d = query.data;
  if (!identityId || !d) return null;

  const step = (node, { icon: Icon, kind, tone = 'neutral', sub } = {}) => (
    <button
      key={node.arn}
      type="button"
      onClick={() => onSelect?.(node.arn)}
      disabled={present && !present(node.arn)}
      className={cn(
        'group flex min-w-0 max-w-[280px] items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors enabled:hover:border-brand/50',
        tone === 'critical' ? 'border-critical/40 bg-critical-soft/50' : tone === 'focus' ? 'border-brand/40 bg-info-soft/40' : 'border-line bg-surface',
      )}
      title={node.name}
    >
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', tone === 'critical' ? 'text-critical' : 'text-ink-3')} />
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{kind}</span>
        <span className="block truncate text-[12.5px] font-semibold text-ink">{node.name}</span>
        {sub && <span className="block truncate text-[11px] text-ink-3">{sub}</span>}
      </span>
    </button>
  );
  const arrow = (label) => (
    <span className="flex shrink-0 flex-col items-center px-0.5 text-ink-3" aria-hidden="true">
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
      <ArrowRight className="size-4" />
    </span>
  );

  const policies = d.policies;
  const viaRole = d.runs_as[0];
  const admin = d.admin;

  return (
    <section aria-label="Access path" className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4" data-scene="access-path">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {step({ arn: d.identity.arn, name: d.identity.name }, { icon: UserCircle, kind: 'Identity', tone: 'focus', sub: d.identity.account })}
        {viaRole && (
          <>
            {arrow('runs as')}
            {step(viaRole, { icon: KeyRound, kind: 'IAM role' })}
          </>
        )}
        {policies.length > 0 && arrow(viaRole ? 'attached to role' : 'attached directly')}
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {policies.map((p) =>
            step(p, {
              icon: FileText,
              kind: p.kind_label,
              tone: p.admin ? 'critical' : 'neutral',
              sub: `${p.direct ? 'On the identity itself' : 'On its role'} · ${p.reach_label}`,
            }),
          )}
        </span>
        {policies.length > 0 && arrow('can reach')}
        <span className="flex flex-col rounded-[10px] border border-line bg-surface-2 px-3 py-1.5">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{d.contained ? 'Its policies grant' : 'Through its policies'}</span>
          <span className="text-[13px] font-semibold text-ink">
            {formatNumber(d.direct.resources)} resource{d.direct.resources === 1 ? '' : 's'}
            {d.direct.sensitive ? <span className="text-critical"> · {formatNumber(d.direct.sensitive)} sensitive</span> : null}
          </span>
          {d.total.resources > d.direct.resources && (
            <span className="text-[11px] text-ink-3">
              {formatNumber(d.total.resources)} with the roles it can become · {d.total.accounts} account{d.total.accounts === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <Link
          to={`/identities/${d.identity.id}?tab=blast`}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          Blast radius {d.total.score.toFixed(1)} <ChevronRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {d.contained && (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-[8px] border border-low/30 bg-low-soft/50 px-3 py-2">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            <b className="text-ink">Contained - nothing can use it right now.</b> {d.contained.reason}
            {d.contained.at ? ` ${formatRelative(d.contained.at)}` : ''}
            {d.contained.by ? ` by ${d.contained.by}` : ''}, so its blast radius is 0. The policies below still grant what they grant: right-size
            them before a new key is issued.
          </p>
        </div>
      )}
      <AdminVerdict admin={admin} become={d.can_become} name={d.identity.name} onShowPath={onShowPath} onFocus={onFocus} contained={Boolean(d.contained)} />
    </section>
  );
}

function AdminVerdict({ admin, become, name, onShowPath, onFocus, contained }) {
  if (admin.verdict === 'direct') {
    const others = admin.also_via ?? [];
    return (
      <div className="mt-3 flex flex-wrap items-start gap-2 rounded-[8px] border border-critical/30 bg-critical-soft/60 px-3 py-2">
        <Crown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-critical" />
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
          <b className="text-ink">{contained ? 'Holds administrator access (unusable while contained).' : 'Has administrator access.'}</b> {admin.policy} is attached {admin.direct ? `directly to ${name}` : `to the role it runs as, ${admin.attached_to}`}, so it can do anything in its account.
          {others.length > 0 && (
            <>
              {' '}It can also become {others.length === 1 ? 'an administrator role' : `${others.length} administrator roles`} in{' '}
              {[...new Set(others.map((o) => o.account))].join(', ')}.
            </>
          )}
        </p>
      </div>
    );
  }
  if (admin.verdict === 'path') {
    const path = admin.paths[0];
    return (
      <div className="mt-3 rounded-[8px] border border-high/40 bg-high-soft/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-high" />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            <b className="text-ink">Not an administrator - but can become one in {path.steps.length - 1} step{path.steps.length === 2 ? '' : 's'}.</b>
            {admin.paths.length > 1 ? ` ${admin.paths.length} routes in all.` : ''}
          </p>
          {onShowPath && (
            <button
              type="button"
              onClick={() => onShowPath(path)}
              className="inline-flex items-center gap-1 rounded-[6px] border border-high/40 bg-surface px-2 py-1 text-[12px] font-medium text-ink hover:border-high"
            >
              <Route aria-hidden="true" className="size-3.5" /> Show it on the graph
            </button>
          )}
        </div>
        <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          {path.steps.map((s, index) => (
            <li key={`${s.arn}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="flex items-center gap-1 text-ink-3" title={path.links[index - 1]}>
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                  <span className="text-[10.5px]">can assume</span>
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </span>
              )}
              <button
                type="button"
                onClick={() => onFocus?.(s.id)}
                className={cn(
                  'rounded-[6px] border px-2 py-0.5 font-mono text-[11.5px] font-semibold',
                  s.is_admin ? 'border-critical/40 bg-critical-soft text-critical' : 'border-line bg-surface text-ink',
                )}
                title={index > 0 ? path.links[index - 1] : undefined}
              >
                {s.name}
                {s.is_admin ? ' · admin' : ''}
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-1.5 text-[11.5px] text-ink-3">Why: {path.links.join('; ')}.</p>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-low/30 bg-low-soft/50 px-3 py-2">
      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-low" />
      <p className="text-[12.5px] text-ink-2">
        <b className="text-ink">No path to administrator access.</b> None of its policies grant it, and {become.length ? `none of the ${become.length} role${become.length === 1 ? '' : 's'} it can become has it` : 'it cannot become any other role'}.
      </p>
    </div>
  );
}
