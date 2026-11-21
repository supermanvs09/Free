import { useMemo, useState } from 'react';
import { ChevronDown, KeyRound, SearchX } from 'lucide-react';
import { formatNumber, formatRelative } from '../../lib/format';
import { summarisePolicy } from '../../lib/iamAccess';
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

const isAdmin = (a) => a.is_admin ?? /admin/i.test(`${a.permission_set_name ?? ''} ${a.policy_arn ?? ''}`);

/**
 * The Access tab, laid out like the AWS console's policy summary: one card
 * per grant (permission set, managed or inline policy) and, inside it, one
 * row per service with the access levels it grants - "Full access" or
 * "Limited: Read, Write" - and on which resources. A service opens to its
 * actions. One search filters grants, services and actions at once.
 */
export function PersonAccess({ access }) {
  const [search, setSearch] = useState('');
  const grants = useMemo(() => access.map((a) => ({ a, title: accessTitle(a), services: summarisePolicy(a.policy_document) })), [access]);
  const term = search.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!term) return grants;
    const hit = (v) => String(v ?? '').toLowerCase().includes(term);
    return grants
      .map((g) => {
        if (hit(g.title) || hit(g.a.group_name) || hit(g.a.account_id) || hit(g.a.policy_arn)) return g;
        const services = g.services
          .map((s) => (hit(s.name) || hit(s.service) ? s : { ...s, actions: s.actions.filter((x) => hit(x.action) || hit(`${s.service}:${x.action}`)) }))
          .filter((s) => hit(s.name) || hit(s.service) || s.actions.length > 0 || s.resources.some(hit));
        return services.length ? { ...g, services, matched: true } : null;
      })
      .filter(Boolean);
  }, [grants, term]);

  if (access.length === 0) {
    return <EmptyState compact icon={KeyRound} title="No access recorded" description="The discovery scan found no policy or permission set for this person." />;
  }

  const admin = access.filter(isAdmin).length;
  const escalation = access.filter((a) => a.has_escalation).length;
  const services = new Set(grants.flatMap((g) => g.services.filter((s) => s.effect === 'Allow').map((s) => s.service)));
  const viaGroup = access.filter((a) => a.granted_via === 'group' || a.group_id).length;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Access summary" className="grid grid-cols-2 gap-4 rounded-[var(--radius-control)] border border-line bg-surface-2 p-4 sm:grid-cols-4">
        <Figure label="Grants" value={access.length} caption={viaGroup ? `${formatNumber(viaGroup)} through groups` : 'All assigned directly'} />
        <Figure label="Services" value={services.size} caption="it can call" />
        <Figure label="Admin-level" value={admin} tone={admin > 0 ? 'text-high' : undefined} caption={admin ? 'full control' : 'none'} />
        <Figure label="Escalation risk" value={escalation} tone={escalation > 0 ? 'text-critical' : undefined} caption={escalation ? 'can raise own access' : 'none'} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>What this person can do</SectionLabel>
        <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search a service, action or policy" aria-label="Search access" className="w-72" />
      </div>

      {shown.length === 0 ? (
        <EmptyState compact icon={SearchX} title="Nothing matches" description="No grant, service or action matches your search." />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((g) => (
            <GrantCard key={g.a.id} grant={g} forceOpen={Boolean(term)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GrantCard({ grant, forceOpen }) {
  const { a, title, services } = grant;
  const [open, setOpen] = useState(true);
  const expanded = open || forceOpen;
  const admin = isAdmin(a);
  const viaGroup = a.granted_via === 'group' || a.group_id;
  const allows = services.filter((s) => s.effect === 'Allow');
  const denies = services.filter((s) => s.effect === 'Deny');
  return (
    <li className="overflow-hidden rounded-[var(--radius-control)] border border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={expanded} className="flex w-full items-start gap-2.5 bg-surface-2/60 px-3.5 py-3 text-left hover:bg-surface-2">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold [overflow-wrap:anywhere] text-ink">{title}</span>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">
            {accessTypeLabel(a.access_type)} · Account <span className="font-mono">{a.account_id}</span> ·{' '}
            {viaGroup ? (
              <>
                via group <span className="font-medium text-ink-2">{a.group_name || a.group_id || 'not named'}</span>
              </>
            ) : (
              'assigned directly'
            )}
            {a.session_duration ? ` · ${sessionLength(a.session_duration)} sessions` : ''}
            {a.last_used_at ? ` · last used ${formatRelative(a.last_used_at)}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
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
          <ChevronDown aria-hidden="true" className={cn('size-4 text-ink-3 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>
      {expanded && (
        <div className="border-t border-line">
          {services.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-ink-3">
              {a.policy_arn ? (
                <>
                  Uses the AWS managed policy <span className="font-mono text-ink-2">{lastSegment(a.policy_arn)}</span>. Its actions are defined by AWS and were not
                  collected with the scan.
                </>
              ) : (
                'The policy text was not collected, so its actions cannot be listed.'
              )}
            </p>
          ) : (
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  <th className="w-[30%] px-3.5 py-2 font-semibold">Service</th>
                  <th className="w-[36%] px-2 py-2 font-semibold">Access level</th>
                  <th className="px-2 py-2 pr-3.5 font-semibold">Resources</th>
                </tr>
              </thead>
              <tbody>
                {[...allows, ...denies].map((s) => (
                  <ServiceRow key={`${s.effect}|${s.service}`} row={s} open={forceOpen && grant.matched} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

function ServiceRow({ row, open: forced }) {
  const [open, setOpen] = useState(false);
  const expanded = open || forced;
  const deny = row.effect === 'Deny';
  const anyResource = row.resources.includes('*');
  return (
    <>
      <tr className={cn('border-b border-line align-top last:border-b-0', deny && 'bg-surface-2/50')}>
        <td className="px-3.5 py-2">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={expanded} className="flex items-start gap-1 text-left">
            <ChevronDown aria-hidden="true" className={cn('mt-0.5 size-3.5 shrink-0 text-ink-3 transition-transform', !expanded && '-rotate-90')} />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">{row.name}</span>
              <span className="block text-[11px] text-ink-3">
                {formatNumber(row.actions.length)} {row.actions.length === 1 ? 'action' : 'actions'}
                {deny ? ' · denied' : ''}
              </span>
            </span>
          </button>
        </td>
        <td className="px-2 py-2">
          <span className={cn('text-[12.5px]', deny ? 'text-ink-3 line-through' : row.admin ? 'font-semibold text-high' : 'text-ink-2')}>{row.levelText}</span>
          {row.conditions && <span className="mt-0.5 block text-[11px] text-ink-3">With conditions</span>}
        </td>
        <td className="px-2 py-2 pr-3.5">
          {anyResource ? (
            <span className={cn('text-[12px]', deny ? 'text-ink-3' : 'font-medium text-high')}>All resources</span>
          ) : (
            row.resources.slice(0, 2).map((r) => (
              <span key={r} className="block truncate font-mono text-[11.5px] text-ink-2" title={r}>
                {lastSegment(r) || r}
              </span>
            ))
          )}
          {!anyResource && row.resources.length > 2 && <span className="text-[11px] text-ink-3">+{formatNumber(row.resources.length - 2)} more</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface-2/40">
          <td colSpan={3} className="px-3.5 py-2.5 pl-9">
            <ul className="flex flex-wrap gap-1.5">
              {row.actions.map((x, i) => (
                <li key={`${x.action}-${i}`} className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11.5px]" title={x.level}>
                  <span className="font-mono text-ink">{x.action}</span>
                  <span className="ml-1.5 text-ink-3">{x.level}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function Figure({ label, value, tone, caption }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{label}</p>
      <p data-numeric="" className={cn('mt-1 text-[22px] font-bold', tone || 'text-ink')}>
        {formatNumber(value)}
      </p>
      {caption && <p className="text-[11px] text-ink-3">{caption}</p>}
    </div>
  );
}
