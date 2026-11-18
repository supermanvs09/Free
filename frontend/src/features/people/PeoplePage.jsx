import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock3, Crown, Link2Off, ShieldOff, UserRoundX, UsersRound } from 'lucide-react';
import { fetchHumanIdentities, fetchHumanOverview } from '../../lib/api/humanIdentities';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber, formatRelative, formatRelativeShort } from '../../lib/format';
import { DiscoveryTabs, PageHeader } from '../../shell/PageHeader';
import { CellStack, DataGrid } from '../../ui/DataGrid';
import { Select, SearchInput } from '../../ui/Field';
import { ProportionBar } from '../../ui/Meter';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { MetricTile } from '../../ui/Stat';
import { EmptyState, ErrorState } from '../../ui/States';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { RecordBar, ResultCount } from '../../ui/WorkArea';
import { cn } from '../../ui/cn';
import { fetchPostureScoreIndex } from '../../lib/api/posture';
import { BandTag, ScoreRing } from '../posture/parts';
import { PersonDrawer } from './PersonDrawer';
import { Avatar, CoverageRing, LegendRow } from './parts';
import { MFA_OPTIONS, SORT_OPTIONS, SOURCE_LABEL, SOURCE_OPTIONS, STATUS_OPTIONS, daysSince, humanTypeLabel, personName, statusMeta } from './peopleMeta';

/**
 * People: the humans who sign in to AWS, next to the workloads in Discovery.
 *
 * The tiles answer "how exposed are our people" before any list is read: how
 * many there are and where they sign in, how many have MFA, and the five
 * things that usually need a conversation (console without MFA, long idle,
 * never used, admin-level, not tied to a person). The source switch above them
 * scopes the tiles and the list together, so the two always describe the same
 * people. Filters, sort, page and the open person live in the address.
 */
const PAGE_SIZES = [10, 25, 50, 100];

export default function PeoplePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const source = SOURCE_OPTIONS.some((o) => o.value === searchParams.get('source')) ? searchParams.get('source') : 'all';
  const status = STATUS_OPTIONS.some((o) => o.value === searchParams.get('status')) ? searchParams.get('status') || '' : '';
  const mfa = ['true', 'false'].includes(searchParams.get('mfa')) ? searchParams.get('mfa') : '';
  const sort = SORT_OPTIONS.some((o) => o.value === searchParams.get('sort')) ? searchParams.get('sort') : SORT_OPTIONS[0].value;
  const [sortBy, sortOrder] = sort.split(':');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 25;
  const urlSearch = searchParams.get('search') || '';
  const personId = searchParams.get('person') || '';

  const update = useCallback(
    (changes, { keepPage = false } = {}) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === null || value === undefined) next.delete(key);
        else next.set(key, String(value));
      }
      if (!keepPage) next.delete('page');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  /* The search box: typed text is copied to the address after a pause, and a
     change made elsewhere (a link, Back) is copied into the box - but never the
     value this box wrote itself, which would reset it while typing. */
  const [draft, setDraft] = useState(urlSearch);
  const debounced = useDebouncedValue(draft, 320);
  const written = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === written.current) return;
    written.current = urlSearch;
    setDraft(urlSearch);
  }, [urlSearch]);
  useEffect(() => {
    const value = debounced.trim();
    if (value === urlSearch) return;
    written.current = value;
    update({ search: value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const overview = useQuery((signal) => fetchHumanOverview({ source }, signal), [source]);
  const list = useQuery(
    (signal) => fetchHumanIdentities({ page, pageSize, source, status, mfa, search: urlSearch, sortBy, sortOrder }, signal),
    [page, pageSize, source, status, mfa, urlSearch, sortBy, sortOrder],
  );
  /* Security scores from the posture service, matched by ARN (IAM users) or by
     name / email (single sign-on users, who have no ARN). */
  const postureIndex = useQuery((signal) => fetchPostureScoreIndex(signal), []);
  const o = overview.data;
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtered = Boolean(status || mfa || urlSearch);

  const columns = useMemo(
    () => [
      {
        key: 'person',
        header: 'Person',
        primary: true,
        width: '27%',
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={personName(row)} seed={row.email || row.user_name || row.id} size={34} />
            <CellStack title={personName(row)} meta={row.email || row.user_name || 'No email recorded'} />
          </span>
        ),
      },
      {
        key: 'source',
        header: 'Signs in with',
        width: '13%',
        cell: (row) => (
          <span className="block min-w-0">
            <Tag tone={row.source === 'iam' ? 'neutral' : 'brand'} size="sm">
              {SOURCE_LABEL[row.source] ?? row.source}
            </Tag>
            {row.human_type && <span className="mt-0.5 block truncate text-[11px] text-ink-3">{humanTypeLabel(row.human_type)}</span>}
            {row.source === 'iam' && row.account_id && <span className="block truncate font-mono text-[11px] text-ink-3">{row.account_id}</span>}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '10%',
        cell: (row) => {
          const meta = statusMeta(row.status);
          return (
            <Tag tone={meta.tone} size="sm" dot>
              {meta.label}
            </Tag>
          );
        },
      },
      {
        key: 'mfa',
        header: 'MFA',
        width: '10%',
        cell: (row) => <MfaCell row={row} />,
      },
      {
        key: 'access',
        header: 'Access',
        width: '11%',
        priority: 'wide',
        cell: (row) => (
          <span className="block text-[12.5px] text-ink-2">
            <span data-numeric="" className="font-semibold text-ink">
              {formatNumber(row.access_count)}
            </span>{' '}
            {row.access_count === 1 ? 'grant' : 'grants'}
            <span className="block text-[11px] text-ink-3">
              {formatNumber(row.group_count)} {row.group_count === 1 ? 'group' : 'groups'}
            </span>
          </span>
        ),
      },
      {
        key: 'score',
        header: 'Security score',
        width: '15%',
        cell: (row) => <ScoreCell entry={scoreFor(postureIndex.data, row)} loading={!postureIndex.data && !postureIndex.isError} />,
      },
      {
        key: 'last',
        header: 'Last active',
        width: '12%',
        cell: (row) => <LastActive value={row.last_activity_at} source={row.source} />,
      },
    ],
    [postureIndex.data, postureIndex.isError],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discovery"
        lede="The human identities that sign in to your AWS accounts: IAM users and single sign-on users. See who has MFA, who has gone quiet and who holds admin-level access."
        sections={<DiscoveryTabs />}
        meta={o ? <p className="text-[11.5px] text-ink-3">{formatNumber(o.total)} human identities in your scope.</p> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Where people sign in" options={SOURCE_OPTIONS} value={source} onChange={(value) => update({ source: value === 'all' ? '' : value })} />
        <p className="text-[12px] text-ink-3">The tiles and the list follow this choice.</p>
      </div>

      {overview.isError && !o ? (
        <Panel>
          <ErrorState compact error={overview.error} onRetry={overview.refetch} title="Human identity figures could not be loaded" />
        </Panel>
      ) : (
        <Tiles overview={o} onMfaOff={() => update({ mfa: 'false' })} />
      )}

      <Panel prominence="lead" flush className="animate-rise overflow-hidden">
        <RecordBar
          trailing={
            <TableToolbar>
              <RefreshButton
                onRefresh={() => {
                  list.refetch();
                  overview.refetch();
                }}
                refreshing={list.isRefreshing}
                label="Refresh human identities"
              />
            </TableToolbar>
          }
        >
          <SearchInput value={draft} onChange={setDraft} placeholder="Search name, email or user name…" className="min-w-[14rem] flex-1 sm:max-w-sm" />
          <Select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })} options={STATUS_OPTIONS} className="w-auto" />
          <Select aria-label="MFA" value={mfa} onChange={(e) => update({ mfa: e.target.value })} options={MFA_OPTIONS} className="w-auto" />
          <Select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === SORT_OPTIONS[0].value ? '' : e.target.value })} options={SORT_OPTIONS} className="w-auto" />
          <ResultCount shown={formatNumber(rows.length)} total={formatNumber(total)} unit="identities" filtered={filtered} paged loading={list.isLoading && !list.data} />
        </RecordBar>

        {list.isError && !list.data ? (
          <ErrorState error={list.error} onRetry={list.refetch} title="Human identities could not be loaded" />
        ) : (
          <DataGrid
            caption="Human identities"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={list.isLoading && !list.data}
            refreshing={list.isRefreshing}
            onRowClick={(row) => update({ person: row.id }, { keepPage: true })}
            skeletonRows={8}
            emptyState={
              <EmptyState
                icon={UsersRound}
                title={filtered ? 'Nobody matches these filters' : 'No people found yet'}
                description={
                  filtered
                    ? 'Try a different search, or clear the status and MFA filters.'
                    : 'People appear here once discovery has read your IAM users or your single sign-on directory.'
                }
              />
            }
          />
        )}
        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            unit="identities"
            onPageChange={(next) => update({ page: next > 1 ? next : '' }, { keepPage: true })}
            onPageSizeChange={(size) => update({ size: size === 25 ? '' : size })}
          />
        )}
      </Panel>

      <PersonDrawer id={personId} onClose={() => update({ person: '' }, { keepPage: true })} />
    </div>
  );
}

/* ── Tiles ───────────────────────────────────────────────────────────────── */

function Tiles({ overview: o, onMfaOff }) {
  const loading = !o;
  const known = o ? o.mfa.enabled + o.mfa.disabled : 0;
  const statusTotal = o ? o.byStatus.active + o.byStatus.inactive + o.byStatus.suspended : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 @container lg:grid-cols-3">
        <Panel prominence="quiet" className="animate-rise">
          <p className="text-[12.5px] font-medium text-ink-2">Human identities</p>
          <p data-numeric="" className={cn('mt-1 font-display text-[34px] leading-none font-extrabold tracking-[-0.03em] text-ink', loading && 'opacity-40')}>
            {loading ? '-' : formatNumber(o.total)}
          </p>
          <ProportionBar
            className="mt-4"
            height={8}
            total={o?.total}
            ariaLabel="Where people sign in"
            segments={[
              { key: 'iam', label: 'AWS IAM', value: o?.bySource.iam ?? 0, color: 'var(--t-series-1)' },
              { key: 'sso', label: 'Single sign-on', value: o?.bySource.sso ?? 0, color: 'var(--t-series-2)' },
              { key: 'both', label: 'Both', value: o?.bySource.both ?? 0, color: 'var(--t-series-3)' },
            ]}
          />
          <div className="mt-3 flex flex-col gap-1">
            <LegendRow color="var(--t-series-1)" label="AWS IAM" value={loading ? '-' : formatNumber(o.bySource.iam)} />
            <LegendRow color="var(--t-series-2)" label="Single sign-on" value={loading ? '-' : formatNumber(o.bySource.sso)} />
            <LegendRow color="var(--t-series-3)" label="In both" value={loading ? '-' : formatNumber(o.bySource.both)} />
          </div>
        </Panel>

        <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 1 }}>
          <p className="text-[12.5px] font-medium text-ink-2">MFA coverage</p>
          <div className="mt-2 flex items-center gap-5">
            <CoverageRing value={o?.mfa.enabled ?? 0} total={known} tone={known > 0 && o.mfa.enabled / known < 0.8 ? 'var(--t-medium)' : 'var(--t-low)'} label={known ? `${o.mfa.enabled} of ${known} people with a known setting have MFA on` : 'MFA coverage unknown'} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <LegendRow color="var(--t-low)" label="MFA on" value={loading ? '-' : formatNumber(o.mfa.enabled)} />
              <LegendRow color="var(--t-high)" label="MFA off" value={loading ? '-' : formatNumber(o.mfa.disabled)} />
              <LegendRow color="var(--t-track)" label="Not reported" value={loading ? '-' : formatNumber(o.mfa.unknown)} />
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
            Of the {formatNumber(known)} people whose setting is known.{' '}
            {o && o.mfa.disabled > 0 && (
              <button type="button" onClick={onMfaOff} className="font-medium text-brand hover:underline">
                Show who has it off
              </button>
            )}
          </p>
        </Panel>

        <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 2 }}>
          <p className="text-[12.5px] font-medium text-ink-2">Account status</p>
          <p data-numeric="" className={cn('mt-1 font-display text-[34px] leading-none font-extrabold tracking-[-0.03em] text-ink', loading && 'opacity-40')}>
            {loading ? '-' : formatNumber(o.byStatus.active)}
            <span className="ml-1.5 font-sans text-[13px] font-medium tracking-normal text-ink-3">active</span>
          </p>
          <ProportionBar
            className="mt-4"
            height={8}
            total={statusTotal}
            ariaLabel="Account status"
            segments={[
              { key: 'active', label: 'Active', value: o?.byStatus.active ?? 0, color: 'var(--t-low)' },
              { key: 'inactive', label: 'Inactive', value: o?.byStatus.inactive ?? 0, color: 'var(--t-medium)' },
              { key: 'suspended', label: 'Suspended', value: o?.byStatus.suspended ?? 0, color: 'var(--t-high)' },
            ]}
          />
          <div className="mt-3 flex flex-col gap-1">
            <LegendRow color="var(--t-low)" label="Active" value={loading ? '-' : formatNumber(o.byStatus.active)} />
            <LegendRow color="var(--t-medium)" label="Inactive" value={loading ? '-' : formatNumber(o.byStatus.inactive)} />
            <LegendRow color="var(--t-high)" label="Suspended" value={loading ? '-' : formatNumber(o.byStatus.suspended)} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <RiskTile label="Console without MFA" value={o?.consoleWithoutMfa} icon={ShieldOff} bad="critical" caption="Can sign in to the console with a password alone" />
        <RiskTile label="Inactive 90+ days" value={o?.inactiveOver90} icon={Clock3} bad="high" caption="Signed in once, then went quiet" />
        <RiskTile label="Never signed in" value={o?.neverUsed} icon={UserRoundX} bad="medium" caption="Created, never used" />
        <RiskTile label="Admin-level access" value={o?.privileged} icon={Crown} bad="high" caption="Administrator permission set or policy" />
        <RiskTile label="Not tied to a person" value={o?.unlinked} icon={Link2Off} bad="medium" caption="Cannot be matched across IAM and SSO" />
      </div>
    </div>
  );
}

/** A risk count: loud when above zero, quiet green when it is clear. */
function RiskTile({ label, value, icon, bad, caption }) {
  const known = Number.isFinite(value);
  return (
    <MetricTile label={label} value={known ? value : null} tone={known && value > 0 ? bad : 'low'} icon={icon} caption={known && value === 0 ? 'None' : caption} className="animate-rise" />
  );
}

/* ── Cells ───────────────────────────────────────────────────────────────── */

function MfaCell({ row }) {
  const on = row.mfa_active === true;
  const off = row.mfa_active === false;
  const consoleOn = row.console_access === true;
  return (
    <span className="block min-w-0">
      <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-medium', on ? 'text-low' : off ? 'text-critical' : 'text-ink-3')}>
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', on ? 'bg-low' : off ? 'bg-critical' : 'bg-ink-3/50')} />
        {on ? 'On' : off ? 'Off' : 'Not reported'}
      </span>
      {consoleOn && !on && <span className="mt-0.5 block text-[11px] font-medium text-critical">Console open</span>}
      {consoleOn && on && <span className="mt-0.5 block text-[11px] text-ink-3">Console access</span>}
    </span>
  );
}

/** The posture entry for a person: by ARN first, then by user name, email or display name. */
function scoreFor(index, row) {
  if (!index) return null;
  return (
    (row.arn && index.get(row.arn)) ||
    [row.user_name, row.email, row.display_name].map((v) => v && index.get(`name:${String(v).toLowerCase()}`)).find(Boolean) ||
    null
  );
}

function ScoreCell({ entry, loading }) {
  if (!entry) return <span className="text-[12px] text-ink-3">{loading ? '…' : 'Not scored yet'}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`Security score ${entry.score} of 100`}>
      <ScoreRing score={entry.score} band={entry.band} size={28} />
      <BandTag score={entry.score} band={entry.band} />
    </span>
  );
}

// ponytail: SSO sign-ins are not collected yet, so an empty value means unknown, not never.
function LastActive({ value, source }) {
  if (!value) return <span className="text-[12.5px] text-ink-3">{source === 'iam' ? 'Never signed in' : 'Not reported'}</span>;
  const days = daysSince(value);
  return (
    <span className="block min-w-0 whitespace-nowrap" title={String(value)}>
      <span className={cn('block text-[12.5px]', days !== null && days > 90 ? 'font-medium text-high' : 'text-ink-2')}>{formatRelativeShort(value)}</span>
      {days !== null && days > 90 && <span className="block text-[11px] text-ink-3">{formatRelative(value)}</span>}
    </span>
  );
}
