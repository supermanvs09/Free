import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ChevronDown, ShieldAlert } from 'lucide-react';
import { changeEntityRoute } from '../../lib/api/changes';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { DIFF_LIMIT, diffValues, isPlainObject, parseJsonish } from '../../lib/jsonDiff';
import { CopyableValue } from '../../ui/Copyable';
import { cn } from '../../ui/cn';
import { ChangeBadge, ChangeDetails, ENTITY_META, ENTITY_TYPES, EvidenceCard, RiskBadge, Value, fieldLabel } from './parts';
import { changeRisk, changeStory, groupChanges, groupImpact, groupRisk, groupStory, shortName } from './story';

/*
 * Scan changes as a digest: the question a security engineer opens this page
 * with is "did this scan make us riskier?", so the changes that raised risk
 * come first, then those that took access away, then everything else by
 * kind. Each line is one resource and reads as a sentence; it opens in place
 * to the field-by-field Before / After and who made the change. This follows
 * how change history reads in cloud security tools: impact first (Orca, Wiz
 * Audit History), which resources changed and which attributes (Terraform
 * drift), who / what / when per change (Wiz, AWS Config timeline).
 */

const latest = (changes) => changes.reduce((a, c) => (new Date(c.detectedAt) > new Date(a.detectedAt) ? c : a), changes[0]);

/** Groups of one scan's changes, each with its story and impact. */
export function useChangeGroups(changes, search) {
  return useMemo(() => {
    const term = search.trim().toLowerCase();
    return groupChanges(changes)
      .map((g) => ({
        ...g,
        lead: g.changes[0],
        risk: groupRisk(g.changes),
        impact: groupImpact(g.changes),
        story: groupStory(g.changes) ?? changeStory(g.changes[0]) ?? g.changes[0].summary,
      }))
      .filter((g) => !term || [g.lead.name, g.lead.arn, g.story, ...g.changes.map((c) => changeStory(c) ?? c.summary)].some((v) => String(v ?? '').toLowerCase().includes(term)));
  }, [changes, search]);
}

export function ChangesExplorer({ groups }) {
  const raised = groups.filter((g) => g.impact === 'raised').sort((a, b) => Number(b.risk?.level === 'critical') - Number(a.risk?.level === 'critical'));
  const reduced = groups.filter((g) => g.impact === 'reduced');
  const other = groups.filter((g) => g.impact === 'other');

  return (
    <div className="flex flex-col">
      {raised.length > 0 && (
        <Section title="Raised risk" count={raised.length} note="Wildcard access or trust, risky actions, new roles or keys, deleted roles. Review these first.">
          {raised.map((g) => (
            <ChangeLine key={g.key} group={g} />
          ))}
        </Section>
      )}
      {reduced.length > 0 && (
        <Section title="Reduced exposure" count={reduced.length} note="Access that was taken away: actions removed, trust or bindings deleted, credentials deleted.">
          {reduced.map((g) => (
            <ChangeLine key={g.key} group={g} />
          ))}
        </Section>
      )}
      {other.length > 0 && (
        <Section title="Other changes" count={other.length} note="Changes that neither add nor remove access, by kind.">
          {ENTITY_TYPES.map((type) => {
            const list = other.filter((g) => g.lead.entityType === type);
            return list.length ? <KindGroup key={type} type={type} groups={list} /> : null;
          })}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, note, children }) {
  return (
    <section aria-label={title} className="border-b border-line last:border-b-0">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 pt-5 pb-2">
        <h3 className="text-[14px] font-semibold text-ink">
          {title} <span className="font-normal text-ink-3">{formatNumber(count)}</span>
        </h3>
        <p className="text-[12.5px] text-ink-3">{note}</p>
      </header>
      <ul className="pb-3">{children}</ul>
    </section>
  );
}

const SHOW_FIRST = 6;

function KindGroup({ type, groups }) {
  const [all, setAll] = useState(false);
  const meta = ENTITY_META[type];
  const Icon = meta?.icon;
  const shown = all ? groups : groups.slice(0, SHOW_FIRST);
  return (
    <li>
      <p className="flex items-center gap-1.5 px-5 pt-2 pb-1 text-[12px] font-medium text-ink-2">
        {Icon && <Icon aria-hidden="true" className="size-3.5 text-ink-3" />}
        {meta?.plural ?? type} <span className="font-normal text-ink-3">{formatNumber(groups.length)}</span>
      </p>
      <ul>
        {shown.map((g) => (
          <ChangeLine key={g.key} group={g} />
        ))}
      </ul>
      {groups.length > SHOW_FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mx-5 mb-1 text-[12.5px] font-medium text-brand hover:underline">
          {all ? 'Show fewer' : `Show ${formatNumber(groups.length - SHOW_FIRST)} more`}
        </button>
      )}
    </li>
  );
}

/** One resource's changes as one line; opens in place. */
function ChangeLine({ group: g }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const lead = g.lead;
  const last = latest(g.changes);
  const actor = g.changes.map((c) => c.evidence?.callerArn).find(Boolean);
  const to = changeEntityRoute(lead);
  const place = [lead.accountId, lead.region].filter(Boolean).join(' · ');
  return (
    <li>
      <div className={cn('group relative mx-2 rounded-[var(--radius-control)] transition-colors hover:bg-surface-2', open && 'bg-surface-2')}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-2.5 text-left"
        >
          <ImpactGlyph group={g} />
          <span className="min-w-0">
            <span className="block text-[13.5px] leading-snug font-medium text-ink">{g.story}</span>
            <span className="mt-0.5 block truncate text-[12px] text-ink-3">
              <span className="text-ink-2">{lead.name || shortName(lead.arn)}</span>
              {' · '}
              {ENTITY_META[lead.entityType]?.label ?? 'Resource'}
              {g.changes.length > 1 ? ` · ${formatNumber(g.changes.length)} changes` : ''}
              {place ? ` · ${place}` : ''}
              {actor ? ` · by ${shortName(actor)}` : ''}
            </span>
            {g.risk && <span className={cn('mt-0.5 block text-[12px]', g.risk.level === 'critical' ? 'text-critical' : 'text-high')}>{g.risk.reasons.join(' · ')}</span>}
          </span>
          <span className="flex items-center gap-2 pt-0.5 text-[12px] whitespace-nowrap text-ink-3">
            <span title={formatDateTime(last.detectedAt)}>{formatRelative(last.detectedAt)}</span>
            <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
        {open && (
          <div id={panelId} className="@container flex flex-col gap-5 border-t border-line px-3 pt-4 pb-4 pl-11">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-[12px] text-ink-2">
                <CopyableValue value={lead.arn} />
              </span>
              {to && (
                <Link to={to} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline">
                  Open {ENTITY_META[lead.entityType]?.label?.toLowerCase() ?? 'record'} <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              )}
            </div>
            {g.changes.map((c) => (
              <ChangeCard key={c.id} change={c} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function ImpactGlyph({ group: g }) {
  if (g.impact === 'raised') {
    return <ShieldAlert aria-label={g.risk?.level === 'critical' ? 'Critical risk' : 'High risk'} className={cn('mt-0.5 size-4.5', g.risk?.level === 'critical' ? 'text-critical' : 'text-high')} />;
  }
  if (g.impact === 'reduced') return <ArrowDownRight aria-label="Reduced exposure" className="mt-0.5 size-4.5 text-low" />;
  const Icon = ENTITY_META[g.lead.entityType]?.icon;
  return Icon ? <Icon aria-hidden="true" className="mt-0.5 size-4 text-ink-3" /> : <span />;
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
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface">
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
