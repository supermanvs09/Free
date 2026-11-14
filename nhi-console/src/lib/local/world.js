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

/* ── What each kind of identity does: the actions its activity is made of ── */
const AWS_ACTIONS = {
  payments: [
    ['dynamodb.amazonaws.com', 'GetItem', 'AWS::DynamoDB::Table', 'payments-ledger', true],
    ['dynamodb.amazonaws.com', 'PutItem', 'AWS::DynamoDB::Table', 'payments-ledger', false],
    ['sqs.amazonaws.com', 'SendMessage', 'AWS::SQS::Queue', 'settlement-events', false],
    ['secretsmanager.amazonaws.com', 'GetSecretValue', 'AWS::SecretsManager::Secret', 'prod/payments/npci-api-key', true],
    ['kms.amazonaws.com', 'Decrypt', 'AWS::KMS::Key', 'alias/payments-cmk', true],
    ['s3.amazonaws.com', 'PutObject', 'AWS::S3::Object', 'dpa-payments-receipts', false],
    ['logs.amazonaws.com', 'PutLogEvents', 'AWS::Logs::LogGroup', '/aws/lambda/payments', false],
  ],
  data: [
    ['s3.amazonaws.com', 'GetObject', 'AWS::S3::Object', 'dpa-data-lake-raw', true],
    ['s3.amazonaws.com', 'PutObject', 'AWS::S3::Object', 'dpa-data-lake-curated', false],
    ['glue.amazonaws.com', 'GetTable', 'AWS::Glue::Table', 'analytics.transactions', true],
    ['athena.amazonaws.com', 'StartQueryExecution', 'AWS::Athena::WorkGroup', 'reporting', false],
    ['redshift-data.amazonaws.com', 'ExecuteStatement', 'AWS::Redshift::Cluster', 'dpa-warehouse', false],
    ['kinesis.amazonaws.com', 'GetRecords', 'AWS::Kinesis::Stream', 'txn-stream', true],
    ['kms.amazonaws.com', 'Decrypt', 'AWS::KMS::Key', 'alias/data-lake-cmk', true],
  ],
  cicd: [
    ['sts.amazonaws.com', 'AssumeRole', 'AWS::IAM::Role', 'deploy-target', true],
    ['ecr.amazonaws.com', 'PutImage', 'AWS::ECR::Repository', 'payments-api', false],
    ['ecs.amazonaws.com', 'UpdateService', 'AWS::ECS::Service', 'payments-api', false],
    ['lambda.amazonaws.com', 'UpdateFunctionCode', 'AWS::Lambda::Function', 'upi-payment-processor', false],
    ['iam.amazonaws.com', 'PassRole', 'AWS::IAM::Role', 'payments-lambda-exec', false],
    ['cloudformation.amazonaws.com', 'UpdateStack', 'AWS::CloudFormation::Stack', 'payments-prod', false],
    ['s3.amazonaws.com', 'GetObject', 'AWS::S3::Object', 'dpa-terraform-state', true],
  ],
  ops: [
    ['ec2.amazonaws.com', 'DescribeInstances', 'AWS::EC2::Instance', '*', true],
    ['iam.amazonaws.com', 'ListUsers', 'AWS::IAM::User', '*', true],
    ['iam.amazonaws.com', 'CreateAccessKey', 'AWS::IAM::User', 'svc-tally-sync', false],
    ['s3.amazonaws.com', 'ListBuckets', 'AWS::S3::Bucket', '*', true],
    ['ssm.amazonaws.com', 'StartSession', 'AWS::EC2::Instance', 'payments-gateway-01', false],
    ['rds.amazonaws.com', 'DescribeDBInstances', 'AWS::RDS::DBInstance', '*', true],
  ],
};
const AZURE_ACTIONS = [
  ['Microsoft.KeyVault', 'vaults/secrets/getSecret/action', 'Microsoft.KeyVault/vaults/secrets', 'kv-payments-prod/upi-signing-key', true],
  ['Microsoft.Storage', 'storageAccounts/blobServices/containers/blobs/read', 'Microsoft.Storage/blobs', 'stpaymentsprod/receipts', true],
  ['Microsoft.Storage', 'storageAccounts/blobServices/containers/blobs/write', 'Microsoft.Storage/blobs', 'stpaymentsprod/settlements', false],
  ['Microsoft.Sql', 'servers/databases/read', 'Microsoft.Sql/servers/databases', 'sql-payments/merchants', true],
  ['Microsoft.ContainerService', 'managedClusters/listClusterUserCredential/action', 'Microsoft.ContainerService/managedClusters', 'aks-payments', false],
  ['Microsoft.ServiceBus', 'namespaces/queues/messages/send/action', 'Microsoft.ServiceBus/queues', 'sb-payments/refunds', false],
];
const JENKINS_ACTIONS = [
  ['jenkins', 'job.build', 'Jenkins::Job', 'self', false],
  ['jenkins', 'credentials.use', 'Jenkins::Credential', 'bound', true],
  ['jenkins', 'scm.checkout', 'Git::Repository', 'deepalgo-labs/payments-api', true],
  ['jenkins', 'artifact.archive', 'Jenkins::Artifact', 'build-output', false],
  ['jenkins', 'agent.connect', 'Jenkins::Agent', 'agent-linux-01', true],
];
const VAULT_ACTIONS = [
  ['vault', 'auth/approle/login', 'Vault::Auth', 'approle', false],
  ['vault', 'secret/data/payments/read', 'Vault::KV', 'secret/data/payments/npci', true],
  ['vault', 'database/creds/readonly', 'Vault::Lease', 'database/creds/readonly', false],
  ['vault', 'sys/leases/renew', 'Vault::Lease', 'database/creds/readonly', false],
  ['vault', 'transit/encrypt/payments', 'Vault::Transit', 'transit/keys/payments', false],
];

function actionsFor(identity) {
  if (identity.provider === 'azure') return AZURE_ACTIONS;
  if (identity.provider === 'jenkins') return JENKINS_ACTIONS;
  if (identity.provider === 'vault') return VAULT_ACTIONS;
  if (identity.functional_class === 'NHI_CICD') return AWS_ACTIONS.cicd;
  if (['HUMAN', 'DUAL_IDENTITY'].includes(identity.functional_class) || identity.identity_type === 'ec2_instance') return AWS_ACTIONS.ops;
  if (identity.account_id === '739204185562') return AWS_ACTIONS.data;
  return AWS_ACTIONS.payments;
}

function ipsFor(identity, r) {
  if (identity.provider === 'jenkins') return ['49.207.51.18', '49.207.51.19'];
  if (identity.oidc_provider || identity.name.includes('github')) return ['140.82.112.21', '4.208.26.197', '20.42.65.85'];
  if (['HUMAN', 'DUAL_IDENTITY'].includes(identity.functional_class)) return ['106.51.73.220', '49.37.142.8'];
  if (identity.provider === 'azure') return ['20.193.142.9', '4.213.31.44'];
  if (identity.provider === 'vault') return ['10.40.12.31', '10.40.12.32'];
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
  const actions = actionsFor(identity);
  const ips = ipsFor(identity, r);
  const creds = credentialsOf(identity);
  const last = Date.parse(identity.last_activity_at);
  const perDay = identity.hot ? r.int(22, 40) : identity.idle_days > 60 ? 0 : r.int(3, 12);
  const events = [];
  const span = identity.idle_days > 60 ? 0 : 90;
  for (let d = 0; d < span; d += 1) {
    const dayStart = last - d * DAY;
    const n = Math.max(0, perDay + r.int(-3, 4) - (d > 45 ? 2 : 0));
    for (let k = 0; k < n; k += 1) {
      const hourBias = identity.functional_class === 'NHI_CICD' ? r.pick([3, 4, 10, 11, 14, 15, 16]) : r.int(0, 23);
      const t = dayStart - r.int(0, 59) * MIN - ((24 + new Date(dayStart).getUTCHours() - hourBias) % 24) * HOUR;
      if (t > NOW) continue;
      const [source, name, rtype, rname, readOnly] = r.pick(actions);
      const cred = creds.length ? r.pick(creds) : null;
      const errored = r.chance(identity.functional_class === 'DUAL_IDENTITY' ? 0.09 : 0.03);
      events.push(makeEvent(identity, { t, source, name, rtype, rname, readOnly, cred, ip: r.pick(ips), errored, r }));
    }
  }
  /* A few notable departures: the genome anomalies are built from these. */
  if (identity.hot || identity.is_admin) {
    const t = last - r.int(1, 30) * HOUR;
    events.push(makeEvent(identity, { t, source: identity.provider === 'aws' ? 'sts.amazonaws.com' : identity.provider, name: identity.provider === 'aws' ? 'AssumeRole' : 'credentials.use', rtype: 'AWS::IAM::Role', rname: 'OrganizationAccountAccessRole', readOnly: false, cred: creds[0], ip: '185.220.101.47', errored: true, r, cross: '739204185562' }));
  }
  events.sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time));
  eventCache.set(identity.id, events);
  return events;
}

function makeEvent(identity, { t, source, name, rtype, rname, readOnly, cred, ip, errored, r, cross = null }) {
  const scope = scopeById(identity.account_id);
  const resourceArn =
    identity.provider === 'aws'
      ? rname === '*'
        ? null
        : rtype === 'AWS::S3::Object'
          ? `arn:aws:s3:::${rname}/${r.pick(['2026/11', 'daily', 'exports'])}/${r.hex(8)}.json`
          : rtype === 'AWS::IAM::Role'
            ? `arn:aws:iam::${cross ?? identity.account_id}:role/${rname}`
            : `arn:aws:${source.split('.')[0]}:${identity.region}:${identity.account_id}:${rtype.split('::')[2].toLowerCase()}/${rname}`
      : identity.provider === 'azure'
        ? `/subscriptions/${identity.account_id}/resourceGroups/rg-payments-prod/providers/${rtype}/${rname}`
        : `${identity.provider}://${identity.account_id}/${rname === 'self' ? identity.name : rname}`;
  const action = identity.provider === 'aws' ? `${source.split('.')[0]}:${name}` : name;
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
    resource_type: rtype,
    resource_name: rname === '*' ? null : rname,
    target: resourceArn,
    is_cross_account: Boolean(cross),
    target_account_id: cross ?? scope?.id ?? null,
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
