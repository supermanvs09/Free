/* Discovery scans and what each one found had changed. */
import { estate, person } from './seed';
import { identities, credentials, visible, identityById } from './world';
import { HOUR, MIN, NOW, iso, rng, hashString } from './util';
import { slice, save } from './state';
import { evaluate, TRIGGERS } from './postureEngine';

const SCAN_EVERY = 6 * HOUR;

export function scans() {
  const extra = slice('extraScans', () => []);
  const base = [];
  const latest = NOW - 41 * MIN;
  for (let i = 0; i < 40; i += 1) {
    const end = latest - i * SCAN_EVERY;
    const id = `scan_${new Date(end).toISOString().slice(0, 13).replace(/[-T]/g, '')}`;
    base.push({ scan_id: id, status: 'COMPLETED', account_id: null, started_at: iso(end - 9 * MIN), completed_at: iso(end) });
  }
  const all = [...extra, ...base];
  return all.map((s, i) => ({ ...s, previous_scan_id: all[i + 1]?.scan_id ?? null, previous_scan_at: all[i + 1]?.completed_at ?? null, total_changes: changesOf(s.scan_id, i).length }));
}

export function recordScan(scan) {
  slice('extraScans', () => []).unshift(scan);
  save();
}

const FIELD_CHANGES = [
  ['permission', 'MODIFIED', 'Policy statement added: s3:DeleteObject on arn:aws:s3:::dpa-payments-receipts/*', { field: 'policy_document', before: '3 statements', after: '4 statements' }],
  ['binding', 'CREATED', 'Now bound to a second credential', { field: 'bound_credentials', before: 1, after: 2 }],
  ['trust_edge', 'CREATED', 'New trust: assumable from account 464622532012', { field: 'trust_policy', before: '1 principal', after: '2 principals' }],
  ['credential', 'MODIFIED', 'Rotated (1 fields changed)', { field: 'last_rotated_at', before: null, after: 'now' }],
  ['identity', 'MODIFIED', 'Tags changed (1 fields changed)', { field: 'tags.owner', before: null, after: 'owner tag added' }],
  ['credential', 'CREATED', 'New access key created', { field: 'access_keys', before: 1, after: 2 }],
  ['identity', 'DELETED', 'No longer found', { field: 'status', before: 'active', after: 'deleted' }],
  ['permission', 'DELETED', 'Unused permission removed: iam:PassRole', { field: 'policy_document', before: '6 statements', after: '5 statements' }],
];

const cache = new Map();
export function changesOf(scanId, index = 0) {
  if (cache.has(scanId)) return cache.get(scanId);
  const r = rng(hashString(scanId));
  const ids = estate().identities;
  const creds = estate().credentials;
  const n = index === 0 ? 14 : r.int(0, 9);
  const at = scanAt(scanId);
  const out = [];
  if (index === 0) {
    for (const row of ids.filter((x) => x.recent_change)) out.push(change(scanId, at, row, 'identity', row.recent_change.change_type, row.recent_change.summary, r));
    for (const row of creds.filter((x) => x.recent_change)) out.push(change(scanId, at, row, 'credential', row.recent_change.change_type, row.recent_change.summary, r));
  }
  /* The cloud changes behind checks that started failing in this sync's window. */
  for (const row of ids) {
    for (const c of evaluate(row)) {
      const t = TRIGGERS[c.rule_id];
      if (!c.failing || !c.failing_since || t?.kind !== 'change') continue;
      const when = Date.parse(c.failing_since);
      if (when > Date.parse(at) || when <= Date.parse(at) - SCAN_EVERY) continue;
      out.push(checkChange(scanId, at, row, c, t, r));
    }
  }
  while (out.length < n) {
    const [entity, type, summary, details] = r.pick(FIELD_CHANGES);
    const row = entity === 'credential' ? r.pick(creds) : r.pick(ids);
    out.push(change(scanId, at, row, entity, type, summary, r, details));
  }
  cache.set(scanId, out);
  return out;
}

function scanAt(scanId) {
  const s = scanId.replace('scan_', '');
  return iso(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), 0) || NOW);
}

function change(scanId, at, row, entity, type, summary, r, details = null) {
  const isCred = 'credential_type' in row;
  const actor = r.pick(['terraform-runner', 'github-actions-deploy', person('raju').email, person('charan').email]);
  return {
    change_id: `chg_${r.hex(10)}`,
    scan_id: scanId,
    scan_at: at,
    change_type: type,
    entity_type: entity,
    entity_arn: row.arn,
    entity_name: row.name,
    identity_id: isCred ? row.bound_identities?.[0] ?? null : row.id,
    credential_id: isCred ? row.id : null,
    account_id: row.account_id,
    region: row.region,
    provider: row.provider,
    summary,
    details: details ? { [details.field]: { before: details.before, after: details.after } } : type === 'CREATED' ? { status: { before: null, after: 'active' } } : { updated_at: { before: null, after: at } },
    detected_at: at,
    cloudtrail_evidence: row.provider === 'aws' ? { caller_arn: actor.includes('@') ? `arn:aws:iam::${row.account_id}:user/${actor.split('@')[0]}` : `arn:aws:sts::${row.account_id}:assumed-role/${actor}/session`, event_name: type === 'CREATED' ? 'CreateRole' : 'PutRolePolicy', source_ip: actor.includes('@') ? '106.51.73.220' : '140.82.112.21', event_time: iso(Date.parse(at) - r.int(5, 300) * MIN) } : null,
  };
}

function checkChange(scanId, at, row, check, t, r) {
  const base = change(scanId, at, row, t.entity === 'credential' ? 'identity' : 'identity', t.type, t.summary, r, { field: t.field, before: t.before, after: t.after });
  const when = check.failing_since;
  return {
    ...base,
    change_id: `chg_${check.finding_id.slice(4)}`,
    entity_type: t.entity,
    detected_at: at,
    rule_id: check.rule_id,
    cloudtrail_evidence: row.provider === 'aws' && t.event ? { ...(base.cloudtrail_evidence ?? {}), event_name: t.event, event_time: when } : base.cloudtrail_evidence,
  };
}

export function visibleChanges(list) {
  return list.filter((c) => {
    const row = c.credential_id ? estate().credentials.find((x) => x.id === c.credential_id) : identityById(c.identity_id);
    return row ? visible(row) : true;
  });
}

export function changesForEntity(kind, row) {
  const all = scans().flatMap((s, i) => changesOf(s.scan_id, i));
  const mine = all.filter((c) => (kind === 'credential' ? c.credential_id === row.id : c.identity_id === row.id && !c.credential_id) || c.entity_arn === row.arn);
  return { changes: mine.slice(0, 50), truncated: mine.length > 50, change_tracking_available: true };
}

export { identities, credentials };
