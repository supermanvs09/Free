/*
 * NHI Genome for credentials: how each long-lived credential (an access key,
 * a stored secret, a Vault login) is normally used, consumer by consumer, so
 * a new consumer of a known credential stands out: "known credential,
 * unknown consumer".
 *
 * A consumer's fingerprint is read from the workload it is (an ECS task in a
 * private subnet, a Lambda on AWS's own network, a Jenkins agent) and from
 * what the credential may do. The unknown consumer exists only while the
 * live scenario `sharedkey` runs, and is cut off when the key is rotated in
 * Vault (response overlay), so every screen agrees on both.
 */
import { estate } from './seed';
import { identitiesOf, visible } from './world';
import { grantsOf } from './entitlements';
import { hashString } from './util';
import { keyDeactivated, keyRotated, scenario } from './response';

const LONG_LIVED = new Set(['access_key', 'secret', 'client_secret', 'jenkins_credential', 'vault_secret_id', 'vault_token', 'vault_lease', 'vault_k8s_jwt']);
const BASELINE_DAYS = 14;
const H = (s) => hashString(String(s));

/* How a workload of each kind reaches AWS: network, client, and when it runs. */
const PROFILE = {
  ecs_task: { network: '10.0.2.0/24', where: 'private subnet, payments VPC', sample: '10.0.2.47', client: 'aws-sdk-go-v2/1.30.3 (ECS Fargate)', hours: 'Business hours, 09:00-19:00 IST', window: [9, 19] },
  lambda_function: { network: 'AWS internal', where: 'Lambda service network', sample: 'AWS Lambda egress', client: 'Boto3/1.34.69 Python/3.12 (AWS_Lambda_python3.12)', hours: 'Nightly, 01:00-03:00 IST', window: [1, 3] },
  eks_pod: { network: '10.0.8.0/22', where: 'EKS pod network', sample: '10.0.9.21', client: 'aws-sdk-java/2.25 (EKS)', hours: 'Around the clock', window: [0, 24] },
  batch_job: { network: '10.0.6.0/24', where: 'Batch compute subnet', sample: '10.0.6.12', client: 'aws-cli/2.15.30 (AWS Batch)', hours: 'Daily at 23:00 IST', window: [23, 24] },
  jenkins_job: { network: '10.20.4.0/24', where: 'Jenkins agents', sample: '10.20.4.15', client: 'aws-cli/2.15.30 (Jenkins pipeline)', hours: 'On deploy, weekdays', window: [10, 20] },
  jenkins_agent: { network: '10.20.4.0/24', where: 'Jenkins agents', sample: '10.20.4.16', client: 'Jenkins agent 3.2', hours: 'On build', window: [9, 21] },
  iam_user_service_account: { network: '10.0.4.0/24', where: 'App subnet', sample: '10.0.4.9', client: 'aws-sdk-js/3.540', hours: 'Business hours', window: [9, 19] },
};
const FALLBACK = { network: '10.0.0.0/16', where: 'Company network', sample: '10.0.1.10', client: 'aws-sdk', hours: 'Business hours', window: [9, 19] };

/* The third consumer the live scenario adds. */
const STRANGER = {
  ip: '185.193.88.41',
  where: 'Outside every VPC · Stockholm, SE (AS 206728, hosting provider)',
  region: 'eu-north-1',
  client: 'python-requests/2.31.0 (custom script)',
  calls: ['sts:GetCallerIdentity', 'iam:ListAttachedUserPolicies', 's3:ListAllMyBuckets', 'secretsmanager:ListSecrets', 'secretsmanager:GetSecretValue'],
  count: 214,
};

/** Who legitimately uses a credential: a key's owning IAM user only signs, its readers use it. */
function consumersOf(cred) {
  const bound = identitiesOf(cred).filter(visible);
  if (cred.credential_type === 'access_key' && cred.store === 'vault') return bound.slice(1);
  return bound;
}

function callsFor(cred, consumer) {
  const owner = cred.credential_type === 'access_key' ? identitiesOf(cred)[0] : consumer;
  const actions = (owner ? grantsOf(owner) : []).flatMap((g) => g.actions).filter((a) => !a.includes('*'));
  const unique = [...new Set(actions)];
  const h = H(`${cred.id}:${consumer.id}`);
  /* Each consumer uses its own slice of what the credential allows. */
  const start = unique.length > 2 ? h % (unique.length - 1) : 0;
  return (unique.length ? [...unique.slice(start), ...unique.slice(0, start)] : ['sts:GetCallerIdentity']).slice(0, 3);
}

function fingerprint(cred, consumer) {
  const p = PROFILE[consumer.identity_type] ?? FALLBACK;
  const h = H(`${cred.id}:${consumer.id}`);
  return {
    id: consumer.id,
    name: consumer.name,
    identity_type: consumer.identity_type,
    provider: consumer.provider,
    known: true,
    network: p.network,
    where: p.where,
    sample_ip: p.sample,
    region: consumer.region,
    client: p.client,
    hours: p.hours,
    window: p.window,
    calls: callsFor(cred, consumer),
    per_day: 40 + (h % 900),
    share_pct: null,
    first_seen_days: BASELINE_DAYS + (h % 120),
  };
}

/** The unknown consumer, while the scenario runs and the key has not been rotated. */
function strangerOf(cred) {
  const run = scenario('sharedkey');
  if (!run || cred.id !== sharedKey()?.id || keyRotated(cred.id) || keyDeactivated(cred.id)) return null;
  return {
    id: 'unknown',
    name: 'Unknown consumer',
    known: false,
    sample_ip: STRANGER.ip,
    network: STRANGER.ip,
    where: STRANGER.where,
    region: STRANGER.region,
    client: STRANGER.client,
    calls: STRANGER.calls,
    count: STRANGER.count,
    first_seen_at: new Date(run.at).toISOString(),
    last_seen_at: new Date(run.at + 3 * 60_000).toISOString(),
  };
}

/** The key the scenario is about: svc-billing's access key, kept in Vault. */
export function sharedKey() {
  const owner = estate().identities.find((i) => i.name === 'svc-billing');
  return owner ? estate().credentials.find((c) => c.credential_type === 'access_key' && c.bound_identities?.[0] === owner.id) ?? null : null;
}

/** Every way the unknown consumer departs from the baseline, in plain words. */
function departures(stranger, known) {
  if (!stranger) return [];
  const hour = new Date(stranger.first_seen_at).getHours();
  const inWindow = known.some((k) => hour >= k.window[0] && hour < k.window[1]);
  const out = [
    { dimension: 'consumer', label: 'A third consumer', detail: `${known.length} known consumers for ${BASELINE_DAYS} days; this source is none of them.` },
    { dimension: 'network', label: 'New source network', detail: `${stranger.sample_ip} - ${stranger.where}. Known: ${[...new Set(known.map((k) => k.network))].join(', ')}.` },
    { dimension: 'region', label: 'New region', detail: `${stranger.region}. Known: ${[...new Set(known.map((k) => k.region))].join(', ')}.` },
    { dimension: 'client', label: 'New client', detail: `${stranger.client}. Known: ${known.map((k) => k.client.split(' ')[0]).join(', ')}.` },
    { dimension: 'calls', label: 'New call pattern: enumeration', detail: `${stranger.calls.join(', ')} - none of them in the baseline.` },
  ];
  if (!inWindow) out.push({ dimension: 'time', label: 'Outside every known window', detail: `${String(hour).padStart(2, '0')}:00 - known: ${known.map((k) => k.hours.toLowerCase()).join('; ')}.` });
  return out;
}

function shape(cred, { full = false } = {}) {
  const known = consumersOf(cred).map((c) => fingerprint(cred, c));
  const total = known.reduce((s, k) => s + k.per_day, 0) || 1;
  known.forEach((k) => {
    k.share_pct = Math.round((k.per_day / total) * 100);
  });
  const stranger = strangerOf(cred);
  const owner = cred.credential_type === 'access_key' ? identitiesOf(cred)[0] : null;
  const rot = keyRotated(cred.id);
  const row = {
    credential_id: cred.id,
    name: cred.name,
    credential_type: cred.credential_type,
    provider: cred.provider,
    account_id: cred.account_id,
    access_key_id: cred.access_key_id ?? null,
    owner: owner ? { id: owner.id, name: owner.name } : null,
    stored_in: cred.store === 'vault' ? { store: 'vault', name: cred.store_name ?? 'Vault prod', path: cred.vault_path } : null,
    baseline: { state: known.length ? 'established' : 'none', days: BASELINE_DAYS },
    known_consumers: known.length,
    unknown_consumers: stranger ? 1 : 0,
    last_used_at: cred.last_used_at,
    status: stranger ? 'unknown_consumer' : rot?.at && scenario('sharedkey') && cred.id === sharedKey()?.id ? 'contained' : 'normal',
    rotated: rot ? { at: new Date(rot.at).toISOString(), by: rot.by_name ?? rot.by ?? null, via: rot.via ?? 'plan' } : null,
  };
  if (!full) return { ...row, consumers: known.map((k) => ({ id: k.id, name: k.name, identity_type: k.identity_type })) };
  return { ...row, consumers: known, stranger, departures: departures(stranger, known) };
}

/** Every long-lived credential with at least one consumer, newest risk first. */
export function credentialGenome() {
  return estate()
    .credentials.filter((c) => LONG_LIVED.has(c.credential_type) && !c.__deleted && consumersOf(c).length)
    .map((c) => shape(c))
    .sort((a, b) => b.unknown_consumers - a.unknown_consumers || b.known_consumers - a.known_consumers || String(a.name).localeCompare(String(b.name)));
}

export function credentialGenomeOne(id) {
  const cred = estate().credentials.find((c) => c.id === id);
  return cred ? shape(cred, { full: true }) : null;
}
