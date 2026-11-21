import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { fetchPermissionSets } from '../../lib/api/humanIdentities';
import { useQuery } from '../../lib/hooks';
import { formatNumber, formatRelative } from '../../lib/format';
import { DataGrid } from '../../ui/DataGrid';
import { SearchInput } from '../../ui/Field';
import { Panel, PanelHeader } from '../../ui/Panel';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { sessionLength } from './peopleMeta';

const KIND_LABEL = { managed: 'Managed policy', inline: 'Inline policy', permission_set: 'Permission set' };
const USAGE = [
  { value: 'all', label: 'All' },
  { value: 'used', label: 'Used' },
  { value: 'unused', label: 'Unused' },
];
const plural = (count, one, many) => `${formatNumber(count)} ${count === 1 ? one : many}`;

/**
 * What each IAM policy and SSO permission set allows, and who holds it.
 * Follows the page's "Signs in with" choice. Used / Unused appear only when
 * usage is collected (IAM with the activity store on); SSO sets never claim
 * "never used" for actions nobody measured.
 */
export function PermissionSets({ source }) {
  const [usage, setUsage] = useState('all');
  const [search, setSearch] = useState('');
  const query = useQuery((signal) => fetchPermissionSets({ source, usage }, signal), [source, usage]);
  const sets = query.data ?? [];
  const usageOn = usage !== 'all' || sets.some((s) => s.usage_available);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sets;
    return sets.filter((s) =>
      [s.name, s.arn, ...(s.assigned_identities ?? []).map((i) => i.user_name), ...(s.actions ?? []).map((a) => `${a.service}:${a.action}`)].some((v) =>
        String(v ?? '').toLowerCase().includes(term),
      ),
    );
  }, [sets, search]);

  return (
    <Panel prominence="quiet" className="animate-rise">
      <PanelHeader
        prominence="quiet"
        title="Permission sets and policies"
        subtitle="What each IAM policy and single sign-on permission set allows, and who holds it."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search sets, people, actions" aria-label="Search permission sets" className="w-60" />
            {usageOn && <SegmentedControl label="Actions" options={USAGE} value={usage} onChange={setUsage} />}
          </span>
        }
      />
      {query.isError && !query.data ? (
        <ErrorState compact error={query.error} onRetry={query.refetch} title="Permission sets could not be loaded" />
      ) : !query.data ? (
        <p className="mt-3 text-[12.5px] text-ink-3">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-3">
          {search.trim()
            ? 'Nothing matches your search.'
            : usage === 'used'
              ? 'No allowed action was used in the last 90 days.'
              : usage === 'unused'
                ? 'Every allowed action was used in the last 90 days.'
                : 'No policy or permission set is assigned to a person.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {shown.map((set, i) => (
            <SetRow key={`${set.source}|${set.kind}|${set.arn}|${set.name}|${i}`} set={set} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SetRow({ set }) {
  const people = set.assigned_identities ?? [];
  const actions = set.actions ?? [];
  const accounts = new Set(people.flatMap((p) => p.account_ids ?? []));
  const s = set.summary ?? {};
  const admin = actions.some((a) => a.service === '*' || a.action === '*') || /admin/i.test(`${set.name} ${(set.policies ?? []).map((p) => p.name).join(' ')}`);
  return (
    <li className="py-2.5">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-ink" title={set.arn || set.name}>
              {set.name || set.arn}
            </span>
            <span className="block text-[11.5px] text-ink-3">
              {KIND_LABEL[set.kind] ?? set.kind} · {plural(people.length, 'person', 'people')} · {plural(accounts.size, 'account', 'accounts')} ·{' '}
              {plural(s.actions_allowed ?? actions.length, 'action', 'actions')}
              {set.session_duration ? ` · ${sessionLength(set.session_duration)} sessions` : ''}
            </span>
          </span>
          {set.usage_available && s.never_used != null && (
            <span className="shrink-0 text-right text-[11.5px] text-ink-3">
              <span className={cn('block font-semibold', s.never_used > 0 ? 'text-high' : 'text-low')}>{formatNumber(s.share_used_pct)}% used</span>
              {formatNumber(s.never_used)} never used
            </span>
          )}
          <Tag tone="neutral" size="sm">
            {set.source === 'sso' ? 'Single sign-on' : 'AWS IAM'}
          </Tag>
          {admin && (
            <Tag tone="high" size="sm">
              Admin-level
            </Tag>
          )}
        </summary>
        <div className="mt-3 grid gap-3 text-[11.5px] text-ink-2 sm:grid-cols-2">
          <div>
            <span className="block font-semibold text-ink-3">Policies</span>
            {(set.policies ?? []).length
              ? set.policies.map((p) => (
                  <span key={`${p.kind}|${p.arn}|${p.name}`} className="block truncate font-mono" title={p.arn || p.name}>
                    {p.name} <span className="font-sans text-ink-3">· {p.kind}</span>
                  </span>
                ))
              : 'None recorded'}
          </div>
          <div>
            <span className="block font-semibold text-ink-3">Held by</span>
            {people.map((p) => (
              <span key={p.human_id} className="block truncate" title={p.user_name}>
                {p.user_name} <span className="font-mono text-ink-3">· {(p.account_ids ?? []).join(', ')}</span>
              </span>
            ))}
          </div>
        </div>
        <DataGrid
          className="mt-3"
          caption={`Actions allowed by ${set.name}`}
          rows={actions}
          rowKey={(row, i) => `${row.service}:${row.action}|${row.resource}|${row.policy_source}|${i}`}
          density="compact"
          columns={[
            {
              key: 'action',
              header: 'Action',
              primary: true,
              width: '34%',
              cell: (row) => (
                <span className="block min-w-0">
                  <span className="block truncate font-mono text-[12.5px] text-ink">{row.action || 'No action recorded'}</span>
                  <span className="block truncate text-[11px] text-ink-3">{row.service === '*' ? 'Every service' : row.service || 'Service not recorded'}</span>
                </span>
              ),
            },
            {
              key: 'resource',
              header: 'Resource',
              width: '30%',
              cell: (row) => (
                <span className={cn('block truncate font-mono text-[12px]', row.resource === '*' ? 'text-high' : 'text-ink-2')} title={row.resource}>
                  {row.resource === '*' ? '* (every resource)' : row.resource || 'Not recorded'}
                </span>
              ),
            },
            {
              key: 'source',
              header: 'Allowed by',
              width: '20%',
              priority: 'wide',
              cell: (row) => <span className="block truncate text-[12.5px] text-ink-2">{row.policy_source}</span>,
            },
            {
              key: 'used',
              header: 'Used (90 days)',
              width: '16%',
              cell: (row) =>
                row.used_90d == null ? (
                  <span className="text-[11.5px] text-ink-3">Not collected</span>
                ) : row.used_90d ? (
                  <span className="block min-w-0">
                    <Tag tone="low" size="sm" dot>
                      Used
                    </Tag>
                    <span className="mt-0.5 block text-[11px] text-ink-3">{row.last_used_at ? formatRelative(row.last_used_at) : ''}</span>
                  </span>
                ) : (
                  <Tag tone="neutral" size="sm">
                    Never used
                  </Tag>
                ),
            },
          ]}
          emptyState={
            <EmptyState
              compact
              icon={ListChecks}
              title="No actions listed"
              description={set.source === 'sso' ? 'The permission set policy text is not collected, so its actions cannot be listed.' : 'No Allow statement was found.'}
            />
          }
        />
      </details>
    </li>
  );
}
