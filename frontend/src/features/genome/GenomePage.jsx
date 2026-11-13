import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, SearchX, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { fetchAllAnomalies, fetchGenomeFleet, fetchGenomeSummary } from '../../lib/api/genome';
import { genomeRoute } from '../../lib/identityLinks';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { SERIES_TOKENS, severityMeta } from '../../lib/domain';
import { exportRowsToCsv, timestampedName } from '../../lib/csv';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { DataGrid } from '../../ui/DataGrid';
import { FacetRail, useFacetRail } from '../../ui/FacetRail';
import { SearchInput, Select } from '../../ui/Field';
import { Meter } from '../../ui/Meter';
import { Pagination } from '../../ui/Pagination';
import { Panel, PanelHeader } from '../../ui/Panel';
import { ChartSkeleton, ListSkeleton, StatStripSkeleton } from '../../ui/Skeleton';
import { MetricTile } from '../../ui/Stat';
import { EmptyState, ErrorState } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { SegmentedControl, Tabs } from '../../ui/Tabs';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { useToast } from '../../ui/Toast';
import { RecordBar, ResultCount, ShowFiltersButton, WorkArea } from '../../ui/WorkArea';
import { CompositionDonut } from '../../charts/CompositionDonut';
import { TrendChart } from '../../charts/TrendChart';
import { AnomalyDrawer } from './AnomalyDrawer';
import { AnomalyGroups } from './AnomalyGroups';
import { useAccess } from '../../app/useAccess';
import { anomalyStatusMeta, dimensionLabel, roleKindLabel, sourceTypeLabel } from './meta';

const PAGE_SIZES = [10, 25, 50, 100];
const WINDOWS = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];
const WINDOW_WORDS = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
const TAB_KEYS = ['overview', 'identities', 'anomalies'];
const DAY_MS = 86400000;

/**
 * Where an identity's baseline stands, from the genome list's baseline
 * status: active is established; anything else with activity (or a
 * baselines row) is learning; neither is not started.
 * An identity that has never made a call is not learning anything, whatever
 * its baseline row says: it reads "No activity" (and sorts with the
 * not-started ones). lastSeen is undefined when activity could not be read,
 * which never counts as "no activity".
 */
export function learningState(baseline, lastSeen) {
  const status = baseline?.status;
  if (status === 'active') return { key: 'established', label: 'Established', tone: 'low' };
  const neverActive = lastSeen !== undefined && !lastSeen;
  if (neverActive) return { key: 'none', label: 'No activity', tone: 'neutral' };
  /* Calls are coming in (or a baselines row exists) but nothing is
     established: it is learning. No day counts - the pipeline's numbers do
     not add up reliably, and "learning" is what matters. */
  if (status || lastSeen) return { key: 'learning', label: 'Learning', tone: 'medium' };
  return { key: 'none', label: 'Not started', tone: 'neutral' };
}

/** A row's last call, or undefined when the events store could not be read. */
const seenOrUnknown = (row) => (row.activityKnown ? row.lastSeen : undefined);

const BASELINE_FILTERS = [
  { value: '', label: 'Every baseline state' },
  { value: 'established', label: 'Established' },
  { value: 'learning', label: 'Learning' },
  { value: 'none', label: 'Not started or no activity' },
];

const SORTS = [
  { value: 'baseline', label: 'Sort: Baselined and learning first' },
  { value: 'risk', label: 'Sort: Risk, highest first' },
  { value: 'seen', label: 'Sort: Last call, newest first' },
  { value: 'name', label: 'Sort: Name' },
];

/**
 * NHI Genome - the fleet.
 *
 * Overview: how far the fleet has learned its normal behaviour, what departed
 * from it and where. Identities: every monitored identity from the genome's
 * own list (GET /genome/identities), with its learning progress; one opens its
 * genome, anomalies, activity and timeline. Anomalies: every departure, with
 * filters by severity and departure type, each opening its evidence.
 */
export default function GenomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const window = WINDOWS.some((entry) => entry.value === searchParams.get('window')) ? searchParams.get('window') : '24h';

  const setParams = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, String(value));
        else next.delete(key);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const summary = useQuery((signal) => fetchGenomeSummary({ window }, signal), [window]);
  const fleet = useQuery((signal) => fetchGenomeFleet({}, signal), []);
  /* The tab badge counts what the tab lists: every open anomaly, any age
     (the summary card counts only the selected window). */
  const openTotal = fleet.data ? fleet.data.items.reduce((sum, row) => sum + (Number(row.openAnomalies) || 0), 0) : undefined;

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'identities', label: 'Identities', count: fleet.data?.items.length || undefined },
    { value: 'anomalies', label: 'Anomalies', count: Number.isFinite(openTotal) && openTotal > 0 ? openTotal : undefined },
  ];

  /* A tab change starts at the top of the page, with the other tab's filters
     left behind (they belong to that list). */
  const openTab = (value, extra = {}) => {
    const next = new URLSearchParams();
    if (window !== '24h') next.set('window', window);
    if (value !== 'overview') next.set('tab', value);
    for (const [key, v] of Object.entries(extra)) if (v) next.set(key, String(v));
    setSearchParams(next, { replace: false });
    globalThis.scrollTo({ top: 0 });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="NHI Genome"
        lede="Each workload identity learns its own normal behaviour from its calls, then every call is compared with it. Open an identity to see its fingerprint, its departures and how its baseline got where it is."
        actions={
          <SegmentedControl
            label="Detection window"
            options={WINDOWS}
            value={window}
            onChange={(value) => setParams({ window: value === '24h' ? '' : value })}
          />
        }
        tabs={<Tabs size="sm" tabs={tabs} value={tab} onChange={(value) => openTab(value)} />}
      />

      {tab === 'overview' && <OverviewTab summary={summary} fleet={fleet} window={window} openTab={openTab} />}
      {tab === 'identities' && <IdentitiesTab fleet={fleet} searchParams={searchParams} setParams={setParams} />}
      {tab === 'anomalies' && <AnomaliesTab searchParams={searchParams} setParams={setParams} />}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab({ summary, fleet, window, openTab }) {
  const chartDays = window === '30d' ? 30 : window === '7d' ? 7 : 14;
  const all = useMemo(() => fleet.data?.items ?? [], [fleet.data]);

  /* Workload mix of the watched fleet, largest first. Glue jobs and crawlers
     are one family, "Glue components". Every family keeps its own slice and
     each slice opens the Identities tab on that family. */
  const mix = useMemo(() => {
    const counts = new Map();
    for (const row of all) counts.set(row.sourceType, (counts.get(row.sourceType) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, value], index) => ({ key, label: sourceTypeLabel(key), value, color: SERIES_TOKENS[index % (SERIES_TOKENS.length - 1)] }));
  }, [all]);

  const learning = useMemo(
    () =>
      all
        .map((row) => ({ row, state: learningState(row.baseline, seenOrUnknown(row)) }))
        .filter((entry) => entry.state.key === 'learning')
        .sort((a, b) => (Date.parse(b.row.lastSeen ?? '') || 0) - (Date.parse(a.row.lastSeen ?? '') || 0) || a.row.name.localeCompare(b.row.name)),
    [all],
  );

  if (summary.isError && !summary.data) {
    return (
      <Panel prominence="quiet">
        <ErrorState error={summary.error} onRetry={summary.refetch} title="The behaviour summary failed to load" />
      </Panel>
    );
  }
  if (summary.isLoading && !summary.data) return <StatStripSkeleton count={4} />;

  const { cards } = summary.data;
  const active = all.filter((row) => String(row.status || '').toLowerCase() === 'active').length;

  return (
    <>
      <SummaryCards cards={cards} window={window} learningCount={fleet.data ? learning.length : null} openTab={openTab} />

      <div className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <AnomaliesPerDay days={summary.data.anomaliesByDay} span={chartDays} generatedAt={summary.data.generatedAt} />
        <DeparturesByType departures={summary.data.departures} span={chartDays} onSelect={(dimension) => openTab('anomalies', { dim: dimension })} />
      </div>

      <div className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel prominence="quiet" className="animate-rise">
          <PanelHeader
            prominence="quiet"
            title="What is watched"
            subtitle={
              all.length
                ? `${formatNumber(all.length)} monitored identities in your scope: ${formatNumber(active)} active, ${formatNumber(all.length - active)} with another status. Select a type to list it.`
                : 'Monitored workload identities in your selected accounts and regions, by type.'
            }
          />
          {fleet.isLoading && !fleet.data ? (
            <ChartSkeleton height={184} />
          ) : fleet.isError && !fleet.data ? (
            <ErrorState compact error={fleet.error} onRetry={fleet.refetch} />
          ) : mix.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-ink-3">No workload identity is in your scope yet.</p>
          ) : (
            <CompositionDonut className="mt-4" data={mix} centerLabel="Watched" onSelect={(item) => openTab('identities', { type: item.key })} />
          )}
        </Panel>
        <LearningNow entries={learning} loading={fleet.isLoading && !fleet.data} onAll={() => openTab('identities', { baseline: 'learning' })} />
      </div>

      <div className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <MostAnomalous entries={summary.data.mostAnomalous} onAll={() => openTab('anomalies')} />
        <Panel prominence="quiet" className="animate-rise">
          <PanelHeader prominence="quiet" title="Recently baselined" subtitle="Baselines established or republished, newest first." />
          <RecentlyBaselined entries={summary.data.recentlyBaselined} />
        </Panel>
      </div>
    </>
  );
}

function SummaryCards({ cards, window, learningCount, openTab }) {
  const watched = cards.identities_watched;
  const established = cards.baselines_established;
  const open = cards.open_anomalies;
  const critical = cards.critical_anomalies;
  const coverage = Number.isFinite(watched) && watched > 0 && Number.isFinite(established) ? (established / watched) * 100 : null;
  const tiles = [
    <MetricTile
      key="established"
      as="button"
      type="button"
      onClick={() => openTab('identities', { baseline: 'established' })}
      label="Baselines established"
      value={established}
      tone="brand"
      meter={coverage}
      meterLabel="Share of watched identities with an established baseline"
      caption={Number.isFinite(watched) ? `of ${formatNumber(watched)} identities watched` : 'Normal behaviour learned and watched'}
    />,
    <MetricTile
      key="learning"
      as="button"
      type="button"
      onClick={() => openTab('identities', { baseline: 'learning' })}
      label="Still learning"
      /* Counted from the identity list when it is in: the summary's count
         also holds identities that never made a call, which are not learning. */
      value={learningCount ?? cards.still_learning}
      tone="medium"
      caption="Calls seen, no baseline yet, so no anomaly can be raised"
    />,
    <MetricTile
      key="open"
      as="button"
      type="button"
      onClick={() => openTab('anomalies')}
      label="Open anomalies"
      value={open}
      tone="high"
      caption={`Raised in the last ${WINDOW_WORDS[window]} and still open`}
    />,
    <MetricTile
      key="critical"
      as="button"
      type="button"
      onClick={() => openTab('anomalies', { sev: 'CRITICAL' })}
      label="Critical anomalies"
      value={critical}
      tone="critical"
      caption={Number.isFinite(critical) ? 'Open now and graded Critical, any age' : 'Shown once event severities can be read'}
    />,
  ];
  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[54rem]:grid-cols-4">
      {tiles.map((tile, index) => (
        <div key={tile.key} className="animate-rise" data-stagger="" style={{ '--stagger': index }}>
          {tile}
        </div>
      ))}
    </div>
  );
}

/** Anomalies raised per UTC day, open or resolved. Days without one are a measured zero. */
function AnomaliesPerDay({ days, span, generatedAt }) {
  const data = useMemo(() => {
    const counts = new Map(days.map((entry) => [String(entry.day).slice(0, 10), Number(entry.count) || 0]));
    const end = Date.parse(generatedAt ?? '') || Date.parse(days.at(-1)?.day ?? '') || 0;
    const today = Math.floor(end / DAY_MS) * DAY_MS;
    return Array.from({ length: span }, (_, index) => {
      const iso = new Date(today - (span - 1 - index) * DAY_MS).toISOString().slice(0, 10);
      const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return { label, anomalies: counts.get(iso) ?? 0 };
    });
  }, [days, span, generatedAt]);
  const total = data.reduce((sum, entry) => sum + entry.anomalies, 0);
  return (
    <Panel prominence="quiet" className="animate-rise">
      <PanelHeader prominence="quiet" title="Anomalies per day" />
      <TrendChart className="mt-3" data={data} dataKey="anomalies" label="Anomalies raised" height={168} />
      <p className="mt-1 text-[11.5px] text-ink-3">
        Last {span} days, all severities, UTC · {formatNumber(total)} in all.
      </p>
    </Panel>
  );
}

/** Open departures grouped by what departed; each row opens the Anomalies tab on that type. */
function DeparturesByType({ departures, span, onSelect }) {
  const max = departures.reduce((top, entry) => Math.max(top, Number(entry.count) || 0), 0);
  return (
    <Panel prominence="quiet" className="animate-rise">
      <PanelHeader prominence="quiet" title="Departures by type" subtitle={`Open anomalies raised in the last ${span} days, by what departed from the baseline.`} />
      {departures.length === 0 ? (
        <p className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-3">
          No open departure in this window.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {departures.map((entry) => (
            <li key={entry.dimension} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => onSelect(entry.dimension)}
                className="group flex w-full items-center gap-4 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink group-hover:text-brand">{dimensionLabel(entry.dimension)}</span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-track">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${max ? (entry.count / max) * 100 : 0}%` }} />
                  </span>
                </span>
                <span data-numeric="" className="w-8 shrink-0 text-right text-[13px] font-semibold text-ink">
                  {formatNumber(entry.count)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MostAnomalous({ entries, onAll }) {
  return (
    <Panel prominence="quiet" flush className="animate-rise overflow-hidden">
      <div className="px-4 pt-4">
        <PanelHeader
          prominence="quiet"
          title="Most anomalous identities"
          subtitle="Highest risk score from the latest scoring window first."
          actions={
            <Button variant="secondary" size="sm" onClick={onAll}>
              All anomalies
            </Button>
          }
        />
      </div>
      {entries.length === 0 ? (
        <p className="m-4 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-ink-3">
          No identity has been scored as anomalous yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
          {entries.map((entry) => {
            const severity = severityMeta(entry.severity);
            return (
              <li key={entry.id}>
                <Link
                  to={genomeRoute(entry.source_type, entry.identity_name)}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  title={entry.identity_name}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink group-hover:text-brand">
                      {entry.display_name || entry.identity_name}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {sourceTypeLabel(entry.source_type, entry.identity_name)}
                      {entry.region ? ` · ${entry.region}` : ''}
                    </span>
                  </span>
                  {Number(entry.anomalous_event_count) > 0 && (
                    <span className="shrink-0 text-[12px] text-ink-3">{formatNumber(entry.anomalous_event_count)} anomalous</span>
                  )}
                  <span data-numeric="" className="w-8 shrink-0 text-right text-[14px] font-semibold text-ink">
                    {entry.risk_score ?? '-'}
                  </span>
                  <Tag tone={severity.tone} size="sm" dot>
                    {severity.label}
                  </Tag>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Learning in progress: identities making calls whose baseline is not yet
 * established, most recently active first.
 */
function LearningNow({ entries, loading, onAll }) {
  const shown = entries.slice(0, 5);
  return (
    <Panel prominence="quiet" className="animate-rise">
      <PanelHeader
        prominence="quiet"
        title="Learning now"
        subtitle="Nothing can be flagged for these until their baseline is established."
        actions={
          entries.length > shown.length ? (
            <Button variant="link" size="sm" onClick={onAll}>
              All {formatNumber(entries.length)}
            </Button>
          ) : null
        }
      />
      {loading ? (
        <ListSkeleton rows={3} />
      ) : shown.length === 0 ? (
        <p className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-5 text-center text-[12.5px] text-ink-3">
          No identity is learning right now.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {shown.filter(({ row }) => row.openable).map(({ row }) => (
            <li key={row.id} className="py-2.5">
              <Link to={genomeRoute(row.sourceType, row.identityName)} className="group block" title={row.identityName}>
                <span className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink group-hover:text-brand">{row.name}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-3" title={row.lastSeen ? formatDateTime(row.lastSeen) : undefined}>
                    {row.lastSeen ? `Last call ${formatRelative(row.lastSeen)}` : 'Learning'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentlyBaselined({ entries }) {
  if (!entries?.length) {
    return (
      <p className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-5 text-center text-[12.5px] text-ink-3">
        No baseline has been established yet. Identities appear here as their learning period completes.
      </p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col divide-y divide-line">
      {entries.map((entry) => (
        <li key={`${entry.id}-${entry.occurred_at}`}>
          <Link to={genomeRoute(entry.source_type, entry.identity_name)} className="group flex items-center gap-2 py-2.5" title={entry.identity_name}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-ink group-hover:text-brand">
                {entry.display_name || entry.identity_name}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {sourceTypeLabel(entry.source_type, entry.identity_name)}
                {entry.region ? ` · ${entry.region}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-3" title={formatDateTime(entry.occurred_at)}>
              {formatRelative(entry.occurred_at)}
            </span>
            {entry.event === 'baseline_version_published' ? (
              <Tag tone="info" size="sm">
                {entry.version ? `Version ${entry.version}` : 'New version'}
              </Tag>
            ) : (
              <Tag tone="low" size="sm">
                Established
              </Tag>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ── Identities ───────────────────────────────────────────────────────────── */

function IdentitiesTab({ fleet, searchParams, setParams }) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const listRef = useRef(null);
  const type = searchParams.get('type') || '';
  const baselineFilter = BASELINE_FILTERS.some((f) => f.value === searchParams.get('baseline')) ? searchParams.get('baseline') : '';
  const sort = SORTS.some((s) => s.value === searchParams.get('sort')) ? searchParams.get('sort') : 'baseline';
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 25;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('q') || '');
  const search = useDebouncedValue(searchDraft, 250).trim().toLowerCase();

  const all = useMemo(() => fleet.data?.items ?? [], [fleet.data]);
  const typeOptions = useMemo(() => {
    const keys = [...new Set(all.map((row) => row.sourceType))].sort((a, b) => sourceTypeLabel(a).localeCompare(sourceTypeLabel(b)));
    return [{ value: '', label: 'All workload types' }, ...keys.map((key) => ({ value: key, label: sourceTypeLabel(key) }))];
  }, [all]);

  const filtered = useMemo(() => {
    const out = all.filter(
      (row) =>
        (!type || row.sourceType === type) &&
        (!baselineFilter || learningState(row.baseline, seenOrUnknown(row)).key === baselineFilter) &&
        (!search ||
          [row.name, row.identityName, row.workloadKey, row.accountId, row.region].some((value) => String(value ?? '').toLowerCase().includes(search))),
    );
    const time = (value) => Date.parse(value ?? '') || 0;
    /* Default order: identities with a baseline first, then those learning
       (they have calls), then the rest that have called, and identities never
       seen calling last. Within each, the most recent call first. */
    const rank = (row) => {
      const key = learningState(row.baseline, seenOrUnknown(row)).key;
      if (key === 'established') return 0;
      if (key === 'learning') return 1;
      return row.lastSeen ? 2 : 3;
    };
    const by = {
      baseline: (a, b) => rank(a) - rank(b) || time(b.lastSeen) - time(a.lastSeen),
      risk: (a, b) => (b.risk.score ?? -1) - (a.risk.score ?? -1) || (b.openAnomalies ?? 0) - (a.openAnomalies ?? 0),
      seen: (a, b) => time(b.lastSeen) - time(a.lastSeen),
      name: () => 0,
    }[sort];
    return out.sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
  }, [all, type, baselineFilter, search, sort]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, lastPage);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const filteredView = Boolean(type || baselineFilter || search);
  const toTop = () => globalThis.requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: 'start' }));

  const onExport = () => {
    exportRowsToCsv({
      filename: timestampedName('nhi-genome-identities'),
      columns: [
        { header: 'Identity', value: (row) => row.name },
        { header: 'Identity name', value: (row) => row.identityName },
        { header: 'Workload type', value: (row) => sourceTypeLabel(row.sourceType, row.nhiType) },
        { header: 'Account', value: (row) => row.accountId ?? '' },
        { header: 'Region', value: (row) => row.region ?? '' },
        { header: 'Baseline', value: (row) => learningState(row.baseline, seenOrUnknown(row)).label },
        { header: 'Risk', value: (row) => row.risk.score ?? '' },
        { header: 'Open anomalies', value: (row) => row.openAnomalies ?? '' },
        { header: 'Last call (UTC)', value: (row) => row.lastSeen ?? '' },
      ],
      rows: filtered,
    });
    notify({ title: 'Exported', description: `${formatNumber(filtered.length)} identities written.`, variant: 'success' });
  };

  const columns = [
    {
      key: 'identity',
      header: 'Identity',
      primary: true,
      width: '30%',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink" title={row.identityName}>
            {row.name}
          </span>
          <span className="block truncate text-[11.5px] text-ink-3">
            {sourceTypeLabel(row.sourceType, row.nhiType)}
            {roleKindLabel(row.roleKind) ? ` · ${roleKindLabel(row.roleKind)}` : ''}
            {row.status && String(row.status).toLowerCase() !== 'active' ? ` · ${row.status}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Account / region',
      width: '16%',
      priority: 'wide',
      cell: (row) => (
        <span className="block min-w-0">
          <span data-numeric="" className="block truncate font-mono text-[12px] text-ink-2">
            {row.accountId || '-'}
          </span>
          <span className="block truncate text-[11.5px] text-ink-3">{row.region || 'Global'}</span>
        </span>
      ),
    },
    { key: 'baseline', header: 'Baseline', width: '20%', cell: (row) => <LearningCell baseline={row.baseline} lastSeen={seenOrUnknown(row)} /> },
    {
      key: 'risk',
      header: 'Risk',
      width: '9%',
      cell: (row) => {
        if (row.risk.score === null) return <span className="text-[12px] text-ink-3">Not scored</span>;
        const severity = severityMeta(row.risk.severity);
        return (
          <span className="flex items-center gap-2">
            <span data-numeric="" className="text-[13px] font-semibold text-ink">
              {row.risk.score}
            </span>
            {row.risk.severity && <span aria-hidden="true" className="size-2 rounded-full" style={{ background: `var(--t-${severity.tone})` }} />}
          </span>
        );
      },
    },
    {
      key: 'open',
      header: 'Open anomalies',
      width: '11%',
      cell: (row) =>
        row.openAnomalies === null ? (
          <span className="text-[12px] text-ink-3">-</span>
        ) : row.openAnomalies > 0 ? (
          <span data-numeric="" className="text-[13px] font-semibold text-critical">
            {formatNumber(row.openAnomalies)}
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">None</span>
        ),
    },
    {
      key: 'last',
      header: 'Last call',
      width: '12%',
      cell: (row) =>
        row.lastSeen ? (
          <span className="whitespace-nowrap text-[12.5px] text-ink-2" title={formatDateTime(row.lastSeen)}>
            {formatRelative(row.lastSeen)}
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">Never</span>
        ),
    },
  ];

  return (
    <Panel ref={listRef} prominence="lead" flush className="animate-rise scroll-mt-28 overflow-hidden">
      <RecordBar
        trailing={
          <TableToolbar>
            <RefreshButton onRefresh={fleet.refetch} refreshing={fleet.isRefreshing} label="Refresh identities" />
            <Button variant="secondary" size="sm" icon={Download} onClick={onExport} disabled={filtered.length === 0}>
              Export
            </Button>
          </TableToolbar>
        }
      >
        <SearchInput
          size="sm"
          value={searchDraft}
          onChange={(value) => {
            setSearchDraft(value);
            setParams({ q: value.trim(), page: '' });
          }}
          placeholder="Search name, ARN, account, region…"
          className="w-full min-w-0 sm:w-64"
          aria-label="Search monitored identities"
        />
        <Select
          size="sm"
          value={type}
          onChange={(event) => {
            setParams({ type: event.target.value, page: '' });
            toTop();
          }}
          options={typeOptions}
          aria-label="Workload type"
          className="min-w-0 sm:w-48"
        />
        <Select
          size="sm"
          value={baselineFilter}
          onChange={(event) => {
            setParams({ baseline: event.target.value, page: '' });
            toTop();
          }}
          options={BASELINE_FILTERS}
          aria-label="Baseline state"
          className="min-w-0 sm:w-44"
        />
        <Select size="sm" value={sort} onChange={(event) => setParams({ sort: event.target.value === 'baseline' ? '' : event.target.value, page: '' })} options={SORTS} aria-label="Sort" className="min-w-0 sm:w-56" />
        <ResultCount
          shown={formatNumber(filtered.length)}
          total={formatNumber(all.length)}
          unit={fleet.data && !fleet.data.complete ? 'identities (first 2,000)' : 'identities'}
          filtered={filteredView}
          loading={fleet.isLoading && !fleet.data}
        />
      </RecordBar>

      {fleet.isError && !fleet.data ? (
        <ErrorState error={fleet.error} onRetry={fleet.refetch} />
      ) : (
        <DataGrid
          caption="Monitored identities"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={fleet.isLoading && !fleet.data}
          refreshing={fleet.isRefreshing}
          onRowClick={(row) => row.openable && navigate(genomeRoute(row.sourceType, row.identityName))}
          density="comfortable"
          skeletonRows={8}
          emptyState={
            filteredView ? (
              <EmptyState
                icon={SearchX}
                title="No identity matches"
                description="No monitored identity matches the search, type and baseline state."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchDraft('');
                      setParams({ q: '', type: '', baseline: '', page: '' });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ShieldQuestion}
                title="No monitored identity in your scope"
                description="The genome watches compute, functions, tasks and pipelines. None was found in the accounts and regions you selected; widen the scope or run a discovery scan."
              />
            )
          }
        />
      )}

      {/* Shown whenever there is more than one page, the same rule as every list. */}
      {filtered.length > 0 && (
        <Pagination
          page={current}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={(next) => {
            setParams({ page: next === 1 ? '' : next });
            toTop();
          }}
          onPageSizeChange={(next) => setParams({ size: next === 25 ? '' : next, page: '' })}
          unit="identities"
        />
      )}
    </Panel>
  );
}

/** Established, learning, no activity or not started. */
function LearningCell({ baseline, lastSeen }) {
  const state = learningState(baseline, lastSeen);
  if (state.key === 'established') {
    return (
      <Tag tone="low" size="sm" dot>
        Established
      </Tag>
    );
  }
  if (state.key === 'none') return <span className="text-[12px] text-ink-3">{state.label}</span>;
  return (
    <Tag tone="medium" size="sm" dot>
      Learning
    </Tag>
  );
}

/* ── Anomalies ────────────────────────────────────────────────────────────── */

const STATES = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
];

const VIEWS = [
  { value: 'groups', label: 'By identity' },
  { value: 'list', label: 'Every anomaly' },
];

function AnomaliesTab({ searchParams, setParams }) {
  const listRef = useRef(null);
  const { railOpen, toggleRail } = useFacetRail('genome-anomalies');
  const state = searchParams.get('state') === 'all' ? 'all' : 'open';
  const severities = (searchParams.get('sev') || '').split(',').filter(Boolean);
  const dimensions = (searchParams.get('dim') || '').split(',').filter(Boolean);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 25;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('q') || '');
  const search = useDebouncedValue(searchDraft, 250).trim().toLowerCase();
  const [selected, setSelected] = useState(null);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const view = searchParams.get('view') === 'list' ? 'list' : 'groups';
  const { can } = useAccess();

  const query = useQuery((signal) => fetchAllAnomalies({ state: state === 'all' ? '' : 'open' }, signal), [state]);
  const all = useMemo(() => query.data?.items ?? [], [query.data]);
  const sevOf = (item) => String(item.severity ?? '').toUpperCase();

  /* Counts follow the other filters, so each number is what that option would show. */
  const matches = useCallback(
    (item, skip) =>
      (skip === 'sev' || severities.length === 0 || severities.includes(sevOf(item))) &&
      (skip === 'dim' || dimensions.length === 0 || dimensions.includes(item.dimension)) &&
      (!search ||
        [item.identity?.display_name, item.identity?.identity_name, item.what_changed, item.region].some((v) =>
          String(v ?? '').toLowerCase().includes(search),
        )),
    [severities, dimensions, search],
  );
  const filtered = useMemo(() => all.filter((item) => matches(item)), [all, matches]);
  const countBy = (skip, key) => {
    const out = new Map();
    for (const item of all) if (matches(item, skip)) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
    return out;
  };
  const sevCounts = countBy('sev', sevOf);
  const dimCounts = countBy('dim', (item) => item.dimension);
  const dimKeys = [...new Set([...all.map((item) => item.dimension), ...dimensions])].sort((a, b) => dimensionLabel(a).localeCompare(dimensionLabel(b)));

  const toggle = (param, list, value) => {
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    setParams({ [param]: next.join(','), page: '' });
  };
  const applied = severities.length + dimensions.length;
  const facetGroups = [
    {
      key: 'sev',
      label: 'Severity',
      options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => ({
        value: sev,
        label: severityMeta(sev).label,
        count: sevCounts.get(sev) ?? 0,
        active: severities.includes(sev),
      })),
      onToggle: (value) => toggle('sev', severities, value),
      note: 'Severity follows detection confidence, so a low-confidence departure never outranks a certain one.',
    },
    {
      key: 'dim',
      label: 'Departure type',
      options: dimKeys.map((dim) => ({ value: dim, label: dimensionLabel(dim), count: dimCounts.get(dim) ?? 0, active: dimensions.includes(dim) })),
      onToggle: (value) => toggle('dim', dimensions, value),
    },
  ];

  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, lastPage);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const toTop = () => globalThis.requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: 'start' }));

  const columns = [
    {
      key: 'identity',
      header: 'Identity',
      primary: true,
      width: '22%',
      cell: (item) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink" title={item.identity?.identity_name}>
            {item.identity?.display_name || item.identity?.identity_name}
          </span>
          <span className="block truncate text-[11.5px] text-ink-3">{sourceTypeLabel(item.identity?.source_type, item.identity?.identity_name)}</span>
        </span>
      ),
    },
    {
      key: 'what',
      header: 'What departed',
      width: '30%',
      cell: (item) => (
        <span className="block truncate text-[12.5px] text-ink-2" title={item.what_changed}>
          {item.what_changed}
        </span>
      ),
    },
    { key: 'type', header: 'Type', width: '12%', priority: 'wide', hideWithRail: true, cell: (item) => <Tag size="sm">{dimensionLabel(item.dimension)}</Tag> },
    {
      key: 'confidence',
      header: 'Confidence',
      width: '11%',
      priority: 'wide',
      cell: (item) =>
        Number.isFinite(item.provenance_confidence) ? (
          <span className="block w-full max-w-[6rem]">
            <span data-numeric="" className="text-[12.5px] font-semibold text-ink">
              {item.provenance_confidence}%
            </span>
            <Meter className="mt-1" value={item.provenance_confidence} tone={severityMeta(item.severity).tone} height={4} />
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">-</span>
        ),
    },
    {
      key: 'severity',
      header: 'Severity',
      width: '9%',
      cell: (item) => {
        const meta = severityMeta(item.severity);
        return item.severity ? (
          <Tag tone={meta.tone} size="sm" dot>
            {meta.label}
          </Tag>
        ) : (
          <span className="text-[12px] text-ink-3">-</span>
        );
      },
    },
    {
      key: 'state',
      header: 'State',
      width: '8%',
      cell: (item) => {
        const meta = anomalyStatusMeta(item.state);
        return (
          <Tag tone={meta.tone} size="sm">
            {meta.label}
          </Tag>
        );
      },
    },
    {
      key: 'detected',
      header: 'Detected',
      width: '13%',
      cell: (item) => (
        <span className="whitespace-nowrap text-[12px] text-ink-2" title={formatDateTime(item.detected_at)}>
          {formatRelative(item.detected_at)}
        </span>
      ),
    },
  ];

  return (
    <WorkArea
      railOpen={railOpen}
      rail={
        <FacetRail
          groups={facetGroups}
          appliedCount={applied}
          onClearAll={() => setParams({ sev: '', dim: '', page: '' })}
          onClose={toggleRail}
          mobileTitle="Filter anomalies"
        />
      }
    >
      <Panel ref={listRef} prominence="lead" flush className="animate-rise scroll-mt-28 overflow-hidden">
        <RecordBar
          trailing={
            <TableToolbar>
              {!railOpen && <ShowFiltersButton onClick={toggleRail} appliedCount={applied} />}
              <SegmentedControl label="How to show anomalies" options={VIEWS} value={view} onChange={(value) => setParams({ view: value === 'groups' ? '' : value, page: '' })} />
              <SegmentedControl label="Which anomalies" options={STATES} value={state} onChange={(value) => setParams({ state: value === 'open' ? '' : value, page: '' })} />
              <RefreshButton onRefresh={query.refetch} refreshing={query.isRefreshing} label="Refresh anomalies" />
            </TableToolbar>
          }
        >
          <SearchInput
            size="sm"
            value={searchDraft}
            onChange={(value) => {
              setSearchDraft(value);
              setParams({ q: value.trim(), page: '' });
            }}
            placeholder="Search identity or what departed…"
            className="w-full min-w-0 sm:w-72"
            aria-label="Search anomalies"
          />
          <ResultCount
            shown={formatNumber(filtered.length)}
            total={formatNumber(all.length)}
            unit={query.data && !query.data.complete ? 'anomalies (newest 1,000)' : state === 'open' ? 'open anomalies' : 'anomalies'}
            filtered={applied > 0 || Boolean(search)}
            loading={query.isLoading && !query.data}
          />
        </RecordBar>
        {(() => {
          const emptyState = (

              applied > 0 || search ? (
                <EmptyState
                  icon={SearchX}
                  title="No anomaly matches"
                  description="No anomaly matches the search and filters."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearchDraft('');
                        setParams({ q: '', sev: '', dim: '', page: '' });
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title={state === 'open' ? 'No open anomalies' : 'No anomalies recorded'}
                  description={
                    state === 'open'
                      ? 'Nothing is waiting for review. Choose All to see the ones already reviewed.'
                      : 'Everything the watched identities did matched their normal behaviour.'
                  }
                />
              )
          );
          if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
          if (view === 'groups') {
            if (query.isLoading && !query.data) return <div className="p-4"><ListSkeleton rows={5} /></div>;
            return (
              <AnomalyGroups
                items={filtered}
                canAct={can('anomalies.review')}
                onChanged={query.refetch}
                onOpen={(item, pattern) => {
                  setSelected(item);
                  setSelectedPattern(pattern ?? null);
                }}
                emptyState={emptyState}
                onSeverity={(list) => setParams({ sev: list.join(','), page: '' })}
              />
            );
          }
          return (
            <DataGrid
              caption="Anomalies"
              columns={columns}
              rows={rows}
              rowKey={(item) => item.id}
              loading={query.isLoading && !query.data}
              refreshing={query.isRefreshing}
              onRowClick={(item) => {
                setSelected(item);
                setSelectedPattern(null);
              }}
              railOpen={railOpen}
              density="comfortable"
              skeletonRows={8}
              emptyState={emptyState}
            />
          );
        })()}
        {view === 'list' && filtered.length > 0 && (
          <Pagination
            page={current}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={(next) => {
              setParams({ page: next === 1 ? '' : next });
              toTop();
            }}
            onPageSizeChange={(next) => setParams({ size: next === 25 ? '' : next, page: '' })}
            unit="anomalies"
          />
        )}
      </Panel>
      <AnomalyDrawer anomaly={selected} pattern={selectedPattern} onClose={() => setSelected(null)} onReviewed={query.refetch} />
    </WorkArea>
  );
}

