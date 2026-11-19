import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Clock3, Crown, Link2Off, ShieldOff, UserRoundX, UsersRound } from 'lucide-react';
import { fetchHumanIdentities, fetchHumanOverview, fetchPermissionSets } from '../../lib/api/humanIdentities';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber, formatRelative, formatRelativeShort } from '../../lib/format';
import { DiscoveryTabs, PageHeader } from '../../shell/PageHeader';
import { CellStack, DataGrid } from '../../ui/DataGrid';
import { Select, SearchInput } from '../../ui/Field';
import { AppliedFilters, FacetRail, useFacetRail } from '../../ui/FacetRail';
import { ProportionBar } from '../../ui/Meter';
import { MetricTile } from '../../ui/Stat';
import { SegmentedControl } from '../../ui/Tabs';
import { Pagination } from '../../ui/Pagination';
import { Panel, PanelHeader } from '../../ui/Panel';
import { EmptyState, ErrorState } from '../../ui/States';
import { IconButton } from '../../ui/Button';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { Tag } from '../../ui/Tag';
import { RecordBar, ResultCount, ShowFiltersButton, WorkArea } from '../../ui/WorkArea';
import { cn } from '../../ui/cn';
import { fetchPostureScoreIndex } from '../../lib/api/posture';
import { BandTag, ScoreRing } from '../posture/parts';
import { PersonDrawer } from './PersonDrawer';
import { Avatar, CoverageRing, LegendRow } from './parts';
import { HUMAN_TYPE_LABEL, COLUMN_SORT, DEFAULT_SORT, MFA_OPTIONS, RISK_OPTIONS, sessionLength, SORT_FIELDS, SOURCE_LABEL, SOURCE_OPTIONS, STATUS_OPTIONS, daysSince, humanTypeLabel, personName, readSort, statusMeta } from './peopleMeta';

/**
 * Human identities: the people who sign in to AWS, next to the workloads in
 * Discovery, laid out like the Non-human tab: one summary band, then the
 * filter rail beside the list.
 *
 * The band answers "how exposed are our people" at a glance: how many there
 * are and where they sign in, MFA coverage, account status, and only the risks
 * that are actually present (none shown as a calm line, not a wall of zeros).
 * The rail's "Signs in with" choice scopes the band and the list together.
 * Filters, sort, page and the open person live in the address.
 */
const PAGE_SIZES = [10, 25, 50, 100];

export default function PeoplePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const source = SOURCE_OPTIONS.some((o) => o.value === searchParams.get('source')) ? searchParams.get('source') : 'all';
  const status = STATUS_OPTIONS.some((o) => o.value === searchParams.get('status')) ? searchParams.get('status') || '' : '';
  const mfa = ['true', 'false'].includes(searchParams.get('mfa')) ? searchParams.get('mfa') : '';
  const risk = RISK_OPTIONS.some((r) => r.value === searchParams.get('risk')) ? searchParams.get('risk') : '';
  const humanType = /^[A-Z_]{1,64}$/.test(searchParams.get('type') || '') ? searchParams.get('type') : '';
  const sort = readSort(searchParams.get('sort'));
  const [sortBy, sortOrder] = sort.split(':');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 25;
  const urlSearch = searchParams.get('search') || '';
  const personId = searchParams.get('person') || '';
  const { railOpen, toggleRail } = useFacetRail('people');

  const writeSort = (field, dir) => update({ sort: `${field}:${dir}` === DEFAULT_SORT ? '' : `${field}:${dir}` });
  const activeColumn = Object.entries(COLUMN_SORT).find(([, field]) => field === sortBy)?.[0];

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
    (signal) => fetchHumanIdentities({ page, pageSize, source, humanType, status, mfa, risk, search: urlSearch, sortBy, sortOrder }, signal),
    [page, pageSize, source, humanType, status, mfa, risk, urlSearch, sortBy, sortOrder],
  );
  /* Security scores from the posture service, matched by ARN (IAM users) or by
     name / email (single sign-on users, who have no ARN). */
  const postureIndex = useQuery((signal) => fetchPostureScoreIndex(signal), []);
  const o = overview.data;
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtered = Boolean(status || mfa || urlSearch || humanType || risk);

  /* The rail. Counts come from the overview, which follows "Signs in with",
     so each group's numbers describe the people that choice covers. */
  const facetGroups = useMemo(() => {
    const count = (v) => (o ? v : undefined);
    const typeKeys = Object.keys(o?.byHumanType ?? {}).sort((a, b) => (o.byHumanType[b] ?? 0) - (o.byHumanType[a] ?? 0));
    /* Risks: the ones present (and the one chosen), with their counts. */
    const riskOptions = RISK_OPTIONS.filter((r) => !o || (o.risks?.[r.value] ?? 0) > 0 || r.value === risk).map((r) => ({
      value: r.value,
      label: r.label,
      count: count(o?.risks?.[r.value] ?? 0),
      active: risk === r.value,
    }));
    return [
      {
        key: 'risk',
        label: 'Risk',
        single: true,
        options: riskOptions,
        onSelect: (value) => update({ risk: value && value !== risk ? value : '' }),
      },
      {
        key: 'type',
        label: 'Identity type',
        single: true,
        options: (typeKeys.length ? typeKeys : Object.keys(HUMAN_TYPE_LABEL)).map((key) => ({
          value: key,
          label: humanTypeLabel(key),
          count: count(o?.byHumanType?.[key] ?? 0),
          active: humanType === key,
        })),
        onSelect: (value) => update({ type: value && value !== humanType ? value : '' }),
      },
      {
        key: 'status',
        label: 'Account status',
        single: true,
        options: STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => ({
          value: opt.value,
          label: opt.label,
          count: count(o?.byStatus?.[opt.value] ?? 0),
          active: status === opt.value,
        })),
        onSelect: (value) => update({ status: value && value !== status ? value : '' }),
      },
      {
        key: 'mfa',
        label: 'MFA',
        single: true,
        options: MFA_OPTIONS.filter((opt) => opt.value).map((opt) => ({
          value: opt.value,
          label: opt.label,
          count: count(opt.value === 'true' ? o?.mfa.enabled : o?.mfa.disabled),
          active: mfa === opt.value,
        })),
        onSelect: (value) => update({ mfa: value && value !== mfa ? value : '' }),
      },
    ];
  }, [o, humanType, status, mfa, risk, update]);

  const chips = [
    source !== 'all' && { key: 'source', label: 'Signs in with', value: SOURCE_LABEL[source] },
    risk && { key: 'risk', label: 'Risk', value: RISK_OPTIONS.find((r) => r.value === risk)?.label ?? risk },
    humanType && { key: 'type', label: 'Type', value: humanTypeLabel(humanType) },
    status && { key: 'status', label: 'Status', value: statusMeta(status).label },
    mfa && { key: 'mfa', label: 'MFA', value: mfa === 'true' ? 'On' : 'Off' },
    urlSearch && { key: 'search', label: 'Search', value: urlSearch },
  ].filter(Boolean);
  const clearAll = () => update({ source: '', type: '', status: '', mfa: '', risk: '', search: '' });

  const columns = useMemo(
    () => [
      {
        key: 'person',
        sortable: true,
        header: 'Person',
        primary: true,
        width: '26%',
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={personName(row)} seed={row.email || row.user_name || row.id} size={32} />
            <CellStack title={personName(row)} meta={row.email || row.user_name || 'No email recorded'} />
          </span>
        ),
      },
      {
        key: 'source',
        header: 'Signs in with',
        width: '15%',
        hideWithRail: true,
        cell: (row) => (
          <span className="block min-w-0">
            <span className="block truncate text-[12.5px] text-ink-2">
              {SOURCE_LABEL[row.source] ?? row.source}
              {row.human_type ? <span className="text-ink-3"> · {humanTypeLabel(row.human_type)}</span> : null}
            </span>
            {row.account_id && <span className="block truncate font-mono text-[11px] text-ink-3 tabular-nums">{row.account_id}</span>}
          </span>
        ),
      },
      {
        key: 'status',
        sortable: true,
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
        sortable: true,
        header: 'MFA',
        width: '11%',
        cell: (row) => <MfaCell row={row} />,
      },
      {
        key: 'access',
        header: 'Access',
        width: '10%',
        priority: 'wide',
        cell: (row) => (
          <span className="block text-[12.5px] text-ink-2">
            <span data-numeric="" className="font-semibold text-ink">
              {formatNumber(row.access_count)}
            </span>{' '}
            {row.access_count === 1 ? 'grant' : 'grants'}
            <span className="block text-[11px] text-ink-3">
              {formatNumber(row.group_count)} {row.group_count === 1 ? 'group' : 'groups'}
              {row.active_key_count > 0 ? ` · ${formatNumber(row.active_key_count)} ${row.active_key_count === 1 ? 'access key' : 'access keys'}` : ''}
            </span>
          </span>
        ),
      },
      {
        key: 'score',
        sortable: true,
        header: 'Security score',
        width: '14%',
        cell: (row) => <ScoreCell entry={scoreFor(postureIndex.data, row)} loading={!postureIndex.data && !postureIndex.isError} />,
      },
      {
        key: 'last',
        sortable: true,
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
        lede="The people who sign in to your AWS accounts: IAM users and single sign-on users. See who has MFA, who has gone quiet and who holds admin-level access."
        sections={<DiscoveryTabs />}
        meta={o ? <p className="text-[11.5px] text-ink-3">{formatNumber(o.total)} human identities in your scope.</p> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Where people sign in" options={SOURCE_OPTIONS} value={source} onChange={(value) => update({ source: value === 'all' ? '' : value, type: '' })} />
        <p className="text-[12px] text-ink-3">The tiles and the list follow this choice.</p>
      </div>

      {overview.isError && !o ? (
        <Panel>
          <ErrorState compact error={overview.error} onRetry={overview.refetch} title="Human identity figures could not be loaded" />
        </Panel>
      ) : (
        <Tiles overview={o} onMfaOff={() => update({ mfa: 'false' })} />
      )}

      <WorkArea
        railOpen={railOpen}
        rail={<FacetRail groups={facetGroups} appliedCount={chips.length} onClearAll={clearAll} onClose={toggleRail} mobileTitle="Filter people" />}
      >
        <Panel prominence="lead" flush className="animate-rise overflow-hidden">
          <RecordBar
            trailing={
              <TableToolbar>
                {!railOpen && <ShowFiltersButton onClick={toggleRail} appliedCount={chips.length} />}
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
            <SearchInput size="sm" value={draft} onChange={setDraft} placeholder="Search name, email or user name…" className="w-full min-w-0 sm:max-w-sm" />
            <ResultCount shown={formatNumber(rows.length)} total={formatNumber(total)} unit="people" filtered={filtered} paged loading={list.isLoading && !list.data} />
            <span className="flex items-center gap-1">
              <Select
                size="sm"
                aria-label="Sort by"
                value={sortBy}
                onChange={(e) => writeSort(e.target.value, SORT_FIELDS.find((f) => f.value === e.target.value)?.dir ?? 'asc')}
                options={SORT_FIELDS.map((field) => ({ value: field.value, label: `Sort: ${field.label}` }))}
              />
              <IconButton
                size="sm"
                icon={sortOrder === 'desc' ? ArrowDownWideNarrow : ArrowUpNarrowWide}
                label={sortOrder === 'desc' ? 'Sorted descending - switch to ascending' : 'Sorted ascending - switch to descending'}
                onClick={() => writeSort(sortBy, sortOrder === 'desc' ? 'asc' : 'desc')}
              />
            </span>
          </RecordBar>

          <AppliedFilters filters={chips} onRemove={(key) => update({ [key]: '' })} onClearAll={clearAll} />

          {list.isError && !list.data ? (
            <ErrorState error={list.error} onRetry={list.refetch} title="Human identities could not be loaded" />
          ) : (
            <DataGrid
              railOpen={railOpen}
              caption="Human identities"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              loading={list.isLoading && !list.data}
              refreshing={list.isRefreshing}
              onRowClick={(row) => update({ person: row.id }, { keepPage: true })}
              sort={{ key: activeColumn, direction: sortOrder }}
              onSortChange={({ key, direction }) => writeSort(COLUMN_SORT[key], direction)}
              skeletonRows={8}
              emptyState={
                <EmptyState
                  icon={UsersRound}
                  title={filtered ? 'Nobody matches these filters' : 'No people found yet'}
                  description={
                    filtered
                      ? 'Try a different search, or clear a filter.'
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
              unit="people"
              onPageChange={(next) => update({ page: next > 1 ? next : '' }, { keepPage: true })}
              onPageSizeChange={(size) => update({ size: size === 25 ? '' : size })}
            />
          )}
        </Panel>
      </WorkArea>

      {source === 'sso' && <PermissionSets />}

      <PersonDrawer id={personId} onClose={() => update({ person: '' }, { keepPage: true })} />
    </div>
  );
}

/* ── Tiles ───────────────────────────────────────────────────────────────── */

function Tiles({ overview: o, onMfaOff }) {
  const loading = !o;
  const known = o ? o.mfa.enabled + o.mfa.disabled : 0;
  const statusTotal = o ? o.byStatus.active + o.byStatus.inactive + o.byStatus.suspended + o.byStatus.disabled : 0;
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
              { key: 'disabled', label: 'Disabled', value: o?.byStatus.disabled ?? 0, color: 'var(--t-ink-3)' },
            ]}
          />
          <div className="mt-3 flex flex-col gap-1">
            <LegendRow color="var(--t-low)" label="Active" value={loading ? '-' : formatNumber(o.byStatus.active)} />
            <LegendRow color="var(--t-medium)" label="Inactive" value={loading ? '-' : formatNumber(o.byStatus.inactive)} />
            <LegendRow color="var(--t-high)" label="Suspended" value={loading ? '-' : formatNumber(o.byStatus.suspended)} />
            <LegendRow color="var(--t-ink-3)" label="Disabled" value={loading ? '-' : formatNumber(o.byStatus.disabled)} />
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

/* ── Permission sets (single sign-on) ────────────────────────────────────── */

/** What each SSO permission set grants and to whom. Shown under "Single sign-on". */
function PermissionSets() {
  const query = useQuery((signal) => fetchPermissionSets(signal), []);
  const sets = query.data ?? [];
  return (
    <Panel prominence="quiet" className="animate-rise">
      <PanelHeader prominence="quiet" title="Permission sets" subtitle="What single sign-on users can do in your accounts, and who holds each set." />
      {query.isError && !query.data ? (
        <ErrorState compact error={query.error} onRetry={query.refetch} title="Permission sets could not be loaded" />
      ) : !query.data ? (
        <p className="mt-3 text-[12.5px] text-ink-3">Loading…</p>
      ) : sets.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-3">No permission set is assigned to a single sign-on user.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {sets.map((set) => (
            <li key={set.permission_set_arn} className="py-2.5">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{set.permission_set_name || set.permission_set_arn}</span>
                    <span className="block text-[11.5px] text-ink-3">
                      {formatNumber(set.assigned_user_count)} {set.assigned_user_count === 1 ? 'user' : 'users'} · {formatNumber(set.account_count)}{' '}
                      {set.account_count === 1 ? 'account' : 'accounts'}
                      {set.session_duration ? ` · ${sessionLength(set.session_duration)} sessions` : ''}
                    </span>
                  </span>
                  {/admin/i.test(`${set.permission_set_name} ${(set.policies ?? []).join(' ')}`) && (
                    <Tag tone="high" size="sm">
                      Admin-level
                    </Tag>
                  )}
                </summary>
                <div className="mt-2 grid gap-2 text-[11.5px] text-ink-2 sm:grid-cols-3">
                  <p>
                    <span className="block font-semibold text-ink-3">Policies</span>
                    {(set.policies ?? []).length ? set.policies.map((p) => <span key={p} className="block truncate font-mono" title={p}>{p.split('/').pop()}</span>) : 'Inline only'}
                  </p>
                  <p>
                    <span className="block font-semibold text-ink-3">Accounts</span>
                    {(set.account_ids ?? []).map((a) => <span key={a} className="block font-mono">{a}</span>)}
                  </p>
                  <p>
                    <span className="block font-semibold text-ink-3">Users</span>
                    {(set.assigned_users ?? []).map((u) => <span key={u} className="block truncate" title={u}>{u}</span>)}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
        {on && row.mfa_type ? <span className="font-normal text-ink-3">· {String(row.mfa_type).toLowerCase()}</span> : null}
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
