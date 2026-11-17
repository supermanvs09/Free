/*
 * The estate the console shows: people, connected accounts and every
 * non-human identity and credential across AWS, Azure, Jenkins and Vault,
 * plus the repositories GitHub and Bitbucket scanning covers. Generated from a
 * fixed seed relative to the moment the console loaded, so the estate is the
 * same on every load and its times stay current.
 */
import { DAY, HOUR, MIN, NOW, ago, iso, rng } from './util';
import { enrich, syncOverlay } from './entitlements';

export const ORG = { name: 'Deep Algorithms', domain: 'deepalgorithms.ai', tenantId: 'tnt_7f3a91c2' };

/* ── People ────────────────────────────────────────────────────────────── */
/* Sign-in names that differ from name@domain. */
const SIGN_IN = { pranav: 'pranav@das' };
export const PEOPLE = [
  { key: 'pranav', name: 'Pranav Reddy', team: 'Platform Security', department: 'Security', role: 'admin' },
  { key: 'charan', name: 'Charan Teja', team: 'Cloud Platform', department: 'Engineering', role: 'admin' },
  { key: 'harika', name: 'Harika Reddy', team: 'Identity & Access', department: 'Security', role: 'operator' },
  { key: 'raju', name: 'Raju Varma', team: 'DevOps', department: 'Engineering', role: 'operator' },
  { key: 'swathi', name: 'Swathi Nair', team: 'Security Operations', department: 'Security', role: 'analyst' },
  { key: 'vamsi', name: 'Vamsi Krishna', team: 'Payments Engineering', department: 'Engineering', role: 'analyst' },
  { key: 'sashi', name: 'Sashi Kumar', team: 'Data Platform', department: 'Engineering', role: 'analyst' },
  { key: 'venkat', name: 'Venkat Rao', team: 'SRE', department: 'Engineering', role: 'analyst' },
  { key: 'sanju', name: 'Sanju Menon', team: 'Mobile Engineering', department: 'Engineering', role: 'viewer' },
  { key: 'kiran', name: 'Kiran Kumar', team: 'Data Science', department: 'Engineering', role: 'viewer' },
  { key: 'divya', name: 'Divya Sri', team: 'QA Automation', department: 'Engineering', role: 'viewer' },
  { key: 'meghana', name: 'Meghana Rao', team: 'Compliance', department: 'Risk', role: 'viewer' },
].map((p) => ({ ...p, email: SIGN_IN[p.key] ?? `${p.key}@${ORG.domain}`, first: p.name.split(' ')[0] }));
export const person = (key) => PEOPLE.find((p) => p.key === key) ?? PEOPLE[0];

/* ── Providers and the accounts each holds ─────────────────────────────── */
export const PROVIDERS = {
  aws: { key: 'aws', label: 'AWS', scopeNoun: 'account' },
  azure: { key: 'azure', label: 'Azure', scopeNoun: 'subscription' },
  jenkins: { key: 'jenkins', label: 'Jenkins', scopeNoun: 'controller' },
  vault: { key: 'vault', label: 'HashiCorp Vault', scopeNoun: 'cluster' },
  github: { key: 'github', label: 'GitHub', scopeNoun: 'organisation' },
  bitbucket: { key: 'bitbucket', label: 'Bitbucket', scopeNoun: 'workspace' },
};

export const SCOPES = [
  { provider: 'aws', id: '482915736104', name: 'prod-core', regions: ['ap-south-1', 'us-east-1'], env: 'production' },
  { provider: 'aws', id: '739204185562', name: 'data-platform', regions: ['ap-south-1', 'eu-west-1'], env: 'production' },
  { provider: 'aws', id: '215660394871', name: 'staging', regions: ['ap-south-1'], env: 'staging' },
  { provider: 'aws', id: '605218934417', name: 'shared-services', regions: ['ap-south-1'], env: 'production' },
  { provider: 'azure', id: 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607', name: 'Payments-Prod', regions: ['centralindia', 'southindia'], env: 'production', tenant: '9c4e1b72-0d3a-4f6b-a8e2-51c7d93f0b14' },
  { provider: 'azure', id: '7e2d9c18-4a3b-42f1-9d6e-0c5b8a7f3e21', name: 'Analytics-Dev', regions: ['centralindia'], env: 'development', tenant: '9c4e1b72-0d3a-4f6b-a8e2-51c7d93f0b14' },
  { provider: 'jenkins', id: 'ci.deepalgorithms.ai', name: 'Jenkins CI', regions: ['on-prem'], env: 'production' },
  { provider: 'vault', id: 'vault.deepalgorithms.ai', name: 'Vault prod', regions: ['ap-south-1'], env: 'production' },
];
export const scopeById = (id) => SCOPES.find((s) => s.id === id);

/* ── Identities: [name, type, classification, scope, owner, extras] ────── */
const I = (name, type, cls, scope, owner, extra = {}) => ({ name, type, cls, scope, owner, ...extra });
const P = '482915736104';
const D = '739204185562';
const S = '215660394871';
const AZP = 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607';
const AZD = '7e2d9c18-4a3b-42f1-9d6e-0c5b8a7f3e21';
const JK = 'ci.deepalgorithms.ai';
const VT = 'vault.deepalgorithms.ai';
const SH = '605218934417';

const IDENTITY_SPECS = [
  // AWS prod-core
  I('upi-payment-processor', 'lambda_function', 'NHI_SERVICE', P, 'vamsi', { cred: 'shared:payments-lambda-exec', secret: 'prod/payments/npci-api-key', admin: false, hot: true }),
  I('upi-callback-handler', 'lambda_function', 'NHI_SERVICE', P, 'vamsi', { cred: 'shared:payments-lambda-exec', public: true, hot: true }),
  I('settlement-batch-worker', 'ecs_task', 'NHI_SERVICE', P, 'vamsi', { secret: 'prod/settlement/bank-sftp', hot: true }),
  I('kyc-document-verifier', 'lambda_function', 'NHI_SERVICE', P, 'vamsi', { secret: 'prod/kyc/digilocker-client' }),
  I('fraud-scoring-api', 'eks_pod', 'NHI_SERVICE', P, 'kiran', { hot: true }),
  I('ledger-reconciler', 'batch_job', 'NHI_SERVICE', P, 'vamsi', {}),
  I('invoice-pdf-renderer', 'lambda_function', 'NHI_SERVICE', P, 'venkat', {}),
  I('notification-dispatcher', 'lambda_function', 'NHI_SERVICE', P, 'venkat', { secret: 'prod/notify/msg91-auth-key', hot: true }),
  I('merchant-onboarding-svc', 'ecs_task', 'NHI_SERVICE', P, 'vamsi', {}),
  I('payments-gateway-01', 'ec2_instance', 'NHI_SERVICE', P, 'raju', { public: true, admin: true, hot: true }),
  I('bastion-prod', 'ec2_instance', 'NHI_SERVICE', P, 'raju', { public: true }),
  I('svc-tally-sync', 'iam_user_service_account', 'NHI_SERVICE', P, null, { keys: 2, oldKey: 412, shadow: true, admin: true }),
  I('svc-razorpay-webhook', 'iam_user_service_account', 'NHI_SAAS', P, 'vamsi', { keys: 1, oldKey: 196 }),
  I('deploy-prod-pipeline', 'codepipeline', 'NHI_CICD', P, 'raju', { admin: true }),
  I('build-payments-api', 'codebuild_project', 'NHI_CICD', P, 'raju', {}),
  I('github-actions-deploy', 'iam_role', 'NHI_CICD', P, 'charan', { oidc: 'token.actions.githubusercontent.com', admin: true, hot: true }),
  I('terraform-runner', 'iam_role', 'NHI_CICD', P, 'charan', { admin: true }),
  I('order-saga-orchestrator', 'step_function', 'NHI_SERVICE', P, 'vamsi', {}),
  I('support-copilot-agent', 'bedrock_agent', 'NHI_AGENT', P, 'kiran', { hot: true }),
  I('datadog-integration', 'iam_role', 'NHI_SAAS', P, 'venkat', { external: '464622532012' }),
  I('snowflake-external-stage', 'iam_role', 'NHI_SAAS', P, 'sashi', { external: '898466741470' }),
  I('pranav.reddy', 'iam_user', 'HUMAN', P, 'pranav', { keys: 1, oldKey: 34 }),
  I('raju-ops-automation', 'iam_user', 'DUAL_IDENTITY', P, 'raju', { keys: 2, oldKey: 288, admin: true }),
  I('cloudwatch-log-shipper', 'lambda_function', 'NHI_SERVICE', P, 'venkat', {}),
  I('refund-processor', 'lambda_function', 'NHI_SERVICE', P, 'vamsi', { cred: 'shared:payments-lambda-exec' }),
  I('cards-tokenization-svc', 'ecs_task', 'NHI_SERVICE', P, 'vamsi', { secret: 'prod/cards/hsm-pin' }),
  // AWS data-platform
  I('gst-report-generator', 'glue_job', 'NHI_SERVICE', D, 'sashi', {}),
  I('clickstream-etl', 'glue_job', 'NHI_SERVICE', D, 'sashi', { hot: true }),
  I('customer-360-builder', 'emr_cluster', 'NHI_SERVICE', D, 'sashi', { admin: true }),
  I('churn-model-notebook', 'sagemaker_notebook', 'NHI_AGENT', D, 'kiran', { public: true }),
  I('feature-store-sync', 'lambda_function', 'NHI_SERVICE', D, 'kiran', {}),
  I('kinesis-txn-consumer', 'lambda_function', 'NHI_SERVICE', D, 'sashi', { hot: true }),
  I('redshift-loader', 'lambda_function', 'NHI_SERVICE', D, 'sashi', { secret: 'data/redshift/loader-password' }),
  I('svc-airflow-scheduler', 'iam_user_service_account', 'NHI_SERVICE', D, 'sashi', { keys: 1, oldKey: 241 }),
  I('data-lake-crawler', 'glue_job', 'NHI_SERVICE', D, 'sashi', {}),
  I('athena-reporting-svc', 'lambda_function', 'NHI_SERVICE', D, 'meghana', {}),
  I('risk-model-endpoint', 'sagemaker_endpoint', 'NHI_AGENT', D, 'kiran', {}),
  // AWS staging
  I('payments-api-staging', 'ecs_task', 'NHI_SERVICE', S, 'vamsi', {}),
  I('qa-regression-runner', 'codebuild_project', 'NHI_CICD', S, 'divya', {}),
  I('load-test-agent', 'ec2_instance', 'NHI_SERVICE', S, 'divya', { public: true }),
  I('temp-debug-role', 'iam_role', 'NHI_EPHEMERAL', S, 'sanju', { admin: true, stale: 140 }),
  I('mobile-api-staging', 'lambda_function', 'NHI_SERVICE', S, 'sanju', {}),
  I('svc-old-sms-gateway', 'iam_user_service_account', 'NHI_SERVICE', S, null, { keys: 1, oldKey: 734, stale: 213, shadow: true }),
  I('preview-env-builder', 'codebuild_project', 'NHI_CICD', S, 'sanju', {}),
  // Azure Payments-Prod
  I('mi-payments-aks', 'managed_identity', 'NHI_SERVICE', AZP, 'charan', { hot: true }),
  I('mi-keyvault-reader', 'managed_identity', 'NHI_SERVICE', AZP, 'charan', {}),
  I('sp-pos-terminal-sync', 'service_principal', 'NHI_SERVICE', AZP, 'vamsi', { azSecret: 18, admin: true }),
  I('app-merchant-portal', 'app_registration', 'NHI_SERVICE', AZP, 'vamsi', { azSecret: 9, public: true }),
  I('sp-powerbi-refresh', 'service_principal', 'NHI_SAAS', AZP, 'meghana', { azSecret: 71 }),
  I('aks-settlement-pod', 'aks_workload', 'NHI_SERVICE', AZP, 'vamsi', { hot: true }),
  I('func-refund-notifier', 'function_app', 'NHI_SERVICE', AZP, 'venkat', {}),
  I('sp-github-deploy', 'service_principal', 'NHI_CICD', AZP, 'charan', { federated: true, admin: true }),
  I('sp-backup-automation', 'service_principal', 'NHI_SERVICE', AZP, null, { azSecret: -12, shadow: true, stale: 96 }),
  // Azure Analytics-Dev
  I('sp-databricks-jobs', 'service_principal', 'NHI_SERVICE', AZD, 'sashi', { azSecret: 44 }),
  I('mi-synapse-pipeline', 'managed_identity', 'NHI_SERVICE', AZD, 'sashi', {}),
  I('sp-legacy-reporting', 'service_principal', 'NHI_SERVICE', AZD, 'meghana', { azSecret: -63, stale: 181 }),
  I('app-ml-experiments', 'app_registration', 'NHI_AGENT', AZD, 'kiran', { azSecret: 120 }),
  // Jenkins
  I('payments-api/deploy-prod', 'jenkins_job', 'NHI_CICD', JK, 'raju', { jenkinsCreds: ['aws-prod-deploy-keys', 'vault-approle-ci'], admin: true, hot: true }),
  I('mobile-app/release-android', 'jenkins_job', 'NHI_CICD', JK, 'sanju', { jenkinsCreds: ['play-store-service-account', 'android-keystore'] }),
  I('infra/terraform-apply', 'jenkins_job', 'NHI_CICD', JK, 'charan', { jenkinsCreds: ['azure-sp-terraform', 'aws-prod-deploy-keys'], admin: true }),
  I('data/nightly-etl', 'jenkins_job', 'NHI_CICD', JK, 'sashi', { jenkinsCreds: ['snowflake-etl-user'] }),
  I('qa/regression-suite', 'jenkins_job', 'NHI_CICD', JK, 'divya', { jenkinsCreds: ['browserstack-key'] }),
  I('agent-linux-01', 'jenkins_agent', 'NHI_CICD', JK, 'raju', { jenkinsCreds: ['agent-ssh-key'] }),
  I('agent-docker-02', 'jenkins_agent', 'NHI_CICD', JK, 'raju', { jenkinsCreds: ['dockerhub-push-token'] }),
  I('jenkins-svc-bot', 'jenkins_user', 'NHI_CICD', JK, null, { jenkinsCreds: ['github-pat-release-bot'], shadow: true }),
  /* HashiCorp Vault is a secret store, not an identity source: each entry
     below is a credential kept in Vault and used by the workload named in
     `consumer`. Kept in this list so every identity id above stays stable. */
  I('approle/payments-api', 'vault_approle', 'NHI_SERVICE', VT, 'vamsi', { vault: 'secret_id', hot: true , consumer: 'upi-payment-processor', vaultAuth: 'AppRole', reads: 'secret/data/payments/*, transit/keys/payments' }),
  I('approle/settlement-worker', 'vault_approle', 'NHI_SERVICE', VT, 'vamsi', { vault: 'secret_id' , consumer: 'settlement-batch-worker', vaultAuth: 'AppRole', reads: 'secret/data/settlement/*' }),
  I('approle/jenkins-ci', 'vault_approle', 'NHI_CICD', VT, 'raju', { vault: 'secret_id', admin: true , consumer: 'payments-api/deploy-prod', vaultAuth: 'AppRole', reads: 'secret/data/ci/*' }),
  I('k8s/fraud-scoring', 'vault_k8s_role', 'NHI_SERVICE', VT, 'kiran', { vault: 'k8s' , consumer: 'fraud-scoring-api', vaultAuth: 'Kubernetes auth', reads: 'secret/data/fraud/*' }),
  I('token/legacy-batch', 'vault_token', 'NHI_SERVICE', VT, null, { vault: 'token', shadow: true, stale: 122 , consumer: 'ledger-reconciler', vaultAuth: 'Token', reads: 'secret/data/payments/*, database/creds/readwrite' }),
  I('aws-secrets-engine/db-readonly', 'vault_dynamic_role', 'NHI_SERVICE', VT, 'sashi', { vault: 'lease' , consumer: 'redshift-loader', vaultAuth: 'Database secrets engine', reads: 'database/creds/readonly' }),
  /* Appended so every identity above keeps its id. */
  I('OrganizationAccountAccessRole', 'iam_role', 'NHI_CICD', D, 'charan', { admin: true, external: P }),
  I('OrganizationAccountAccessRole', 'iam_role', 'NHI_CICD', S, 'charan', { admin: true, external: P }),
  I('sp-terraform-prod', 'service_principal', 'NHI_CICD', AZP, 'charan', { azSecret: 164, admin: true }),
  /* Scenario identities (appended, so every id above stays as it is). */
  I('svc-deploy-bot', 'iam_user_service_account', 'NHI_CICD', P, 'raju', { keys: 1, oldKey: 58, admin: true, hot: true }),
  I('OrganizationAccountAccessRole', 'iam_role', 'NHI_CICD', SH, 'charan', { admin: true, external: P }),
  I('reporting-readonly', 'iam_role', 'NHI_SERVICE', P, 'meghana', {}),
  I('ops-support-role', 'iam_role', 'NHI_SERVICE', P, 'venkat', { stale: 41 }),
  I('break-glass-admin', 'iam_role', 'HUMAN', P, 'pranav', { admin: true, stale: 63 }),
  I('invoice-legacy-export', 'lambda_function', 'NHI_SERVICE', P, 'sashi', { cred: 'shared:invoice-legacy-export-role', stale: 97 }),
  /* One IAM access key, kept in Vault, legitimately used by two workloads. */
  I('svc-billing', 'iam_user_service_account', 'NHI_SERVICE', P, 'vamsi', { keys: 1, oldKey: 64, vaultKey: 'secret/data/billing/aws-access-key' }),
  I('svc-billing-api', 'ecs_task', 'NHI_SERVICE', P, 'vamsi', { hot: true, usesVaultKey: 'svc-billing' }),
  I('batch-reconciler', 'lambda_function', 'NHI_SERVICE', P, 'sashi', { usesVaultKey: 'svc-billing' }),
];

export const IDENTITY_TYPE_PROVIDER = {
  managed_identity: 'azure',
  service_principal: 'azure',
  app_registration: 'azure',
  aks_workload: 'azure',
  function_app: 'azure',
  jenkins_job: 'jenkins',
  jenkins_agent: 'jenkins',
  jenkins_user: 'jenkins',
  vault_approle: 'vault',
  vault_k8s_role: 'vault',
  vault_token: 'vault',
  vault_dynamic_role: 'vault',
};

const AWS_ARN = {
  lambda_function: (a, r, n) => `arn:aws:lambda:${r}:${a}:function:${n}`,
  ecs_task: (a, r, n) => `arn:aws:ecs:${r}:${a}:task-definition/${n}`,
  eks_pod: (a, r, n) => `arn:aws:eks:${r}:${a}:pod/payments-eks/${n}`,
  batch_job: (a, r, n) => `arn:aws:batch:${r}:${a}:job-definition/${n}`,
  ec2_instance: (a, r) => `arn:aws:ec2:${r}:${a}:instance/i-0${(Number(a.slice(-6)) * 7919).toString(16).padStart(16, '0').slice(0, 16)}`,
  iam_user_service_account: (a, r, n) => `arn:aws:iam::${a}:user/${n}`,
  iam_user: (a, r, n) => `arn:aws:iam::${a}:user/${n}`,
  iam_role: (a, r, n) => `arn:aws:iam::${a}:role/${n}`,
  codepipeline: (a, r, n) => `arn:aws:codepipeline:${r}:${a}:${n}`,
  codebuild_project: (a, r, n) => `arn:aws:codebuild:${r}:${a}:project/${n}`,
  step_function: (a, r, n) => `arn:aws:states:${r}:${a}:stateMachine:${n}`,
  bedrock_agent: (a, r, n) => `arn:aws:bedrock:${r}:${a}:agent/${n}`,
  glue_job: (a, r, n) => `arn:aws:glue:${r}:${a}:job/${n}`,
  emr_cluster: (a, r, n) => `arn:aws:elasticmapreduce:${r}:${a}:cluster/${n}`,
  sagemaker_notebook: (a, r, n) => `arn:aws:sagemaker:${r}:${a}:notebook-instance/${n}`,
  sagemaker_endpoint: (a, r, n) => `arn:aws:sagemaker:${r}:${a}:endpoint/${n}`,
};

function identityArn(spec, scope, region, r) {
  if (scope.provider === 'aws') {
    const make = AWS_ARN[spec.type] ?? ((a, rg, n) => `arn:aws:iam::${a}:role/${n}`);
    const arn = make(scope.id, region, spec.name);
    return spec.type === 'ec2_instance' ? arn.replace(/instance\/.*/, `instance/i-0${r.hex(16)}`) : arn;
  }
  if (scope.provider === 'azure') {
    const rg = spec.name.includes('payments') || scope.name === 'Payments-Prod' ? 'rg-payments-prod' : 'rg-analytics-dev';
    const kind = {
      managed_identity: 'Microsoft.ManagedIdentity/userAssignedIdentities',
      service_principal: 'Microsoft.Graph/servicePrincipals',
      app_registration: 'Microsoft.Graph/applications',
      aks_workload: 'Microsoft.ContainerService/managedClusters/aks-payments/workloads',
      function_app: 'Microsoft.Web/sites',
    }[spec.type];
    return `/subscriptions/${scope.id}/resourceGroups/${rg}/providers/${kind}/${spec.name}`;
  }
  if (scope.provider === 'jenkins') {
    if (spec.type === 'jenkins_job') return `jenkins://${scope.id}/job/${spec.name.split('/').join('/job/')}`;
    if (spec.type === 'jenkins_agent') return `jenkins://${scope.id}/computer/${spec.name}`;
    return `jenkins://${scope.id}/user/${spec.name}`;
  }
  // vault
  const [mount, role] = spec.name.split('/');
  const path = { vault_approle: `auth/approle/role/${role}`, vault_k8s_role: `auth/kubernetes/role/${role}`, vault_token: `auth/token/accessor/${role}`, vault_dynamic_role: `${mount}/roles/${role}` }[spec.type];
  return `vault://${scope.id}/${path}`;
}

const AWS_CREATORS = ['terraform-runner', 'github-actions-deploy', 'deploy-prod-pipeline'];


/* ── Build ─────────────────────────────────────────────────────────────── */
function build() {
  const r = rng(20261114);
  const identities = [];
  const credentials = [];
  const sharedCreds = new Map();

  IDENTITY_SPECS.forEach((spec, index) => {
    const scope = SCOPES.find((s) => s.id === spec.scope);
    const provider = scope.provider;
    const region = r.pick(scope.regions);
    const owner = spec.owner ? person(spec.owner) : null;
    const ageDays = r.int(40, 900);
    const idle = spec.stale ?? (spec.hot ? 0 : r.weighted([[0, 6], [1, 3], [r.int(2, 9), 3], [r.int(10, 29), 2], [r.int(31, 80), 1]]));
    const lastActivity = idle === 0 ? NOW - r.int(2, 55) * MIN : NOW - idle * DAY - r.int(1, 20) * HOUR;
    const id = `idn_${(index + 1).toString(36).padStart(3, '0')}${r.hex(9)}`;
    const env = spec.name.includes('staging') || scope.env === 'staging' ? 'staging' : scope.env;
    const used = spec.admin ? r.int(3, 14) : r.int(18, 92);
    const arn = identityArn(spec, scope, region, r);
    /* Automation is created by the delivery roles; those, and the organisation
       roles, were created by a person. (The pick keeps the sequence stable.) */
    const picked = provider === 'aws' && spec.cls !== 'HUMAN' ? r.pick(AWS_CREATORS) : null;
    const creator = owner ? (picked && !AWS_CREATORS.includes(spec.name) && spec.name !== 'OrganizationAccountAccessRole' ? picked : owner.email) : null;
    const identity = {
      id,
      name: spec.name,
      arn,
      provider,
      identity_type: spec.type,
      functional_class: spec.cls,
      classification: spec.cls,
      environment: env,
      status: idle > 120 ? 'inactive' : 'active',
      owner: owner?.email ?? null,
      owner_name: owner?.name ?? null,
      owner_team: owner?.team ?? null,
      owner_type: owner ? (spec.cls === 'NHI_CICD' ? 'TEAM_TAG' : 'TAG_OWNER') : 'ORPHANED',
      owner_reason: null,
      account_id: scope.id,
      account_name: scope.name,
      region,
      created_at_aws: iso(NOW - ageDays * DAY),
      created_by: creator,
      first_seen_at: iso(NOW - Math.min(ageDays, r.int(30, 120)) * DAY),
      last_activity_at: iso(lastActivity),
      idle_days: idle,
      age_days: ageDays,
      bound_credentials_count: 0,
      permission_utilization_pct: used,
      is_publicly_accessible: Boolean(spec.public),
      is_admin: Boolean(spec.admin),
      is_shadow: Boolean(spec.shadow),
      vpc_id: ['ec2_instance', 'ecs_task', 'eks_pod', 'lambda_function', 'emr_cluster'].includes(spec.type) && provider === 'aws' ? `vpc-0${r.hex(16)}` : null,
      recent_change: null,
      severity: null,
      signal: null,
      external_account: spec.external ?? null,
      oidc_provider: spec.oidc ?? null,
      hot: Boolean(spec.hot),
      tags: owner ? { owner: owner.email, team: owner.team, env } : { env },
    };
    /* A Vault entry is a stored credential, not an identity (see above). */
    if (provider !== 'vault') identities.push(identity);

    /* Credentials bound to it. */
    const bind = (cred, to = identity) => {
      cred.bound_identities = cred.bound_identities ?? [];
      cred.bound_identities.push(to.id);
      to.bound_credentials_count += 1;
      (to.credential_ids ??= []).push(cred.id);
    };
    const newCred = (fields) => {
      const created = NOW - r.int(Math.max(5, Math.min(ageDays, 30)), Math.max(10, ageDays)) * DAY;
      const cred = {
        id: `crd_${(credentials.length + 1).toString(36).padStart(3, '0')}${r.hex(9)}`,
        provider,
        account_id: scope.id,
        account_name: scope.name,
        region,
        status: 'active',
        created_at: iso(created),
        last_used_at: identity.last_activity_at,
        last_rotated_at: null,
        rotation_enabled: false,
        rotation_overdue: false,
        expires_at: null,
        days_until_expiry: null,
        is_orphaned: false,
        has_external_trust: false,
        permission_boundary_arn: null,
        recent_change: null,
        owner_principal_arn: arn,
        owner_name: owner?.name ?? null,
        idle_days: idle,
        age_days: Math.round((NOW - created) / DAY),
        ...fields,
      };
      credentials.push(cred);
      return cred;
    };

    if (provider === 'aws') {
      if (['iam_user_service_account', 'iam_user'].includes(spec.type)) {
        for (let k = 0; k < (spec.keys ?? 1); k += 1) {
          const age = k === 0 ? spec.oldKey ?? r.int(20, 200) : r.int(5, 60);
          const key = `AKIA${r.alnum(16)}`;
          const cred = newCred({
            name: `${spec.name} · ${key.slice(0, 4)}…${key.slice(-4)}`,
            arn: `${arn}/accesskey/${key}`,
            access_key_id: key,
            credential_type: 'access_key',
            created_at: iso(NOW - age * DAY),
            age_days: age,
            last_rotated_at: null,
            rotation_overdue: age > 90,
            status: k === 1 && spec.keys === 2 && age > 300 ? 'inactive' : 'active',
          });
          bind(cred);
        }
      } else {
        const sharedKey = spec.cred;
        let role = sharedKey ? sharedCreds.get(sharedKey) : null;
        if (!role) {
          const roleName = sharedKey ? sharedKey.split(':')[1] : spec.type === 'iam_role' ? spec.name : `${spec.name}-role`;
          role = newCred({
            name: roleName,
            arn: `arn:aws:iam::${scope.id}:role/${roleName}`,
            credential_type: 'iam_role',
            has_external_trust: Boolean(spec.external || spec.oidc),
            external_principal: spec.external ? `arn:aws:iam::${spec.external}:root` : spec.oidc ?? null,
            permission_boundary_arn: spec.admin ? null : r.chance(0.4) ? `arn:aws:iam::${scope.id}:policy/workload-boundary` : null,
          });
          if (sharedKey) sharedCreds.set(sharedKey, role);
        }
        bind(role);
      }
      if (spec.secret) {
        const rotated = r.chance(0.5);
        const age = r.int(60, 500);
        const cred = newCred({
          name: spec.secret,
          arn: `arn:aws:secretsmanager:${region}:${scope.id}:secret:${spec.secret}-${r.alnum(6, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')}`,
          credential_type: 'secret',
          rotation_enabled: rotated,
          last_rotated_at: rotated ? iso(NOW - r.int(3, 28) * DAY) : null,
          rotation_overdue: !rotated && age > 180,
          created_at: iso(NOW - age * DAY),
          age_days: age,
        });
        bind(cred);
      }
    } else if (provider === 'azure') {
      if (spec.type === 'managed_identity' || spec.type === 'aks_workload' || spec.type === 'function_app') {
        bind(newCred({ name: `${spec.name} (managed identity)`, arn: `${arn}/token`, credential_type: 'managed_identity', client_id: r.uuid() }));
      }
      if (spec.azSecret !== undefined) {
        const days = spec.azSecret;
        const cred = newCred({
          name: `${spec.name} · client secret`,
          arn: `${arn}/passwordCredentials/${r.uuid()}`,
          credential_type: 'client_secret',
          client_id: r.uuid(),
          expires_at: iso(NOW + days * DAY),
          days_until_expiry: days,
          status: days < 0 ? 'expired' : 'active',
          rotation_overdue: days < 30,
        });
        bind(cred);
        if (spec.name === 'sp-pos-terminal-sync') {
          bind(newCred({ name: `${spec.name} · certificate`, arn: `${arn}/keyCredentials/${r.uuid()}`, credential_type: 'certificate', expires_at: iso(NOW + 210 * DAY), days_until_expiry: 210, thumbprint: r.hex(40).toUpperCase() }));
        }
      }
      if (spec.federated) {
        bind(newCred({ name: `${spec.name} · GitHub federated credential`, arn: `${arn}/federatedIdentityCredentials/github-main`, credential_type: 'federated_credential', has_external_trust: true, external_principal: 'repo:deepalgo-labs/payments-api:ref:refs/heads/main' }));
      }
    } else if (provider === 'jenkins') {
      for (const credId of spec.jenkinsCreds ?? []) {
        let cred = sharedCreds.get(`jk:${credId}`);
        if (!cred) {
          const kind = credId.includes('ssh') ? 'ssh_private_key' : credId.includes('keys') || credId.includes('user') ? 'username_password' : credId.includes('keystore') ? 'certificate' : 'secret_text';
          const age = r.int(30, 640);
          cred = newCred({
            name: credId,
            arn: `jenkins://${scope.id}/credentials/store/system/domain/_/${credId}`,
            credential_type: 'jenkins_credential',
            jenkins_kind: kind,
            created_at: iso(NOW - age * DAY),
            age_days: age,
            rotation_overdue: age > 180,
            last_rotated_at: age > 180 ? null : iso(NOW - r.int(5, 60) * DAY),
          });
          sharedCreds.set(`jk:${credId}`, cred);
        }
        bind(cred);
      }
    } else if (provider === 'vault') {
      const ttlDays = spec.vault === 'token' ? -1 : spec.vault === 'lease' ? 0.04 : r.int(7, 30);
      const consumer = identities.find((x) => x.name === spec.consumer);
      const cred = newCred({
        name: spec.vault === 'secret_id' ? `Vault ${spec.name} · secret_id` : spec.vault === 'token' ? `Vault ${spec.name} · periodic token` : spec.vault === 'lease' ? `Vault ${spec.name} · dynamic DB lease` : `Vault ${spec.name} · Kubernetes login`,
        store: 'vault',
        store_name: scope.name,
        vault_path: arn.replace(`vault://${scope.id}/`, ''),
        vault_auth: spec.vaultAuth,
        vault_reads: spec.reads.split(', '),
        consumer_name: spec.consumer,
        owner_principal_arn: consumer?.arn ?? arn,
        arn: `${arn}/${spec.vault}`,
        credential_type: { secret_id: 'vault_secret_id', token: 'vault_token', lease: 'vault_lease', k8s: 'vault_k8s_jwt' }[spec.vault],
        expires_at: ttlDays > 0 ? iso(NOW + ttlDays * DAY) : null,
        days_until_expiry: ttlDays > 0 ? Math.max(0, Math.round(ttlDays)) : null,
        rotation_enabled: spec.vault !== 'token',
        rotation_overdue: spec.vault === 'token',
        last_rotated_at: spec.vault === 'token' ? null : iso(NOW - r.int(1, 6) * DAY),
      });
      if (consumer) bind(cred, consumer);
    }

    identity.severity = spec.admin && (spec.public || !owner) ? 'CRITICAL' : spec.admin || spec.shadow ? 'HIGH' : idle > 90 ? 'MEDIUM' : null;
    identity.signal = !owner ? 'Orphaned' : spec.admin ? 'Admin access' : idle > 90 ? 'Unused 90+ days' : spec.public ? 'Publicly reachable' : null;
  });

  /* A few credentials nothing uses any more. */
  [
    ['legacy-reporting-role', P, 'iam_role'],
    ['prod/old/paytm-merchant-key', P, 'secret'],
    ['jenkins-old-nexus-deployer', JK, 'jenkins_credential'],
  ].forEach(([name, scopeId, type]) => {
    const scope = scopeById(scopeId);
    const age = r.int(300, 700);
    credentials.push({
      id: `crd_orph${r.hex(8)}`,
      provider: scope.provider,
      name,
      arn: scope.provider === 'aws' ? (type === 'secret' ? `arn:aws:secretsmanager:ap-south-1:${scopeId}:secret:${name}-Xk29Qa` : `arn:aws:iam::${scopeId}:role/${name}`) : `jenkins://${scopeId}/credentials/store/system/domain/_/${name}`,
      credential_type: type,
      jenkins_kind: type === 'jenkins_credential' ? 'username_password' : undefined,
      account_id: scopeId,
      account_name: scope.name,
      region: scope.regions[0],
      status: 'active',
      created_at: iso(NOW - age * DAY),
      last_used_at: iso(NOW - r.int(150, 290) * DAY),
      last_rotated_at: null,
      rotation_enabled: false,
      rotation_overdue: true,
      expires_at: null,
      days_until_expiry: null,
      is_orphaned: true,
      has_external_trust: false,
      permission_boundary_arn: null,
      recent_change: null,
      owner_principal_arn: null,
      idle_days: r.int(150, 290),
      age_days: age,
      bound_identities: [],
    });
  });

  /* svc-billing's access key lives in Vault; two workloads read it from there. */
  for (const spec of IDENTITY_SPECS.filter((x) => x.vaultKey)) {
    const owner = identities.find((x) => x.name === spec.name);
    const key = credentials.find((c) => c.credential_type === 'access_key' && c.bound_identities?.includes(owner.id));
    if (!key) continue;
    Object.assign(key, { store: 'vault', store_name: 'Vault prod', vault_path: spec.vaultKey, vault_auth: 'KV v2', vault_reads: [spec.vaultKey], last_used_at: iso(NOW - 4 * MIN) });
    for (const user of IDENTITY_SPECS.filter((x) => x.usesVaultKey === spec.name)) {
      const consumer = identities.find((x) => x.name === user.name);
      key.bound_identities.push(consumer.id);
      consumer.bound_credentials_count += 1;
      (consumer.credential_ids ??= []).push(key.id);
    }
  }

  for (const cred of credentials) {
    cred.bound_identities_count = cred.bound_identities.length;
    cred.idle_days = Math.max(0, Math.round((NOW - Date.parse(cred.last_used_at)) / DAY));
  }

  /* What the latest scan saw change. */
  const changedIdentities = r.sample(identities, 6);
  changedIdentities.forEach((row, i) => {
    row.recent_change = { change_type: i < 3 ? 'CREATED' : 'MODIFIED', detected_at: ago(r.int(20, 170) * MIN), summary: i < 3 ? 'New since the previous scan' : 'Permissions changed (1 field changed)' };
  });
  r.sample(credentials, 5).forEach((row, i) => {
    row.recent_change = { change_type: i < 2 ? 'CREATED' : 'MODIFIED', detected_at: ago(r.int(20, 170) * MIN), summary: i < 2 ? 'New since the previous scan' : 'Rotated (1 field changed)' };
  });

  const out = { identities, credentials };
  /* Grants, links and utilisation from the entitlement model. */
  enrich(out);
  return out;
}

let world = null;
export function estate() {
  world ??= build();
  /* What people did (keys deactivated, roles right-sized, ...) on top. */
  syncOverlay(world);
  return world;
}

/* ── Code repositories (credential exposure) ───────────────────────────── */
export const GITHUB_ORG = 'deepalgo-labs';
export const BITBUCKET_URL = 'https://bitbucket.deepalgorithms.ai';
export const REPOSITORIES = [
  { platform: 'github', name: `${GITHUB_ORG}/payments-api`, branches: ['main', 'release/2026.11', 'feature/upi-autopay'], owner: 'vamsi' },
  { platform: 'github', name: `${GITHUB_ORG}/mobile-app`, branches: ['main', 'develop'], owner: 'sanju' },
  { platform: 'github', name: `${GITHUB_ORG}/infra-terraform`, branches: ['main'], owner: 'charan' },
  { platform: 'github', name: `${GITHUB_ORG}/data-pipelines`, branches: ['main', 'airflow-2.9'], owner: 'sashi' },
  { platform: 'github', name: `${GITHUB_ORG}/merchant-portal`, branches: ['main', 'develop'], owner: 'vamsi' },
  { platform: 'github', name: `${GITHUB_ORG}/ml-experiments`, branches: ['main'], owner: 'kiran' },
  { platform: 'github', name: `${GITHUB_ORG}/support-copilot`, branches: ['main'], owner: 'kiran' },
  { platform: 'bitbucket', name: 'PAY/settlement-engine', branches: ['master', 'hotfix/neft-cutoff'], owner: 'vamsi' },
  { platform: 'bitbucket', name: 'OPS/jenkins-shared-lib', branches: ['master'], owner: 'raju' },
  { platform: 'bitbucket', name: 'DATA/airflow-dags', branches: ['master', 'develop'], owner: 'sashi' },
  { platform: 'bitbucket', name: 'OPS/vault-policies', branches: ['master'], owner: 'harika' },
];

export { DAY, HOUR, MIN, NOW };
