/*
 * Plain-language reading of scan changes: one sentence per permission, trust
 * or binding change, a risk verdict per change, and grouping of the changes a
 * scan made to one ARN into a single story.
 *
 * Every value here ends up as React text, never as HTML, so tag values such as
 * "<Script>alert(1)</Script>" are shown as typed and never run.
 */

/** Actions that hand out admin or let a principal become someone else. Lower case. */
export const RISKY_ACTIONS = new Set(['*', '*:*', 'iam:*', 'iam:passrole', 'sts:assumerole', 'sts:*']);

export const isRiskyAction = (action) => RISKY_ACTIONS.has(String(action ?? '').trim().toLowerCase());

/** null and non-arrays read as "none" (the scanner writes null as well as []). */
export const asActions = (value) => (Array.isArray(value) ? value.filter((v) => v !== null && v !== undefined && v !== '').map(String) : []);

/** The readable end of an ARN or principal: role/name -> name. "*" stays "*". */
export function shortName(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text === '*') return '*';
  if (!text.startsWith('arn:')) return text;
  const tail = text.split(':').slice(5).join(':');
  return tail.split('/').pop() || tail || text;
}

const first = (...values) => values.map((v) => (v === null || v === undefined ? '' : String(v).trim())).find(Boolean) ?? '';

const listText = (items, max = 4) => (items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`);

/** The two ends of a trust or binding change, as the scanner may name them. */
function ends(details) {
  return {
    source: first(details.source, details.source_arn, details.principal, details.trusted_principal),
    target: first(details.target, details.target_arn, details.role_arn),
  };
}

/**
 * One sentence for a permission, trust or binding change, or null when the
 * scanner's own summary is the best we have.
 */
export function changeStory(change) {
  const d = change.details ?? {};
  const who = change.name || shortName(change.arn) || 'This identity';
  if (change.entityType === 'permission') {
    const added = asActions(d.actions_added);
    const removed = asActions(d.actions_removed);
    if (added.length && removed.length) return `${who} gained ${listText(added)} and lost ${listText(removed)}`;
    if (added.length) return `${who} gained ${listText(added)}`;
    if (removed.length) return `${who} lost ${listText(removed)}`;
    return null;
  }
  if (change.entityType === 'trust_edge') {
    const { source, target } = ends(d);
    const from = source === '*' ? 'Anyone (*)' : shortName(source);
    const to = shortName(target) || who;
    if (!from) return null;
    if (change.changeType === 'CREATED') return `${from} can now assume ${to}`;
    if (change.changeType === 'DELETED') return `${from} can no longer assume ${to}`;
    return `The trust between ${from} and ${to} changed`;
  }
  if (change.entityType === 'binding') {
    const other = bindingOther(change);
    if (!other) return null;
    if (change.changeType === 'CREATED') return `${who} is now bound to ${other}`;
    if (change.changeType === 'DELETED') return `${who} is no longer bound to ${other}`;
  }
  return null;
}

/** The far end of a binding, from the side of the change's own entity. */
function bindingOther(change) {
  const d = change.details ?? {};
  const { source, target } = ends(d);
  const raw = first(d.service_account, d.subject, d.bound_to, target === change.arn ? source : target, source);
  if (!raw) return '';
  return raw === '*' || raw.endsWith(':*') || raw.endsWith('/*') ? '* (any service account)' : shortName(raw);
}

/** A wildcard principal: "*", or an ARN ending in "*". */
const wild = (value) => {
  const text = String(value ?? '').trim();
  return text === '*' || /[:/]\*$/.test(text);
};

const isRoleArn = (arn) => /:role\//.test(String(arn ?? ''));

/**
 * The risk of one change: { level: 'critical' | 'high', reasons: [...] } or
 * null. Wildcards are critical; risky actions, new roles or keys and deleted
 * roles are high.
 */
export function changeRisk(change) {
  const d = change.details ?? {};
  const reasons = [];
  let critical = false;
  if (wild(change.arn) || wild(change.name)) {
    reasons.push('Wildcard identity (*)');
    critical = true;
  }
  if (change.entityType === 'trust_edge' && change.changeType !== 'DELETED' && wild(ends(d).source)) {
    reasons.push('Anyone can assume it (wildcard trust)');
    critical = true;
  }
  if (change.entityType === 'binding' && change.changeType !== 'DELETED' && bindingOther(change).startsWith('*')) {
    reasons.push('Bound to any service account (*)');
    critical = true;
  }
  const risky = asActions(d.actions_added).filter(isRiskyAction);
  if (risky.length) {
    reasons.push(`Risky actions added: ${risky.join(', ')}`);
    if (risky.some((a) => a === '*' || a === '*:*')) critical = true;
  }
  const type = String(first(d.identity_type, d.type, d.credential_type)).toLowerCase();
  if (change.changeType === 'CREATED' && change.entityType === 'identity' && (isRoleArn(change.arn) || type.includes('role'))) reasons.push('New IAM role');
  if (change.changeType === 'CREATED' && change.entityType === 'credential' && (/access.?key/.test(type) || /^AKIA/.test(change.name))) reasons.push('New access key');
  if (change.changeType === 'DELETED' && change.entityType === 'identity' && (isRoleArn(change.arn) || type.includes('role'))) reasons.push('Role deleted');
  if (!reasons.length) return null;
  return { level: critical ? 'critical' : 'high', reasons };
}

/**
 * Changes from one scan to one ARN, in the order they first appear. A group
 * of one is just that change.
 */
export function groupChanges(changes) {
  const groups = new Map();
  for (const change of changes) {
    const key = `${change.scanId}|${change.arn || change.id}`;
    if (!groups.has(key)) groups.set(key, { key, changes: [] });
    groups.get(key).changes.push(change);
  }
  return [...groups.values()];
}

/** The worst risk in a group, with every reason once. */
export function groupRisk(changes) {
  const risks = changes.map(changeRisk).filter(Boolean);
  if (!risks.length) return null;
  return {
    level: risks.some((r) => r.level === 'critical') ? 'critical' : 'high',
    reasons: [...new Set(risks.flatMap((r) => r.reasons))],
  };
}

/**
 * The group's story in one line. Two binding changes, one deleted and one
 * created, read as a move: "X moved from A to B".
 */
export function groupStory(changes) {
  const bindings = changes.filter((c) => c.entityType === 'binding');
  const gone = bindings.find((c) => c.changeType === 'DELETED');
  const added = bindings.find((c) => c.changeType === 'CREATED');
  if (gone && added) {
    const who = added.name || shortName(added.arn);
    return `${who} moved from ${bindingOther(gone)} to ${bindingOther(added)}`;
  }
  return null;
}

/**
 * Whether a change only takes access away: actions lost and none gained, a
 * trust or binding removed, a credential deleted. Shown as reduced exposure.
 */
export function changeReduces(change) {
  const d = change.details ?? {};
  if (change.entityType === 'permission') return asActions(d.actions_removed).length > 0 && asActions(d.actions_added).length === 0;
  if (['trust_edge', 'binding', 'credential'].includes(change.entityType)) return change.changeType === 'DELETED';
  return false;
}

/** raised | reduced | other, for a group of changes to one resource. */
export function groupImpact(changes) {
  if (groupRisk(changes)) return 'raised';
  if (changes.length && changes.every(changeReduces)) return 'reduced';
  return 'other';
}
