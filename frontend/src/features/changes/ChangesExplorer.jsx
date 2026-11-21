import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, ShieldAlert } from 'lucide-react';
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
 * first, then one row per changed resource and, beside it, everything this
 * scan changed on the selected resource, each field as Before / After and who
 * made the change when CloudTrail recorded it.
 *
 * Colour is kept for meaning only: a red or amber mark for risk, a small dot
 * for created / deleted / modified, red for a risky action. Everything else is
 * ink on the surface, so the risky lines are the ones that stand out.
 */

const RISK_ORDER = { critical: 0, high: 1 };
const latest = (changes) => changes.reduce((a, c) => (new Date(c.detectedAt) > new Date(a.detectedAt) ? c : a), changes[0]);
const riskTone = (risk) => (risk?.level === 'critical' ? 'text-critical' : 'text-high');

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
  const attention = groups.filter((g) => g.risk);
  const critical = attention.filter((g) => g.risk.level === 'critical').length;

  return (
    <div className="flex flex-col">
      {attention.length > 0 && !search && (
        <section aria-label="Needs attention" className="border-b border-line px-4 py-4 sm:px-5">
          <h3 className="text-[13px] font-semibold text-ink">
            Needs attention
            <span className="ml-2 font-normal text-ink-3">
              {critical > 0 && `${formatNumber(critical)} critical`}
              {critical > 0 && attention.length > critical && ' · '}
              {attention.length > critical && `${formatNumber(attention.length - critical)} high risk`}
            </span>
          </h3>
          <ul className="mt-2.5 divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {attention.slice(0, 5).map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setSelected(g.key)}
                  aria-current={selected === g.key || undefined}
                  className={cn('grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2', selected === g.key && 'bg-surface-2')}
                >
                  <ShieldAlert aria-hidden="true" className={cn('mt-0.5 size-4', riskTone(g.risk))} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{g.story}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{g.risk.reasons.join(' · ')}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[12px] whitespace-nowrap text-ink-3">
                    {formatRelative(latest(g.changes).detectedAt)}
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {attention.length > 5 && <p className="mt-2 text-[12px] text-ink-3">{formatNumber(attention.length - 5)} more below, marked with a shield.</p>}
        </section>
      )}

      <div className="grid min-h-[28rem] @min-[64rem]:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <aside className="border-b border-line bg-surface-2/40 @min-[64rem]:border-r @min-[64rem]:border-b-0">
          <div className="border-b border-line p-3">
            <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search resources and changes" aria-label="Search changes" />
          </div>
          <p className="px-4 pt-3 pb-1.5 text-[12px] text-ink-3">
            {formatNumber(groups.length)} {groups.length === 1 ? 'resource' : 'resources'} changed
          </p>
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">No change matches your search.</p>
          ) : (
            <ul className="max-h-[40rem] overflow-y-auto px-2 pb-2">
              {groups.map((g) => (
                <ResourceRow key={g.key} group={g} active={g.key === selected} onSelect={() => setSelected(g.key)} />
              ))}
            </ul>
          )}
        </aside>
        <section aria-label="Selected resource" className="min-w-0">
          {current ? <ResourceDetail group={current} /> : <p className="p-6 text-[13px] text-ink-3">Select a resource to see what changed.</p>}
        </section>
      </div>
    </div>
  );
}

function ResourceRow({ group: g, active, onSelect }) {
  const Icon = ENTITY_META[g.lead.entityType]?.icon;
  const types = [...new Set(g.changes.map((c) => CHANGE_META[c.changeType]?.label ?? c.changeType))];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors',
          active ? 'bg-surface shadow-[0_0_0_1px_var(--t-line)]' : 'hover:bg-surface/70',
        )}
      >
        {Icon && <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-ink" title={g.lead.arn}>
              {g.lead.name || shortName(g.lead.arn)}
            </span>
            {g.risk && <ShieldAlert aria-label={g.risk.level === 'critical' ? 'Critical risk' : 'High risk'} className={cn('size-3.5 shrink-0', riskTone(g.risk))} />}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-2">{g.story}</span>
          <span className="mt-0.5 block text-[11.5px] text-ink-3">
            {types.join(', ')} · {formatNumber(g.changes.length)} {g.changes.length === 1 ? 'change' : 'changes'}
          </span>
        </span>
      </button>
    </li>
  );
}

function ResourceDetail({ group: g }) {
  const lead = g.lead;
  const to = changeEntityRoute(lead);
  const place = [lead.accountId, lead.region].filter(Boolean).join(' · ');
  const last = latest(g.changes);
  const story = g.changes.length > 1 ? groupStory(g.changes) : null;
  return (
    <div className="@container flex flex-col gap-6 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold text-balance text-ink">{lead.name || shortName(lead.arn)}</h3>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {ENTITY_META[lead.entityType]?.label ?? 'Resource'}
            {place ? ` · ${place}` : ''} · detected <span title={formatDateTime(last.detectedAt)}>{formatRelative(last.detectedAt)}</span>
          </p>
          <p className="mt-1.5 min-w-0 text-[12px] text-ink-2">
            <CopyableValue value={lead.arn} />
          </p>
        </div>
        {to && (
          <Link to={to} className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink hover:bg-surface-2">
            Open {ENTITY_META[lead.entityType]?.label?.toLowerCase() ?? 'record'} <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </header>

      {g.risk && (
        <div className="flex items-start gap-2.5">
          <ShieldAlert aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', riskTone(g.risk))} />
          <div className="min-w-0">
            <p className={cn('text-[13px] font-semibold', riskTone(g.risk))}>{g.risk.level === 'critical' ? 'Critical risk' : 'High risk'}</p>
            <ul className="mt-0.5 text-[13px] text-ink-2">
              {g.risk.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {story && <p className="text-[14px] font-medium text-ink">{story}</p>}

      <ol className="flex flex-col">
        {g.changes.map((c, i) => (
          <ChangeEntry key={c.id} change={c} last={i === g.changes.length - 1} />
        ))}
      </ol>
    </div>
  );
}

/** One change in a resource's history: a dot on the timeline, the sentence, then the evidence. */
function ChangeEntry({ change: c, last }) {
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
      <span aria-hidden="true" className="relative flex justify-center">
        <span className="mt-1.5 size-2 rounded-full border border-ink-3/60 bg-surface" />
        {!last && <span className="absolute top-4 bottom-0 w-px bg-line" />}
      </span>
      <div className={cn('min-w-0', !last && 'pb-6')}>
        <ChangeCard change={c} />
      </div>
    </li>
  );
}

/** One change: what happened, the Before / After of each field, and who did it. */
export function ChangeCard({ change: c }) {
  const fields = Array.isArray(c.details?.fields_changed) ? c.details.fields_changed : [];
  const rest = { ...c, details: { ...c.details, fields_changed: undefined } };
  const hasRest = Object.entries(rest.details).some(([k, v]) => k !== 'fields_changed' && v !== undefined && v !== null);
  const risk = changeRisk(c);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-3">
          <ChangeBadge type={c.changeType} />
          <span>{ENTITY_META[c.entityType]?.label}</span>
          <span title={formatDateTime(c.detectedAt)}>{formatRelative(c.detectedAt)}</span>
          {risk && <RiskBadge risk={risk} />}
        </p>
        <p className="mt-1 text-[14px] font-medium text-ink">{changeStory(c) ?? c.summary}</p>
      </div>
      {fields.length > 0 && <BeforeAfter fields={fields} />}
      {hasRest && <ChangeDetails change={rest} />}
      {c.evidence && <EvidenceCard evidence={c.evidence} changeType={c.changeType} />}
    </div>
  );
}

/** Only the keys that moved, as Before / After rows, the way a code review shows a diff. */
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
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-line">
      <table className="w-full table-fixed text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-[12px] text-ink-3">
            <th className="w-[30%] px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.label}-${i}`} className="border-b border-line align-top last:border-b-0">
              <td className="px-3 py-2 [overflow-wrap:anywhere] text-ink-2">{r.label}</td>
              <td className="px-3 py-2 [overflow-wrap:anywhere] text-ink-3">
                <span aria-hidden="true" className="mr-1.5 font-mono text-critical/70">−</span>
                <Value value={r.before} />
              </td>
              <td className="px-3 py-2 font-medium [overflow-wrap:anywhere] text-ink">
                <span aria-hidden="true" className="mr-1.5 font-mono text-low">+</span>
                <Value value={r.after} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
