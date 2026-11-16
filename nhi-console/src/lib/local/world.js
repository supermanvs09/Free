/*
 * The estate as the signed-in user sees it: only applications that are
 * switched on, only the accounts and regions in their saved scope. Every
 * screen reads through here, so switching an application off removes it
 * everywhere at once.
 */
import { enabledProviders } from './apps';
import { estate, SCOPES, scopeById } from './seed';
import { slice } from './state';
import { DAY, HOUR, MIN, NOW, hashString, iso, rng } from './util';
import { anomalySpecsFor, grantsOf, resolveResource } from './entitlements';

export function scopeSettings() {
  return slice('scope', () => ({ accounts: [], regions: [] }));
}

export function visibleScopes() {
  const on = new Set(enabledProviders());
  return SCOPES.filter((s) => on.has(s.provider));
}

function inScope(row) {
  const on = new Set(enabledProviders());
  if (!on.has(row.provider)) return false;
  const { accounts, regions } = scopeSettings();
  if (accounts.length && !accounts.includes(row.account_id)) return false;
  if (regions.length && !regions.includes(row.region)) return false;
  return true;
}

export const identities = () => estate().identities.filter(inScope);
export const credentials = () => estate().credentials.filter(inScope);
export const identityById = (id) => estate().identities.find((r) => r.id === id) ?? null;
export const credentialById = (id) => estate().credentials.find((r) => r.id === id) ?? null;
export const identityByArn = (arn) => estate().identities.find((r) => r.arn === arn) ?? null;
export const credentialByArn = (arn) => estate().credentials.find((r) => r.arn === arn) ?? null;
export const visible = (row) => Boolean(row) && inScope(row);

export function credentialsOf(identity) {
  return (identity.credential_ids ?? []).map(credentialById).filter(Boolean);
}
export function identitiesOf(credential) {
  return (credential.bound_identities ?? []).map(identityById).filter(Boolean);
}

/* ── Activity: what each identity actually did ─────────────────────────────
   Built from the grants it uses (lib/local/entitlements.js), against the real
   resources those grants name, plus the departures NHI Genome flags. */

/* The call an administrator-level grant is used for, per service. */
const TYPICAL = {
  dynamodb: ['dynamodb:Query', true], s3: ['s3:GetObject', true], sqs: ['sqs:SendMessage', false], sns: ['sns:Publish', false],
  kms: ['kms:Decrypt', true], secretsmanager: ['secretsmanager:GetSecretValue', true], ssm: ['ssm:GetParameter', true],
  ecs: ['ecs:UpdateService', false], cloudformation: ['cloudformation:UpdateStack', false], lambda: ['lambda:UpdateFunctionCode', false],
  ec2: ['ec2:DescribeInstances', true], glue: ['glue:GetTable', true], rds: ['rds:DescribeDBClusters', true], kinesis: ['kinesis:GetRecords', true],
};
const READ = /^(read|scm\.checkout|agent\.connect)$|:(Get|List|Describe|Query|Scan|Receive|Filter|Decrypt|InvokeModel|StartQuery)|\/read$|getSecret|listClusterUserCredential|GetRecord/;

function activityTargets(identity) {
  const out = [];
  for (const g of grantsOf(identity)) {
    if (!g.used) continue;
    const on = g.seen_on.length ? g.seen_on : g.wildcard ? [null] : g.targets;
    for (const res of on) {
      const actions = g.actions.map((a) => {
        if (a !== '*') return a.replace(/\*$/, a.startsWith('ec2:') ? 'Instances' : a.startsWith('iam:') ? 'Role' : 'Item');
        return TYPICAL[res?.service]?.[0] ?? 'sts:GetCallerIdentity';
      });
      for (const action of actions) out.push({ action, res, readOnly: READ.test(action) });
    }
  }
  return out;
}

function eventSource(identity, action) {
  if (identity.provider === 'aws') return `${action.split(':')[0].replace(/^rds-db$/, 'rds')}.amazonaws.com`;
  if (identity.provider === 'azure') return action.split('/')[0];
  return identity.provider;
}

function resourceArnFor(res, r) {
  if (!res) return null;
  if (res.service === 's3' && res.arn.startsWith('arn:aws:s3:::')) return `${res.arn}/${r.pick(['2026/11', 'daily', 'exports', 'inbound'])}/${r.hex(8)}.json`;
  return res.arn;
}

function pickCred(identity, creds, action, r) {
  if (!creds.length) return null;
  if (identity.provider === 'aws') return creds.find((c) => c.credential_type === 'iam_role') ?? creds.find((c) => c.credential_type === 'access_key' && c.status === 'active') ?? creds[0];
  if (identity.provider === 'jenkins' && action === 'Credentials/UseItem') return r.pick(creds);
  return creds.find((c) => !['secret'].includes(c.credential_type)) ?? creds[0];
}

function ipsFor(identity, r) {
  if (identity.provider === 'jenkins') return ['49.207.51.18', '49.207.51.19'];
  if (identity.oidc_provider || identity.name.includes('github')) return ['140.82.112.21', '4.208.26.197', '20.42.65.85'];
  if (['HUMAN', 'DUAL_IDENTITY'].includes(identity.functional_class)) return ['106.51.73.220', '49.37.142.8'];
  if (identity.provider === 'azure') return ['20.193.142.9', '4.213.31.44'];
  if (identity.provider === 'vault') return ['10.40.12.31', '10.40.12.32'];
  if (identity.external_account) return ['3.120.181.40', '52.28.62.9'];
  return [`10.${r.int(10, 60)}.${r.int(1, 250)}.${r.int(2, 250)}`, `10.${r.int(10, 60)}.${r.int(1, 250)}.${r.int(2, 250)}`];
}

const AGENTS = {
  aws: ['aws-sdk-go-v2/1.32.4 os/linux lang/go#1.23', 'Boto3/1.35.54 Python/3.12.7 Linux/5.10', 'aws-sdk-java/2.29.6 Linux/5.10 OpenJDK_64-Bit'],
  azure: ['azsdk-python-identity/1.19.0 Python/3.12', 'azsdk-net-Identity/1.13.1'],
  jenkins: ['Jenkins/2.479.1 (pipeline)'],
  vault: ['Go-http-client/1.1 (vault-agent 1.18.2)'],
};

const eventCache = new Map();
/** The identity's last 90 days of calls, newest first. Deterministic per identity. */
export function eventsOf(identity) {
  if (eventCache.has(identity.id)) return eventCache.get(identity.id);
  const r = rng(hashString(identity.id));
  const targets = activityTargets(identity);
  const ips = ipsFor(identity, r);
  const creds = credentialsOf(identity);
  const last = Date.parse(identity.last_activity_at);
  const perDay = identity.hot ? r.int(22, 40) : identity.idle_days > 60 ? 0 : r.int(3, 12);
  const events = [];
  const span = identity.idle_days > 60 || !targets.length ? 0 : 90;
  for (let d = 0; d < span; d += 1) {
    const dayStart = last - d * DAY;
    const n = Math.max(0, perDay + r.int(-3, 4) - (d > 45 ? 2 : 0));
    for (let k = 0; k < n; k += 1) {
      const hourBias = identity.functional_class === 'NHI_CICD' ? r.pick([4, 5, 10, 11, 14, 15, 16]) : r.int(1, 17);
      const t = dayStart - r.int(0, 59) * MIN - ((24 + new Date(dayStart).getUTCHours() - hourBias) % 24) * HOUR;
      if (t > NOW) continue;
      const { action, res, readOnly } = r.pick(targets);
      const errored = r.chance(identity.functional_class === 'DUAL_IDENTITY' ? 0.05 : 0.015);
      events.push(makeEvent(identity, { t, action, res, readOnly, cred: pickCred(identity, creds, action, r), ip: r.pick(ips), errored, r }));
    }
  }
  /* What NHI Genome flags: the departures, as they were recorded. */
  for (const a of anomalySpecsFor(identity)) {
    const res = a.target ? resolveResource(a.target, identity) ?? { arn: a.target, name: a.target.split(/[/:]/).pop(), service: a.action.split(':')[0], type: 'AWS::IAM::Role' } : null;
    const at = NOW - a.hoursAgo * HOUR;
    const count = a.dimension === 'volume' ? 36 : Math.max(1, a.errors || 2);
    for (let k = 0; k < count; k += 1) {
      const t = a.dimension === 'time_of_day' ? Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate(), Number(a.value.slice(0, 2)), k) : at - k * 90 * 1000;
      events.push({
        ...makeEvent(identity, { t, action: a.action, res, readOnly: READ.test(a.action), cred: pickCred(identity, creds, a.action, r), ip: a.ip ?? r.pick(ips), errored: k < (a.errors ?? 0), r }),
        ...(a.dimension === 'user_agent' ? { user_agent: a.value } : {}),
        ...(a.dimension === 'region' ? { aws_region: a.value, region: a.value } : {}),
        anomaly: a.dimension,
      });
    }
  }
  events.sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time));
  eventCache.set(identity.id, events);
  return events;
}

function makeEvent(identity, { t, action, res, readOnly, cred, ip, errored, r }) {
  const scope = scopeById(identity.account_id);
  const resourceArn = resourceArnFor(res, r);
  const source = eventSource(identity, action);
  const name = identity.provider === 'aws' ? action.split(':')[1] : identity.provider === 'azure' ? action.split('/').slice(1).join('/') : action;
  const targetAccount = res?.provider === 'aws' ? res.account_id : null;
  const cross = Boolean(targetAccount && targetAccount !== identity.account_id) || /:iam::(\d{12}):/.exec(resourceArn ?? '')?.[1] !== undefined && /:iam::(\d{12}):/.exec(resourceArn)[1] !== identity.account_id;
  return {
    event_id: `${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}`,
    event_time: iso(t),
    event_name: name,
    event_source: source,
    action,
    service: identity.provider === 'aws' ? source.split('.')[0] : source,
    is_read_only: Boolean(readOnly),
    read_only: Boolean(readOnly),
    error_code: errored ? (identity.provider === 'aws' ? 'AccessDenied' : identity.provider === 'vault' ? 'permission denied' : 'Forbidden') : null,
    error_message: errored ? `User: ${identity.arn} is not authorized to perform: ${action}${resourceArn ? ` on resource: ${resourceArn}` : ''}` : null,
    status: errored ? 'failed' : 'success',
    source_ip: ip,
    user_agent: r.pick(AGENTS[identity.provider] ?? AGENTS.aws),
    aws_region: identity.region,
    region: identity.region,
    caller_arn: identity.arn,
    caller_type: identity.provider === 'aws' ? (identity.identity_type.startsWith('iam_user') ? 'IAMUser' : 'AssumedRole') : identity.provider === 'azure' ? 'ServicePrincipal' : identity.provider === 'jenkins' ? 'JenkinsJob' : 'VaultEntity',
    session_issuer_arn: cred?.credential_type === 'iam_role' ? cred.arn : null,
    access_key_id: cred?.access_key_id ?? (cred?.credential_type === 'iam_role' ? `ASIA${r.alnum(16)}` : null),
    credential_id: cred?.id ?? null,
    credential_name: cred?.name ?? null,
    credential_arn: cred?.arn ?? null,
    credential_type: cred?.credential_type ?? null,
    binding_type: cred?.credential_type === 'iam_role' ? 'assumed_role' : cred ? 'direct' : null,
    resource_arn: resourceArn,
    resource_type: res?.type ?? null,
    resource_name: res?.name ?? null,
    target: resourceArn,
    is_cross_account: cross,
    target_account_id: targetAccount ?? scope?.id ?? null,
    recipient_account_id: identity.account_id,
  };
}

/** Events in a range, with the filters the activity screens send. */
export function filteredEvents(identity, q = {}) {
  let rows = eventsOf(identity);
  const range = q.time_range || '30d';
  const span = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY }[range];
  let from = span ? NOW - span : 0;
  let to = NOW + MIN;
  if (range === 'custom') {
    from = Date.parse(q.start_date) || from;
    to = q.end_date ? Date.parse(q.end_date) + DAY : to;
  }
  rows = rows.filter((e) => {
    const t = Date.parse(e.event_time);
    return t >= from && t <= to;
  });
  if (q.service) rows = rows.filter((e) => e.service === q.service || e.event_source === q.service);
  if (q.action) rows = rows.filter((e) => e.event_name === q.action || e.action === q.action);
  if (q.result === 'success') rows = rows.filter((e) => !e.error_code);
  if (q.result === 'error' || q.result === 'failed' || q.result === 'failure') rows = rows.filter((e) => e.error_code);
  if (q.read_write === 'read') rows = rows.filter((e) => e.is_read_only);
  if (q.read_write === 'write') rows = rows.filter((e) => !e.is_read_only);
  if (q.resource) rows = rows.filter((e) => String(e.resource_arn ?? '').includes(q.resource));
  if (q.source_ip) rows = rows.filter((e) => e.source_ip === q.source_ip);
  if (q.credential) rows = rows.filter((e) => e.credential_id === q.credential || e.credential_arn === q.credential || e.access_key_id === q.credential);
  return rows;
}

export { NOW, DAY, HOUR, MIN };
