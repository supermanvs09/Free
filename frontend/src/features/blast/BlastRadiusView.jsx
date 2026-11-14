import { Fragment, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { fetchBlastRadius, fetchWhoCanAssume } from '../../lib/api/blastRadius';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { DetailSkeleton } from '../../ui/Skeleton';
import { ClearState, EmptyState, ErrorState } from '../../ui/States';
import { cn } from '../../ui/cn';
import { BlastExplorer } from './BlastExplorer';

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

const SERVICE_LABEL = {
  s3: 'S3',
  secretsmanager: 'Secrets Manager',
  kms: 'KMS keys',
  iam: 'IAM roles',
  sts: 'STS',
  dynamodb: 'DynamoDB',
  sqs: 'SQS',
  sns: 'SNS',
  lambda: 'Lambda',
  ec2: 'EC2',
  rds: 'RDS',
  ssm: 'Parameter Store',
  ecr: 'ECR',
  ecs: 'ECS',
  logs: 'CloudWatch Logs',
  kinesis: 'Kinesis',
  glue: 'Glue',
};
const serviceLabel = (s) => SERVICE_LABEL[s] ?? (s ? s.toUpperCase() : 'Other');

/* Services whose reach is the dangerous part: credentials and key material. */
const SENSITIVE = new Set(['secretsmanager', 'kms', 'ssm', 'iam', 'sts']);
const isSensitive = (r) => SENSITIVE.has(r.service) || r.type === 'secret' || r.type === 'key';

const LIMITATION = {
  crosses_account_boundary: 'Crosses into another AWS account.',
  does_not_prove_access_happened: 'Allowed by policy - CloudTrail has not shown it being used.',
  wildcard_resource_grant: 'Granted on every resource of this kind ("*"), not on a named one.',
  condition_not_evaluated: 'The policy has a condition that was not evaluated.',
};
const limitationText = (code) => LIMITATION[code] ?? String(code).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) + '.';

const RISK = {
  CRITICAL: { label: 'Critical', tone: 'critical', stroke: 'var(--color-critical)' },
  HIGH: { label: 'High', tone: 'high', stroke: 'var(--color-high)' },
  MEDIUM: { label: 'Medium', tone: 'medium', stroke: 'var(--color-medium)' },
  LOW: { label: 'Low', tone: 'low', stroke: 'var(--color-low)' },
  NONE: { label: 'None', tone: 'neutral', stroke: 'var(--color-ink-3)' },
};

const accountOf = (arn) => String(arn ?? '').split(':')[4] || '';
const lastSegment = (arn) => {
  const text = String(arn ?? '');
  if (text.startsWith('*:')) return `All ${serviceLabel(text.slice(2))} resources`;
  if (text === '*') return 'Every resource';
  if (/^arn:[^:]+:s3:::[^/]+\/\*$/.test(text)) return `Every object in ${text.split(':::')[1].slice(0, -2)}`;
  const tail = text.split(':').slice(5).join(':');
  return tail.split('/').filter(Boolean).pop() || tail || text;
};

/* ── Score gauge ────────────────────────────────────────────────────────── */

function Gauge({ score, level }) {
  const risk = RISK[level] ?? RISK.NONE;
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  const r = 52;
  const arc = Math.PI * r;
  return (
    <div className="relative w-[140px] shrink-0" role="img" aria-label={`Blast radius score ${value.toFixed(1)} of 10, ${risk.label}`}>
      <svg viewBox="0 0 128 72" className="w-full overflow-visible">
        <path d="M12 66 A52 52 0 0 1 116 66" fill="none" stroke="var(--color-track, var(--color-line))" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M12 66 A52 52 0 0 1 116 66"
          fill="none"
          stroke={risk.stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(value / 10) * arc} ${arc}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span data-numeric="" className="font-display text-[32px] leading-none font-bold tracking-tight text-ink">
          {value.toFixed(1)}
        </span>
        <span className="mt-1 text-[10.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase">of 10</span>
      </div>
    </div>
  );
}

/* ── One reachable resource ─────────────────────────────────────────────── */

function ResourceRow({ res, source, paths, open, onToggle }) {
  const sensitive = isSensitive(res);
  const via = (res.path_arns ?? []).slice(1, -1);
  const cross = accountOf(res.arn) && accountOf(res.arn) !== accountOf(source);
  const detail = paths.filter((p) => p.target_arn === res.arn);
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
        <span
          className={cn(
            'grid size-8 place-items-center rounded-[9px] border',
            sensitive ? 'border-critical/25 bg-critical-soft text-critical' : 'border-line bg-surface-2 text-ink-3',
          )}
        >
          {sensitive ? <Lock className="size-4" /> : <span className="text-[10px] font-bold tracking-wide uppercase">{String(res.service).slice(0, 3)}</span>}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink" title={res.arn}>
              {lastSegment(res.arn)}
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-3">
              {serviceLabel(res.service)}
              {res.type && !res.type.startsWith('all_') && !serviceLabel(res.service).toLowerCase().includes(res.type) ? ` ${res.type}` : ''}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-ink-3">
            {via.length === 0 ? (
              <span>Direct permission</span>
            ) : (
              <>
                <span>Through</span>
                {via.map((arn, i) => (
                  <Fragment key={arn}>
                    {i > 0 && <ArrowRight className="size-3" />}
                    <span className="font-medium text-ink-2">{lastSegment(arn)}</span>
                  </Fragment>
                ))}
              </>
            )}
            {cross && <span className="rounded-full border border-line px-1.5 text-[10.5px]">account {accountOf(res.arn)}</span>}
            {res.wildcard && <span className="rounded-full border border-line px-1.5 text-[10.5px]">wildcard</span>}
            {res.observed_activity && <span className="rounded-full bg-high-soft px-1.5 text-[10.5px] text-high">used</span>}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden w-20 @md:block" title={`Reach score ${Number(res.score).toFixed(1)} of 10`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-track">
              <span className={cn('block h-full rounded-full', res.score >= 8 ? 'bg-critical' : res.score >= 6 ? 'bg-high' : res.score >= 4 ? 'bg-medium' : 'bg-low')} style={{ width: `${Math.min(100, Number(res.score) * 10)}%` }} />
            </span>
          </span>
          <span data-numeric="" className="w-7 text-right text-[12.5px] font-semibold text-ink">
            {Number(res.score).toFixed(1)}
          </span>
          {open ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronRight className="size-4 text-ink-3" />}
        </span>
      </button>
      {open && (
        <div className="animate-fade border-t border-line bg-surface-2/50 px-4 py-3 pl-[60px]">
          {detail.slice(0, 3).map((p, k) => (
            <div key={k} className={cn(k > 0 && 'mt-3 border-t border-line pt-3')}>
              <p className="text-[12.5px] text-ink-2">{p.path_description}</p>
              <ol className="mt-2 flex flex-col gap-1">
                {(p.hops ?? []).map((hop, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
                    <span className="w-14 shrink-0 font-medium text-ink-2">{hop.edge_type === 'CAN_ASSUME' ? 'Assumes' : 'Can use'}</span>
                    <span className="min-w-0 truncate font-mono" title={hop.to_arn}>
                      {hop.to_arn}
                    </span>
                    <span className="shrink-0">· {hop.evidence === 'observed' ? 'seen in CloudTrail' : 'from IAM policy'}</span>
                  </li>
                ))}
              </ol>
              {p.limitations?.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 text-[11.5px] text-ink-3">
                  {p.limitations.map((code) => (
                    <li key={code}>· {limitationText(code)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/* ── Who can become this role ───────────────────────────────────────────── */

const PRINCIPAL_KIND = { role: 'Role', user: 'IAM user', service: 'AWS service', account: 'Whole account', federated: 'Federated', public: 'Anyone' };

function WhoCanBecome({ arn }) {
  const query = useQuery((signal) => fetchWhoCanAssume(arn, signal), [arn]);
  const data = query.data;
  if (query.isError || !data) return null;
  const principals = data.principals ?? [];
  const callers = (data.callers ?? []).filter((c) => (c.hops ?? 1) > 1);
  if (principals.length === 0 && callers.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]">
      <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-ink">Who can become this role</h3>
        {data.public_trust && (
          <Tag tone="critical" size="sm" dot>
            Anyone can assume it
          </Tag>
        )}
      </header>
      <ul className="divide-y divide-line">
        {principals.map((p) => (
          <li key={`${p.kind}-${p.value}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={p.value}>
              {p.kind === 'service' ? p.value : lastSegment(p.value) || p.value}
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-3">{PRINCIPAL_KIND[p.kind] ?? p.kind}</span>
            {!p.same_account && p.kind !== 'service' && <span className="shrink-0 rounded-full border border-line px-1.5 text-[10.5px] text-ink-3">other account</span>}
          </li>
        ))}
        {callers.map((c) => (
          <li key={c.arn} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{(c.path ?? []).map(lastSegment).join(' → ')}</span>
            <span className="shrink-0 text-[11.5px] text-ink-3">{c.hops} steps away</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── The view ───────────────────────────────────────────────────────────── */

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sensitive', label: 'Secrets & keys' },
  { value: 'cross', label: 'Other accounts' },
];

/**
 * What an attacker reaches if this credential is taken over: every resource
 * its policies allow, directly or by becoming other roles, scored by how
 * damaging it is. Read from IAM policies (allowed), with CloudTrail use marked.
 */
export function BlastRadiusView({ arn, compact = false }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState('all');
  const [openRow, setOpenRow] = useState(null);
  const query = useQuery((signal) => fetchBlastRadius(arn, { refresh: refreshKey > 0 }, signal), [arn, refreshKey]);
  const result = query.data;

  const derived = useMemo(() => {
    if (!result) return null;
    const resources = result.reachable_resources ?? [];
    const source = accountOf(result.source_arn);
    const sensitive = resources.filter(isSensitive);
    const accounts = new Set(resources.map((r) => accountOf(r.arn)).filter((a) => a && a !== source));
    const viaRoles = resources.filter((r) => (r.hops ?? 1) > 1).length;
    const used = resources.filter((r) => r.observed_activity).length;
    return { resources, sensitive, accounts, viaRoles, used };
  }, [result]);

  if (query.isError && !result) {
    if (query.error?.status === 404) {
      return (
        <EmptyState
          compact
          icon={ShieldAlert}
          title="Not in the accounts you are viewing"
          description="This credential belongs to an account or region outside your current scope. Change the scope to include it."
        />
      );
    }
    return <ErrorState compact error={query.error} onRetry={query.refetch} title="Blast radius could not be computed" />;
  }
  if (!result || !derived) return <DetailSkeleton rows={7} />;

  const name = result.source_name || lastSegment(result.source_arn);
  const total = derived.resources.length;
  const risk = RISK[result.risk_level] ?? RISK.NONE;
  const recompute = (
    <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)} disabled={query.isRefreshing}>
      {query.isRefreshing ? 'Recomputing…' : 'Recompute'}
    </Button>
  );

  if (total === 0) {
    return (
      <ClearState
        title="Nothing reachable"
        description={`No IAM policy lets ${name} reach a resource or another role in the accounts you are viewing.`}
        action={recompute}
      />
    );
  }

  const shown = derived.resources.filter((r) =>
    filter === 'sensitive' ? isSensitive(r) : filter === 'cross' ? accountOf(r.arn) && accountOf(r.arn) !== accountOf(result.source_arn) : true,
  );
  const sentence = [
    derived.sensitive.length ? `${formatNumber(derived.sensitive.length)} of them secrets, keys or roles` : null,
    derived.accounts.size ? `across ${formatNumber(derived.accounts.size + 1)} AWS accounts` : null,
    derived.viaRoles ? `${formatNumber(derived.viaRoles)} only by becoming another role` : null,
  ].filter(Boolean);

  return (
    <div className={cn('@container flex flex-col gap-4', query.isRefreshing && 'opacity-70 transition-opacity')}>
      {/* Verdict */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]">
        <div className="flex flex-col gap-5 p-5 @xl:flex-row @xl:items-center @xl:gap-7 sm:p-6">
          <div className="flex items-center gap-4">
            <Gauge score={result.blast_radius_score} level={result.risk_level} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={risk.tone} size="sm" dot>
                {risk.label} blast radius
              </Tag>
              {result.secrets_access && (
                <Tag tone="critical" size="sm">
                  Reaches secrets
                </Tag>
              )}
              {result.converging_paths && <Tag size="sm">Several routes to the same target</Tag>}
            </div>
            <p className="mt-3 text-[15px] leading-snug text-ink">
              If <span className="font-semibold">{name}</span> is taken over, an attacker can reach{' '}
              <span data-numeric="" className="font-semibold">
                {formatNumber(total)} {total === 1 ? 'resource' : 'resources'}
              </span>
              {sentence.length ? ` - ${sentence.join(', ')}.` : '.'}
            </p>
            <p className="mt-2 text-[12px] text-ink-3">
              From IAM policies: what is allowed.{' '}
              {derived.used ? `${formatNumber(derived.used)} of these were used in CloudTrail.` : 'None of it has been used in CloudTrail yet.'}{' '}
              <span title={formatDateTime(result.computed_at)}>Computed {formatRelative(result.computed_at)}.</span>{' '}
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={query.isRefreshing}
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-60"
              >
                <RefreshCw aria-hidden="true" className={cn('size-3', query.isRefreshing && 'animate-spin')} />
                {query.isRefreshing ? 'Recomputing…' : 'Recompute'}
              </button>
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-line border-t border-line @2xl:grid-cols-4 @2xl:divide-x">
          {[
            ['Reachable', total, 'resources'],
            ['Sensitive', derived.sensitive.length, 'secrets, keys, roles'],
            ['Roles it can become', (result.reachable_identities ?? []).length, 'by assuming them'],
            ['Other accounts', derived.accounts.size, derived.accounts.size ? [...derived.accounts].slice(0, 2).join(', ') : 'stays in its own'],
          ].map(([label, value, hint]) => (
            <div key={label} className="min-w-0 border-line px-5 py-3 not-last:border-b @2xl:not-last:border-b-0">
              <dt className="text-[11px] text-ink-3">{label}</dt>
              <dd data-numeric="" className={cn('mt-0.5 font-display text-[20px] leading-tight font-bold text-ink', label === 'Sensitive' && value > 0 && 'text-critical')}>
                {formatNumber(value)}
              </dd>
              <dd className="truncate text-[11px] text-ink-3">{hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Explore the attack surface */}
      {!compact && (
        <section className="hidden overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)] @3xl:block">
          <header className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
            <h3 className="text-[13.5px] font-semibold text-ink">Attack surface</h3>
            <span className="text-[12px] text-ink-3">Select any node to trace how an attacker gets there</span>
          </header>
          <BlastExplorer result={result} />
        </section>
      )}

      {/* What it can reach */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink">
            What it can reach{' '}
            <span data-numeric="" className="font-normal text-ink-3">
              {formatNumber(shown.length)}
            </span>
          </h3>
          <SegmentedControl label="Show" options={FILTERS} value={filter} onChange={setFilter} />
        </header>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">Nothing in this view.</p>
        ) : (
          <ul>
            {shown.map((res) => (
              <ResourceRow
                key={res.arn}
                res={res}
                source={result.source_arn}
                paths={result.paths ?? []}
                open={openRow === res.arn}
                onToggle={() => setOpenRow((cur) => (cur === res.arn ? null : res.arn))}
              />
            ))}
          </ul>
        )}
      </section>

      {String(result.source_arn).includes(':role/') && <WhoCanBecome arn={result.source_arn} />}
    </div>
  );
}
