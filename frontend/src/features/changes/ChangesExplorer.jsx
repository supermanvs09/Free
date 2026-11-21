import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { changeEntityRoute } from '../../lib/api/changes';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { DIFF_LIMIT, diffValues, isPlainObject, parseJsonish } from '../../lib/jsonDiff';
import { CopyableValue } from '../../ui/Copyable';
import { SearchInput } from '../../ui/Field';
import { cn } from '../../ui/cn';
import { CHANGE_META, ChangeBadge, ChangeDetails, ENTITY_META, EvidenceCard, RiskBadge, Value, fieldLabel } from './parts';
import { changeRisk, changeStory, groupChanges, groupRisk, groupStory, shortName } from './story';

/*
 * Scan changes as an audit history, the way cloud security tools show it
 * (Wiz Audit History, the AWS Config resource timeline): what needs attention
 * first, then one row per changed resource on the left and, on the right,
 * everything this scan changed on the selected resource, each field as a
 * Before | After pair and who made the change when CloudTrail recorded it.
 */

const RISK_ORDER = { critical: 0, high: 1 };
const latest = (changes) => changes.reduce((a, c) => (new Date(c.detectedAt) > new Date(a.detectedAt) ? c : a), changes[0]);

export function ChangesExplorer({ changes }) {
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groupChanges(changes)
      .map((g) => ({ ...g, risk: groupRisk(g.changes), lead: g.changes[0], story: groupStory(g.changes) ?? changeStory(g.changes[0]) ?? g.changes[0].summary }))
      .filter((g) => !term || [g.lead.name, g.lead.arn, g.story, ...g.changes.map((c) => changeStory(c) ?? c.summary)].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .sort((a, b) => (RISK_ORDER[a.risk?.level] ?? 9) - (RISK_ORDER[b.risk?.level] ?? 9));
  }, [changes, search]);

  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!groups.some((g) => g.key === selected)) setSelected(groups[0]?.key ?? null);
  }, [groups, selected]);
  const current = groups.find((g) => g.key === selected) ?? null;
  const attention = groups.filter((g) => g.risk).slice(0, 4);

  return (
    <div className="flex flex-col">
      {attention.length > 0 && !search && (
        <section aria-label="Needs attention" className="border-b border-line px-4 py-4 sm:px-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            <ShieldAlert aria-hidden="true" className="size-3.5 text-high" /> Needs attention
          </p>
          <ul className="mt-2.5 grid gap-2.5 @min-[44rem]:grid-cols-2 @min-[80rem]:grid-cols-4">
            {attention.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setSelected(g.key)}
                  className={cn(
                    'flex h-full w-full flex-col gap-1.5 rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                    g.risk.level === 'critical' ? 'border-critical/30 bg-critical-soft/40 hover:border-critical/60' : 'border-high/30 bg-high-soft/40 hover:border-high/60',
                    selected === g.key && 'ring-2 ring-brand/40',
                  )}
                >
                  <RiskBadge risk={g.risk} />
                  <span className="text-[12.5px] leading-snug font-medium text-ink">{g.story}</span>
                  <span className="mt-auto text-[11px] text-ink-3">{g.risk.reasons[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid min-h-[28rem] @min-[64rem]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="border-b border-line @min-[64rem]:border-r @min-[64rem]:border-b-0">
          <div className="border-b border-line p-3">
            <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search a resource or change" aria-label="Search changes" />
          </div>
          <p className="px-4 pt-3 pb-1 text-[11px] text-ink-3">
            {formatNumber(groups.length)} {groups.length === 1 ? 'resource' : 'resources'} changed · riskiest first
          </p>
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-ink-3">No change matches your search.</p>
          ) : (
            <ul className="max-h-[40rem] overflow-y-auto pb-2">
              {groups.map((g) => (
                <ResourceRow key={g.key} group={g} active={g.key === selected} onSelect={() => setSelected(g.key)} />
              ))}
            </ul>
          )}
        </aside>
        <section aria-label="Selected resource" className="min-w-0">
          {current ? <ResourceDetail group={current} /> : <p className="p-6 text-[12.5px] text-ink-3">Select a resource to see what changed.</p>}
        </section>
      </div>
    </div>
  );
}

function ResourceRow({ group: g, active, onSelect }) {
  const Icon = ENTITY_META[g.lead.entityType]?.icon;
  const types = [...new Set(g.changes.map((c) => c.changeType))];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className={cn('flex w-full items-start gap-2.5 border-l-2 px-4 py-2.5 text-left transition-colors', active ? 'border-brand bg-brand-soft/50' : 'border-transparent hover:bg-surface-2')}
      >
        {Icon && <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink" title={g.lead.arn}>
            {g.lead.name || shortName(g.lead.arn)}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">{g.story}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            {types.map((t) => (
              <span key={t} className={cn('font-semibold', CHANGE_META[t]?.tone === 'low' ? 'text-low' : CHANGE_META[t]?.tone === 'critical' ? 'text-critical' : 'text-medium')}>
                {CHANGE_META[t]?.label}
              </span>
            ))}
            <span>· {formatNumber(g.changes.length)} {g.changes.length === 1 ? 'change' : 'changes'}</span>
          </span>
        </span>
        {g.risk && <span aria-label={`${g.risk.level} risk`} className={cn('mt-1.5 size-2 shrink-0 rounded-full', g.risk.level === 'critical' ? 'bg-critical' : 'bg-high')} />}
      </button>
    </li>
  );
}

function ResourceDetail({ group: g }) {
  const lead = g.lead;
  const to = changeEntityRoute(lead);
  const place = [lead.accountId, lead.region].filter(Boolean).join(' · ');
  const last = latest(g.changes);
  return (
    <div className="@container flex flex-col gap-5 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-ink">{lead.name || shortName(lead.arn)}</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {ENTITY_META[lead.entityType]?.label ?? 'Resource'}
            {place ? ` · ${place}` : ''} · detected <span title={formatDateTime(last.detectedAt)}>{formatRelative(last.detectedAt)}</span>
          </p>
          <p className="mt-1 min-w-0 text-[12px]">
            <CopyableValue value={lead.arn} />
          </p>
        </div>
        {to && (
          <Link to={to} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
            Open {ENTITY_META[lead.entityType]?.label?.toLowerCase() ?? 'record'} <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </header>

      {g.risk && (
        <div className={cn('rounded-[var(--radius-control)] border px-3.5 py-3', g.risk.level === 'critical' ? 'border-critical/30 bg-critical-soft/40' : 'border-high/30 bg-high-soft/40')}>
          <RiskBadge risk={g.risk} />
          <ul className="mt-1.5 list-disc pl-5 text-[12.5px] text-ink-2">
            {g.risk.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {g.changes.length > 1 && groupStory(g.changes) && <p className="text-[13.5px] font-medium text-ink">{groupStory(g.changes)}</p>}

      <ol className="flex flex-col gap-4">
        {g.changes.map((c) => (
          <ChangeCard key={c.id} change={c} />
        ))}
      </ol>
    </div>
  );
}

/** One change: what happened, the Before | After of each field, and who did it. */
export function ChangeCard({ change: c }) {
  const fields = Array.isArray(c.details?.fields_changed) ? c.details.fields_changed : [];
  const rest = { ...c, details: { ...c.details, fields_changed: undefined } };
  const hasRest = Object.entries(rest.details).some(([k, v]) => k !== 'fields_changed' && v !== undefined && v !== null);
  return (
    <li className="rounded-[var(--radius-control)] border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-3.5 py-2.5">
        <ChangeBadge type={c.changeType} />
        <span className="text-[12px] text-ink-3">{ENTITY_META[c.entityType]?.label}</span>
        <RiskBadge risk={changeRisk(c)} />
        <span className="ml-auto text-[11.5px] text-ink-3" title={formatDateTime(c.detectedAt)}>
          {formatRelative(c.detectedAt)}
        </span>
      </div>
      <div className="flex flex-col gap-3.5 px-3.5 py-3">
        <p className="text-[13px] font-medium text-ink">{changeStory(c) ?? c.summary}</p>
        {fields.length > 0 && <BeforeAfter fields={fields} />}
        {hasRest && <ChangeDetails change={rest} />}
        {c.evidence && <EvidenceCard evidence={c.evidence} changeType={c.changeType} />}
      </div>
    </li>
  );
}

/** Only the keys that moved, as a Before | After table. */
function BeforeAfter({ fields }) {
  const rows = fields.flatMap((entry) => {
    const field = String(entry.field ?? '');
    const a = parseJsonish(entry.old ?? entry.old_value);
    const b = parseJsonish(entry.new ?? entry.new_value);
    const structured = (isPlainObject(a) || Array.isArray(a)) && (isPlainObject(b) || Array.isArray(b));
    if (!structured) return [{ label: fieldLabel(field), before: a, after: b }];
    return diffValues(a, b)
      .slice(0, DIFF_LIMIT)
      .map((leaf) => ({ label: [fieldLabel(field), ...leaf.path.map((p) => (typeof p === 'number' ? `#${p + 1}` : fieldLabel(String(p))))].join(' › '), before: leaf.before, after: leaf.after }));
  });
  return (
    <table className="w-full table-fixed overflow-hidden rounded-[var(--radius-control)] border border-line text-left text-[12.5px]">
      <thead>
        <tr className="border-b border-line bg-surface-2 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          <th className="w-[28%] px-3 py-2 font-semibold">Field</th>
          <th className="px-3 py-2 font-semibold">Before</th>
          <th className="px-3 py-2 font-semibold">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label}-${i}`} className="border-b border-line align-top last:border-b-0">
            <td className="px-3 py-2 text-ink-2 [overflow-wrap:anywhere]">{r.label}</td>
            <td className="bg-critical-soft/30 px-3 py-2 [overflow-wrap:anywhere] text-ink-2">
              <Value value={r.before} />
            </td>
            <td className="bg-low-soft/40 px-3 py-2 font-medium [overflow-wrap:anywhere] text-ink">
              <Value value={r.after} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
