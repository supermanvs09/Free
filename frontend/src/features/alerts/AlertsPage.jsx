import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, FileWarning, KeyRound, ShieldAlert } from 'lucide-react';
import { fetchAlerts } from '../../lib/api/alerts';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useAccess } from '../../app/useAccess';
import { PageHeader } from '../../shell/PageHeader';
import { SearchInput } from '../../ui/Field';
import { ListSkeleton } from '../../ui/Skeleton';
import { ClearState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { ScoreShift, detectorLabel, dropSeverity } from './parts';

const RAIL = { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium' };

function Stat({ label, value, hint, tone }) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{label}</p>
      <p data-numeric="" className={cn('mt-1.5 truncate font-display text-[28px] leading-none font-bold tracking-tight text-ink', tone)}>
        {value}
      </p>
      {hint && <p className="mt-1.5 truncate text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

function DropRow({ d }) {
  const sev = dropSeverity(d.delta, d.band_before, d.band_now);
  const more = Math.max(0, (d.new_failing_checks || 0) - 1);
  return (
    <li>
      <Link
        to={`/alerts/identities/${encodeURIComponent(d.identity_id)}`}
        className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 py-4 pr-4 pl-6 transition-colors hover:bg-surface-2/70 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto_auto] sm:pr-5"
      >
        <span aria-hidden="true" className={cn('absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full', RAIL[sev.key])} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-ink group-hover:text-brand">{d.identity_name || d.identity_id}</span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-3">
            {identityTypeLabel(d.identity_type)} · {d.account_id}
          </span>
        </span>
        <span className="col-span-2 min-w-0 sm:col-span-1">
          {d.top_reason ? (
            <>
              <span className="block truncate text-[13px] text-ink-2">{d.top_reason}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3">
                {d.top_points ? `−${d.top_points} points` : ''}
                {more ? ` · and ${more} more ${more === 1 ? 'change' : 'changes'}` : ''}
              </span>
            </>
          ) : (
            <span className="block text-[13px] text-ink-3">Score recalculated lower; open to see what changed.</span>
          )}
        </span>
        <span className="flex items-center gap-3 sm:justify-end">
          <ScoreShift before={d.score_before} now={d.score_now} />
          <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums', sev.tone === 'critical' ? 'bg-critical-soft text-critical' : sev.tone === 'high' ? 'bg-high-soft text-high' : 'bg-medium-soft text-medium')}>
            {d.delta}
          </span>
        </span>
        <span className="hidden items-center gap-3 text-[12px] text-ink-3 sm:flex">
          <span title={formatDateTime(d.detected_at)}>{formatRelative(d.detected_at)}</span>
          <ChevronRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}

function ExposureRow({ e }) {
  const tier = String(e.risk_tier || e.severity || '').toUpperCase();
  const tone = tier === 'CRITICAL' ? 'critical' : tier === 'HIGH' ? 'high' : tier === 'MEDIUM' ? 'medium' : 'neutral';
  return (
    <li>
      <Link
        to={`/exposure?search=${encodeURIComponent(e.file_path || e.repository || '')}`}
        className="group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-4 pr-4 pl-6 transition-colors hover:bg-surface-2/70 sm:pr-5"
      >
        <span aria-hidden="true" className={cn('absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full', tone === 'neutral' ? 'bg-line-strong' : RAIL[tone] ?? 'bg-medium')} />
        <span className="grid size-9 place-items-center rounded-[10px] border border-line bg-surface-2 text-ink-2">
          <KeyRound className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-ink group-hover:text-brand">{detectorLabel(e.detector)}</span>
            {e.new && (
              <Tag size="sm" tone="brand">
                New
              </Tag>
            )}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-3" title={`${e.repository}/${e.file_path}:${e.line_number}`}>
            {e.repository}/{e.file_path}:{e.line_number}
          </span>
        </span>
        <span className="flex items-center gap-3 text-[12px] text-ink-3">
          {tier && (
            <Tag size="sm" tone={tone} dot>
              {tier.charAt(0) + tier.slice(1).toLowerCase()}
            </Tag>
          )}
          <span className="hidden sm:inline">{e.platform}</span>
          <ArrowUpRight className="size-4" />
        </span>
      </Link>
    </li>
  );
}

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'drops', label: 'Score drops' },
  { value: 'exposures', label: 'Exposed credentials' },
];

/**
 * What got worse at the latest sync: identities whose posture score fell
 * (each opens the full why), and credentials found in code.
 */
export default function AlertsPage() {
  const { exposureEnabled } = useWorkspace();
  const { can } = useAccess();
  const showExposure = exposureEnabled && can('exposure.view');
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'all';
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const query = useQuery((signal) => fetchAlerts(signal), []);
  const data = query.data;

  const drops = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.score_drops ?? []).filter((d) => !term || [d.identity_name, d.identity_arn, d.top_reason, d.account_id].some((v) => String(v ?? '').toLowerCase().includes(term)));
  }, [data, q]);
  const exposures = useMemo(() => {
    const term = q.trim().toLowerCase();
    return showExposure ? (data?.exposures ?? []).filter((e) => !term || [e.detector, e.repository, e.file_path, e.author].some((v) => String(v ?? '').toLowerCase().includes(term))) : [];
  }, [data, q, showExposure]);

  const summary = data?.summary;
  const lost = (data?.score_drops ?? []).reduce((n, d) => n + Math.abs(d.delta), 0);
  const worst = data?.score_drops?.[0];
  const lede = summary?.last_sync
    ? `Compared at the sync ${formatRelative(summary.last_sync)}${summary.previous_sync ? ` against the one on ${formatDateTime(summary.previous_sync)}` : ''}.`
    : 'What got worse since the previous sync.';

  const showDrops = view !== 'exposures';
  const showExp = view !== 'drops' && showExposure;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Alerts" lede={lede} />

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !data ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <>
          <section aria-label="Summary" className="animate-rise grid grid-cols-1 divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              label="Scores dropped"
              value={formatNumber(summary.score_drops)}
              hint={summary.score_drops ? `${formatNumber(lost)} points lost across ${summary.score_drops === 1 ? 'one identity' : 'them'}` : 'No identity got worse'}
              tone={summary.score_drops ? 'text-critical' : undefined}
            />
            <Stat
              label="Biggest drop"
              value={worst ? worst.delta : '-'}
              hint={worst ? `${worst.identity_name}: ${worst.score_before} → ${worst.score_now}` : 'Nothing fell'}
            />
            {showExposure ? (
              <Stat
                label="Exposed credentials"
                value={formatNumber(summary.exposures)}
                hint={summary.new_exposures ? `${formatNumber(summary.new_exposures)} new since the previous sync` : 'None new since the previous sync'}
              />
            ) : (
              <Stat label="Exposed credentials" value="-" hint="Connect a code source to scan for leaked credentials" />
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl
              label="Show"
              options={showExposure ? VIEWS : VIEWS.slice(0, 2)}
              value={view}
              onChange={(v) => setParams(v === 'all' ? {} : { view: v }, { replace: true })}
            />
            <SearchInput size="sm" value={q} onChange={setQ} placeholder="Search identity, reason or file…" className="w-full sm:w-80" aria-label="Search alerts" />
          </div>

          {showDrops && (
            <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface" aria-label="Score drops">
              <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <ShieldAlert className="size-4 text-ink-3" />
                  Score drops
                  <span data-numeric="" className="font-normal text-ink-3">
                    {formatNumber(drops.length)}
                  </span>
                </h2>
                <span className="hidden text-[12px] text-ink-3 sm:block">Worst first · open one to see exactly where the points went</span>
              </header>
              {drops.length === 0 ? (
                <ClearState
                  compact
                  title={q ? 'No score drop matches' : 'No score dropped at the last sync'}
                  description={q ? 'Try another search.' : 'Every identity scored the same or better than at the sync before.'}
                  action={!q && (
                    <button type="button" className="text-[12.5px] font-medium text-brand hover:underline" onClick={() => navigate('/posture')}>
                      Open Posture
                    </button>
                  )}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {drops.map((d) => (
                    <DropRow key={d.identity_id} d={d} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {showExp && (
            <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface" aria-label="Exposed credentials">
              <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5">
                <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <FileWarning className="size-4 text-ink-3" />
                  Exposed credentials
                  <span data-numeric="" className="font-normal text-ink-3">
                    {formatNumber(exposures.length)}
                  </span>
                </h2>
                <Link to="/exposure" className="text-[12px] font-medium text-brand hover:underline">
                  Open Credential exposure
                </Link>
              </header>
              {!summary.exposure_available ? (
                <ClearState compact title="Exposure findings could not be read" description="The scanner's tables are not available for this workspace yet." />
              ) : exposures.length === 0 ? (
                <ClearState compact title={q ? 'No credential matches' : 'No exposed credential'} description={q ? 'Try another search.' : 'Nothing that looks like a live credential was found in your code.'} />
              ) : (
                <ul className="divide-y divide-line">
                  {exposures.map((e) => (
                    <ExposureRow key={e.finding_id} e={e} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {summary ? `${summary.score_drops} score drops` : ''}
      </span>
    </div>
  );
}
