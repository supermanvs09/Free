import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, Crown, ShieldCheck, ShieldOff, UserRoundX, UsersRound } from 'lucide-react';
import { fetchHumanIdentities, fetchHumanOverview } from '../../lib/api/humanIdentities';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber, formatRelative, formatRelativeShort } from '../../lib/format';
import { DiscoveryTabs, PageHeader } from '../../shell/PageHeader';
import { CellStack, DataGrid } from '../../ui/DataGrid';
import { Select, SearchInput } from '../../ui/Field';
import { AppliedFilters, FacetRail, useFacetRail } from '../../ui/FacetRail';
import { ProportionBar } from '../../ui/Meter';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { EmptyState, ErrorState } from '../../ui/States';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { Tag } from '../../ui/Tag';
import { RecordBar, ResultCount, ShowFiltersButton, WorkArea } from '../../ui/WorkArea';
import { cn } from '../../ui/cn';
import { fetchPostureScoreIndex } from '../../lib/api/posture';
import { BandTag, ScoreRing } from '../posture/parts';
import { PersonDrawer } from './PersonDrawer';
import { Avatar, CoverageRing } from './parts';
import { HUMAN_TYPE_LABEL, MFA_OPTIONS, SORT_OPTIONS, SOURCE_LABEL, SOURCE_OPTIONS, STATUS_OPTIONS, daysSince, humanTypeLabel, personName, statusMeta } from './peopleMeta';

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
const STATUS_COLORS = { active: 'var(--t-low)', inactive: 'var(--t-medium)', suspended: 'var(--t-high)', disabled: 'var(--t-ink-3)' };
const TONE_CHIP = { critical: 'bg-critical-soft text-critical', high: 'bg-high-soft text-high', medium: 'bg-medium-soft text-medium' };

export default function PeoplePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const source = SOURCE_OPTIONS.some((o) => o.value === searchParams.get('source')) ? searchParams.get('source') : 'all';
  const status = STATUS_OPTIONS.some((o) => o.value === searchParams.get('status')) ? searchParams.get('status') || '' : '';
  const mfa = ['true', 'false'].includes(searchParams.get('mfa')) ? searchParams.get('mfa') : '';
  const humanType = /^[A-Z_]{1,64}$/.test(searchParams.get('type') || '') ? searchParams.get('type') : '';
  const sort = SORT_OPTIONS.some((o) => o.value === searchParams.get('sort')) ? searchParams.get('sort') : SORT_OPTIONS[0].value;
  const [sortBy, sortOrder] = sort.split(':');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 25;
  const urlSearch = searchParams.get('search') || '';
  const personId = searchParams.get('person') || '';
  const { railOpen, toggleRail } = useFacetRail('people');

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
    (signal) => fetchHumanIdentities({ page, pageSize, source, humanType, status, mfa, search: urlSearch, sortBy, sortOrder }, signal),
    [page, pageSize, source, humanType, status, mfa, urlSearch, sortBy, sortOrder],
  );
  /* Security scores from the posture service, matched by ARN (IAM users) or by
     name / email (single sign-on users, who have no ARN). */
  const postureIndex = useQuery((signal) => fetchPostureScoreIndex(signal), []);
  const o = overview.data;
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtered = Boolean(status || mfa || urlSearch || humanType);

  /* The rail. Counts come from the overview, which follows "Signs in with",
     so each group's numbers describe the people that choice covers. */
  const facetGroups = useMemo(() => {
    const count = (v) => (o ? v : undefined);
    const typeKeys = Object.keys(o?.byHumanType ?? {}).sort((a, b) => (o.byHumanType[b] ?? 0) - (o.byHumanType[a] ?? 0));
    return [
      {
        key: 'source',
        label: 'Signs in with',
        single: true,
        options: SOURCE_OPTIONS.filter((opt) => opt.value !== 'all').map((opt) => ({
          value: opt.value,
          label: opt.label,
          count: count(opt.value === 'iam' ? o?.bySource.iam : o?.bySource.sso),
          active: source === opt.value,
        })),
        onSelect: (value) => update({ source: value && value !== source ? value : '', type: '' }),
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
  }, [o, source, humanType, status, mfa, update]);

  const chips = [
    source !== 'all' && { key: 'source', label: 'Signs in with', value: SOURCE_LABEL[source] },
    humanType && { key: 'type', label: 'Type', value: humanTypeLabel(humanType) },
    status && { key: 'status', label: 'Status', value: statusMeta(status).label },
    mfa && { key: 'mfa', label: 'MFA', value: mfa === 'true' ? 'On' : 'Off' },
    urlSearch && { key: 'search', label: 'Search', value: urlSearch },
  ].filter(Boolean);
  const clearAll = () => update({ source: '', type: '', status: '', mfa: '', search: '' });

  const columns = useMemo(
    () => [
      {
        key: 'person',
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
            </span>
          </span>
        ),
      },
      {
        key: 'score',
        header: 'Security score',
        width: '14%',
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
        lede="The people who sign in to your AWS accounts: IAM users and single sign-on users. See who has MFA, who has gone quiet and who holds admin-level access."
        sections={<DiscoveryTabs />}
        meta={o ? <p className="text-[11.5px] text-ink-3">{formatNumber(o.total)} human identities in your scope.</p> : null}
      />

      {overview.isError && !o ? (
        <Panel>
          <ErrorState compact error={overview.error} onRetry={overview.refetch} title="Human identity figures could not be loaded" />
        </Panel>
      ) : (
        <SummaryBand overview={o} source={source} onFilter={(changes) => update(changes)} />
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
            <Select
              size="sm"
              aria-label="Sort by"
              value={sort}
              onChange={(e) => update({ sort: e.target.value === SORT_OPTIONS[0].value ? '' : e.target.value })}
              options={SORT_OPTIONS}
            />
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

      <PersonDrawer id={personId} onClose={() => update({ person: '' }, { keepPage: true })} />
    </div>
  );
}

/* ── Summary band ────────────────────────────────────────────────────────── */

/**
 * One panel, three columns: who (total and where they sign in), MFA coverage
 * with account status, and what needs attention. Risks at zero are not drawn
 * as tiles; with nothing to act on the column says so in one calm line.
 */
function SummaryBand({ overview: o, source, onFilter }) {
  const loading = !o;
  const known = o ? o.mfa.enabled + o.mfa.disabled : 0;
  const statusEntries = o
    ? STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => ({ key: opt.value, label: opt.label, value: o.byStatus[opt.value] ?? 0, color: STATUS_COLORS[opt.value] }))
    : [];
  const statusTotal = statusEntries.reduce((sum, e) => sum + e.value, 0);
  /* Linking people across IAM and SSO is not filled in by discovery yet; when
     nobody is linked the count is the whole population and says nothing. */
  const unlinkedMeaningful = o && o.unlinked > 0 && o.unlinked < o.total;
  const risks = o
    ? [
        { key: 'console', icon: ShieldOff, tone: 'critical', value: o.consoleWithoutMfa, label: 'can sign in to the console with a password alone', action: { label: 'Show MFA off', changes: { mfa: 'false' } } },
        { key: 'admin', icon: Crown, tone: 'high', value: o.privileged, label: 'hold an administrator permission set or policy' },
        { key: 'inactive', icon: Clock3, tone: 'high', value: o.inactiveOver90, label: 'have not signed in for 90 days or more', action: { label: 'Oldest first', changes: { sort: 'last_activity_at:asc' } } },
        { key: 'never', icon: UserRoundX, tone: 'medium', value: o.neverUsed, label: 'IAM users have never signed in' },
        unlinkedMeaningful && { key: 'unlinked', icon: UsersRound, tone: 'medium', value: o.unlinked, label: 'cannot be matched to one person across IAM and SSO' },
      ].filter((r) => r && r.value > 0)
    : [];

  return (
    <Panel prominence="quiet" flush className="animate-rise overflow-hidden">
      <div className="grid divide-y divide-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1.35fr)] lg:divide-x lg:divide-y-0">
        {/* Who */}
        <section className="flex flex-col gap-3 p-5">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">People</p>
          <p data-numeric="" className={cn('font-display text-[36px] leading-none font-extrabold tracking-[-0.03em] text-ink', loading && 'opacity-40')}>
            {loading ? '-' : formatNumber(o.total)}
          </p>
          <ProportionBar
            height={6}
            total={o?.total}
            ariaLabel="Where people sign in"
            segments={[
              { key: 'iam', label: 'AWS IAM', value: o?.bySource.iam ?? 0, color: 'var(--t-series-1)' },
              { key: 'sso', label: 'Single sign-on', value: o?.bySource.sso ?? 0, color: 'var(--t-series-2)' },
            ]}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <Dot color="var(--t-series-1)" label="AWS IAM" value={loading ? '-' : formatNumber(o.bySource.iam)} />
            <Dot color="var(--t-series-2)" label="Single sign-on" value={loading ? '-' : formatNumber(o.bySource.sso)} />
            {o?.rootAccounts > 0 && <span className="text-ink-3">incl. {formatNumber(o.rootAccounts)} root {o.rootAccounts === 1 ? 'user' : 'users'}</span>}
          </div>
          {source !== 'all' && <p className="text-[11px] text-ink-3">Showing {SOURCE_LABEL[source]} only.</p>}
        </section>

        {/* MFA and status */}
        <section className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <CoverageRing
              size={76}
              stroke={8}
              value={o?.mfa.enabled ?? 0}
              total={known}
              tone={known > 0 && o.mfa.enabled / known < 0.8 ? 'var(--t-high)' : 'var(--t-low)'}
              label={known ? `${o.mfa.enabled} of ${known} people with a known setting have MFA on` : 'MFA coverage unknown'}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">MFA coverage</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                {loading
                  ? 'Loading…'
                  : known === 0
                    ? 'Not reported for these people.'
                    : `${formatNumber(o.mfa.enabled)} on, ${formatNumber(o.mfa.disabled)} off${o.mfa.unknown ? `, ${formatNumber(o.mfa.unknown)} not reported` : ''}.`}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Account status</p>
              <p className="text-[11.5px] text-ink-3">
                <span data-numeric="" className="font-semibold text-ink">
                  {loading ? '-' : formatNumber(o.byStatus.active)}
                </span>{' '}
                active
              </p>
            </div>
            <ProportionBar className="mt-2" height={6} total={statusTotal} ariaLabel="Account status" segments={statusEntries} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
              {statusEntries
                .filter((e) => e.value > 0 || e.key === 'active')
                .map((e) => (
                  <button key={e.key} type="button" onClick={() => onFilter({ status: e.key })} className="rounded hover:text-ink focus-visible:outline-2">
                    <Dot color={e.color} label={e.label} value={formatNumber(e.value)} />
                  </button>
                ))}
            </div>
          </div>
        </section>

        {/* What needs attention */}
        <section className="flex flex-col p-5">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Needs attention</p>
          {loading ? (
            <p className="mt-3 text-[12.5px] text-ink-3">Loading…</p>
          ) : risks.length === 0 ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-[var(--radius-control)] bg-low-soft px-3 py-2.5">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
              <p className="text-[12.5px] leading-relaxed text-ink-2">Nothing stands out: no console access without MFA, no idle or unused accounts, no admin-level access.</p>
            </div>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {risks.map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', TONE_CHIP[r.tone])}>
                    <r.icon aria-hidden="true" className="size-3.5" />
                  </span>
                  <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
                    <span data-numeric="" className="font-semibold text-ink">
                      {formatNumber(r.value)}
                    </span>{' '}
                    {r.label}
                  </p>
                  {r.action && (
                    <button type="button" onClick={() => onFilter(r.action.changes)} className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">
                      {r.action.label}
                      <ArrowRight aria-hidden="true" className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}

function Dot({ color, label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
      {label}
      <span data-numeric="" className="font-semibold text-ink">
        {value}
      </span>
    </span>
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
