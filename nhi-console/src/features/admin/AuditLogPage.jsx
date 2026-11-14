import { useMemo, useState } from 'react';
import { Download, Eye, History, RefreshCw, SearchX, ShieldAlert } from 'lucide-react';
import { exportAuditLog, fetchAuditFacets, fetchAuditLog } from '../../lib/api/admin';
import { useAccess } from '../../app/useAccess';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative, formatUtc } from '../../lib/format';
import { roleMeta } from '../../lib/roles';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { DataGrid } from '../../ui/DataGrid';
import { SearchInput, Select } from '../../ui/Field';
import { Drawer } from '../../ui/Overlay';
import { Pagination } from '../../ui/Pagination';
import { DetailList, DetailRow, Panel, SectionLabel } from '../../ui/Panel';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { RecordBar, ResultCount } from '../../ui/WorkArea';

/**
 * The audit log: what everyone did, newest first.
 *
 * Every request that changes something, every refusal, every sign-in and
 * every export is recorded by one server middleware, so an API added later is
 * covered without anyone remembering to log it. An admin or operator reads
 * everyone's actions; everyone else reads their own - the server narrows the
 * query, so this screen just says which it is showing.
 */

const RANGES = [
  { value: '24h', label: '24h', days: 1 },
  { value: '7d', label: '7d', days: 7 },
  { value: '30d', label: '30d', days: 30 },
  { value: '90d', label: '90d', days: 90 },
  { value: 'all', label: 'All', days: null },
];

const OUTCOMES = [
  { value: '', label: 'All' },
  { value: 'success', label: 'Done' },
  { value: 'denied', label: 'Refused' },
  { value: 'invalid', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

const OUTCOME_TAG = {
  success: { tone: 'low', label: 'Done' },
  denied: { tone: 'critical', label: 'Refused' },
  invalid: { tone: 'medium', label: 'Rejected' },
  failed: { tone: 'high', label: 'Failed' },
};

/* Plain words for the actions people look for most; the rest are spelled out
   from the route name (aws.accounts.create -> "AWS accounts: create"). */
const ACTION_LABELS = {
  login: 'Signed in',
  logout: 'Signed out',
  refresh: 'Renewed a session',
  'users.create': 'Added a user',
  'users.update': 'Changed a user',
  'users.delete': 'Removed a user',
  'me.password.update': 'Changed own password',
  'settings.update': 'Saved their data scope',
  'ispm.scans.create': 'Started a posture scan',
  'ispm.findings.update': 'Worked a posture finding',
  'integrations.aws.verify': 'Verified an AWS account',
  'integrations.aws.accounts.delete': 'Removed an AWS account',
  'integrations.aws.accounts.sync': 'Asked for a sync',
  'integrations.aws.accounts.recheck': 'Re-checked a connection',
  'audit-logs.read': 'Exported the audit log',
  'ispm.posture.export': 'Exported posture',
  'genome.anomalies.feedback.create': 'Reviewed an anomaly',
  'genome.anomalies.disposition.create': 'Closed or reopened an anomaly',
  'remediation.plans.create': 'Created a remediation plan',
  'remediation.plans.approve': 'Approved a remediation plan',
  'remediation.plans.reject': 'Rejected a remediation plan',
  'remediation.plans.cancel': 'Cancelled a remediation plan',
  'remediation.plans.execute': 'Ran a remediation plan',
  'remediation.plans.mark-done.create': 'Marked a fix as done',
  'remediation.executions.rollback.create': 'Rolled a fix back',
};

const ACRONYMS = { aws: 'AWS', ispm: 'Posture', iam: 'IAM', sso: 'SSO', ip: 'IP', csv: 'CSV' };

export function actionLabel(action, outcome) {
  if (action === 'login' && outcome === 'denied') return 'Sign-in refused';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const parts = String(action || '').split('.');
  if (parts.length < 2) return action || '-';
  const verb = parts.pop();
  const subject = parts.map((p) => ACRONYMS[p] ?? p.replace(/-/g, ' ')).join(' ');
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)}: ${verb.replace(/-/g, ' ')}`;
}

/** What a change set, in one line, from the recorded (already redacted) body. */
function changeSummary(entry) {
  const details = entry.details;
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  for (const [key, value] of Object.entries(details)) {
    if (key === 'query' || value === '[redacted]') continue;
    if (value === null || typeof value === 'object') continue;
    parts.push(`${key.replace(/_/g, ' ')}: ${String(value)}`);
    if (parts.length === 3) break;
  }
  return parts.join(' · ');
}

export default function AuditLogPage() {
  const { can } = useAccess();
  const { notify } = useToast();
  const [range, setRange] = useState('7d');
  const [outcome, setOutcome] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300).trim();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

  /* The range is fixed when the filters change, so paging through it does
     not shift under the reader as time passes. */
  const filters = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days;
    const from = days ? new Date(Date.now() - days * 86400000).toISOString() : '';
    return { from, outcome, actor, action, q };
  }, [range, outcome, actor, action, q]);
  const filterKey = JSON.stringify({ ...filters, from: range });

  const query = useQuery((signal) => fetchAuditLog(filters, { page, pageSize }, signal), [filterKey, page, pageSize]);
  const facets = useQuery((signal) => fetchAuditFacets(signal), []);
  const data = query.data;
  const everyone = data?.everyone ?? can('audit.all');

  const reset = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const { filename } = await exportAuditLog(filters);
      notify({ variant: 'success', title: 'Export downloaded', description: `${filename}, with the filters shown (up to 10,000 entries).` });
    } catch (error) {
      notify({ variant: 'error', title: 'Export failed', description: error?.message });
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      key: 'when',
      header: 'When',
      width: '14%',
      cell: (e) => (
        <span className="block min-w-0" title={`${formatDateTime(e.occurred_at)} · ${formatUtc(e.occurred_at)}`}>
          <span className="block text-[12.5px] text-ink-2">{formatRelative(e.occurred_at)}</span>
          <span className="cell-meta block truncate text-[11px] text-ink-3">{formatDateTime(e.occurred_at)}</span>
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Who',
      width: '20%',
      primary: true,
      cell: (e) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink" title={e.actor}>
            {e.actor === 'anonymous' ? 'Not signed in' : e.actor}
          </span>
          {e.actor_role && <span className="cell-meta block truncate text-[11px] text-ink-3">{roleMeta(e.actor_role).label}</span>}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '28%',
      cell: (e) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] text-ink">{actionLabel(e.action, e.outcome)}</span>
          <span className="cell-meta block truncate text-[11px] text-ink-3" title={`${e.method} ${e.path}`}>
            {[e.target ? `on ${e.target}` : '', changeSummary(e)].filter(Boolean).join(' · ') || <span className="font-mono">{`${e.method} ${e.path}`}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      width: '12%',
      cell: (e) => {
        const meta = OUTCOME_TAG[e.outcome] ?? { tone: 'neutral', label: e.outcome || '-' };
        return (
          <span className="block min-w-0">
            <Tag size="sm" tone={meta.tone} dot>
              {meta.label}
            </Tag>
            {e.error_code && <span className="cell-meta mt-0.5 block truncate font-mono text-[10.5px] text-ink-3">{e.error_code}</span>}
          </span>
        );
      },
    },
    {
      key: 'screen',
      header: 'From',
      width: '14%',
      priority: 'wide',
      cell: (e) => <span className="block truncate font-mono text-[11.5px] text-ink-3" title={e.screen}>{e.screen || '-'}</span>,
    },
    {
      key: 'ip',
      header: 'Address',
      width: '12%',
      priority: 'wide',
      cell: (e) => <span className="block truncate font-mono text-[11.5px] text-ink-3">{e.ip || '-'}</span>,
    },
  ];

  const filtered = Boolean(outcome || actor || action || q || range !== '7d');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        lede="What people did in this console: every change, every refused attempt, every sign-in and every export. Entries are written by the server for every request and can't be edited or deleted here."
        actions={
          <Button variant="secondary" icon={Download} onClick={onExport} loading={exporting} disabled={!data || data.total === 0}>
            Export CSV
          </Button>
        }
      />

      <p className="-mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2">
        {everyone ? (
          <>
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            Showing everyone's actions in this workspace.
          </>
        ) : (
          <>
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
            Showing your own actions. An admin or operator can see everyone's.
          </>
        )}
      </p>

      <Panel prominence="lead" flush className="overflow-hidden" data-list-top="">
        <RecordBar
          trailing={
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={query.refetch} loading={query.isRefreshing}>
              Refresh
            </Button>
          }
        >
          <SearchInput size="sm" value={search} onChange={reset(setSearch)} placeholder="Search person, action, id or path…" className="w-full min-w-0 sm:max-w-xs" />
          <SegmentedControl label="Time range" options={RANGES} value={range} onChange={reset(setRange)} />
          <SegmentedControl label="Outcome" options={OUTCOMES} value={outcome} onChange={reset(setOutcome)} />
          {everyone && (
            <Select
              size="sm"
              aria-label="Person"
              value={actor}
              onChange={(event) => reset(setActor)(event.target.value)}
              options={[{ value: '', label: 'Everyone' }, ...(facets.data?.actors ?? []).map((a) => ({ value: a, label: a === 'anonymous' ? 'Not signed in' : a }))]}
              className="w-48"
            />
          )}
          <Select
            size="sm"
            aria-label="Action"
            value={action}
            onChange={(event) => reset(setAction)(event.target.value)}
            options={[{ value: '', label: 'Every action' }, ...(facets.data?.actions ?? []).map((a) => ({ value: a, label: actionLabel(a) }))]}
            className="w-56"
          />
          <ResultCount shown={formatNumber(data?.entries.length ?? 0)} total={formatNumber(data?.total ?? 0)} unit="entries" paged filtered={filtered} loading={!data && query.isLoading} />
        </RecordBar>

        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={query.refetch} title="The audit log could not be read" />
        ) : (
          <DataGrid
            caption="Audit log"
            columns={columns}
            rows={data?.entries ?? []}
            rowKey={(e) => e.id}
            loading={!data && query.isLoading}
            refreshing={query.isRefreshing}
            onRowClick={setSelected}
            emptyState={
              filtered ? (
                <EmptyState
                  compact
                  icon={SearchX}
                  title="Nothing matches"
                  description="No entry matches the time range, filters and search."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRange('7d');
                        setOutcome('');
                        setActor('');
                        setAction('');
                        setSearch('');
                        setPage(1);
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState compact icon={History} title="Nothing recorded yet" description="Actions appear here as people use the console." />
              )
            }
          />
        )}
        {data && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            unit="entries"
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </Panel>

      <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EntryDrawer({ entry, onClose }) {
  const outcome = entry ? OUTCOME_TAG[entry.outcome] ?? { tone: 'neutral', label: entry.outcome } : null;
  const details = entry?.details && Object.keys(entry.details).length > 0 ? entry.details : null;
  return (
    <Drawer
      open={Boolean(entry)}
      onClose={onClose}
      width="md"
      eyebrow="Audit log entry"
      title={entry ? actionLabel(entry.action, entry.outcome) : ''}
      subtitle={entry ? `${entry.actor === 'anonymous' ? 'Not signed in' : entry.actor} · ${formatDateTime(entry.occurred_at)}` : ''}
    >
      {entry && (
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={outcome.tone} dot>
              {outcome.label}
            </Tag>
            <Tag tone="neutral">HTTP {entry.status}</Tag>
            {entry.error_code && <Tag tone="neutral">{entry.error_code}</Tag>}
          </div>
          <div>
            <SectionLabel>What</SectionLabel>
            <DetailList className="mt-1">
              <DetailRow label="Action" mono>{entry.action}</DetailRow>
              <DetailRow label="On">{entry.target || <span className="text-ink-3">Nothing specific</span>}</DetailRow>
              <DetailRow label="Request" mono>{`${entry.method} ${entry.path}`}</DetailRow>
              <DetailRow label="Screen" mono>{entry.screen || '-'}</DetailRow>
            </DetailList>
          </div>
          <div>
            <SectionLabel>Who and from where</SectionLabel>
            <DetailList className="mt-1">
              <DetailRow label="Person">{entry.actor === 'anonymous' ? 'Not signed in' : entry.actor}</DetailRow>
              <DetailRow label="Role at the time">{entry.actor_role ? roleMeta(entry.actor_role).label : '-'}</DetailRow>
              <DetailRow label="Address" mono>{entry.ip || '-'}</DetailRow>
              <DetailRow label="Browser">{entry.user_agent || '-'}</DetailRow>
            </DetailList>
          </div>
          <div>
            <SectionLabel>When</SectionLabel>
            <DetailList className="mt-1">
              <DetailRow label="Local time">{formatDateTime(entry.occurred_at)}</DetailRow>
              <DetailRow label="UTC" mono>{formatUtc(entry.occurred_at)}</DetailRow>
              <DetailRow label="Took">{`${formatNumber(entry.duration_ms)} ms`}</DetailRow>
              <DetailRow label="Request id" mono>{entry.request_id || '-'}</DetailRow>
            </DetailList>
          </div>
          {details && (
            <div>
              <SectionLabel>What was sent</SectionLabel>
              <p className="mt-1 text-[11.5px] text-ink-3">Passwords, tokens and other secret-looking values are removed before an entry is stored.</p>
              <pre className="mt-2 max-h-80 overflow-auto rounded-[var(--radius-control)] border border-line bg-inset px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-2">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
