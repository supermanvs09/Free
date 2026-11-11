import { useMemo } from 'react';
import { DatabaseZap, Eye, ShieldAlert } from 'lucide-react';
import { fetchGenomeActivity } from '../../lib/api/genome';
import { useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelativeShort } from '../../lib/format';
import { Button } from '../../ui/Button';
import { CellStack, DataGrid } from '../../ui/DataGrid';
import { Pagination } from '../../ui/Pagination';
import { EmptyState, ErrorState } from '../../ui/States';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { Tag } from '../../ui/Tag';
import { RecordBar, ResultCount } from '../../ui/WorkArea';
import { RangePicker } from './EventTimeline';
import { eventRange, rangeInstants } from './eventState';

/**
 * The identity's calls from the same API as Genome → Activity
 * (GET /genome/identities/{source_type}/{identity_name}/activity), drawn with
 * the record's own table. That API pages by cursor; a page further on is
 * reached by walking the cursors once and remembering them.
 */
export function GenomeEvents({ genomeKey, state, patch }) {
  const range = eventRange(state);
  const instants = useMemo(() => rangeInstants(state), [state.range, state.from, state.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeKey = `${genomeKey.sourceType}|${genomeKey.identityName}|${instants.from}|${instants.to}|${state.size}`;
  /* Cursor of each page start, refilled when the range or page size changes. */
  const cursorList = useMemo(() => [null], [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useQuery(
    async (signal) => {
      const list = cursorList;
      const want = Math.max(1, state.page) - 1;
      let page;
      for (let i = Math.min(want, list.length - 1); i <= want; i += 1) {
        page = await fetchGenomeActivity(
          genomeKey.sourceType,
          genomeKey.identityName,
          { ...instants, bucket: 'day', recentLimit: state.size, recentCursor: list[i] ?? undefined },
          signal,
        );
        if (list[i + 1] === undefined) list[i + 1] = page.nextCursor;
        if (!page.nextCursor && i < want) break; // ran out before the asked page
      }
      return page;
    },
    [scopeKey, state.page],
  );

  const data = query.data;
  const unknown = data && (data.totalCalls === null || data.totalCalls === undefined);
  const total = Number(data?.totalCalls) || 0;
  const rows = useMemo(
    () =>
      (data?.recentCalls ?? []).map((call) => {
        const [service, ...name] = String(call.api_call ?? '').split(':');
        return { ...call, service, action: name.join(':') || call.api_call };
      }),
    [data],
  );

  const columns = [
    {
      key: 'event',
      header: 'Call',
      primary: true,
      width: '26%',
      cell: (row) => <CellStack icon={Eye} title={row.action || 'Unnamed call'} meta={row.service || 'Service not recorded'} />,
    },
    {
      key: 'resource',
      header: 'Resource',
      width: '28%',
      cell: (row) => (
        <span className="block min-w-0 truncate text-[12.5px] text-ink-2" title={row.resource || undefined}>
          {row.resource ? row.resource.split(/[:/]/).filter(Boolean).pop() : 'No resource'}
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      width: '14%',
      cell: (row) =>
        row.risk_status ? (
          <Tag size="sm" tone={/critical|high/i.test(row.risk_status) ? 'critical' : /medium/i.test(row.risk_status) ? 'high' : 'neutral'}>
            {row.risk_status}
            {row.risk_score !== null && row.risk_score !== undefined ? ` · ${row.risk_score}` : ''}
          </Tag>
        ) : (
          <span className="text-[12px] text-ink-3">Not scored</span>
        ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '18%',
      priority: 'wide',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12px] text-ink-2">{row.source_ip || 'Not recorded'}</span>
          <span className="block truncate text-[11px] text-ink-3">{row.region || ''}</span>
        </span>
      ),
    },
    {
      key: 'time',
      header: 'When',
      width: '14%',
      cell: (row) => (
        <span className="block text-[12.5px] whitespace-nowrap text-ink-2" title={formatDateTime(row.event_time)}>
          {formatRelativeShort(row.event_time)}
        </span>
      ),
    },
  ];

  return (
    <>
      <RecordBar
        trailing={
          <TableToolbar>
            <RefreshButton onRefresh={query.refetch} refreshing={query.isRefreshing} label="Refresh calls" />
          </TableToolbar>
        }
      >
        <RangePicker state={state} patch={patch} />
        <ResultCount shown={formatNumber(rows.length)} total={formatNumber(total)} unit="calls" loading={query.isLoading && !data} />
      </RecordBar>
      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : unknown ? (
        <EmptyState
          icon={DatabaseZap}
          title="The activity store could not be read"
          description="This identity's calls are unknown right now, not empty. Try again in a few minutes."
          action={
            <Button variant="secondary" size="sm" onClick={query.refetch}>
              Try again
            </Button>
          }
        />
      ) : (
        <DataGrid
          caption="Calls of this identity"
          columns={columns}
          rows={rows}
          rowKey={(row, index) => row.event_id || index}
          loading={query.isLoading && !data}
          refreshing={query.isRefreshing || (query.isLoading && Boolean(data))}
          density="compact"
          skeletonRows={10}
          emptyState={<EmptyState icon={ShieldAlert} title="No calls in this period" description={`Nothing was recorded for this identity ${range.phrase}. Try a longer range.`} />}
        />
      )}
      {total > 0 && !unknown && (
        <Pagination
          page={state.page}
          pageSize={state.size}
          total={total}
          unit="calls"
          onPageChange={(page) => patch({ page })}
          onPageSizeChange={(size) => patch({ size, page: 1 })}
        />
      )}
    </>
  );
}
