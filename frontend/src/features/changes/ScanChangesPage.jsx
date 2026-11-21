import { useMemo, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GitCompareArrows, History, SearchX } from 'lucide-react';
import { fetchScanChanges, fetchScans, scanChangesRoute } from '../../lib/api/changes';
import { formatDateTime, formatDuration, formatNumber, formatRelative, parseDate } from '../../lib/format';
import { NEUTRAL_SERIES, SERIES_TOKENS } from '../../lib/domain';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TooltipCard } from '../../charts/ChartTooltip';
import { useQuery } from '../../lib/hooks';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { ListSkeleton, Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { cn } from '../../ui/cn';
import { useSync } from '../sync/SyncContext';
import { CHANGE_META, CHANGE_TYPES, ENTITY_META, ENTITY_TYPES } from './parts';
import { ChangesExplorer } from './ChangesExplorer';
import { groupChanges, groupRisk } from './story';


/* How long the scan ran; null unless both ends are recorded and differ (the
   scanner stamps both with one time when it does not track the start). */
function scanDuration(scan) {
  const start = parseDate(scan?.startedAt);
  const end = parseDate(scan?.completedAt);
  return start && end && end > start ? formatDuration(start, end) : null;
}

/**
 * `/scans/:scanId/changes` - everything one discovery scan found had changed
 * since the scan before it, within the selected accounts and regions. Opened
 * from "View all changes" on the dashboard; the scan picker moves between
 * recent scans. Filters and page live in the URL.
 */
export default function ScanChangesPage() {
  const { scanId } = useParams();
  const sync = useSync();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const changeType = CHANGE_TYPES.includes(searchParams.get('change_type')) ? searchParams.get('change_type') : '';
  const entityType = ENTITY_TYPES.includes(searchParams.get('entity_type')) ? searchParams.get('entity_type') : '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageLimit = [10, 25, 50, 100].includes(Number(searchParams.get('limit'))) ? Number(searchParams.get('limit')) : 100;
  /* Risk is read from each change's details in the browser, so "High risk
     only" reads the largest page the API serves and filters that.
     ponytail: page-local filter; move risk into the query if scans exceed 100 changes routinely. */
  const highRisk = searchParams.get('risk') === 'high';
  const limit = highRisk ? 100 : pageLimit;

  const query = useQuery(
    (signal) => fetchScanChanges({ scanId, changeType, entityType, page, limit }, signal),
    [scanId, changeType, entityType, page, limit],
    { keepPrevious: true },
  );
  const scansQuery = useQuery((signal) => fetchScans({ limit: 20 }, signal), []);

  const setParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patch)) next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => setParams({ change_type: '', entity_type: '', risk: '' });

  /* Counts that follow the other filter. With the list narrowed to one
     entity type (the Identities page's "Review the changes" opens it that
     way), "Created (12)" counted every entity type and so promised rows the
     list did not have; with a change type chosen, the entity menu did the
     same. Each count now counts what its choice would actually list. */
  const countFor = (type, entity) => {
    if (!summary) return 0;
    const cross = summary.byEntityAndChange;
    if (entity && type) return cross ? cross[entity]?.[type] ?? 0 : null;
    if (entity) return summary.byEntityType[entity] ?? 0;
    if (type) return summary.byChangeType[type] ?? 0;
    return summary.total;
  };
  const listRef = useRef(null);
  const data = query.data;
  const scan = data?.scan;
  const summary = data?.summary;
  const filtered = Boolean(changeType || entityType || highRisk);
  const groups = useMemo(() => {
    const list = data?.changes ?? [];
    /* A risky group is kept whole, so a binding move still reads as one story. */
    const all = groupChanges(list);
    return highRisk ? all.filter((g) => groupRisk(g.changes)) : all;
  }, [data, highRisk]);

  const back = (
    <Button variant="secondary" as={Link} to="/overview" icon={ArrowLeft}>
      Dashboard
    </Button>
  );

  const scanOptions = useMemo(() => {
    const scans = scansQuery.data ?? [];
    const options = scans.map((item, index) => ({
      value: item.id,
      label: `${formatDateTime(item.completedAt)}${item.accountId ? ` · ${item.accountId}` : ''} · ${formatNumber(item.totalChanges)} ${item.totalChanges === 1 ? 'change' : 'changes'}${index === 0 ? ' (latest)' : ''}${item.status === 'partial' ? ' · partial scan' : ''}`,
    }));
    if (scan && !options.some((option) => option.value === scan.id)) {
      options.unshift({ value: scan.id, label: `${formatDateTime(scan.completedAt)}${scan.accountId ? ` · ${scan.accountId}` : ''}` });
    }
    return options;
  }, [scansQuery.data, scan]);

  if (query.isError && !data) {
    const missing = query.error?.status === 404 || query.error?.status === 400;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Scan changes" actions={back} />
        <Panel>
          {missing && scanId === 'latest' ? (
            /* A new workspace: no sync has finished, so there is no "latest" to show. */
            <EmptyState
              icon={History}
              title="No sync has finished yet"
              description="Changes appear here after each sync: what was added, removed or modified since the one before."
              action={
                sync.canScan ? (
                  <Button variant="primary" size="sm" onClick={sync.openPanel}>
                    Sync now
                  </Button>
                ) : null
              }
            />
          ) : missing ? (
            <EmptyState
              icon={SearchX}
              title="Scan not found"
              description="It may be outside the accounts you have selected, or the link is out of date."
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate(scanChangesRoute('latest'), { replace: true })}>
                  Show the latest scan
                </Button>
              }
            />
          ) : (
            <ErrorState error={query.error} onRetry={query.refetch} title="The scan's changes failed to load" />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Scan changes"
        lede="What discovery found had changed since the previous scan, in the accounts and regions you have selected."
        actions={
          <>
            {scanOptions.length > 1 && (
              <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
                <span className="hidden sm:inline">Scan</span>
                <Select
                  value={scan?.id ?? ''}
                  onChange={(event) => navigate(scanChangesRoute(event.target.value))}
                  options={scanOptions}
                  aria-label="Choose a scan"
                  className="max-w-full sm:max-w-[27rem]"
                />
              </label>
            )}
            {back}
          </>
        }
      />

      {!data ? (
        <Panel prominence="lead">
          <div className="grid gap-4 @min-[52rem]:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-20 rounded-[var(--radius-control)]" />
            ))}
          </div>
          <span role="status" className="sr-only">
            Loading scan changes
          </span>
        </Panel>
      ) : (
        <SummaryPanel scan={scan} summary={summary} />
      )}


      <Panel ref={listRef} prominence="lead" flush className="scroll-mt-28 overflow-hidden" data-list-top="">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <SegmentedControl
            label="Change type"
            value={changeType || 'all'}
            onChange={(value) => setParams({ change_type: value === 'all' ? '' : value })}
            options={[
              { value: 'all', label: `All${summary ? ` (${formatNumber(countFor('', entityType))})` : ''}` },
              ...CHANGE_TYPES.map((type) => {
                const n = countFor(type, entityType);
                return { value: type, label: `${CHANGE_META[type].filter}${summary && n !== null ? ` (${formatNumber(n)})` : ''}` };
              }),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              value={entityType}
              onChange={(event) => setParams({ entity_type: event.target.value })}
              aria-label="Entity type"
              className="min-w-[11rem]"
              options={[
                { value: '', label: 'All entity types' },
                ...ENTITY_TYPES.map((type) => {
                  const n = countFor(changeType, type);
                  return { value: type, label: `${ENTITY_META[type].plural}${summary && n !== null ? ` (${formatNumber(n)})` : ''}` };
                }),
              ]}
            />
            <Button
              variant={highRisk ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={highRisk}
              onClick={() => setParams({ risk: highRisk ? '' : 'high' })}
            >
              High risk only
            </Button>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>


        {!data ? (
          <div className="p-5">
            <ListSkeleton rows={6} />
          </div>
        ) : groups.length === 0 ? (
          highRisk && data.changes.length > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No high-risk change on this page"
              description="No wildcard, risky action, new role or key, or deleted role among these changes."
              action={
                <Button variant="secondary" size="sm" onClick={() => setParams({ risk: '' })}>
                  Show every change
                </Button>
              }
            />
          ) : (
            <NoChanges scan={scan} summary={summary} filtered={filtered} onClear={clearFilters} />
          )
        ) : (
          <div aria-busy={query.isRefreshing || undefined} className={cn('@container transition-opacity', (query.isRefreshing || query.isLoading) && 'opacity-60')}>
            <ChangesExplorer changes={groups.flatMap((group) => group.changes)} />
          </div>
        )}
        {highRisk && data && data.pagination.total > data.pagination.limit && (
          <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3 sm:px-5">
            High-risk changes among the {formatNumber(data.pagination.limit)} changes on this page; use the pages below for the rest.
          </p>
        )}

        {data && data.pagination.total > 0 && (
          <Pagination
            page={data.pagination.page}
            pageSize={data.pagination.limit}
            total={data.pagination.total}
            unit={data.pagination.total === 1 ? 'change' : 'changes'}
            onPageChange={(value) => setParams({ page: value })}
            onPageSizeChange={(value) => setParams({ limit: value === 100 ? '' : value, page: '' })}
          />
        )}
      </Panel>

      {(scansQuery.data?.length ?? 0) >= 2 && (
        <ScanHistory scans={scansQuery.data} currentId={scan?.id} onOpen={(id) => navigate(scanChangesRoute(id))} />
      )}
    </div>
  );
}

/**
 * The scan in one line: when it finished, what it was compared with, and how
 * many changes it found. The counts per change and entity type live on the
 * filters above the list, so they are not repeated here as tiles.
 */
function SummaryPanel({ scan, summary }) {
  const first = !scan?.previousScanId;
  const duration = scanDuration(scan);
  const fact = 'flex min-w-0 flex-col gap-0.5';
  return (
    <section aria-label="Scan" className="animate-rise flex flex-wrap items-stretch gap-x-10 gap-y-4 rounded-[var(--radius-panel)] border border-line bg-surface px-5 py-4">
      <div className={fact}>
        <span className="text-[12px] text-ink-3">Scan finished</span>
        <span className="text-[14px] font-semibold text-ink" title={formatDateTime(scan.completedAt)}>
          {formatDateTime(scan.completedAt)}
        </span>
        <span className="text-[12px] text-ink-3">
          {formatRelative(scan.completedAt)}
          {duration ? ` · ran ${duration}` : ''}
          {scan.status === 'partial' ? ' · partial scan' : ''}
        </span>
      </div>
      <div className={fact}>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <GitCompareArrows aria-hidden="true" className="size-3.5" /> Compared with
        </span>
        <span className="text-[14px] font-medium text-ink">{first ? 'Nothing: first scan' : formatDateTime(scan.previousScanAt)}</span>
        {!first && <span className="text-[12px] text-ink-3">the previous scan</span>}
      </div>
      {scan.accountId && (
        <div className={fact}>
          <span className="text-[12px] text-ink-3">Account</span>
          <span className="font-mono text-[13.5px] text-ink">{scan.accountId}</span>
        </div>
      )}
      <div className={cn(fact, 'ml-auto text-right')}>
        <span className="text-[12px] text-ink-3">Changes found</span>
        <span data-numeric="" className="text-[22px] leading-tight font-semibold text-ink">
          {formatNumber(summary.total)}
        </span>
      </div>
    </section>
  );
}

/**
 * Changes found by each recent scan, oldest to newest: a spike is drift worth
 * opening. The scan on screen is the accent bar, the rest are context; a bar
 * opens its scan.
 */
function ScanHistory({ scans, currentId, onOpen }) {
  const data = useMemo(
    () =>
      [...scans].reverse().map((item) => ({
        id: item.id,
        label: item.completedAt
          ? new Date(item.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : item.id,
        at: item.completedAt,
        changes: item.totalChanges,
      })),
    [scans],
  );
  const total = data.reduce((sum, row) => sum + row.changes, 0);
  return (
    <Panel prominence="quiet" className="animate-rise">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">Changes per scan</p>
        <p className="text-[12px] text-ink-3" data-numeric="">
          {formatNumber(total)} changes across the last {formatNumber(data.length)} scans · select a bar to open that scan
        </p>
      </div>
      <div className="mt-3 h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--t-chart-grid)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--t-chart-axis)', fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: 'var(--t-chart-grid)' }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: 'var(--t-chart-axis)', fontSize: 10.5 }} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--t-chart-grid)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                return (
                  <TooltipCard
                    title={row.at ? formatDateTime(row.at) : row.id}
                    subtitle={row.id === currentId ? 'Shown below' : 'Select to open'}
                    rows={[{ label: 'Changes', value: formatNumber(row.changes), color: row.id === currentId ? SERIES_TOKENS[0] : NEUTRAL_SERIES }]}
                  />
                );
              }}
            />
            <Bar dataKey="changes" radius={[3, 3, 0, 0]} maxBarSize={30} onClick={(row) => row?.id && row.id !== currentId && onOpen(row.id)} style={{ cursor: 'pointer' }}>
              {data.map((row) => (
                <Cell key={row.id} fill={row.id === currentId ? SERIES_TOKENS[0] : NEUTRAL_SERIES} fillOpacity={row.id === currentId ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function NoChanges({ scan, summary, filtered, onClear }) {
  if (filtered && summary.total > 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No change matches these filters"
        description="This scan has changes, just none of this kind."
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  if (!scan?.previousScanId) {
    return (
      <EmptyState
        icon={History}
        title="First scan completed"
        description="There was nothing to compare it with. Changes appear here after the next scan."
      />
    );
  }
  return (
    <EmptyState
      icon={GitCompareArrows}
      title="No changes detected"
      description="Everything in your selected accounts and regions matched the previous scan."
    />
  );
}
