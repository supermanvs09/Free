import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowLeft, GitCompareArrows, History, SearchX, ShieldAlert, ShieldCheck } from 'lucide-react';
import { fetchScanChanges, fetchScans, scanChangesRoute } from '../../lib/api/changes';
import { formatDateTime, formatDuration, formatNumber, formatRelative, parseDate } from '../../lib/format';
import { NEUTRAL_SERIES, SERIES_TOKENS } from '../../lib/domain';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TooltipCard } from '../../charts/ChartTooltip';
import { useQuery } from '../../lib/hooks';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { SearchInput, Select } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { ListSkeleton, Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { cn } from '../../ui/cn';
import { useSync } from '../sync/SyncContext';
import { CHANGE_META, CHANGE_TYPES, ENTITY_META, ENTITY_TYPES } from './parts';
import { ChangesExplorer, useChangeGroups } from './ChangesExplorer';

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
  const showList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const data = query.data;
  const scan = data?.scan;
  const summary = data?.summary;
  const filtered = Boolean(changeType || entityType || highRisk);
  const [search, setSearch] = useState('');
  /* A risky group is kept whole, so a binding move still reads as one story. */
  const allGroups = useChangeGroups(data?.changes ?? [], search);
  const groups = highRisk ? allGroups.filter((g) => g.impact === 'raised') : allGroups;

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
          <Skeleton className="h-28 rounded-[var(--radius-control)]" />
          <span role="status" className="sr-only">
            Loading scan changes
          </span>
        </Panel>
      ) : (
        <Verdict
          scan={scan}
          summary={summary}
          groups={allGroups}
          partial={data.pagination.total > data.changes.length}
          scans={scansQuery.data ?? []}
          onOpenScan={(id) => navigate(scanChangesRoute(id))}
          onRaised={() => {
            setParams({ risk: 'high' });
            showList();
          }}
        />
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
            <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search resources and changes" aria-label="Search changes" className="w-60" />
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
              Raised risk only
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
          search.trim() && data.changes.length > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No change matches your search"
              description="Search looks at resource names, ARNs and what changed."
              action={
                <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              }
            />
          ) : highRisk && data.changes.length > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No change on this page raised risk"
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
            <ChangesExplorer groups={groups} />
          </div>
        )}
        {highRisk && data && data.pagination.total > data.pagination.limit && (
          <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3 sm:px-5">
            Changes that raised risk among the {formatNumber(data.pagination.limit)} on this page; use the pages below for the rest.
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
    </div>
  );
}

/**
 * The answer first: did this scan make us riskier? One sentence, the three
 * impact counts (each opens what it counts), the facts that frame the
 * comparison, and the changes-per-scan chart beside it so a spike stands out.
 */
function Verdict({ scan, summary, groups, partial, scans, onOpenScan, onRaised }) {
  const raised = groups.filter((g) => g.impact === 'raised');
  const critical = raised.filter((g) => g.risk?.level === 'critical').length;
  const reduced = groups.filter((g) => g.impact === 'reduced').length;
  const other = groups.length - raised.length - reduced;
  const first = !scan?.previousScanId;
  const duration = scanDuration(scan);
  const where = partial ? ' on this page' : '';
  const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;

  let headline;
  if (first) headline = 'First scan: nothing to compare with yet';
  else if (summary.total === 0) headline = 'Nothing changed since the previous scan';
  else if (raised.length) headline = `${plural(raised.length, 'resource', 'resources')} gained risk in this scan${where}`;
  else headline = `No change raised risk${where}`;
  const Icon = raised.length ? ShieldAlert : ShieldCheck;

  return (
    <section aria-label="Scan verdict" className="animate-rise grid gap-x-8 gap-y-5 rounded-[var(--radius-panel)] border border-line bg-surface px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', raised.length ? (critical ? 'text-critical' : 'text-high') : 'text-low')} />
          <div className="min-w-0">
            <h2 className="text-[17px] leading-snug font-semibold text-ink">{headline}</h2>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {formatNumber(summary.total)} {summary.total === 1 ? 'change' : 'changes'} found
              {critical ? ` · ${plural(critical, 'critical', 'critical')}` : ''}
              {raised.length ? ' · review the changes that raised risk first' : ''}
            </p>
          </div>
        </div>

        {groups.length > 0 && (
          <dl className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-[var(--radius-control)] border border-line">
            <Impact
              label="Raised risk"
              value={raised.length}
              icon={ShieldAlert}
              tone={raised.length ? (critical ? 'text-critical' : 'text-high') : 'text-ink-3'}
              onClick={raised.length ? onRaised : undefined}
            />
            <Impact label="Reduced exposure" value={reduced} icon={ArrowDownRight} tone={reduced ? 'text-low' : 'text-ink-3'} />
            <Impact label="Other changes" value={other} />
          </dl>
        )}

        <p className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
          <span>
            Finished <span className="text-ink-2" title={formatDateTime(scan.completedAt)}>{formatRelative(scan.completedAt)}</span>
            {duration ? `, ran ${duration}` : ''}
            {scan.status === 'partial' ? ' · partial scan' : ''}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitCompareArrows aria-hidden="true" className="size-3.5" />
            {first ? 'No previous scan' : <>Compared with <span className="text-ink-2">{formatDateTime(scan.previousScanAt)}</span></>}
          </span>
          {scan.accountId && (
            <span>
              Account <span className="font-mono text-ink-2">{scan.accountId}</span>
            </span>
          )}
        </p>
      </div>

      {scans.length > 1 && <ScanHistory scans={scans} currentId={scan.id} onOpen={onOpenScan} />}
    </section>
  );
}

function Impact({ label, value, icon: Icon, tone = 'text-ink', onClick }) {
  const body = (
    <>
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-3">
        {Icon && <Icon aria-hidden="true" className={cn('size-3.5', tone)} />}
        {label}
      </dt>
      <dd data-numeric="" className={cn('mt-1 text-[22px] leading-none font-semibold', value ? 'text-ink' : 'text-ink-3')}>
        {formatNumber(value)}
        <span className="ml-1 text-[11.5px] font-normal text-ink-3">{value === 1 ? 'resource' : 'resources'}</span>
      </dd>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="px-4 py-3 text-left transition-colors hover:bg-surface-2" title={`Show only: ${label.toLowerCase()}`}>
      {body}
    </button>
  ) : (
    <div className="px-4 py-3">{body}</div>
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
    <div className="min-w-0 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-[12.5px] font-semibold text-ink">Changes per scan</p>
        <p className="text-[11.5px] text-ink-3" data-numeric="">
          {formatNumber(total)} across the last {formatNumber(data.length)} · select a bar to open it
        </p>
      </div>
      <div className="mt-2 h-[128px] w-full">
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
    </div>
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
