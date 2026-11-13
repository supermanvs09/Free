import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Dna, FileWarning, ShieldAlert } from 'lucide-react';
import { fetchAlerts } from '../../lib/api/alerts';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { genomeRoute } from '../../lib/identityLinks';
import { useAccess } from '../../app/useAccess';
import { useWorkspace } from '../../app/WorkspaceContext';
import { PageHeader } from '../../shell/PageHeader';
import { SearchInput } from '../../ui/Field';
import { ListSkeleton } from '../../ui/Skeleton';
import { ClearState, ErrorState } from '../../ui/States';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { ScoreShift } from './parts';

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

const SOURCES = {
  posture: { label: 'Posture', icon: ShieldAlert, what: 'Score drop' },
  genome: { label: 'NHI Genome', icon: Dna, what: 'Behaviour anomaly' },
  exposure: { label: 'Credential exposure', icon: FileWarning, what: 'Exposed credential' },
};
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEV = {
  critical: { label: 'Critical', dot: 'bg-critical', soft: 'bg-critical-soft text-critical' },
  high: { label: 'High', dot: 'bg-high', soft: 'bg-high-soft text-high' },
  medium: { label: 'Medium', dot: 'bg-medium', soft: 'bg-medium-soft text-medium' },
  low: { label: 'Low', dot: 'bg-low', soft: 'bg-low-soft text-low' },
};

const linkOf = (a) => (a.source === 'genome' && a.facts ? `${genomeRoute(a.facts.source_type, a.facts.identity_name)}?tab=anomalies` : a.link);

/* ── One row ────────────────────────────────────────────────────────────── */

function Row({ a, selected, onSelect }) {
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn('relative flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3.5 transition-colors', selected ? 'bg-info-soft/55' : 'hover:bg-surface-2/70')}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', sev.dot)} title={sev.label} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink">{a.subject}</span>
          <span className="ml-auto shrink-0 text-[11px] text-ink-3" title={formatDateTime(a.detected_at)}>
            {formatRelative(a.detected_at)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{a.title}</span>
        <span className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-3">
          <src.icon className="size-3.5" />
          <span className="truncate">{src.label}</span>
        </span>
      </span>
    </div>
  );
}

/* ── The preview ────────────────────────────────────────────────────────── */

function Preview({ a }) {
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-line px-6 pt-5 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', sev.soft)}>{sev.label}</span>
          <span className="flex items-center gap-1.5 text-ink-3">
            <src.icon className="size-3.5" /> {src.what}
          </span>
          <span className="text-ink-3" title={formatDateTime(a.detected_at)}>
            · detected {formatRelative(a.detected_at)}
          </span>
        </div>
        <h2 className="mt-3 text-[18px] leading-snug font-semibold text-ink">{a.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{a.subject}</span>
          {a.subject_type ? ` · ${a.source === 'exposure' ? a.subject_type : identityTypeLabel(a.subject_type)}` : ''}
          {a.account_id ? ` · ${a.account_id}` : ''}
        </p>
      </header>

      <div className="px-6 py-5">
        <section className="rounded-[14px] border border-line bg-surface-2/40 p-4">
          {a.source === 'posture' && (
            <>
              <ScoreShift before={a.score_before} now={a.score_now} />
              <p className="mt-2 text-[13px] text-ink-2">{a.summary}</p>
            </>
          )}
          {a.source === 'genome' && (
            <>
              <p className="text-[13px] text-ink-2">
                <span className="font-semibold text-ink">{formatNumber(a.count)}</span> open {a.count === 1 ? 'departure' : 'departures'} from its learned baseline - {a.summary}.
              </p>
              {a.facts?.latest && <p className="mt-2 rounded-[10px] bg-surface px-3 py-2 text-[12.5px] text-ink-2">Latest: {a.facts.latest}</p>}
            </>
          )}
          {a.source === 'exposure' && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-ink-3">Where</dt>
              <dd className="truncate font-mono text-ink">{a.summary}</dd>
              {a.facts?.redacted && (
                <>
                  <dt className="text-ink-3">Value</dt>
                  <dd className="truncate font-mono text-ink-2">{a.facts.redacted}</dd>
                </>
              )}
              {a.facts?.author && (
                <>
                  <dt className="text-ink-3">Committed by</dt>
                  <dd className="truncate text-ink-2">{a.facts.author}</dd>
                </>
              )}
              {a.facts?.verification && (
                <>
                  <dt className="text-ink-3">Verified</dt>
                  <dd className="text-ink-2">{a.facts.verification.toLowerCase().replaceAll('_', ' ')}</dd>
                </>
              )}
            </dl>
          )}
          <Link to={linkOf(a)} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
            {a.source === 'posture' ? 'See exactly why the score dropped' : a.source === 'genome' ? 'Investigate in NHI Genome' : 'Open in Credential exposure'}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </section>
        <p className="mt-4 text-[12px] text-ink-3">
          {src.label} raised this {formatRelative(a.detected_at)}. It leaves this list once the cause is fixed and the next sync no longer sees it.
        </p>
      </div>
    </div>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

/**
 * Every alert from posture, NHI Genome and credential exposure in one
 * read-only list. ponytail: no status or comments (no tables of our own);
 * an alert lasts as long as its cause. Add triage back if teams need to
 * mark work done.
 */
export default function AlertsPage() {
  const { can } = useAccess();
  const { exposureEnabled } = useWorkspace();
  const showExposure = exposureEnabled && can('exposure.view');
  const [sources, setSources] = useState([]);
  const [sevs, setSevs] = useState([]);
  const [q, setQ] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const listRef = useRef(null);

  const query = useQuery((signal) => fetchAlerts(signal), []);

  const all = useMemo(() => (query.data?.alerts ?? []).filter((a) => showExposure || a.source !== 'exposure'), [query.data, showExposure]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        (sources.length === 0 || sources.includes(a.source)) &&
        (sevs.length === 0 || sevs.includes(a.severity)) &&
        (!term || [a.subject, a.title, a.summary, a.account_id].some((v) => String(v ?? '').toLowerCase().includes(term))),
    );
  }, [all, sources, sevs, q]);
  const current = shown.find((a) => a.key === selectedKey) ?? shown[0] ?? null;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.key]);

  const countBy = (field, value) => all.filter((a) => a[field] === value).length;
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const onKey = (e) => {
    if (e.target.closest('input')) return;
    const i = shown.findIndex((a) => a.key === current?.key);
    if ((e.key === 'j' || e.key === 'ArrowDown') && shown[i + 1]) {
      e.preventDefault();
      setSelectedKey(shown[i + 1].key);
    } else if ((e.key === 'k' || e.key === 'ArrowUp') && shown[i - 1]) {
      e.preventDefault();
      setSelectedKey(shown[i - 1].key);
    }
  };

  const lastSync = query.data?.summary?.last_sync;
  const lede = query.data
    ? `${formatNumber(all.length)} ${all.length === 1 ? 'alert' : 'alerts'} from score drops, behaviour anomalies and exposed credentials${lastSync ? `, as of the sync ${formatRelative(lastSync)}` : ''}.`
    : 'Score drops, behaviour anomalies and exposed credentials in one place.';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Alerts" lede={lede} />

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !query.data ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4">
          <ListSkeleton rows={8} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SOURCES)
              .filter(([k]) => k !== 'exposure' || showExposure)
              .map(([k, src]) => {
                const on = sources.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(sources, setSources, k)}
                    className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                  >
                    <src.icon className="size-3.5" />
                    {src.label}
                    <span data-numeric="" className="font-semibold">
                      {countBy('source', k)}
                    </span>
                  </button>
                );
              })}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            {SEVERITIES.map((k) => {
              const on = sevs.includes(k);
              const n = countBy('severity', k);
              if (!n && !on) return null;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(sevs, setSevs, k)}
                  className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                >
                  <span className={cn('size-1.5 rounded-full', SEV[k].dot)} />
                  {SEV[k].label}
                  <span data-numeric="" className="font-semibold">
                    {n}
                  </span>
                </button>
              );
            })}
            <SearchInput size="sm" value={q} onChange={setQ} placeholder="Search alerts, identities, accounts…" className="ml-auto w-full sm:w-72" aria-label="Search alerts" />
          </div>

          <section className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface" onKeyDown={onKey}>
            {shown.length === 0 ? (
              <ClearState
                title={q || sources.length || sevs.length ? 'No alert matches' : 'All clear'}
                description={q || sources.length || sevs.length ? 'Try another filter or search.' : 'Nothing needs attention. New alerts appear here after each sync.'}
              />
            ) : (
              <div className="flex h-[min(76vh,860px)] min-h-[540px]">
                <div
                  ref={listRef}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Alerts"
                  className={cn('min-h-0 w-full shrink-0 overflow-y-auto border-r border-line outline-none lg:block lg:w-[440px]', mobileDetail ? 'hidden' : 'block')}
                >
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 text-[11px] text-ink-3 backdrop-blur">
                    {formatNumber(shown.length)} · worst first
                    <span className="ml-auto hidden gap-1 sm:flex">
                      {['j', 'k'].map((k) => (
                        <kbd key={k} className="rounded border border-line px-1 font-mono text-[10px]">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                  {shown.map((a) => (
                    <Row
                      key={a.key}
                      a={a}
                      selected={a.key === current?.key}
                      onSelect={() => {
                        setSelectedKey(a.key);
                        setMobileDetail(true);
                      }}
                    />
                  ))}
                </div>
                <div className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', mobileDetail ? 'flex' : 'hidden')}>
                  {mobileDetail && (
                    <button type="button" onClick={() => setMobileDetail(false)} className="border-b border-line px-6 py-2.5 text-left text-[12.5px] font-medium text-brand lg:hidden">
                      ← All alerts
                    </button>
                  )}
                  {current && <Preview key={current.key} a={current} />}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
