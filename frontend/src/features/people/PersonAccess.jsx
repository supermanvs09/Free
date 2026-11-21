import { useMemo, useState } from 'react';
import { KeyRound, ListChecks } from 'lucide-react';
import { formatNumber, formatRelative } from '../../lib/format';
import { DataGrid } from '../../ui/DataGrid';
import { SearchInput } from '../../ui/Field';
import { SectionLabel } from '../../ui/Panel';
import { EmptyState } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { sessionLength } from './peopleMeta';

const TYPE_LABEL = {
  iam_inline_policy: 'Inline policy',
  iam_policy: 'Managed policy',
  permission_set: 'Permission set',
};

const lastSegment = (arn) => (arn ? String(arn).split('/').pop() : '');

/** Card title: the permission set or policy name, else the end of its ARN. */
export function accessTitle(a) {
  return (
    a.permission_set_name ||
    a.policy_name ||
    lastSegment(a.policy_arn) ||
    lastSegment(a.permission_set_arn) ||
    lastSegment(a.role_arn) ||
    TYPE_LABEL[a.access_type] ||
    'Access'
  );
}

export function accessTypeLabel(type) {
  if (TYPE_LABEL[type]) return TYPE_LABEL[type];
  const text = String(type ?? '').replace(/_/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : 'Access';
}

const asList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/** One row per action and resource in the Allow statements of a policy document. */
export function allowedActions(doc, source) {
  let parsed = doc;
  if (typeof doc === 'string') {
    try {
      parsed = JSON.parse(doc);
    } catch {
      return [];
    }
  }
  const out = [];
  for (const st of asList(parsed?.Statement)) {
    if (String(st?.Effect ?? '').toLowerCase() !== 'allow') continue;
    const resources = asList(st.Resource);
    for (const action of asList(st.Action)) {
      const text = String(action);
      const [service, name] = text === '*' ? ['*', '*'] : text.includes(':') ? text.split(/:(.*)/s) : ['', text];
      for (const resource of resources.length ? resources : ['']) {
        out.push({ action: text, service, name, resource: String(resource), source });
      }
    }
  }
  return out;
}

/**
 * The Access tab: the same shape as the non-human Permissions tab. Figures,
 * where the access comes from (one card per grant), then every allowed action
 * with a search. Usage per action is not collected for people, so no "used"
 * column is shown rather than one that would read "never used" for everything.
 */
export function PersonAccess({ access }) {
  const [search, setSearch] = useState('');
  const actions = useMemo(
    () => access.flatMap((a) => allowedActions(a.policy_document, accessTitle(a))),
    [access],
  );
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((row) => [row.action, row.resource, row.source].some((v) => v.toLowerCase().includes(term)));
  }, [actions, search]);

  const admin = access.filter((a) => a.is_admin ?? /admin/i.test(`${a.permission_set_name ?? ''} ${a.policy_arn ?? ''}`)).length;
  const escalation = access.filter((a) => a.has_escalation).length;
  const wildcard = actions.filter((row) => row.resource === '*').length;

  if (access.length === 0) {
    return <EmptyState compact icon={KeyRound} title="No access recorded" description="The discovery scan found no policy or permission set for this person." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Access summary" className="grid grid-cols-2 gap-4 rounded-[var(--radius-control)] border border-line bg-surface-2 p-4 sm:grid-cols-4">
        <Figure label="Grants" value={access.length} />
        <Figure label="Actions allowed" value={actions.length} />
        <Figure label="Admin-level" value={admin} tone={admin > 0 ? 'text-high' : undefined} />
        <Figure label="Escalation risk" value={escalation} tone={escalation > 0 ? 'text-critical' : undefined} />
      </section>

      <div>
        <SectionLabel>Where the access comes from</SectionLabel>
        <ul className="mt-2 flex flex-col gap-1.5">
          {access.map((a) => (
            <AccessCard key={a.id} access={a} />
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>
            Allowed actions{' '}
            {wildcard > 0 && (
              <span className="font-normal text-high">
                · {formatNumber(wildcard)} on every resource
              </span>
            )}
          </SectionLabel>
          <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search actions, resources, policies" aria-label="Search allowed actions" className="w-64" />
        </div>
        <DataGrid
          className="mt-2"
          caption="Allowed actions"
          rows={rows}
          rowKey={(row, index) => `${row.source}-${row.action}-${row.resource}-${index}`}
          density="compact"
          columns={[
            {
              key: 'action',
              header: 'Action',
              primary: true,
              width: '38%',
              cell: (row) => (
                <span className="block min-w-0">
                  <span className="block truncate font-mono text-[12.5px] text-ink" title={row.action}>
                    {row.name || row.action}
                  </span>
                  <span className="block truncate text-[11px] text-ink-3">{row.service === '*' ? 'Every service' : row.service || 'Service not recorded'}</span>
                </span>
              ),
            },
            {
              key: 'resource',
              header: 'Resource',
              width: '34%',
              cell: (row) => (
                <span className={cn('block truncate font-mono text-[12px]', row.resource === '*' ? 'text-high' : 'text-ink-2')} title={row.resource}>
                  {row.resource === '*' ? '* (every resource)' : row.resource || 'Not recorded'}
                </span>
              ),
            },
            {
              key: 'source',
              header: 'Allowed by',
              width: '28%',
              cell: (row) => (
                <span className="block truncate text-[12.5px] text-ink-2" title={row.source}>
                  {row.source}
                </span>
              ),
            },
          ]}
          emptyState={
            actions.length === 0 ? (
              <EmptyState
                compact
                icon={ListChecks}
                title="No policy document recorded"
                description="The grants are listed above; their policy text was not collected, so the actions cannot be listed."
              />
            ) : (
              <EmptyState compact icon={ListChecks} title="No allowed action matches your search" description="Try another action, resource or policy name." />
            )
          }
        />
      </div>
    </div>
  );
}

function AccessCard({ access: a }) {
  /* The API flags admin and escalation from the policy document too; older answers without the flags fall back to the name. */
  const admin = a.is_admin ?? /admin/i.test(`${a.permission_set_name ?? ''} ${a.policy_arn ?? ''}`);
  const viaGroup = a.granted_via === 'group' || a.group_id;
  return (
    <li className="rounded-[var(--radius-control)] border border-line px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <KeyRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold [overflow-wrap:anywhere] text-ink">{accessTitle(a)}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {accessTypeLabel(a.access_type)} · Account <span className="font-mono">{a.account_id}</span> ·{' '}
            {viaGroup ? (
              <>
                via group <span className="font-medium text-ink-2">{a.group_name || a.group_id || 'not named'}</span>
              </>
            ) : (
              'assigned directly'
            )}
            {a.session_duration ? ` · ${sessionLength(a.session_duration)} sessions` : ''}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">{a.last_used_at ? `Last used ${formatRelative(a.last_used_at)}` : 'No use recorded'}</p>
          {a.policy_document && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[11.5px] font-medium text-brand">Policy document</summary>
              <pre className="mt-1.5 max-h-56 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
                {JSON.stringify(a.policy_document, null, 2)}
              </pre>
            </details>
          )}
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {admin && (
            <Tag tone="high" size="sm">
              Admin-level
            </Tag>
          )}
          {a.has_escalation && (
            <Tag tone="critical" size="sm">
              Escalation risk
            </Tag>
          )}
        </span>
      </div>
    </li>
  );
}

function Figure({ label, value, tone }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{label}</p>
      <p data-numeric="" className={cn('mt-1 text-[22px] font-bold', tone || 'text-ink')}>
        {formatNumber(value)}
      </p>
    </div>
  );
}
