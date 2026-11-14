/*
 * The estate the console watches: every connected application, the
 * non-human identities found in each, their credentials, the posture
 * findings, detections, leaked secrets, Jira tickets and mail.
 *
 * Built deterministically from a seed so every viewer sees the same records,
 * with times anchored to the current hour. Anything people change is layered
 * on top by the shared store (see store.js).
 */

/* ── Seeded randomness ─────────────────────────────────────────────────── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFor(key) {
  const r = mulberry32(hashString(String(key)));
  const api = {
    next: r,
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(r() * list.length)],
    chance: (p) => r() < p,
    weighted: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let x = r() * total;
      for (const [v, w] of pairs) {
        x -= w;
        if (x <= 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
    hex: (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''),
    alnum: (n, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567') =>
      Array.from({ length: n }, () => chars[Math.floor(r() * chars.length)]).join(''),
    shuffle: (list) => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
  return api;
}

const HOUR = 3600e3;
const DAY = 24 * HOUR;
/* Times are anchored to the start of the current hour, so everyone who opens
   the console within the same hour sees identical timestamps. */
export const ANCHOR = Math.floor(Date.now() / HOUR) * HOUR;
const ago = (ms) => new Date(ANCHOR - ms).toISOString();
const ahead = (ms) => new Date(ANCHOR + ms).toISOString();

/* ── Organisation ──────────────────────────────────────────────────────── */
export const ORG = {
  name: 'Corvane',
  domain: 'corvane.io',
  tenant: 'corvane-prod',
  jiraSite: 'corvane.atlassian.net',
  jiraProject: { key: 'SEC', name: 'Security Engineering' },
  mailFrom: 'nhi-alerts@corvane.io',
};

export const TEAMS = ['Platform', 'Payments', 'Data', 'Identity & Access', 'Security Operations', 'Developer Experience', 'Machine Learning'];

export const PEOPLE = [
  { id: 'p-priya', name: 'Priya Raman', title: 'Head of Cloud Security', team: 'Security Operations', role: 'admin' },
  { id: 'p-marcus', name: 'Marcus Chen', title: 'Staff Platform Engineer', team: 'Platform', role: 'operator' },
  { id: 'p-elena', name: 'Elena Novak', title: 'Security Engineer', team: 'Identity & Access', role: 'analyst' },
  { id: 'p-daniel', name: 'Daniel Okafor', title: 'Payments Tech Lead', team: 'Payments', role: 'operator' },
  { id: 'p-sofia', name: 'Sofia Alvarez', title: 'Detection Engineer', team: 'Security Operations', role: 'analyst' },
  { id: 'p-james', name: 'James Whitfield', title: 'Data Platform Lead', team: 'Data', role: 'operator' },
  { id: 'p-aisha', name: 'Aisha Karim', title: 'DevEx Engineer', team: 'Developer Experience', role: 'operator' },
  { id: 'p-tomas', name: 'Tomás Herrera', title: 'SRE', team: 'Platform', role: 'operator' },
  { id: 'p-hannah', name: 'Hannah Lindqvist', title: 'GRC Manager', team: 'Security Operations', role: 'viewer' },
  { id: 'p-kenji', name: 'Kenji Watanabe', title: 'ML Infrastructure Engineer', team: 'Machine Learning', role: 'operator' },
  { id: 'p-ravi', name: 'Ravi Menon', title: 'Cloud Architect', team: 'Platform', role: 'admin' },
  { id: 'p-olivia', name: 'Olivia Grant', title: 'Backend Engineer', team: 'Payments', role: 'operator' },
  { id: 'p-noah', name: 'Noah Fischer', title: 'Security Analyst', team: 'Security Operations', role: 'analyst' },
  { id: 'p-leila', name: 'Leila Haddad', title: 'Data Engineer', team: 'Data', role: 'operator' },
].map((p) => ({ ...p, email: `${p.name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${p.name.split(' ')[1].toLowerCase()}@${ORG.domain}` }));

/* People who have left: still named as owners on identities nobody re-homed. */
export const FORMER = [
  { id: 'p-greg', name: 'Greg Holloway', title: 'Former DevOps Engineer', team: 'Platform', departed: ago(74 * DAY), email: `greg.holloway@${ORG.domain}` },
  { id: 'p-mira', name: 'Mira Petrov', title: 'Former Data Engineer', team: 'Data', departed: ago(131 * DAY), email: `mira.petrov@${ORG.domain}` },
];

/* ── Providers ─────────────────────────────────────────────────────────── */
export const PROVIDERS = {
  aws: { key: 'aws', name: 'Amazon Web Services', short: 'AWS', logo: 'aws', kind: 'cloud', color: '#FF9900', unit: 'account' },
  azure: { key: 'azure', name: 'Microsoft Azure', short: 'Azure', logo: 'azure-icon', kind: 'cloud', color: '#0078D4', unit: 'subscription' },
  github: { key: 'github', name: 'GitHub', short: 'GitHub', logo: 'github', kind: 'code', color: '#24292F', unit: 'organization' },
  bitbucket: { key: 'bitbucket', name: 'Bitbucket', short: 'Bitbucket', logo: 'bitbucket', kind: 'code', color: '#2684FF', unit: 'workspace' },
  vault: { key: 'vault', name: 'HashiCorp Vault', short: 'Vault', logo: 'vault', kind: 'secrets', color: '#FFD814', unit: 'cluster' },
  jira: { key: 'jira', name: 'Jira', short: 'Jira', logo: 'jira', kind: 'workflow', color: '#2684FF', unit: 'site' },
  email: { key: 'email', name: 'Email', short: 'Email', logo: 'gmail', kind: 'workflow', color: '#EA4335', unit: 'domain' },
};
export const SOURCE_PROVIDERS = ['aws', 'azure', 'github', 'bitbucket', 'vault'];

/* Identity types per provider. `logo` is the service icon shown beside it. */
export const IDENTITY_TYPES = {
  'aws.role': { provider: 'aws', label: 'IAM role', logo: 'aws-iam' },
  'aws.user': { provider: 'aws', label: 'IAM user', logo: 'aws-iam' },
  'aws.lambda': { provider: 'aws', label: 'Lambda execution role', logo: 'aws-lambda' },
  'aws.ec2': { provider: 'aws', label: 'EC2 instance profile', logo: 'aws-ec2' },
  'aws.ecs': { provider: 'aws', label: 'ECS task role', logo: 'aws-ecs' },
  'aws.eks': { provider: 'aws', label: 'EKS service account role', logo: 'aws-eks' },
  'azure.sp': { provider: 'azure', label: 'Service principal', logo: 'azure-icon' },
  'azure.mi': { provider: 'azure', label: 'Managed identity', logo: 'azure-icon' },
  'azure.app': { provider: 'azure', label: 'App registration', logo: 'azure-icon' },
  'github.app': { provider: 'github', label: 'GitHub App', logo: 'github' },
  'github.oauth': { provider: 'github', label: 'OAuth App', logo: 'github' },
  'github.pat': { provider: 'github', label: 'Personal access token', logo: 'github' },
  'github.deploykey': { provider: 'github', label: 'Deploy key', logo: 'github' },
  'github.actions': { provider: 'github', label: 'Actions workflow (OIDC)', logo: 'github-actions' },
  'bitbucket.repotoken': { provider: 'bitbucket', label: 'Repository access token', logo: 'bitbucket' },
  'bitbucket.wstoken': { provider: 'bitbucket', label: 'Workspace access token', logo: 'bitbucket' },
  'bitbucket.apppassword': { provider: 'bitbucket', label: 'App password', logo: 'bitbucket' },
  'bitbucket.oauth': { provider: 'bitbucket', label: 'OAuth consumer', logo: 'bitbucket' },
  'bitbucket.pipelines': { provider: 'bitbucket', label: 'Pipelines (OIDC)', logo: 'bitbucket' },
  'vault.approle': { provider: 'vault', label: 'AppRole', logo: 'vault' },
  'vault.k8s': { provider: 'vault', label: 'Kubernetes auth role', logo: 'vault' },
  'vault.awsauth': { provider: 'vault', label: 'AWS auth role', logo: 'vault' },
  'vault.token': { provider: 'vault', label: 'Token', logo: 'vault' },
  'vault.dbrole': { provider: 'vault', label: 'Database secrets role', logo: 'vault' },
};

export const CREDENTIAL_TYPES = {
  'aws.accesskey': { label: 'Access key', logo: 'aws-iam' },
  'aws.session': { label: 'STS session (short-lived)', logo: 'aws-iam' },
  'azure.secret': { label: 'Client secret', logo: 'azure-icon' },
  'azure.cert': { label: 'Certificate', logo: 'azure-icon' },
  'azure.federated': { label: 'Federated credential', logo: 'azure-icon' },
  'github.pat': { label: 'Personal access token', logo: 'github' },
  'github.finepat': { label: 'Fine-grained token', logo: 'github' },
  'github.appkey': { label: 'App private key', logo: 'github' },
  'github.sshkey': { label: 'SSH deploy key', logo: 'github' },
  'github.clientsecret': { label: 'OAuth client secret', logo: 'github' },
  'bitbucket.token': { label: 'Access token', logo: 'bitbucket' },
  'bitbucket.apppassword': { label: 'App password', logo: 'bitbucket' },
  'bitbucket.secret': { label: 'OAuth secret', logo: 'bitbucket' },
  'vault.secretid': { label: 'AppRole secret ID', logo: 'vault' },
  'vault.token': { label: 'Vault token', logo: 'vault' },
  'vault.lease': { label: 'Dynamic lease', logo: 'vault' },
};

/* ── Connections (one per account / tenant / org / workspace / cluster) ── */
const BASE_CONNECTIONS = [
  { id: 'c-aws-prod', provider: 'aws', name: 'corvane-production', locator: '482193760215', env: 'prod', regions: ['us-east-1', 'us-west-2', 'eu-west-1'], size: 34 },
  { id: 'c-aws-pay', provider: 'aws', name: 'payments-production', locator: '719305846621', env: 'prod', regions: ['us-east-1', 'eu-central-1'], size: 22 },
  { id: 'c-aws-data', provider: 'aws', name: 'data-lake', locator: '305518249937', env: 'prod', regions: ['us-east-1'], size: 18 },
  { id: 'c-aws-stg', provider: 'aws', name: 'corvane-staging', locator: '611024587390', env: 'staging', regions: ['us-east-1'], size: 16 },
  { id: 'c-aws-shared', provider: 'aws', name: 'shared-services', locator: '128830471956', env: 'prod', regions: ['us-east-1'], size: 10 },
  { id: 'c-az-prod', provider: 'azure', name: 'Production', locator: 'a3f1c9d2-6b47-4e0a-9d1f-2c7e5b8a4f10', env: 'prod', regions: ['eastus', 'westeurope'], size: 20, tenant: 'corvane.onmicrosoft.com' },
  { id: 'c-az-analytics', provider: 'azure', name: 'Analytics', locator: '7d2e4b81-03ac-4f69-b5e2-91c0d8a6e3f7', env: 'prod', regions: ['eastus2'], size: 12, tenant: 'corvane.onmicrosoft.com' },
  { id: 'c-az-sandbox', provider: 'azure', name: 'Sandbox', locator: 'c05b9e37-8f12-4a6d-a7c3-5e1f0b2d9846', env: 'dev', regions: ['centralus'], size: 8, tenant: 'corvane.onmicrosoft.com' },
  { id: 'c-gh-corvane', provider: 'github', name: 'corvane', locator: 'github.com/corvane', env: 'prod', size: 28, repos: 214 },
  { id: 'c-gh-labs', provider: 'github', name: 'corvane-labs', locator: 'github.com/corvane-labs', env: 'dev', size: 10, repos: 46 },
  { id: 'c-bb-legacy', provider: 'bitbucket', name: 'corvane-legacy', locator: 'bitbucket.org/corvane-legacy', env: 'prod', size: 16, repos: 88 },
  { id: 'c-vault-prod', provider: 'vault', name: 'vault-prod', locator: 'https://vault.corvane.internal:8200', env: 'prod', size: 20, version: '1.17.6' },
  { id: 'c-vault-dr', provider: 'vault', name: 'vault-dr', locator: 'https://vault-dr.corvane.internal:8200', env: 'prod', size: 6, version: '1.17.6' },
];

const WORKFLOW_CONNECTIONS = [
  { id: 'c-jira', provider: 'jira', name: ORG.jiraSite, locator: `https://${ORG.jiraSite}`, project: 'SEC', status: 'healthy' },
  { id: 'c-email', provider: 'email', name: 'Google Workspace', locator: ORG.mailFrom, status: 'healthy' },
];

/* Resource vocabulary per provider, for permissions and the access graph. */
const RES = {
  aws: {
    prod: ['s3://corvane-prod-ledger', 's3://corvane-customer-exports', 'rds:payments-primary', 'dynamodb:sessions', 'kms:alias/payments', 'secretsmanager:prod/stripe-api', 'sqs:settlement-queue', 'lambda:invoice-renderer', 'eks:prod-core'],
    staging: ['s3://corvane-staging-assets', 'rds:staging-db', 'sqs:staging-events', 'eks:staging-core'],
  },
  azure: {
    prod: ['Key Vault: kv-corvane-prod', 'Storage: stcorvaneprod', 'SQL: sql-orders-prod', 'AKS: aks-prod-weu', 'Subscription: Production', 'Microsoft Graph'],
    dev: ['Storage: stsandbox01', 'Key Vault: kv-sandbox', 'Subscription: Sandbox'],
  },
  github: ['corvane/payments-api', 'corvane/web-app', 'corvane/infra-terraform', 'corvane/ledger-service', 'corvane/mobile', 'corvane/data-pipelines', 'corvane/helm-charts', 'corvane/docs'],
  bitbucket: ['corvane-legacy/billing-batch', 'corvane-legacy/report-engine', 'corvane-legacy/ftp-bridge', 'corvane-legacy/partner-sync', 'corvane-legacy/crm-connector'],
  vault: ['kv/prod/payments/*', 'kv/prod/platform/*', 'database/creds/orders-ro', 'database/creds/ledger-rw', 'aws/creds/deployer', 'pki/issue/internal', 'transit/encrypt/pii'],
};

/* Names per type. Real-looking and specific, not "role-1". */
const NAMES = {
  'aws.role': ['payments-settlement-worker', 'ledger-reconciler', 'terraform-deployer', 'datadog-integration', 'github-actions-deploy', 'backup-orchestrator', 'cross-account-auditor', 'snowflake-loader', 'cost-explorer-reader', 'incident-break-glass', 'eventbridge-dispatch', 'partner-sftp-ingest', 'vault-aws-secrets-engine', 'config-recorder'],
  'aws.user': ['ci-deployer', 'svc-legacy-reporting', 'jenkins-artifacts', 'svc-sendgrid-bounce', 'tableau-extract', 'svc-partner-feed', 'old-migration-bot'],
  'aws.lambda': ['invoice-renderer-exec', 'webhook-fanout-exec', 'pii-scrubber-exec', 'thumbnail-gen-exec', 'fraud-score-exec', 'audit-forwarder-exec'],
  'aws.ec2': ['bastion-host-profile', 'kafka-broker-profile', 'build-runner-profile', 'legacy-batch-profile'],
  'aws.ecs': ['checkout-api-task', 'notifications-task', 'ledger-api-task', 'search-indexer-task'],
  'aws.eks': ['external-dns-irsa', 'karpenter-controller', 'argo-cd-irsa', 'cert-manager-irsa', 'loki-storage-irsa'],
  'azure.sp': ['sp-terraform-prod', 'sp-databricks-ingest', 'sp-powerbi-refresh', 'sp-github-oidc-deploy', 'sp-backup-vault', 'sp-sentinel-connector', 'sp-legacy-sharepoint-sync'],
  'azure.mi': ['mi-aks-kubelet', 'mi-func-orders', 'mi-adf-pipelines', 'mi-appgw-certs', 'mi-logic-approvals'],
  'azure.app': ['app-corvane-portal', 'app-hr-sync', 'app-teams-bot', 'app-partner-api', 'app-mail-processor'],
  'github.app': ['corvane-release-bot', 'renovate', 'snyk-security', 'linear-sync', 'argo-cd-image-updater'],
  'github.oauth': ['vercel-preview', 'sonarcloud', 'codecov'],
  'github.pat': ['gh-pat-greg-automation', 'gh-pat-release-scripts', 'gh-pat-docs-publisher', 'gh-pat-mirror-sync'],
  'github.deploykey': ['deploy-key-helm-charts', 'deploy-key-infra-ro', 'deploy-key-ledger-prod', 'deploy-key-docs-site'],
  'github.actions': ['deploy-payments-api.yml', 'terraform-apply.yml', 'publish-images.yml', 'nightly-data-sync.yml', 'release-mobile.yml'],
  'bitbucket.repotoken': ['billing-batch-ci', 'report-engine-ci', 'partner-sync-deploy'],
  'bitbucket.wstoken': ['workspace-backup', 'jira-dev-panel'],
  'bitbucket.apppassword': ['svc-jenkins-legacy', 'mira-etl-scripts', 'ftp-bridge-pusher'],
  'bitbucket.oauth': ['sonarqube-legacy', 'crowd-sso-bridge'],
  'bitbucket.pipelines': ['billing-batch-deploy', 'crm-connector-release'],
  'vault.approle': ['approle-payments-api', 'approle-ledger', 'approle-jenkins', 'approle-airflow', 'approle-partner-gateway'],
  'vault.k8s': ['k8s-checkout', 'k8s-notifications', 'k8s-search', 'k8s-ml-serving'],
  'vault.awsauth': ['aws-auth-lambda-fraud', 'aws-auth-ec2-batch'],
  'vault.token': ['token-terraform-orphan', 'token-ops-periodic', 'token-root-generated'],
  'vault.dbrole': ['db-orders-ro', 'db-ledger-rw', 'db-analytics-ro'],
};

const TYPES_BY_PROVIDER = {
  aws: [['aws.role', 5], ['aws.user', 2], ['aws.lambda', 2], ['aws.ec2', 1], ['aws.ecs', 1.4], ['aws.eks', 1.4]],
  azure: [['azure.sp', 4], ['azure.mi', 3], ['azure.app', 2]],
  github: [['github.app', 2], ['github.oauth', 1], ['github.pat', 1.5], ['github.deploykey', 1.5], ['github.actions', 2.5]],
  bitbucket: [['bitbucket.repotoken', 2], ['bitbucket.wstoken', 1], ['bitbucket.apppassword', 2], ['bitbucket.oauth', 1], ['bitbucket.pipelines', 1.5]],
  vault: [['vault.approle', 3], ['vault.k8s', 2.5], ['vault.awsauth', 1], ['vault.token', 1.5], ['vault.dbrole', 1.5]],
};

const PERMS = {
  'aws.role': ['s3:GetObject', 's3:PutObject', 'kms:Decrypt', 'sts:AssumeRole', 'dynamodb:Query', 'sqs:SendMessage', 'logs:PutLogEvents', 'ec2:DescribeInstances', 'iam:PassRole', 'secretsmanager:GetSecretValue', 'rds-db:connect', 'cloudwatch:PutMetricData'],
  'aws.user': ['s3:*', 'ecr:PutImage', 'ecr:GetAuthorizationToken', 'cloudformation:*', 'iam:CreateAccessKey', 'ses:SendEmail', 'athena:StartQueryExecution'],
  azure: ['Microsoft.KeyVault/vaults/secrets/read', 'Microsoft.Storage/storageAccounts/blobServices/containers/read', 'Microsoft.Sql/servers/databases/read', 'Microsoft.ContainerService/managedClusters/read', 'Microsoft.Authorization/roleAssignments/write', 'Directory.Read.All', 'Application.ReadWrite.All', 'Mail.Send', 'Sites.ReadWrite.All'],
  github: ['contents:write', 'pull_requests:write', 'metadata:read', 'actions:write', 'packages:write', 'administration:write', 'secrets:read', 'workflows:write', 'issues:write', 'checks:write'],
  bitbucket: ['repository:write', 'repository:admin', 'pullrequest:write', 'pipeline:variable', 'webhook', 'project:admin', 'account:read'],
  vault: ['read kv/prod/payments/*', 'read database/creds/orders-ro', 'update transit/encrypt/pii', 'read aws/creds/deployer', 'create pki/issue/internal', 'list kv/prod/*', 'sudo sys/*'],
};

const COUNTRIES = ['US', 'IE', 'DE', 'GB', 'NL', 'SG', 'IN'];

/* ── Build ─────────────────────────────────────────────────────────────── */
export function buildConnection(base, extra = {}) {
  const r = rngFor(`conn:${base.id}`);
  const provider = PROVIDERS[base.provider];
  return {
    status: 'healthy',
    connectedAt: ago(r.int(90, 540) * DAY),
    connectedBy: r.pick(['p-priya', 'p-ravi', 'p-marcus']),
    lastSyncAt: ago(r.int(4, 55) * 60e3),
    syncEvery: provider.kind === 'workflow' ? null : '15 min',
    regions: [],
    ...base,
    ...extra,
  };
}

function identityForConnection(conn, index, r, people, owners) {
  const provider = conn.provider;
  const type = r.weighted(TYPES_BY_PROVIDER[provider]);
  const t = IDENTITY_TYPES[type];
  const pool = NAMES[type];
  const baseName = pool[index % pool.length];
  const round = Math.floor(index / pool.length);
  const QUAL = ['eu', 'batch', 'internal', 'reporting', 'sync', 'ops', 'canary', 'legacy', 'edge', 'v2'];
  const qual = round ? QUAL[(round * 3 + index + hashString(conn.id)) % QUAL.length] : '';
  const withQual = !qual ? baseName : baseName.endsWith('.yml') ? baseName.replace('.yml', `-${qual}.yml`) : `${baseName}-${qual}`;
  const env = conn.env === 'prod' && r.chance(0.15) ? 'staging' : conn.env;
  const name = provider === 'aws' && conn.env !== 'prod' ? `${withQual}-stg` : withQual;
  const id = `${provider}-${hashString(`${conn.id}:${type}:${name}:${index}`).toString(36)}`;

  const formerOwner = r.chance(0.07);
  const orphan = !formerOwner && r.chance(0.06);
  const owner = formerOwner ? r.pick(FORMER).id : orphan ? null : r.pick(owners);
  const ownerPerson = people.find((p) => p.id === owner);
  const team = ownerPerson?.team || FORMER.find((p) => p.id === owner)?.team || r.pick(TEAMS);

  const createdDays = r.int(20, 1300);
  const lastUsedDays = r.weighted([[0, 6], [1, 3], [r.int(2, 20), 3], [r.int(30, 89), 1.4], [r.int(90, 420), 1.6]]);
  const neverUsed = r.chance(0.04);
  const lastUsedAt = neverUsed ? null : ago(lastUsedDays * DAY + r.int(1, 1200) * 60e3);

  const permPool = PERMS[type] || PERMS[provider] || PERMS['aws.role'];
  const granted = r.int(provider === 'aws' ? 18 : 6, provider === 'aws' ? 420 : 60);
  const adminLike = r.chance(type === 'aws.user' || type === 'azure.sp' || type === 'github.pat' || type === 'bitbucket.apppassword' || type === 'vault.token' ? 0.35 : 0.1);
  const used = neverUsed ? 0 : Math.max(1, Math.round(granted * (adminLike ? r.int(1, 8) / 100 : r.int(8, 70) / 100)));
  const scopes = r.shuffle(permPool).slice(0, r.int(3, Math.min(7, permPool.length)));
  if (adminLike) {
    const adminScope = { aws: 'AdministratorAccess', azure: 'Owner (subscription)', github: 'admin:org', bitbucket: 'repository:admin', vault: 'policy: root' }[provider];
    scopes.unshift(adminScope);
  }

  const resPool = provider === 'aws' ? RES.aws[env === 'prod' ? 'prod' : 'staging'] : provider === 'azure' ? RES.azure[env === 'dev' ? 'dev' : 'prod'] : RES[provider];
  const resources = r.shuffle(resPool).slice(0, r.int(2, Math.min(5, resPool.length)));

  const locator = {
    aws: `arn:aws:iam::${conn.locator}:${type === 'aws.user' ? 'user' : 'role'}/${name}`,
    azure: `objectId ${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}`,
    github: type === 'github.actions' ? `${conn.name}/${r.pick(['payments-api', 'infra-terraform', 'web-app', 'data-pipelines', 'mobile'])}/.github/workflows/${name}` : `${conn.name} · ${t.label}`,
    bitbucket: `${conn.name} · ${t.label}`,
    vault: type === 'vault.token' ? `accessor ${r.hex(8)}…` : `auth/${type === 'vault.approle' ? 'approle' : type === 'vault.k8s' ? 'kubernetes' : type === 'vault.awsauth' ? 'aws' : 'database'}/role/${name}`,
  }[provider];

  const status = lastUsedAt === null || lastUsedDays >= 90 ? 'stale' : lastUsedDays >= 30 ? 'dormant' : 'active';

  /* Daily calls over 30 days, for sparklines and the activity panel. */
  const baseRate = status === 'active' ? r.int(40, 4200) : status === 'dormant' ? r.int(0, 12) : 0;
  const series = Array.from({ length: 30 }, (_, i) => {
    const day = 29 - i;
    if (status !== 'active' && day < lastUsedDays) return 0;
    const weekday = new Date(ANCHOR - day * DAY).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.45 : 1;
    return Math.round(baseRate * weekend * (0.7 + r.next() * 0.6));
  });

  return {
    id,
    provider,
    connectionId: conn.id,
    type,
    name,
    locator,
    environment: env,
    region: conn.regions?.length ? r.pick(conn.regions) : null,
    owner,
    team,
    createdAt: ago(createdDays * DAY),
    createdBy: r.chance(0.6) ? r.pick(['terraform', 'pulumi', 'console', 'cli', 'bicep']) : 'console',
    lastUsedAt,
    status,
    permissions: { granted, used, adminLike, scopes },
    resources,
    tags: r.shuffle(['pci', 'sox', 'customer-data', 'ci-cd', 'third-party', 'break-glass', 'internal', 'gdpr']).slice(0, r.int(0, 2)),
    countries: status === 'active' ? r.shuffle(COUNTRIES).slice(0, r.int(1, 2)) : [],
    series,
    thirdParty: ['github.app', 'github.oauth', 'bitbucket.oauth', 'azure.app'].includes(type) && r.chance(0.6) ? r.pick(['Datadog', 'Snyk', 'Vercel', 'SonarSource', 'Codecov', 'Linear', 'Renovate']) : null,
    links: [],
  };
}

function credentialsFor(identity, r) {
  const out = [];
  const mk = (type, extra = {}) => {
    const createdDays = Math.min(r.int(3, 900), Math.floor((ANCHOR - Date.parse(identity.createdAt)) / DAY));
    const id = `cred-${hashString(`${identity.id}:${type}:${out.length}`).toString(36)}`;
    const lastUsedAt = identity.lastUsedAt && r.chance(0.85) ? identity.lastUsedAt : identity.lastUsedAt ? ago(r.int(40, 400) * DAY) : null;
    const cred = {
      id,
      identityId: identity.id,
      provider: identity.provider,
      type,
      createdAt: ago(createdDays * DAY),
      ageDays: createdDays,
      lastUsedAt,
      expiresAt: null,
      rotationDays: null,
      status: 'active',
      storedIn: null,
      ...extra,
    };
    out.push(cred);
    return cred;
  };
  const p = identity.provider;
  const t = identity.type;
  if (t === 'aws.user') {
    const n = r.chance(0.3) ? 2 : 1;
    for (let i = 0; i < n; i += 1) {
      mk('aws.accesskey', {
        display: `AKIA${r.alnum(4)}••••••••${r.alnum(4)}`,
        rotationDays: 90,
        storedIn: r.pick(['GitHub Actions secret · corvane/infra-terraform', 'Bitbucket repository variable · billing-batch', 'Vault kv/prod/platform/ci', 'Jenkins credentials store', 'AWS Secrets Manager']),
        status: i === 1 && r.chance(0.5) ? 'inactive' : 'active',
      });
    }
  } else if (p === 'aws') {
    mk('aws.session', { display: 'ASIA…  1h STS sessions', rotationDays: null, storedIn: 'Issued on demand' });
  } else if (t === 'azure.sp' || t === 'azure.app') {
    const expiresDays = r.weighted([[r.int(-20, -1), 1], [r.int(1, 13), 1.6], [r.int(14, 60), 2], [r.int(61, 700), 4]]);
    mk(r.chance(0.7) ? 'azure.secret' : 'azure.cert', {
      display: r.chance(0.7) ? `${r.alnum(3, 'abcdefghijklmnopqrstuvwxyz0123456789')}8Q~••••••••••${r.alnum(4)}` : `Thumbprint ${r.hex(8).toUpperCase()}…`,
      expiresAt: expiresDays < 0 ? ago(-expiresDays * DAY) : ahead(expiresDays * DAY),
      rotationDays: 180,
      storedIn: r.pick(['Key Vault kv-corvane-prod', 'GitHub Actions secret · corvane/infra-terraform', 'Azure DevOps variable group', 'Vault kv/prod/platform/azure']),
      status: expiresDays < 0 ? 'expired' : 'active',
    });
    if (t === 'azure.sp' && r.chance(0.4)) mk('azure.federated', { display: 'repo:corvane/infra-terraform:ref:refs/heads/main', storedIn: 'Workload identity federation' });
  } else if (t === 'azure.mi') {
    /* Managed identities have no secret to steal - Azure rotates the token. */
  } else if (t === 'github.pat') {
    const classic = r.chance(0.6);
    const expires = classic && r.chance(0.6) ? null : ahead(r.int(-10, 200) * DAY);
    mk(classic ? 'github.pat' : 'github.finepat', {
      display: classic ? `ghp_${r.alnum(4, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}••••••••••••${r.alnum(4, 'abcdefghijklmnopqrstuvwxyz0123456789')}` : `github_pat_11${r.alnum(6)}••••••••`,
      expiresAt: expires,
      storedIn: r.pick(['Jenkins credentials store', 'Bitbucket repository variable · partner-sync', 'Laptop keychain (owner)', 'Vault kv/prod/platform/github']),
      status: expires && Date.parse(expires) < ANCHOR ? 'expired' : 'active',
    });
  } else if (t === 'github.app') {
    mk('github.appkey', { display: `SHA256:${r.alnum(10, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}…`, rotationDays: 365, storedIn: r.pick(['Vault kv/prod/platform/github-app', 'AWS Secrets Manager', 'Kubernetes secret · argo-cd']) });
  } else if (t === 'github.oauth') {
    mk('github.clientsecret', { display: `${r.hex(6)}••••••••${r.hex(4)}`, storedIn: 'Vendor-managed' });
  } else if (t === 'github.deploykey') {
    mk('github.sshkey', { display: `ED25519 SHA256:${r.alnum(12, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}…`, storedIn: r.pick(['Argo CD repository credentials', 'Jenkins credentials store', 'EC2 build-runner']) });
  } else if (t === 'bitbucket.apppassword') {
    mk('bitbucket.apppassword', { display: `ATBB${r.alnum(6)}••••••••`, storedIn: r.pick(['Jenkins credentials store', 'Cron host legacy-batch-01', 'Laptop keychain (owner)']) });
  } else if (t === 'bitbucket.repotoken' || t === 'bitbucket.wstoken') {
    const expires = r.chance(0.5) ? null : ahead(r.int(5, 300) * DAY);
    mk('bitbucket.token', { display: `ATCTT3x${r.alnum(6)}••••••••`, expiresAt: expires, storedIn: r.pick(['Bitbucket Pipelines variable', 'Vault kv/prod/platform/bitbucket', 'Jenkins credentials store']) });
  } else if (t === 'bitbucket.oauth') {
    mk('bitbucket.secret', { display: `${r.alnum(8)}••••••`, storedIn: 'Vendor-managed' });
  } else if (t === 'vault.approle') {
    const ttlUnlimited = r.chance(0.35);
    mk('vault.secretid', { display: `secret_id_accessor ${r.hex(8)}-${r.hex(4)}…`, expiresAt: ttlUnlimited ? null : ahead(r.int(1, 30) * DAY), storedIn: r.pick(['Kubernetes secret · payments', 'Jenkins credentials store', 'AWS SSM Parameter Store']) });
  } else if (t === 'vault.token') {
    mk('vault.token', { display: `hvs.${r.alnum(6, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}••••••••`, expiresAt: r.chance(0.6) ? null : ahead(r.int(1, 30) * DAY), storedIn: r.pick(['Terraform Cloud workspace variable', 'Operator laptop', 'GitHub Actions secret · corvane/infra-terraform']) });
  } else if (t === 'vault.dbrole') {
    mk('vault.lease', { display: `${r.int(3, 40)} active leases · max TTL ${r.pick(['1h', '24h', '30d'])}`, storedIn: 'Issued on demand' });
  }
  return out;
}

/* Posture rules. `test(identity, creds)` returns evidence when it fails. */
export const RULES = [
  { id: 'NHI-001', title: 'Access key older than 90 days', provider: 'aws', severity: 'high', pillar: 'Credential hygiene', frameworks: ['CIS AWS 1.14', 'SOC 2 CC6.1'], playbook: 'pb-rotate-aws-key',
    test: (i, cs) => cs.find((c) => c.type === 'aws.accesskey' && c.status === 'active' && c.ageDays > 90) && { age: `${cs.find((c) => c.type === 'aws.accesskey' && c.ageDays > 90).ageDays} days` } },
  { id: 'NHI-002', title: 'Administrator access granted to a workload', provider: '*', severity: 'critical', pillar: 'Least privilege', frameworks: ['NIST AC-6', 'SOC 2 CC6.3'], playbook: 'pb-rightsize',
    test: (i) => i.permissions.adminLike && i.environment === 'prod' && { scope: i.permissions.scopes[0], used: `${i.permissions.used} of ${i.permissions.granted} permissions used in 90 days` } },
  { id: 'NHI-003', title: 'Identity unused for 90+ days', provider: '*', severity: 'medium', pillar: 'Lifecycle', frameworks: ['SOC 2 CC6.2', 'ISO 27001 A.5.18'], playbook: 'pb-disable',
    test: (i) => i.status === 'stale' && { lastUsed: i.lastUsedAt || 'never' } },
  { id: 'NHI-004', title: 'Owner has left the company', provider: '*', severity: 'high', pillar: 'Ownership', frameworks: ['SOC 2 CC6.2'], playbook: 'pb-reassign',
    test: (i) => FORMER.some((p) => p.id === i.owner) && { owner: FORMER.find((p) => p.id === i.owner).name } },
  { id: 'NHI-005', title: 'No accountable owner', provider: '*', severity: 'medium', pillar: 'Ownership', frameworks: ['ISO 27001 A.5.9'], playbook: 'pb-reassign',
    test: (i) => !i.owner && { owner: 'none' } },
  { id: 'NHI-006', title: 'Client secret expires within 14 days', provider: 'azure', severity: 'high', pillar: 'Credential hygiene', frameworks: ['SOC 2 CC6.1'], playbook: 'pb-rotate-azure-secret',
    test: (i, cs) => { const c = cs.find((x) => x.type === 'azure.secret' && x.expiresAt && Date.parse(x.expiresAt) > ANCHOR && Date.parse(x.expiresAt) - ANCHOR < 14 * DAY); return c && { expires: c.expiresAt }; } },
  { id: 'NHI-007', title: 'Credential already expired but still attached', provider: '*', severity: 'low', pillar: 'Credential hygiene', frameworks: [], playbook: 'pb-cleanup',
    test: (i, cs) => cs.find((c) => c.status === 'expired') && { credential: 'expired credential present' } },
  { id: 'NHI-008', title: 'Personal access token without expiry', provider: 'github', severity: 'high', pillar: 'Credential hygiene', frameworks: ['CIS GitHub 1.3.4'], playbook: 'pb-revoke-pat',
    test: (i, cs) => cs.find((c) => (c.type === 'github.pat' || c.type === 'github.finepat') && !c.expiresAt) && { token: 'classic PAT, no expiry' } },
  { id: 'NHI-009', title: 'Deploy key has write access', provider: 'github', severity: 'medium', pillar: 'Least privilege', frameworks: ['CIS GitHub 1.1.8'], playbook: 'pb-deploykey-ro',
    test: (i) => i.type === 'github.deploykey' && !i.name.includes('-ro') && { access: 'read/write' } },
  { id: 'NHI-010', title: 'App password in use (deprecated by Atlassian)', provider: 'bitbucket', severity: 'medium', pillar: 'Credential hygiene', frameworks: [], playbook: 'pb-bb-token',
    test: (i) => i.type === 'bitbucket.apppassword' && i.status !== 'stale' && { replacement: 'repository or workspace access token' } },
  { id: 'NHI-011', title: 'AppRole secret ID never expires', provider: 'vault', severity: 'high', pillar: 'Credential hygiene', frameworks: ['NIST IA-5'], playbook: 'pb-approle-ttl',
    test: (i, cs) => cs.find((c) => c.type === 'vault.secretid' && !c.expiresAt) && { secret_id_ttl: '0 (unlimited)' } },
  { id: 'NHI-012', title: 'Orphan token with no expiry', provider: 'vault', severity: 'critical', pillar: 'Credential hygiene', frameworks: ['NIST IA-5'], playbook: 'pb-revoke-vault-token',
    test: (i, cs) => i.type === 'vault.token' && cs.find((c) => !c.expiresAt) && { ttl: 'none', orphan: true } },
  { id: 'NHI-013', title: 'Over-permissioned: under 10% of grants used', provider: '*', severity: 'medium', pillar: 'Least privilege', frameworks: ['NIST AC-6(5)'], playbook: 'pb-rightsize',
    test: (i) => !i.permissions.adminLike && i.permissions.granted > 40 && i.permissions.used / i.permissions.granted < 0.1 && { used: `${i.permissions.used} of ${i.permissions.granted}` } },
  { id: 'NHI-014', title: 'OIDC trust accepts any branch', provider: '*', severity: 'high', pillar: 'Trust', frameworks: ['CIS GitHub 1.5.2'], playbook: 'pb-oidc-subject',
    test: (i) => (i.type === 'github.actions' || i.type === 'bitbucket.pipelines') && i.name.length % 2 === 0 && { subject: 'repo:corvane/*:*' } },
  { id: 'NHI-015', title: 'Third-party app with write access to code', provider: '*', severity: 'medium', pillar: 'Third party', frameworks: ['SOC 2 CC9.2'], playbook: 'pb-review-thirdparty',
    test: (i) => i.thirdParty && i.permissions.scopes.some((s) => /write|admin/.test(s)) && { vendor: i.thirdParty } },
];

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export const PLAYBOOKS = [
  { id: 'pb-rotate-aws-key', title: 'Rotate AWS access key', provider: 'aws', approval: false, est: '2 min',
    steps: ['Create a new access key', 'Write it to the consuming secret store', 'Wait for the new key to be used', 'Deactivate the old key', 'Delete the old key after 7 days'] },
  { id: 'pb-rotate-azure-secret', title: 'Rotate Azure client secret', provider: 'azure', approval: false, est: '3 min',
    steps: ['Add a new client secret (180 days)', 'Store it in Key Vault kv-corvane-prod', 'Restart consumers that read the secret', 'Remove the expiring secret'] },
  { id: 'pb-rightsize', title: 'Reduce to the permissions actually used', provider: '*', approval: true, est: '5 min',
    steps: ['Build a least-privilege policy from 90 days of activity', 'Open a pull request with the policy change', 'Wait for approval', 'Apply the policy', 'Watch for access-denied errors for 24 h'] },
  { id: 'pb-disable', title: 'Disable unused identity', provider: '*', approval: true, est: '1 min',
    steps: ['Snapshot the current configuration', 'Disable the identity', 'Notify the owner', 'Delete after 30 days if nobody objects'] },
  { id: 'pb-reassign', title: 'Assign an accountable owner', provider: '*', approval: false, est: 'instant',
    steps: ['Suggest an owner from recent activity and team', 'Ask the suggested owner to confirm', 'Record the owner on the identity'] },
  { id: 'pb-cleanup', title: 'Remove expired credentials', provider: '*', approval: false, est: '1 min', steps: ['List expired credentials', 'Delete them from the identity'] },
  { id: 'pb-revoke-pat', title: 'Replace PAT with a GitHub App', provider: 'github', approval: true, est: '10 min',
    steps: ['Create a GitHub App with the scopes in use', 'Install it on the repositories in use', 'Swap the token in the consumer', 'Revoke the personal access token'] },
  { id: 'pb-deploykey-ro', title: 'Make deploy key read-only', provider: 'github', approval: false, est: '1 min', steps: ['Confirm no pushes in 90 days', 'Recreate the key as read-only', 'Remove the write key'] },
  { id: 'pb-bb-token', title: 'Replace app password with access token', provider: 'bitbucket', approval: false, est: '5 min',
    steps: ['Create a repository access token with the scopes in use', 'Update the consumer', 'Revoke the app password'] },
  { id: 'pb-approle-ttl', title: 'Bound AppRole secret IDs', provider: 'vault', approval: false, est: '2 min',
    steps: ['Set secret_id_ttl to 24h and secret_id_num_uses to 1', 'Bind secret IDs to the consumer CIDR', 'Re-issue the secret ID to the consumer'] },
  { id: 'pb-revoke-vault-token', title: 'Revoke orphan Vault token', provider: 'vault', approval: true, est: '1 min',
    steps: ['Find consumers from the audit device', 'Issue a scoped, renewable replacement', 'Revoke the orphan token'] },
  { id: 'pb-oidc-subject', title: 'Pin OIDC trust to protected branches', provider: '*', approval: true, est: '3 min',
    steps: ['Read the current trust policy', 'Restrict the subject to refs/heads/main and the production environment', 'Apply and verify a deploy still succeeds'] },
  { id: 'pb-review-thirdparty', title: 'Review third-party access', provider: '*', approval: false, est: '15 min', steps: ['Send an access review to the owner', 'Downgrade to read-only where writes are unused', 'Record the decision'] },
];

/* ── The world ─────────────────────────────────────────────────────────── */
export function buildWorld(extraConnections = []) {
  const people = PEOPLE;
  const owners = people.filter((p) => p.team !== 'Security Operations').map((p) => p.id);
  const connections = [...BASE_CONNECTIONS.map((c) => buildConnection(c)), ...WORKFLOW_CONNECTIONS.map((c) => buildConnection(c))];
  const sourceConnections = [...connections.filter((c) => SOURCE_PROVIDERS.includes(c.provider)), ...extraConnections];

  const identities = [];
  const credentials = [];
  for (const conn of sourceConnections) {
    const r = rngFor(`ids:${conn.id}`);
    const size = conn.size ?? 12;
    for (let i = 0; i < size; i += 1) {
      const identity = identityForConnection(conn, i, r, people, owners);
      identities.push(identity);
      credentials.push(...credentialsFor(identity, rngFor(`cred:${identity.id}`)));
    }
  }

  /* Cross-application trust: the chains that make a leaked CI token a cloud
     breach. Workflow → cloud role, Vault → cloud, Bitbucket pipeline → Azure. */
  const byType = (t) => identities.filter((i) => i.type === t);
  const link = (from, to, kind, label) => {
    if (!from || !to) return;
    from.links.push({ to: to.id, kind, label });
    to.links.push({ from: from.id, kind, label });
  };
  const awsRoles = byType('aws.role');
  const awsUsers = byType('aws.user');
  byType('github.actions').forEach((wf, i) => link(wf, awsRoles[(i * 3) % awsRoles.length], 'assumes', 'AssumeRoleWithWebIdentity'));
  byType('github.actions').slice(0, 2).forEach((wf, i) => link(wf, byType('azure.sp')[i], 'federates', 'Workload identity federation'));
  byType('bitbucket.pipelines').forEach((p, i) => link(p, byType('azure.sp')[(i + 2) % Math.max(1, byType('azure.sp').length)], 'federates', 'OIDC federated credential'));
  byType('bitbucket.apppassword').forEach((p, i) => link(p, awsUsers[i % awsUsers.length], 'stores', 'Access key in repository variable'));
  byType('vault.awsauth').forEach((v, i) => link(v, awsRoles[(i * 5 + 1) % awsRoles.length], 'trusts', 'AWS auth method'));
  byType('vault.dbrole').forEach((v, i) => link(byType('vault.k8s')[i % Math.max(1, byType('vault.k8s').length)], v, 'reads', 'Dynamic database credentials'));
  byType('vault.approle').forEach((v, i) => link(v, awsUsers[(i + 1) % awsUsers.length], 'issues', 'aws/creds/deployer'));
  byType('github.pat').forEach((p, i) => link(p, byType('vault.token')[i % Math.max(1, byType('vault.token').length)], 'stores', 'Token in workflow secret'));
  byType('aws.eks').forEach((e, i) => link(byType('vault.k8s')[i % Math.max(1, byType('vault.k8s').length)], e, 'runs-as', 'Same Kubernetes service account'));

  /* Risk: what it can reach x how exposed it is x how stale it is. */
  for (const i of identities) {
    const cs = credentials.filter((c) => c.identityId === i.id);
    let risk = 18;
    if (i.permissions.adminLike) risk += 32;
    if (i.environment === 'prod') risk += 10;
    if (i.status === 'stale') risk += 12;
    if (!i.owner || FORMER.some((p) => p.id === i.owner)) risk += 12;
    if (cs.some((c) => c.type === 'aws.accesskey' && c.ageDays > 90)) risk += 10;
    if (cs.some((c) => !c.expiresAt && /pat|token|secretid|apppassword/.test(c.type))) risk += 8;
    if (i.links.length) risk += 6 * Math.min(2, i.links.length);
    if (i.tags.includes('pci') || i.tags.includes('customer-data')) risk += 6;
    risk += hashString(i.id) % 9;
    i.risk = Math.max(4, Math.min(99, risk));
    i.riskLevel = i.risk >= 80 ? 'critical' : i.risk >= 60 ? 'high' : i.risk >= 35 ? 'medium' : 'low';
    i.credentialIds = cs.map((c) => c.id);
  }

  /* Findings. */
  const findings = [];
  for (const i of identities) {
    const cs = credentials.filter((c) => c.identityId === i.id);
    for (const rule of RULES) {
      if (rule.provider !== '*' && rule.provider !== i.provider) continue;
      const evidence = rule.test(i, cs);
      if (!evidence) continue;
      const r = rngFor(`finding:${i.id}:${rule.id}`);
      const id = `F-${(hashString(`${i.id}:${rule.id}`) % 90000 + 10000).toString()}`;
      findings.push({
        id,
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        pillar: rule.pillar,
        identityId: i.id,
        provider: i.provider,
        connectionId: i.connectionId,
        environment: i.environment,
        evidence,
        firstSeenAt: ago(r.int(1, 120) * DAY + r.int(0, 23) * HOUR),
        status: r.weighted([['open', 7], ['in_progress', 1.5], ['risk_accepted', 0.4]]),
        assignee: null,
        playbook: rule.playbook,
        frameworks: rule.frameworks,
      });
    }
  }
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));
  findings.filter((f) => f.status === 'in_progress').forEach((f, k) => (f.assignee = ['p-elena', 'p-noah', 'p-sofia', 'p-marcus'][k % 4]));

  /* Detections - behaviour that breaks an identity's baseline. */
  const pickId = (pred, n = 0) => identities.filter(pred)[n] || identities[n];
  const detSpecs = [
    { title: 'Access key used from a country never seen before', sev: 'critical', tactic: 'T1078.004 · Valid accounts: cloud accounts', who: pickId((i) => i.type === 'aws.user' && i.status === 'active'), hours: 2,
      observed: 'GetCallerIdentity, ListBuckets, GetObject x 1,284 from 185.220.101.47 (RO, Tor exit)', baseline: 'Only from 3.91.x.x (us-east-1 NAT) in 180 days', metric: ['Countries', 1, 2] },
    { title: 'GitHub token cloned 142 repositories in 6 minutes', sev: 'critical', tactic: 'T1213 · Data from information repositories', who: pickId((i) => i.type === 'github.pat'), hours: 5,
      observed: '142 git clone operations, 38 private repositories', baseline: 'Pushes to 2 repositories, weekdays 09:00–18:00 UTC', metric: ['Repos read / hour', 3, 142] },
    { title: 'Vault token read 30x its usual number of secrets', sev: 'high', tactic: 'T1555 · Credentials from password stores', who: pickId((i) => i.type === 'vault.token'), hours: 9,
      observed: '2,418 reads under kv/prod/* in 40 minutes', baseline: '~80 reads a day under kv/prod/platform/*', metric: ['Secret reads / hour', 6, 2418] },
    { title: 'Service principal signed in from an unfamiliar network', sev: 'high', tactic: 'T1078.004 · Valid accounts: cloud accounts', who: pickId((i) => i.type === 'azure.sp' && i.environment === 'prod'), hours: 14,
      observed: 'Token request from AS9009 (M247), Bucharest', baseline: 'GitHub Actions runners (AS36459) and AKS egress only', metric: ['New ASNs', 0, 1] },
    { title: 'App password used after its owner left', sev: 'high', tactic: 'T1078 · Valid accounts', who: pickId((i) => i.type === 'bitbucket.apppassword' && FORMER.some((p) => p.id === i.owner)) || pickId((i) => i.type === 'bitbucket.apppassword'), hours: 26,
      observed: 'git push to corvane-legacy/billing-batch from 81.2.69.160', baseline: 'Owner offboarded; no use expected', metric: ['Uses after offboarding', 0, 7] },
    { title: 'Workflow assumed production role outside the deploy window', sev: 'medium', tactic: 'T1550.001 · Use alternate authentication material', who: pickId((i) => i.type === 'github.actions'), hours: 31,
      observed: 'AssumeRoleWithWebIdentity at 03:12 UTC from a pull_request run', baseline: 'Only push to main, 14:00–17:00 UTC', metric: ['Off-window assumptions', 0, 3] },
    { title: 'Managed identity enumerated role assignments', sev: 'medium', tactic: 'T1069.003 · Permission groups discovery: cloud', who: pickId((i) => i.type === 'azure.mi'), hours: 50,
      observed: 'roleAssignments/read x 311 across 3 subscriptions', baseline: 'Reads Key Vault secrets only', metric: ['Discovery calls / day', 0, 311] },
    { title: 'Lambda role created an IAM access key', sev: 'critical', tactic: 'T1098.001 · Account manipulation: additional cloud credentials', who: pickId((i) => i.type === 'aws.lambda'), hours: 70,
      observed: 'iam:CreateAccessKey for user ci-deployer', baseline: 'Never calls IAM write APIs', metric: ['IAM writes', 0, 1] },
    { title: 'Deploy key pushed to a protected branch', sev: 'medium', tactic: 'T1195.002 · Compromise software supply chain', who: pickId((i) => i.type === 'github.deploykey'), hours: 96,
      observed: 'Push to main on corvane/helm-charts bypassing review', baseline: 'Read-only clones by Argo CD', metric: ['Pushes', 0, 1] },
    { title: 'Spike in denied calls from Kubernetes role', sev: 'low', tactic: 'T1580 · Cloud infrastructure discovery', who: pickId((i) => i.type === 'aws.eks'), hours: 120,
      observed: '1,920 AccessDenied on ec2:Describe* in 1 hour', baseline: '< 5 denied calls a day', metric: ['Denied / hour', 1, 1920] },
    { title: 'Dormant identity woke up after 140 days', sev: 'medium', tactic: 'T1078 · Valid accounts', who: pickId((i) => i.status === 'stale' && i.provider === 'aws'), hours: 150,
      observed: 'sts:GetCallerIdentity then s3:ListAllMyBuckets', baseline: 'No activity for 140 days', metric: ['Days idle', 140, 0] },
    { title: 'AppRole secret ID used from two clusters at once', sev: 'high', tactic: 'T1550 · Use alternate authentication material', who: pickId((i) => i.type === 'vault.approle'), hours: 190,
      observed: 'Logins from 10.40.0.0/16 and 172.31.0.0/16 within 4 minutes', baseline: 'Single consumer in 10.40.0.0/16', metric: ['Source networks', 1, 2] },
  ];
  const detections = detSpecs.map((d, k) => {
    const r = rngFor(`det:${k}`);
    const at = ANCHOR - d.hours * HOUR - r.int(0, 50) * 60e3;
    return {
      id: `D-${2400 + k * 7}`,
      title: d.title,
      severity: d.sev,
      tactic: d.tactic,
      identityId: d.who.id,
      provider: d.who.provider,
      detectedAt: new Date(at).toISOString(),
      status: k < 4 ? 'new' : k < 7 ? 'investigating' : r.pick(['resolved', 'false_positive', 'resolved']),
      assignee: k < 2 ? null : r.pick(['p-sofia', 'p-noah', 'p-elena']),
      observed: d.observed,
      baseline: d.baseline,
      metric: { label: d.metric[0], baseline: d.metric[1], observed: d.metric[2] },
      confidence: r.int(78, 98),
      timeline: [
        { at: new Date(at - 38 * 60e3).toISOString(), text: 'Last activity inside baseline' },
        { at: new Date(at - 6 * 60e3).toISOString(), text: 'First call outside baseline' },
        { at: new Date(at).toISOString(), text: 'Detection raised' },
        ...(k >= 4 ? [{ at: new Date(at + 22 * 60e3).toISOString(), text: 'Acknowledged by on-call' }] : []),
      ],
    };
  });

  /* Leaked secrets in code. */
  const leakSpecs = [
    { repo: 'corvane/payments-api', provider: 'github', file: 'scripts/backfill_settlements.py', line: 14, type: 'aws.accesskey', vis: 'private', author: 'Olivia Grant', hours: 3, live: true,
      code: ['import boto3', '', '# TODO move to env before merge', 'session = boto3.Session(', '    aws_access_key_id="AKIA4XQ7••••••••PL2M",', '    aws_secret_access_key="••••••••••••••••••••••••••••••",', '    region_name="us-east-1",', ')'] },
    { repo: 'corvane-labs/llm-eval-sandbox', provider: 'github', file: '.env.example', line: 3, type: 'azure.secret', vis: 'public', author: 'Kenji Watanabe', hours: 20, live: true,
      code: ['AZURE_TENANT_ID=corvane.onmicrosoft.com', 'AZURE_CLIENT_ID=4c1f2a9e-…', 'AZURE_CLIENT_SECRET=Kx38Q~••••••••••••••Va', 'OPENAI_API_BASE=https://…'] },
    { repo: 'corvane-legacy/billing-batch', provider: 'bitbucket', file: 'deploy/run.sh', line: 22, type: 'github.pat', vis: 'private', author: 'Greg Holloway', hours: 52, live: true,
      code: ['#!/usr/bin/env bash', 'set -euo pipefail', '', 'git clone https://ghp_9fKd••••••••••••Qm1@github.com/corvane/ledger-service.git', 'cd ledger-service && make release'] },
    { repo: 'corvane/infra-terraform', provider: 'github', file: 'modules/vault/backend.tf', line: 7, type: 'vault.token', vis: 'private', author: 'Tomás Herrera', hours: 140, live: false,
      code: ['provider "vault" {', '  address = "https://vault.corvane.internal:8200"', '  token   = "hvs.CAESI••••••••••••••••"', '}'] },
    { repo: 'corvane-legacy/partner-sync', provider: 'bitbucket', file: 'config/settings.yaml', line: 31, type: 'bitbucket.apppassword', vis: 'private', author: 'Mira Petrov', hours: 300, live: true,
      code: ['bitbucket:', '  user: mira-etl', '  app_password: ATBB••••••••••••7Kq', 'schedule: "0 */6 * * *"'] },
    { repo: 'corvane/web-app', provider: 'github', file: 'src/config/analytics.ts', line: 9, type: 'github.finepat', vis: 'private', author: 'Aisha Karim', hours: 420, live: false,
      code: ['export const analytics = {', "  token: 'github_pat_11AB••••••••••••',", "  endpoint: 'https://api.github.com/graphql',", '};'] },
  ];
  const exposures = leakSpecs.map((l, k) => {
    const r = rngFor(`leak:${k}`);
    const cred = credentials.find((c) => c.type === l.type) || credentials[k];
    return {
      id: `X-${780 + k * 3}`,
      provider: l.provider,
      repo: l.repo,
      file: l.file,
      line: l.line,
      commit: r.hex(40),
      branch: k % 3 === 0 ? 'main' : `feature/${r.pick(['settlement-backfill', 'eval-harness', 'cleanup', 'vault-module'])}`,
      author: l.author,
      detectedAt: ago(l.hours * HOUR),
      secretType: l.type,
      credentialId: cred?.id,
      identityId: cred?.identityId,
      visibility: l.vis,
      validated: l.live ? 'live' : 'revoked',
      status: k < 3 ? 'open' : k === 3 ? 'resolved' : 'open',
      code: l.code,
      highlight: l.code.findIndex((x) => x.includes('••')),
    };
  });

  /* Jira tickets already raised. */
  const crit = findings.filter((f) => f.severity === 'critical');
  const high = findings.filter((f) => f.severity === 'high');
  const ticketSpecs = [
    { s: 'Rotate leaked AWS key in payments-api backfill script', link: { kind: 'exposure', id: exposures[0].id }, pr: 'Highest', st: 'In Progress', as: 'p-daniel', rep: 'p-sofia', h: 2 },
    { s: 'Investigate mass clone by GitHub token', link: { kind: 'detection', id: detections[1].id }, pr: 'Highest', st: 'In Progress', as: 'p-sofia', rep: 'p-priya', h: 4 },
    { s: `Remove ${crit[0] ? identities.find((i) => i.id === crit[0].identityId)?.name : 'workload'} administrator access`, link: crit[0] && { kind: 'finding', id: crit[0].id }, pr: 'High', st: 'To Do', as: 'p-marcus', rep: 'p-elena', h: 30 },
    { s: 'Revoke orphan Vault token from Terraform', link: findings.find((f) => f.ruleId === 'NHI-012') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-012').id }, pr: 'High', st: 'In Review', as: 'p-tomas', rep: 'p-elena', h: 70 },
    { s: 'Re-home identities owned by Greg Holloway', link: findings.find((f) => f.ruleId === 'NHI-004') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-004').id }, pr: 'Medium', st: 'To Do', as: 'p-ravi', rep: 'p-hannah', h: 120 },
    { s: 'Migrate Bitbucket app passwords to access tokens', link: findings.find((f) => f.ruleId === 'NHI-010') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-010').id }, pr: 'Medium', st: 'To Do', as: 'p-aisha', rep: 'p-elena', h: 160 },
    { s: 'Azure client secret for sp-powerbi-refresh expiring', link: findings.find((f) => f.ruleId === 'NHI-006') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-006').id }, pr: 'High', st: 'Done', as: 'p-james', rep: 'p-noah', h: 200 },
    { s: 'Pin GitHub OIDC subject for terraform-apply workflow', link: findings.find((f) => f.ruleId === 'NHI-014') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-014').id }, pr: 'High', st: 'Done', as: 'p-ravi', rep: 'p-elena', h: 260 },
    { s: 'Quarterly access review: third-party GitHub apps', link: findings.find((f) => f.ruleId === 'NHI-015') && { kind: 'finding', id: findings.find((f) => f.ruleId === 'NHI-015').id }, pr: 'Low', st: 'To Do', as: 'p-hannah', rep: 'p-priya', h: 330 },
    { s: 'Public Azure secret in corvane-labs/llm-eval-sandbox', link: { kind: 'exposure', id: exposures[1].id }, pr: 'Highest', st: 'To Do', as: 'p-kenji', rep: 'p-sofia', h: 19 },
    { s: 'Bound AppRole secret IDs for Jenkins', link: high.find((f) => f.ruleId === 'NHI-011') && { kind: 'finding', id: high.find((f) => f.ruleId === 'NHI-011').id }, pr: 'Medium', st: 'In Progress', as: 'p-tomas', rep: 'p-elena', h: 90 },
  ];
  const tickets = ticketSpecs.map((t, k) => ({
    key: `SEC-${1418 + k * 2}`,
    id: `t-seed-${k}`,
    summary: t.s,
    description: '',
    type: t.link?.kind === 'detection' ? 'Incident' : t.link?.kind === 'exposure' ? 'Incident' : 'Task',
    priority: t.pr,
    status: t.st,
    assignee: t.as,
    reporter: t.rep,
    links: t.link ? [t.link] : [],
    createdAt: ago(t.h * HOUR),
    updatedAt: ago(Math.max(1, t.h - 3) * HOUR),
    labels: ['nhi'],
    seed: true,
  }));
  for (const t of tickets) {
    for (const l of t.links) {
      if (l.kind === 'finding') { const f = findings.find((x) => x.id === l.id); if (f) { f.ticketKey = t.key; if (t.status === 'Done') f.status = 'resolved'; else if (t.status !== 'To Do') { f.status = 'in_progress'; f.assignee = t.assignee; } } }
      if (l.kind === 'detection') { const d = detections.find((x) => x.id === l.id); if (d) d.ticketKey = t.key; }
      if (l.kind === 'exposure') { const x = exposures.find((e) => e.id === l.id); if (x) x.ticketKey = t.key; }
    }
  }

  /* Mail already delivered. */
  const mail = [
    { id: 'm-seed-1', h: 2, from: ORG.mailFrom, to: ['secops@corvane.io'], subject: `[Critical] Live AWS access key committed to corvane/payments-api`, kind: 'alert', link: { kind: 'exposure', id: exposures[0].id },
      body: `A live AWS access key was found in scripts/backfill_settlements.py (line 14) on branch ${exposures[0].branch}.\n\nThe key belongs to an IAM user with write access to production buckets. It was validated against AWS and is active.\n\nRecommended: rotate the key now and remove it from the commit history.` },
    { id: 'm-seed-2', h: 4, from: `jira@${ORG.jiraSite}`, to: ['sofia.alvarez@corvane.io'], subject: `[JIRA] Priya Raman assigned SEC-1420 to you`, kind: 'jira', link: { kind: 'ticket', id: 'SEC-1420' },
      body: `SEC-1420 Investigate mass clone by GitHub token\n\nPriority: Highest\nReporter: Priya Raman\n\nPlease confirm whether the token owner ran this clone and rotate the token if not.` },
    { id: 'm-seed-3', h: 9, from: ORG.mailFrom, to: ['secops@corvane.io'], subject: `[High] Vault token read 30x its usual number of secrets`, kind: 'alert', link: { kind: 'detection', id: detections[2].id },
      body: `${detections[2].observed}.\nBaseline: ${detections[2].baseline}.\n\nThis token has no expiry and was issued outside Terraform.` },
    { id: 'm-seed-4', h: 20, from: ORG.mailFrom, to: ['kenji.watanabe@corvane.io', 'secops@corvane.io'], subject: `[Critical] Azure client secret exposed in a public repository`, kind: 'alert', link: { kind: 'exposure', id: exposures[1].id },
      body: `corvane-labs/llm-eval-sandbox is public and .env.example contains a working client secret for a production service principal.\n\nThe secret is live. Rotate it and make the repository private until the history is cleaned.` },
    { id: 'm-seed-5', h: 26, from: ORG.mailFrom, to: ['priya.raman@corvane.io'], subject: 'Daily digest: 4 new findings, 2 resolved, fleet score 71', kind: 'digest',
      body: `New since yesterday\n• 2 high: Access key older than 90 days\n• 1 high: Client secret expires within 14 days\n• 1 medium: Deploy key has write access\n\nResolved\n• SEC-1430 Azure client secret rotated\n• Orphan token revoked on vault-dr\n\nFleet posture score: 71 (+2 this week).` },
    { id: 'm-seed-6', h: 70, from: `jira@${ORG.jiraSite}`, to: ['tomas.herrera@corvane.io'], subject: `[JIRA] SEC-1424 moved to In Review`, kind: 'jira', link: { kind: 'ticket', id: 'SEC-1424' },
      body: `Elena Novak moved SEC-1424 Revoke orphan Vault token from Terraform from In Progress to In Review.` },
    { id: 'm-seed-7', h: 168, from: ORG.mailFrom, to: ['leadership@corvane.io'], subject: 'Weekly NHI posture report', kind: 'digest',
      body: `Machine identities: ${identities.length} across 5 applications\nCritical findings: ${crit.length}\nMean time to remediate (critical): 2.4 days\nCredentials past rotation policy: ${credentials.filter((c) => c.rotationDays && c.ageDays > c.rotationDays).length}\n\nThe largest risk this week is long-lived CI credentials in Bitbucket pipelines that reach production AWS.` },
  ].map((m) => ({ ...m, at: ago(m.h * HOUR), seed: true }));

  /* Remediation already done. */
  const runs = [
    { id: 'r-seed-1', playbook: 'pb-rotate-azure-secret', targets: [findings.find((f) => f.ruleId === 'NHI-006')?.identityId].filter(Boolean), startedBy: 'p-james', startedAt: ago(196 * HOUR), status: 'succeeded' },
    { id: 'r-seed-2', playbook: 'pb-oidc-subject', targets: [identities.find((i) => i.type === 'github.actions')?.id].filter(Boolean), startedBy: 'p-ravi', startedAt: ago(250 * HOUR), status: 'succeeded', approvedBy: 'p-priya' },
    { id: 'r-seed-3', playbook: 'pb-cleanup', targets: identities.filter((i) => credentials.some((c) => c.identityId === i.id && c.status === 'expired')).slice(0, 3).map((i) => i.id), startedBy: 'p-elena', startedAt: ago(400 * HOUR), status: 'succeeded' },
  ].map((r) => ({ ...r, seed: true }));

  /* Notification rules: how findings reach Jira and inboxes. */
  const rules = [
    { id: 'rule-seed-1', name: 'Critical findings in production', when: { kinds: ['finding', 'detection', 'exposure'], severity: ['critical'], environment: ['prod'] }, actions: { jira: { project: 'SEC', priority: 'Highest' }, email: ['secops@corvane.io'] }, enabled: true, createdBy: 'p-priya', seed: true },
    { id: 'rule-seed-2', name: 'Leaked secrets to the committer', when: { kinds: ['exposure'], severity: ['critical', 'high', 'medium'] }, actions: { email: ['committer', 'secops@corvane.io'] }, enabled: true, createdBy: 'p-sofia', seed: true },
    { id: 'rule-seed-3', name: 'Expiring Azure secrets to owners', when: { kinds: ['finding'], rules: ['NHI-006'] }, actions: { email: ['owner'] }, enabled: true, createdBy: 'p-elena', seed: true },
    { id: 'rule-seed-4', name: 'High detections open a Jira incident', when: { kinds: ['detection'], severity: ['high'] }, actions: { jira: { project: 'SEC', priority: 'High' } }, enabled: false, createdBy: 'p-priya', seed: true },
  ];

  /* What people did recently. */
  const activity = [
    { h: 1, actor: 'p-daniel', verb: 'moved', target: { kind: 'ticket', id: 'SEC-1418' }, text: 'SEC-1418 to In Progress' },
    { h: 2, actor: 'system', verb: 'detected', target: { kind: 'exposure', id: exposures[0].id }, text: 'a live AWS access key in corvane/payments-api' },
    { h: 3, actor: 'p-sofia', verb: 'created', target: { kind: 'ticket', id: 'SEC-1418' }, text: 'SEC-1418 from a leaked secret' },
    { h: 4, actor: 'p-priya', verb: 'assigned', target: { kind: 'ticket', id: 'SEC-1420' }, text: 'SEC-1420 to Sofia Alvarez' },
    { h: 5, actor: 'system', verb: 'detected', target: { kind: 'detection', id: detections[1].id }, text: detections[1].title.toLowerCase() },
    { h: 9, actor: 'system', verb: 'detected', target: { kind: 'detection', id: detections[2].id }, text: detections[2].title.toLowerCase() },
    { h: 11, actor: 'p-marcus', verb: 'connected', target: { kind: 'connection', id: 'c-aws-shared' }, text: 'AWS account shared-services' },
    { h: 19, actor: 'p-sofia', verb: 'created', target: { kind: 'ticket', id: 'SEC-1436' }, text: 'SEC-1436 for a public Azure secret' },
    { h: 30, actor: 'p-elena', verb: 'created', target: { kind: 'ticket', id: 'SEC-1422' }, text: 'SEC-1422 from a critical finding' },
    { h: 70, actor: 'p-elena', verb: 'moved', target: { kind: 'ticket', id: 'SEC-1424' }, text: 'SEC-1424 to In Review' },
    { h: 196, actor: 'p-james', verb: 'ran', target: { kind: 'run', id: 'r-seed-1' }, text: 'Rotate Azure client secret' },
    { h: 250, actor: 'p-priya', verb: 'approved', target: { kind: 'run', id: 'r-seed-2' }, text: 'Pin OIDC trust to protected branches' },
  ].map((a, k) => ({ id: `a-seed-${k}`, at: ago(a.h * HOUR), ...a, seed: true }));

  /* Fleet posture score history (daily, 90 days). */
  const scoreRng = rngFor('score');
  let s = 58;
  const scoreHistory = Array.from({ length: 90 }, (_, k) => {
    s = Math.max(48, Math.min(82, s + (scoreRng.next() - 0.38) * 2.2));
    return { date: new Date(ANCHOR - (89 - k) * DAY).toISOString().slice(0, 10), score: Math.round(s) };
  });

  return { connections, identities, credentials, findings, detections, exposures, tickets, mail, runs, rules, activity, scoreHistory };
}

/* A connection added from the console: build its identities the same way. */
export function connectionSize(provider) {
  return { aws: 14, azure: 10, github: 12, bitbucket: 9, vault: 10 }[provider] ?? 10;
}

export { SEV_ORDER, DAY, HOUR };
