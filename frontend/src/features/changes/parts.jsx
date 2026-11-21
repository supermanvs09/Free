import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  GitCompareArrows,
  CircleMinus,
  CirclePlus,
  Fingerprint,
  KeyRound,
  Link2,
  ListChecks,
  PencilLine,
  ScrollText,
  ShieldAlert,
} from 'lucide-react';
import { fetchScanChanges, scanChangesRoute } from '../../lib/api/changes';
import { useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative, humanizeToken } from '../../lib/format';
import { CopyableValue } from '../../ui/Copyable';
import { cn } from '../../ui/cn';
import { DIFF_LIMIT, diffValues, isPlainObject, parseJsonish } from '../../lib/jsonDiff';
import { asActions, isRiskyAction } from './story';

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

export const CHANGE_META = {
  CREATED: { label: 'Created', badge: 'New', tone: 'low', icon: CirclePlus, filter: 'Created' },
  DELETED: { label: 'Deleted', badge: 'Deleted', tone: 'critical', icon: CircleMinus, filter: 'Deleted' },
  MODIFIED: { label: 'Modified', badge: 'Changed', tone: 'medium', icon: PencilLine, filter: 'Modified' },
};

export const ENTITY_META = {
  identity: { label: 'Identity', plural: 'Identities', icon: Fingerprint },
  credential: { label: 'Credential', plural: 'Credentials', icon: KeyRound },
  permission: { label: 'Permission', plural: 'Permissions', icon: ListChecks },
  binding: { label: 'Binding', plural: 'Bindings', icon: Link2 },
  trust_edge: { label: 'Trust', plural: 'Trust relationships', icon: ArrowLeftRight },
};

export const CHANGE_TYPES = ['CREATED', 'DELETED', 'MODIFIED'];
export const ENTITY_TYPES = ['identity', 'credential', 'permission', 'binding', 'trust_edge'];

const TONE_DOT = { low: 'bg-low', critical: 'bg-critical', medium: 'bg-medium' };

/** Created / Deleted / Modified as a quiet label: a small coloured dot and the word. */
export function ChangeBadge({ type, className, short = false }) {
  const meta = CHANGE_META[type] ?? CHANGE_META.MODIFIED;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-ink-2', className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT[meta.tone])} />
      {short ? meta.badge : meta.label}
    </span>
  );
}

/**
 * Beside a name in the inventory lists: what the latest scan did to the row.
 * It is a control, not a decoration - it opens the row's Changes, so "what
 * changed?" is one click away. `to` makes it a link, `onOpen` a button; the
 * click never also opens the row behind it.
 */
export function RecentChangeMarker({ change, to, onOpen }) {
  if (change !== 'CREATED' && change !== 'MODIFIED') return null;
  const created = change === 'CREATED';
  const label = created ? 'New' : 'Modified';
  const title = created ? 'First discovered in the latest scan - open its changes' : 'Changed in the latest scan - see what changed';
  const className = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-semibold transition-colors',
    created ? 'border-low/30 bg-low-soft text-low hover:border-low/60' : 'border-medium/30 bg-medium-soft text-medium hover:border-medium/60',
  );
  const content = (
    <>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', created ? 'bg-low' : 'bg-medium')} />
      {label}
    </>
  );
  const stop = (event) => event.stopPropagation();
  if (to) {
    return (
      <Link to={to} title={title} aria-label={`${label}: ${title}`} onClick={stop} className={className}>
        {content}
      </Link>
    );
  }
  if (onOpen) {
    return (
      <button
        type="button"
        title={title}
        aria-label={`${label}: ${title}`}
        onClick={(event) => {
          stop(event);
          onOpen();
        }}
        className={className}
      >
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={className}>
      {content}
    </span>
  );
}

/**
 * One line above an inventory list when the latest scan changed rows of this
 * kind: how many were new, modified and removed, and the way to the full
 * diff. Removed rows are no longer in the list, so this is the only place
 * they are mentioned. Nothing renders while there is nothing to say.
 */
export function LatestChangesNotice({ entityType, noun }) {
  const counts = useQuery(
    async (signal) => {
      const read = (changeType) =>
        fetchScanChanges({ scanId: 'latest', entityType, changeType, limit: 1 }, signal).then((data) => ({
          total: data.pagination.total,
          scan: data.scan,
        }));
      const [created, modified, deleted] = await Promise.all(['CREATED', 'MODIFIED', 'DELETED'].map(read));
      return { created: created.total, modified: modified.total, deleted: deleted.total, scan: created.scan };
    },
    [entityType],
  );
  const data = counts.data;
  const total = data ? data.created + data.modified + data.deleted : 0;
  if (!data || total === 0 || !data.scan) return null;
  const parts = [
    data.created && `${formatNumber(data.created)} new`,
    data.modified && `${formatNumber(data.modified)} modified`,
    data.deleted && `${formatNumber(data.deleted)} removed`,
  ].filter(Boolean);
  return (
    <div className="animate-rise flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-panel)] border border-medium/25 bg-medium-soft/40 px-4 py-2.5">
      <GitCompareArrows aria-hidden="true" className="size-4 shrink-0 text-medium" />
      <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
        <span className="font-semibold text-ink">
          {formatNumber(total)} {total === 1 ? noun.one : noun.many} changed
        </span>{' '}
        in the latest scan ({parts.join(', ')}) ·{' '}
        <span title={formatDateTime(data.scan.completedAt)}>{formatRelative(data.scan.completedAt)}</span>
      </p>
      <Link
        to={scanChangesRoute(data.scan.id, { entity_type: entityType })}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
      >
        Review the changes
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}

export function EntityLabel({ type, className }) {
  const meta = ENTITY_META[type] ?? { label: humanizeToken(type), icon: ScrollText };
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[12px] text-ink-2', className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

/* ── Values ──────────────────────────────────────────────────────────────── */

const FIELD_LABELS = {
  type: 'Type',
  name: 'Name',
  account_id: 'Account',
  region: 'Region',
  owner: 'Owner',
  status: 'Status',
  runtime: 'Runtime',
  cluster: 'Cluster',
  attached_policies: 'Attached policies',
  last_used: 'Last used',
  age_days: 'Age (days)',
  is_publicly_accessible: 'Reachable from the internet',
  security_group_ids: 'Security groups',
  last_rotated_at: 'Last rotated',
  rotation_enabled: 'Automatic rotation',
  policy_name: 'Policy',
  policy_type: 'Policy type',
  edge_type: 'Relationship',
  binding: 'Bound through',
  credential_type: 'Credential type',
  identity_type: 'Identity type',
  type_attributes: 'Attributes',
};

export function fieldLabel(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (field.startsWith('tags.')) return `Tag "${field.slice(5)}"`;
  return humanizeToken(field.replaceAll('.', '_'));
}

/** A JSON value as words: never raw JSON on screen. */
export function Value({ value, mono = false }) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-3 italic">none</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3 italic">none</span>;
    return <span className={cn(mono && 'font-mono text-[11.5px]')}>{value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ')}</span>;
  }
  if (typeof value === 'object') {
    return (
      <span>
        {Object.entries(value)
          .map(([key, inner]) => `${fieldLabel(key)}: ${typeof inner === 'object' ? JSON.stringify(inner) : String(inner)}`)
          .join(' · ')}
      </span>
    );
  }
  const text = String(value);
  const looksLikeId = /^arn:|^[A-Z0-9]{16,}$|^\d{12}$/.test(text);
  return <span className={cn((mono || looksLikeId) && 'font-mono text-[11.5px] break-all')}>{text}</span>;
}

/* ── Field diffs ─────────────────────────────────────────────────────────── */

function pathLabel(path) {
  return path.map((part) => (typeof part === 'number' ? `#${part + 1}` : fieldLabel(String(part)))).join(' › ');
}

/** One changed field: the plain before / after, or the changed paths inside it. */
function FieldChange({ field, before, after }) {
  const a = parseJsonish(before);
  const b = parseJsonish(after);
  const structured = (isPlainObject(a) || Array.isArray(a)) && (isPlainObject(b) || Array.isArray(b));
  if (!structured) return <FieldDiff field={field} before={a} after={b} />;
  const leaves = diffValues(a, b);
  if (leaves.length === 0) {
    return (
      <li className="grid gap-1 py-2 @min-[34rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] @min-[34rem]:gap-4">
        <span className="text-[12px] font-medium text-ink-2">{fieldLabel(field)}</span>
        <span className="text-[12.5px] text-ink-3">Same content, stored differently (key order or formatting only).</span>
      </li>
    );
  }
  return (
    <>
      {leaves.map((leaf) => (
        <FieldDiff
          key={`${field}-${leaf.path.join('.')}`}
          field={field}
          label={leaf.path.length ? `${fieldLabel(field)} › ${pathLabel(leaf.path)}` : undefined}
          before={leaf.before}
          after={leaf.after}
        />
      ))}
      {leaves.length >= DIFF_LIMIT && (
        <li className="py-2 text-[12px] text-ink-3">Showing the first {DIFF_LIMIT} differences in {fieldLabel(field)}.</li>
      )}
    </>
  );
}

function FieldDiff({ field, label, before, after }) {
  return (
    <li className="grid gap-1 py-2 @min-[34rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] @min-[34rem]:gap-4">
      <span className="text-[12px] font-medium break-words text-ink-2">{label ?? fieldLabel(field)}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <span className="max-w-full rounded bg-critical-soft px-1.5 py-0.5 break-words text-critical line-through decoration-critical/60" title="Before">
          <Value value={before} />
        </span>
        <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
        <span className="max-w-full rounded bg-low-soft px-1.5 py-0.5 font-medium break-words text-low" title="After">
          <Value value={after} />
        </span>
      </span>
    </li>
  );
}

function ActionList({ title, actions, tone }) {
  if (!actions?.length) return null;
  const gained = tone === 'low';
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-ink-2">
        {title} <span className="font-normal text-ink-3">{actions.length}</span>
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {actions.map((action) => {
          const risky = gained && isRiskyAction(action);
          return (
            <li
              key={action}
              title={risky ? 'Risky: grants admin or lets it act as someone else' : undefined}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[11.5px]',
                risky ? 'border-critical/40 text-critical' : gained ? 'border-line bg-surface text-ink' : 'border-line bg-surface-2 text-ink-3 line-through decoration-ink-3/50',
              )}
            >
              {gained ? '+ ' : '− '}
              {action}
              {risky && <span className="ml-1.5 font-sans text-[10.5px] font-medium">risky</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const HUMANIZED_FACTS = new Set(['type', 'policy_type', 'edge_type', 'binding', 'credential_type', 'identity_type']);

const SHOWN_ELSEWHERE = new Set(['fields_changed', 'actions_added', 'actions_removed', 'source', 'target', 'external']);

/**
 * The change's details, readable: a before / after diff for a modification,
 * the granted and revoked actions for a permission change, the two ends of a
 * trust relationship, and the remaining facts as label / value pairs.
 */
export function ChangeDetails({ change }) {
  const details = change.details ?? {};
  const fields = Array.isArray(details.fields_changed) ? details.fields_changed : [];
  const added = asActions(details.actions_added);
  const removed = asActions(details.actions_removed);
  const facts = Object.entries(details).filter(([key, value]) => !SHOWN_ELSEWHERE.has(key) && value !== undefined);
  const hasTrust = details.source || details.target;

  return (
    <div className="flex flex-col gap-4">
      {fields.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-ink-2">What changed</p>
          <ul className="mt-1 divide-y divide-line">
            {fields.map((entry, index) => (
              /* The API documents {field, old, new}; the scanner writes
                 {field, old_value, new_value}. Both are read. */
              <FieldChange
                key={`${entry.field}-${index}`}
                field={String(entry.field ?? '')}
                before={entry.old ?? entry.old_value}
                after={entry.new ?? entry.new_value}
              />
            ))}
          </ul>
        </div>
      )}

      {(added.length > 0 || removed.length > 0) && (
        <div className="grid gap-4 @min-[34rem]:grid-cols-2">
          <ActionList title="Gained" actions={added} tone="low" />
          <ActionList title="Lost" actions={removed} tone="critical" />
        </div>
      )}

      {hasTrust && (
        <div>
          <p className="text-[12px] font-medium text-ink-2">Relationship</p>
          <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-[12.5px]">
            <span className="min-w-0 font-mono text-[11.5px] break-all text-ink-2">{details.source}</span>
            <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <span className="min-w-0 font-mono text-[11.5px] break-all text-ink-2">{details.target}</span>
            {details.external && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-high">
                Outside your accounts
              </span>
            )}
          </p>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2.5 @min-[34rem]:grid-cols-2">
          {facts.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-[11px] text-ink-3">{fieldLabel(key)}</dt>
              <dd className="mt-0.5 text-[12.5px] text-ink">
                <Value value={HUMANIZED_FACTS.has(key) ? humanizeToken(String(value)) : value} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {fields.length === 0 && added.length === 0 && removed.length === 0 && !hasTrust && facts.length === 0 && (
        <p className="text-[12.5px] text-ink-3">The scan recorded no further detail for this change.</p>
      )}
    </div>
  );
}

/** Who made the change, according to CloudTrail. */
export function EvidenceCard({ evidence, changeType }) {
  if (!evidence) return null;
  const verb = changeType === 'DELETED' ? 'Deleted by' : 'Created by';
  return (
    <div className="rounded-[var(--radius-control)] border border-line px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
        <ScrollText aria-hidden="true" className="size-3.5 text-ink-3" />
        Who made it <span className="font-normal text-ink-3">· from CloudTrail</span>
      </p>
      <dl className="mt-1.5 grid gap-x-5 gap-y-1.5 text-[12px] @min-[34rem]:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-ink-3">{verb}</dt>
        <dd className="min-w-0">
          <CopyableValue value={evidence.callerArn} className="text-ink" />
        </dd>
        <dt className="text-ink-3">Via</dt>
        <dd className="font-mono text-[11.5px] text-ink">{evidence.eventName || '-'}</dd>
        <dt className="text-ink-3">From IP</dt>
        <dd className="font-mono text-[11.5px] text-ink">{evidence.sourceIp || '-'}</dd>
        <dt className="text-ink-3">At</dt>
        <dd className="text-ink" title={formatDateTime(evidence.eventTime)}>
          {formatDateTime(evidence.eventTime)}
        </dd>
      </dl>
    </div>
  );
}

/* ── Risk and grouped stories ────────────────────────────────────────────── */

/** Critical or High, with the reasons on hover. Nothing for an ordinary change. */
export function RiskBadge({ risk }) {
  if (!risk) return null;
  const critical = risk.level === 'critical';
  return (
    <span title={risk.reasons.join(' · ')} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink">
      <ShieldAlert aria-hidden="true" className={cn('size-3.5', critical ? 'text-critical' : 'text-high')} />
      {critical ? 'Critical' : 'High risk'}
    </span>
  );
}
