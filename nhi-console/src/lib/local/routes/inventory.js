/* Inventory: identities, credentials, their record tabs and activity. */
import { ok, fail, paged, list, truthy, sortBy, matches, rng, hashString, iso, DAY, NOW, MIN } from '../util';
import { identities, credentials, identityById, credentialById, credentialsOf, identitiesOf, visible, filteredEvents, eventsOf, visibleScopes, scopeSettings } from '../world';
import { scopeById, person } from '../seed';
import { save } from '../state';
import { permissionsOf } from '../permissions';
import { changesForEntity } from '../changes';
import { credentialGraph, identityGraph, whoCanAssume } from '../reach';

const SEARCH = ['name', 'arn', 'owner', 'owner_name', 'account_id', 'identity_type', 'credential_type', 'account_name'];

export function filterIdentities(q) {
  let rows = identities();
  if (q.search) rows = rows.filter((r) => matches(r, q.search, SEARCH));
  const by = (key, field = key) => {
    const values = list(q[key]).map((v) => String(v).toLowerCase());
    if (values.length) rows = rows.filter((r) => values.includes(String(r[field] ?? '').toLowerCase()));
  };
  by('identity_type');
  by('functional_class');
  by('environment');
  by('status');
  by('provider');
  by('account_id');
  if (q.owner) rows = rows.filter((r) => String(r.owner ?? '').toLowerCase() === String(q.owner).toLowerCase() || (q.owner === 'unassigned' && !r.owner));
  if (q.owner_type) rows = rows.filter((r) => r.owner_type === q.owner_type);
  if (q.vpc_id) rows = rows.filter((r) => r.vpc_id === q.vpc_id);
  if (truthy(q.is_publicly_accessible)) rows = rows.filter((r) => r.is_publicly_accessible);
  if (truthy(q.shadow)) rows = rows.filter((r) => r.is_shadow);
  if (truthy(q.is_admin)) rows = rows.filter((r) => r.is_admin);
  if (truthy(q.is_stale)) rows = rows.filter((r) => r.idle_days >= 90);
  if (truthy(q.is_inactive)) rows = rows.filter((r) => r.idle_days >= 30 && r.idle_days < 90);
  if (truthy(q.is_federated)) rows = rows.filter((r) => r.oidc_provider || r.external_account);
  if (q.min_idle_days) rows = rows.filter((r) => r.idle_days >= Number(q.min_idle_days));
  if (q.region) rows = rows.filter((r) => list(q.region).includes(r.region));
  const sortKey = q.sort_by || 'last_activity_at';
  return sortBy(rows, sortKey, q.sort_order || (sortKey === 'last_activity_at' ? 'desc' : 'asc'));
}

export function filterCredentials(q) {
  let rows = credentials();
  if (q.search) rows = rows.filter((r) => matches(r, q.search, SEARCH));
  const types = list(q.credential_type);
  if (types.length) rows = rows.filter((r) => types.includes(r.credential_type));
  const statuses = list(q.status);
  if (statuses.length) rows = rows.filter((r) => statuses.includes(r.status));
  const providers = list(q.provider);
  if (providers.length) rows = rows.filter((r) => providers.includes(r.provider));
  const accountIds = list(q.account_id);
  if (accountIds.length) rows = rows.filter((r) => accountIds.includes(r.account_id));
  if (q.owner_principal_arn) rows = rows.filter((r) => r.owner_principal_arn === q.owner_principal_arn || identitiesOf(r).some((i) => i.arn === q.owner_principal_arn));
  if (q.rotation_enabled !== undefined && q.rotation_enabled !== '') rows = rows.filter((r) => r.rotation_enabled === truthy(q.rotation_enabled));
  if (truthy(q.rotation_overdue)) rows = rows.filter((r) => r.rotation_overdue);
  if (truthy(q.is_orphaned)) rows = rows.filter((r) => r.is_orphaned);
  if (truthy(q.has_external_trust)) rows = rows.filter((r) => r.has_external_trust);
  if (truthy(q.expired)) rows = rows.filter((r) => r.status === 'expired' || (r.days_until_expiry !== null && r.days_until_expiry < 0));
  if (q.min_idle_days) rows = rows.filter((r) => r.idle_days >= Number(q.min_idle_days));
  if (q.max_days_until_expiry) rows = rows.filter((r) => r.days_until_expiry !== null && r.days_until_expiry <= Number(q.max_days_until_expiry));
  const sortKey = q.sort_by || 'last_used_at';
  return sortBy(rows, sortKey, q.sort_order || (sortKey === 'last_used_at' ? 'desc' : 'asc'));
}

const pub = (row) => {
  const { credential_ids: _c, bound_identities: _b, hot: _h, ...rest } = row;
  return rest;
};

const CATEGORY = { lambda_function: 'COMPUTE', ecs_task: 'COMPUTE', eks_pod: 'COMPUTE', ec2_instance: 'COMPUTE', batch_job: 'COMPUTE', step_function: 'ORCHESTRATION', codepipeline: 'CICD', codebuild_project: 'CICD', jenkins_job: 'CICD', jenkins_agent: 'CICD', jenkins_user: 'CICD', bedrock_agent: 'AI_AGENT', sagemaker_notebook: 'AI_AGENT', sagemaker_endpoint: 'AI_AGENT', glue_job: 'DATA', emr_cluster: 'DATA', iam_user: 'EXCEPTION', iam_user_service_account: 'EXCEPTION', iam_role: 'FEDERATED', managed_identity: 'COMPUTE', aks_workload: 'COMPUTE', function_app: 'COMPUTE', aks_cluster: 'COMPUTE', azure_vm: 'COMPUTE', synapse_pipeline: 'DATA', github_actions_workflow: 'CICD', saas_integration: 'FEDERATED', ssm_automation: 'ORCHESTRATION', cloudformation_stackset: 'CICD', service_principal: 'FEDERATED', app_registration: 'FEDERATED', vault_approle: 'COMPUTE', vault_k8s_role: 'COMPUTE', vault_token: 'EXCEPTION', vault_dynamic_role: 'DATA' };
export function identityRow(row) {
  return { ...pub(row), last_used_at: row.last_activity_at, last_seen_at: new Date(Date.now() - 41 * 60000).toISOString(), category: CATEGORY[row.identity_type] ?? 'UNKNOWN', subnet_id: row.vpc_id ? `subnet-0${row.vpc_id.slice(5, 21)}` : null, security_group_ids: row.vpc_id ? [`sg-0${row.vpc_id.slice(6, 22)}`] : [], parent_arn: row.identity_type === 'eks_pod' ? `arn:aws:eks:${row.region}:${row.account_id}:cluster/payments-eks` : row.identity_type === 'aks_workload' ? `/subscriptions/${row.account_id}/resourceGroups/rg-payments-prod/providers/Microsoft.ContainerService/managedClusters/aks-payments` : null };
}
const CRED_CATEGORY = { iam_role: 'ROLE', access_key: 'KEY', secret: 'SECRET', client_secret: 'SECRET', certificate: 'CERTIFICATE', federated_credential: 'FEDERATION', managed_identity: 'MANAGED', jenkins_credential: 'SECRET', vault_token: 'TOKEN', vault_secret_id: 'SECRET', vault_lease: 'DYNAMIC', vault_k8s_jwt: 'FEDERATION' };
export function credentialRow(row) {
  const out = pub(row);
  out.category = CRED_CATEGORY[row.credential_type] ?? 'OTHER';
  out.created_at_aws = row.created_at;
  out.rotation_status = row.rotation_enabled ? 'enabled' : row.rotation_overdue ? 'overdue' : row.expires_at ? 'expires' : 'not_applicable';
  out.max_session_duration = row.credential_type === 'iam_role' ? 3600 : null;
  /* Where it is kept, when a secret store holds it (HashiCorp Vault). */
  out.stored_in = row.store === 'vault' ? { store: 'vault', owner: row.credential_type === 'access_key' ? identitiesOf(row)[0]?.name ?? null : null, store_name: row.store_name ?? 'Vault prod', path: row.vault_path, auth: row.vault_auth, reads: row.vault_reads ?? [], consumers: identitiesOf(row).map((i) => ({ id: i.id, name: i.name, identity_type: i.identity_type })) } : null;
  const first = identitiesOf(row)[0];
  out.owner_name = first?.name ?? null;
  out.bound_identity_names = identitiesOf(row).map((i) => i.name);
  return out;
}

function count(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}


function attachedPolicies(cred) {
  const owner = identitiesOf(cred)[0];
  if (!owner) return [];
  const m = new Map();
  for (const p of permissionsOf(owner)) {
    if (p.credential_id && p.credential_id !== cred.id) continue;
    const e = m.get(p.policy_source) ?? { policy_name: p.policy_source, name: p.policy_source, arn: p.policy_type === 'aws_managed' ? `arn:aws:iam::aws:policy/${p.policy_source}` : null, policy_type: p.policy_type, policy_arn: p.policy_type === 'aws_managed' ? `arn:aws:iam::aws:policy/${p.policy_source}` : null, total_permissions: 0, used_permissions: 0 };
    e.total_permissions += 1;
    if (p.used) e.used_permissions += 1;
    m.set(p.policy_source, e);
  }
  return [...m.values()];
}

/* The trust policy document, statement per kind of principal. */
function trustStatements(row) {
  const ps = whoCanAssume(row.arn).principals;
  const out = [];
  const services = ps.filter((p) => p.kind === 'service').map((p) => p.value);
  if (services.length) out.push({ Effect: 'Allow', Principal: { Service: services.length === 1 ? services[0] : services }, Action: 'sts:AssumeRole' });
  const aws = ps.filter((p) => ['account', 'role', 'user'].includes(p.kind)).map((p) => p.value);
  if (aws.length) out.push({ Effect: 'Allow', Principal: { AWS: aws.length === 1 ? aws[0] : aws }, Action: 'sts:AssumeRole' });
  for (const p of ps.filter((x) => x.kind === 'federated')) {
    out.push({ Effect: 'Allow', Principal: { Federated: `arn:aws:iam::${row.account_id}:oidc-provider/${p.value}` }, Action: 'sts:AssumeRoleWithWebIdentity', Condition: { StringLike: { [`${p.value}:sub`]: 'repo:deepalgo-labs/*' } } });
  }
  return out.length ? out : [{ Effect: 'Allow', Principal: { AWS: `arn:aws:iam::${row.account_id}:root` }, Action: 'sts:AssumeRole' }];
}

/* Who the trust policy lets in: the same answer blast radius gives (reach.js). */
function trustPrincipals(cred) {
  /* Only a role has a trust policy; a key, secret or token has none. */
  if (cred.credential_type !== 'iam_role') return [];
  const ext = String(cred.external_principal ?? '');
  return whoCanAssume(cred.arn).principals.map((p) => ({
    key: `${p.kind}:${p.value}`,
    principal: p.value,
    type: p.kind === 'service' ? 'Service' : p.kind === 'federated' ? 'Federated' : 'AWS',
    is_external: !p.same_account && p.kind !== 'service',
    condition: p.value === ext ? (ext.startsWith('arn:') ? 'sts:ExternalId is not required' : ext.startsWith('repo:') ? `sub = ${ext}` : 'sub = repo:deepalgo-labs/* (any branch)') : null,
    credential: cred.name,
  }));
}

function privilegeLevel(cred) {
  const owner = identitiesOf(cred)[0];
  return owner?.is_admin ? 4 : attachedPolicies(cred).some((p) => p.total_permissions > 8) ? 3 : 2;
}

/* ── Record tabs ───────────────────────────────────────────────────────── */
function bindingOf(identity, cred) {
  const perms = permissionsOf(identity);
  const own = perms.filter((p) => p.credential_id === cred.id);
  return {
    ...credentialRow(cred),
    credential_id: cred.id,
    lifecycle: { age_days: cred.age_days, last_used_at: cred.last_used_at, rotation_enabled: cred.rotation_enabled, rotation_overdue: cred.rotation_overdue, expires_at: cred.expires_at, created_at_aws: cred.created_at, last_rotated_at: cred.last_rotated_at, days_since_rotation: cred.last_rotated_at ? Math.round((Date.now() - Date.parse(cred.last_rotated_at)) / DAY) : null, permission_boundary_arn: cred.permission_boundary_arn },
    trust_principals: trustPrincipals(cred),
    attached_policies: attachedPolicies(cred),
    trust_principal: cred.external_principal ?? null,
    utilization_pct: own.length ? Math.round((own.filter((p) => p.used).length / own.length) * 100) : null,
    attached_policies_count: attachedPolicies(cred).filter((p) => p.policy_type !== 'inline').length,
    inline_policies_count: attachedPolicies(cred).filter((p) => p.policy_type === 'inline').length,
    inline_policies: attachedPolicies(cred).filter((p) => p.policy_type === 'inline').map((p) => ({ name: p.policy_name, policy_name: p.policy_name })),
    binding_source: cred.store === 'vault' && cred.credential_type === 'access_key' && identitiesOf(cred)[0]?.id !== identity.id ? `Read from HashiCorp Vault at ${cred.vault_path}` : cred.store === 'vault' ? `Vault login (${cred.vault_auth}) kept for this workload` : cred.credential_type === 'iam_role' ? 'Execution role on the workload' : cred.credential_type === 'access_key' ? 'Access key of the IAM user' : cred.provider === 'jenkins' ? 'withCredentials() binding in the pipeline' : cred.provider === 'vault' ? 'Auth method role' : 'Configuration',
    assumable_roles: [],
    trust_policy: cred.credential_type === 'iam_role' ? rawDoc(cred).raw?.Role?.AssumeRolePolicyDocument ?? null : null,
    is_primary: identitiesOf(cred)[0]?.id === identity.id && cred === credentialsOf(identity)[0],
    binding_type: cred.credential_type === 'iam_role' ? 'assumed_role' : cred.credential_type === 'access_key' ? 'access_key' : 'direct',
    bound_via: cred.credential_type === 'iam_role' ? 'Execution role' : cred.credential_type === 'access_key' ? 'Access key on the user' : cred.credential_type === 'secret' ? 'Read at start-up' : 'Bound in configuration',
    granted_actions_count: own.length,
    used_actions_count: own.filter((p) => p.used).length,
    shared_with: identitiesOf(cred).filter((i) => i.id !== identity.id).map((i) => ({ id: i.id, name: i.name, arn: i.arn })),
  };
}

function riskSignals(identity) {
  const creds = credentialsOf(identity);
  const s = (key, label, status, detail) => ({ key, signal: key, label, status: Boolean(status), detail, severity: status ? (key === 'admin' || key === 'orphaned' ? 'HIGH' : 'MEDIUM') : null });
  return [
    s('admin', 'Administrator-equivalent access', identity.is_admin, identity.is_admin ? 'A policy grants *:* or an equivalent.' : 'No administrator policy attached.'),
    s('public', 'Reachable from the internet', identity.is_publicly_accessible, identity.is_publicly_accessible ? 'Has a public endpoint or address.' : 'No public endpoint.'),
    s('orphaned', 'No owner', !identity.owner, identity.owner ? `Owned by ${identity.owner_name}.` : 'No owner tag, team tag or creator found.'),
    s('stale', 'Unused for 90 days or more', identity.idle_days >= 90, `Last active ${identity.idle_days} days ago.`),
    s('old_keys', 'Long-lived credential not rotated', creds.some((c) => c.rotation_overdue), creds.some((c) => c.rotation_overdue) ? 'At least one credential is overdue for rotation.' : 'Credentials are rotated or short-lived.'),
    s('external', 'Trusted by an outside account or provider', creds.some((c) => c.has_external_trust), creds.some((c) => c.has_external_trust) ? 'Assumable from outside this account.' : 'No outside trust.'),
  ];
}

function typeAttributes(identity) {
  const base = { provider: identity.provider, identity_type: identity.identity_type };
  switch (identity.identity_type) {
    case 'lambda_function':
      return { ...base, runtime: 'python3.12', memory_mb: 512, timeout_seconds: 30, handler: 'app.handler', last_modified: identity.first_seen_at };
    case 'ecs_task':
      return { ...base, cluster: 'payments-ecs', launch_type: 'FARGATE', task_definition: `${identity.name}:42`, desired_count: 3 };
    case 'eks_pod':
      return { ...base, cluster: 'payments-eks', namespace: 'fraud', service_account: identity.name, pod_identity: 'IRSA' };
    case 'ec2_instance':
      return { ...base, instance_type: 'm6i.large', ami: 'ami-0f58b397bc5c1f2e8', public_ip: identity.is_publicly_accessible ? '13.232.41.87' : null, imds_v2_required: identity.name !== 'bastion-prod' };
    case 'iam_user':
    case 'iam_user_service_account':
      return { ...base, console_access: identity.functional_class === 'HUMAN', mfa_enabled: identity.functional_class === 'HUMAN', access_keys: credentialsOf(identity).length, password_last_used: identity.functional_class === 'HUMAN' ? identity.last_activity_at : null };
    case 'service_principal':
    case 'app_registration':
      return { ...base, app_id: credentialsOf(identity)[0]?.client_id ?? null, sign_in_audience: 'AzureADMyOrg', publisher_domain: 'deepalgorithms.ai', api_permissions: identity.is_admin ? ['Directory.ReadWrite.All', 'Application.ReadWrite.All'] : ['User.Read'] };
    case 'github_actions_workflow':
      return { ...base, repository: 'deepalgo-labs/payments-api', workflow: '.github/workflows/deploy.yml', trigger: 'push to main', federation: 'OIDC (token.actions.githubusercontent.com)', role: identity.__role ?? null };
    case 'saas_integration':
      return { ...base, vendor: identity.name.split('-')[0], vendor_account: identity.external_account, role: identity.__role ?? null, external_id_required: true };
    case 'ssm_automation':
      return { ...base, document: identity.name, execution_role: identity.__role ?? null, invoked_by: identity.name.startsWith('break-glass') ? 'On-call engineers, in an incident' : 'EventBridge schedule and on-call engineers' };
    case 'cloudformation_stackset':
      return { ...base, stackset: 'org-baseline', administration_account: identity.external_account, execution_role: identity.__role?.split('@')[0] ?? null };
    case 'aks_cluster':
    case 'azure_vm':
    case 'synapse_pipeline':
    case 'managed_identity':
    case 'aks_workload':
    case 'function_app':
      return { ...base, managed_identity: identity.__role ?? null, principal_type: identity.__role || identity.identity_type === 'managed_identity' ? 'user-assigned' : 'system-assigned', role_assignments: identity.is_admin ? ['Owner'] : ['Key Vault Secrets User', 'Storage Blob Data Reader'] };
    case 'jenkins_job':
      return { ...base, folder: identity.name.split('/')[0], last_build: `#${200 + (hashString(identity.id) % 700)}`, last_build_result: 'SUCCESS', triggers: ['SCM push', 'cron H 2 * * *'], credentials_bound: credentialsOf(identity).map((c) => c.name) };
    case 'jenkins_agent':
      return { ...base, labels: ['linux', 'docker'], executors: 4, launch_method: 'SSH' };
    case 'vault_approle':
      return { ...base, token_ttl: '1h', token_max_ttl: '4h', secret_id_ttl: '720h', secret_id_num_uses: 0, policies: identity.is_admin ? ['ci-admin', 'default'] : ['payments-read', 'default'], bound_cidr_list: identity.is_admin ? [] : ['10.40.0.0/16'] };
    case 'vault_token':
      return { ...base, period: '768h', orphan: true, renewable: true, policies: ['legacy-batch', 'default'], creation_path: 'auth/token/create-orphan' };
    default:
      return base;
  }
}

function overviewTab(identity) {
  const creds = credentialsOf(identity);
  const signals = riskSignals(identity);
  const scope = scopeById(identity.account_id);
  const tags = identity.tags ?? {};
  const missing = ['owner', 'team', 'env', 'cost-center', 'data-classification'].filter((t) => !(t in tags));
  return {
    identity: identityRow(identity),
    bound_credentials: creds.map((c) => bindingOf(identity, c)),
    risk_signals: signals,
    type_attributes: typeAttributes(identity),
    tags,
    missing_tags: missing,
    discovery: {
      discovery_source: discoveryApi(identity),
      data_sources: { aws: 'AWS APIs + CloudTrail + IAM Access Analyzer', azure: 'Azure Resource Manager + Microsoft Graph + Entra sign-in logs', jenkins: 'Jenkins REST API + Credentials plugin + Audit Trail', vault: 'Vault API + audit device' }[identity.provider],
      credential_resolution: creds[0] ? `${bindingOf(identity, creds[0]).bound_via}: ${creds[0].name}` : 'No credential is bound',
      source: { aws: 'AWS discovery', azure: 'Azure discovery', jenkins: 'Jenkins discovery', vault: 'Vault discovery' }[identity.provider],
      discovery_api: discoveryApi(identity),
      bound_via: creds[0] ? bindingOf(identity, creds[0]).bound_via : 'None',
      first_seen_at: identity.first_seen_at,
      last_seen_at: iso(NOW - 41 * MIN),
      scope_name: scope?.name,
      scan_id: 'scan_2026111421',
    },
    summary: {
      credentials: creds.length,
      raised_signals: signals.filter((x) => x.status).length,
      permission_utilization_pct: identity.permission_utilization_pct,
    },
  };
}

function discoveryApi(identity) {
  return {
    lambda_function: 'lambda:ListFunctions',
    ecs_task: 'ecs:DescribeTaskDefinition',
    eks_pod: 'eks:DescribePodIdentityAssociation',
    ec2_instance: 'ec2:DescribeInstances',
    iam_user: 'iam:ListUsers',
    iam_user_service_account: 'iam:ListUsers',
    iam_role: 'iam:ListRoles',
    managed_identity: 'Microsoft.ManagedIdentity/userAssignedIdentities (ARM)',
    service_principal: 'GET /servicePrincipals (Microsoft Graph)',
    app_registration: 'GET /applications (Microsoft Graph)',
    aks_workload: 'Microsoft.ContainerService workload identities (ARM)',
    function_app: 'Microsoft.Web/sites identity (ARM)',
    aks_cluster: 'Microsoft.ContainerService/managedClusters (ARM)',
    azure_vm: 'Microsoft.Compute/virtualMachines (ARM)',
    synapse_pipeline: 'Microsoft.Synapse pipelines (ARM)',
    github_actions_workflow: 'iam:ListOpenIDConnectProviders + role trust (IAM)',
    saas_integration: 'iam:GetRole trust policy (IAM)',
    ssm_automation: 'ssm:ListDocuments (SSM)',
    cloudformation_stackset: 'cloudformation:ListStackInstances (CloudFormation)',
    jenkins_job: 'GET /api/json?tree=jobs[...] (Jenkins REST)',
    jenkins_agent: 'GET /computer/api/json (Jenkins REST)',
    jenkins_user: 'GET /asynchPeople/api/json (Jenkins REST)',
    vault_approle: 'LIST auth/approle/role',
    vault_k8s_role: 'LIST auth/kubernetes/role',
    vault_token: 'LIST auth/token/accessors',
    vault_dynamic_role: 'LIST aws/roles',
  }[identity.identity_type] ?? 'Inventory API';
}

function permissionsTab(identity) {
  const perms = permissionsOf(identity);
  const used = perms.filter((p) => p.used).length;
  const byPolicy = new Map();
  for (const p of perms) {
    const key = `${p.policy_source}|${p.policy_type}`;
    const e = byPolicy.get(key) ?? { policy_name: p.policy_source, policy_type: p.policy_type, total_permissions: 0, used_permissions: 0 };
    e.total_permissions += 1;
    if (p.used) e.used_permissions += 1;
    byPolicy.set(key, e);
  }
  return {
    permissions: perms,
    summary: { granted_count: perms.length, used_count: used, unused_count: perms.length - used, utilization_pct: perms.length ? Math.round((used / perms.length) * 100) : 0 },
    policy_breakdown: [...byPolicy.values()],
    activity_data_available: true,
  };
}

/* The access graph's neighbourhood: from the entitlement model (reach.js). */
const relationshipsTab = (identity) => identityGraph(identity);

function activityTab(identity, q) {
  const rows = filteredEvents(identity, q);
  const p = paged(rows, q, { defaultSize: 25 });
  const services = count(rows, 'service').map(([service, n]) => ({ service, count: n }));
  const days = new Map();
  for (const e of rows) days.set(e.event_time.slice(0, 10), (days.get(e.event_time.slice(0, 10)) ?? 0) + 1);
  return {
    activity_data_available: true,
    events: p.data,
    pagination: p.pagination,
    events_pagination: p.pagination,
    total: rows.length,
    total_events: rows.length,
    summary: {
      total_events: rows.length,
      error_count: rows.filter((e) => e.error_code).length,
      read_count: rows.filter((e) => e.is_read_only).length,
      write_count: rows.filter((e) => !e.is_read_only).length,
      unique_services: services.length,
      unique_ips: new Set(rows.map((e) => e.source_ip)).size,
      first_event_at: rows[rows.length - 1]?.event_time ?? null,
      last_event_at: rows[0]?.event_time ?? null,
    },
    top_services: services,
    analytics: {
      top_services: services,
      top_actions: count(rows, 'action').slice(0, 8).map(([action, n]) => ({ action, count: n })),
      usage_pattern: identity.functional_class === 'NHI_CICD' ? 'Scheduled' : identity.hot ? 'Continuous' : 'Intermittent',
      error_rate_pct: rows.length ? Math.round((rows.filter((e) => e.error_code).length / rows.length) * 1000) / 10 : 0,
      access_denied_rate_pct: rows.length ? Math.round((rows.filter((e) => e.error_code).length / rows.length) * 1000) / 10 : 0,
    },
    volume_chart: [...days.entries()].sort().map(([date, n]) => ({ date, count: n })),
  };
}

function rawTab(row) {
  const extra = 'credential_type' in row ? { credential_record: { ...credentialRow(row), privilege_level: privilegeLevel(row), tags: identitiesOf(row)[0]?.tags ?? {} }, attached_policies: attachedPolicies(row) } : {};
  return { ...rawDoc(row), ...extra };
}

function rawDoc(row) {
  const r = rng(hashString(row.id));
  if (row.provider === 'aws' && row.credential_type === 'iam_role') {
    return {
      raw: {
        Role: {
          RoleName: row.name,
          Arn: row.arn,
          CreateDate: row.created_at,
          MaxSessionDuration: 3600,
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: trustStatements(row),
          },
          PermissionsBoundary: row.permission_boundary_arn ? { PermissionsBoundaryArn: row.permission_boundary_arn } : undefined,
          RoleLastUsed: { LastUsedDate: row.last_used_at, Region: row.region },
        },
      },
    };
  }
  return { raw: { ...pub(row), etag: r.hex(32) } };
}

/* ── Credential tabs ───────────────────────────────────────────────────── */
function credentialOverview(cred) {
  const bound = identitiesOf(cred).filter(visible);
  return {
    credential: credentialRow(cred),
    credential_record: { ...credentialRow(cred), privilege_level: privilegeLevel(cred), tags: identitiesOf(cred)[0]?.tags ?? {} },
    attached_policies: attachedPolicies(cred),
    type_attributes: { credential_type: cred.credential_type, provider: cred.provider, ...(cred.access_key_id ? { access_key_id: cred.access_key_id } : {}), ...(cred.client_id ? { client_id: cred.client_id } : {}), ...(cred.jenkins_kind ? { jenkins_kind: cred.jenkins_kind } : {}), ...(cred.thumbprint ? { thumbprint: cred.thumbprint } : {}) },
    bound_identities: bound.map((i) => ({ ...identityRow(i), identity_id: i.id, binding_type: cred.credential_type === 'iam_role' ? 'assumed_role' : 'direct' })),
    risk_signals: [
      { key: 'rotation', signal: 'rotation', severity: cred.rotation_overdue ? 'HIGH' : null, label: 'Overdue for rotation', status: cred.rotation_overdue, detail: cred.rotation_overdue ? `Not rotated in ${cred.age_days} days.` : 'Rotated or short-lived.' },
      { key: 'orphaned', signal: 'orphaned', severity: cred.is_orphaned ? 'MEDIUM' : null, label: 'Nothing uses it', status: cred.is_orphaned, detail: cred.is_orphaned ? 'No identity is bound to it.' : `${bound.length} identities use it.` },
      { key: 'external', signal: 'external', severity: cred.has_external_trust ? 'HIGH' : null, label: 'Trusted from outside', status: cred.has_external_trust, detail: cred.external_principal ?? 'No outside trust.' },
      { key: 'expiry', signal: 'expiry', severity: cred.days_until_expiry !== null && cred.days_until_expiry < 30 ? 'HIGH' : null, label: 'Expired or expiring', status: cred.days_until_expiry !== null && cred.days_until_expiry < 30, detail: cred.expires_at ? `Expires ${cred.expires_at.slice(0, 10)}` : 'Does not expire.' },
    ],
    summary: { bound_identities: bound.length },
  };
}

function trustTab(cred) {
  const principals = [];
  for (const p of trustPrincipals(cred).filter((x) => x.principal !== cred.external_principal)) principals.push({ principal: p.principal, principal_arn: p.principal, principal_type: p.type, name: p.principal.split('/').pop(), kind: p.is_external ? 'external' : 'internal', is_external: p.is_external });
  if (cred.external_principal) principals.push({ principal: cred.external_principal, principal_arn: cred.external_principal, principal_type: cred.external_principal.startsWith('arn:') ? 'AWS' : 'Federated', name: cred.external_principal, kind: 'external', is_external: true, conditions: cred.external_principal.startsWith('arn:') ? { 'sts:ExternalId': 'present' } : { 'token.actions.githubusercontent.com:sub': 'repo:deepalgo-labs/*' } });
  return {
    trust_policy: { document: rawDoc(cred).raw?.Role?.AssumeRolePolicyDocument ?? null, principals: trustPrincipals(cred), warnings: cred.has_external_trust ? [String(cred.external_principal).startsWith('arn:') ? 'Another account can assume this role without an ExternalId.' : 'The federated subject is not pinned to a branch or environment.'] : [] },
    attached_policies: attachedPolicies(cred),
    permission_boundary: cred.permission_boundary_arn ? { boundary_arn: cred.permission_boundary_arn } : null,
    credential_record: { ...credentialRow(cred), privilege_level: privilegeLevel(cred), tags: identitiesOf(cred)[0]?.tags ?? {} },
    trusted_principals: principals,
    principals,
    has_external_trust: cred.has_external_trust,
    cross_account: principals.filter((p) => p.is_external).length,
  };
}

function rotationTab(cred) {
  const r = rng(hashString(cred.id));
  const history = [];
  if (cred.rotation_enabled || cred.last_rotated_at) {
    let t = Date.parse(cred.last_rotated_at ?? cred.created_at);
    for (let i = 0; i < 6 && t > Date.parse(cred.created_at); i += 1) {
      history.push({ rotated_at: iso(t), rotated_by: cred.provider === 'vault' ? 'vault (automatic)' : cred.rotation_enabled ? 'Secrets Manager rotation' : person('raju').email, result: 'success' });
      t -= r.int(25, 35) * DAY;
    }
  }
  return {
    rotation_enabled: cred.rotation_enabled,
    rotation_overdue: cred.rotation_overdue,
    last_rotated_at: cred.last_rotated_at,
    rotation_interval_days: cred.rotation_enabled ? 30 : null,
    next_rotation_at: cred.rotation_enabled ? iso(Date.parse(cred.last_rotated_at ?? cred.created_at) + 30 * DAY) : null,
    age_days: cred.age_days,
    expires_at: cred.expires_at,
    days_until_expiry: cred.days_until_expiry,
    history,
    policy: { max_age_days: 90, warn_at_days: 75 },
  };
}

export default function register(r) {
  r.get('/api/v1/settings', () => {
    const s = scopeSettings();
    return ok({
      settings: {
        accounts: { selected: s.accounts.length ? s.accounts : visibleScopes().map((x) => x.id), is_default: !s.accounts.length },
        regions: { selected: s.regions.length ? s.regions : [...new Set(visibleScopes().flatMap((x) => x.regions))], is_default: !s.regions.length },
      },
      source: s.accounts.length || s.regions.length ? 'user' : 'default',
    });
  });

  r.put('/api/v1/settings', ({ body }) => {
    const s = scopeSettings();
    const all = visibleScopes();
    const accounts = list(body?.selected_account_ids);
    const regions = list(body?.selected_regions);
    s.accounts = accounts.length === all.length ? [] : accounts;
    const allRegions = [...new Set(all.flatMap((x) => x.regions))];
    s.regions = regions.length === allRegions.length ? [] : regions;
    save();
    return ok({ saved: true });
  });

  r.get('/api/v1/filters', () => {
    const all = filterIdentities({});
    const creds = filterCredentials({});
    const s = scopeSettings();
    const scopes = visibleScopes();
    return ok({
      accounts: scopes.map((sc) => ({
        account_id: sc.id,
        account_name: sc.name,
        provider: sc.provider,
        identity_count: all.filter((i) => i.account_id === sc.id).length,
        credential_count: creds.filter((c) => c.account_id === sc.id).length,
        is_default: !s.accounts.length || s.accounts.includes(sc.id),
      })),
      regions: count(identities(), 'region').map(([region, n]) => ({ region, count: n })),
      identity_types: count(all, 'identity_type').map(([value, n]) => ({ value, type: value, count: n })),
      functional_classes: count(all, 'functional_class').map(([value, n]) => ({ value, class: value, count: n })),
      environments: count(all, 'environment').map(([value, n]) => ({ value, environment: value, count: n })),
      statuses: count(all, 'status').map(([value, n]) => ({ value, status: value, count: n })),
      owners: count(all.filter((i) => i.owner), 'owner').map(([value, n]) => ({ value, count: n })),
      providers: count(all, 'provider').map(([value, n]) => ({ value, count: n })),
      credential_types: count(creds, 'credential_type').map(([value, n]) => ({ value, type: value, count: n })),
      credential_statuses: count(creds, 'status').map(([value, n]) => ({ value, status: value, count: n })),
    });
  });

  r.get('/api/v1/identities', ({ query }) => {
    const rows = filterIdentities(query).map(identityRow);
    return ok({ ...paged(rows, query), activity_data_available: true });
  });

  r.get('/api/v1/identities/:id', ({ params, query }) => {
    const identity = identityById(params.id);
    if (!identity || !visible(identity)) return fail(404, 'That identity is not in the current scope.', 'NOT_FOUND');
    switch (query.tab || 'overview') {
      case 'overview':
        return ok(overviewTab(identity));
      case 'permissions':
        return ok(permissionsTab(identity));
      case 'credentials':
        return ok({ credentials: credentialsOf(identity).map((c) => bindingOf(identity, c)), total: credentialsOf(identity).length });
      case 'relationships':
        return ok(relationshipsTab(identity));
      case 'activity':
        return ok(activityTab(identity, query));
      case 'changes':
        return ok(changesForEntity('identity', identity));
      case 'raw':
        return ok(rawTab(identity));
      default:
        return fail(400, 'Unknown tab.', 'VALIDATION_ERROR', 'tab');
    }
  });

  r.get('/api/v1/identities/:id/events', ({ params, query }) => {
    const identity = identityById(params.id);
    if (!identity || !visible(identity)) return fail(404, 'That identity is not in the current scope.', 'NOT_FOUND');
    return ok(eventSection(identity, query.section || 'timeline', query));
  });

  r.get('/api/v1/credentials', ({ query }) => {
    const rows = filterCredentials(query).map(credentialRow);
    return ok({ ...paged(rows, query), activity_data_available: true });
  });

  r.get('/api/v1/credentials/:id', ({ params, query }) => {
    const cred = credentialById(params.id);
    if (!cred || !visible(cred)) return fail(404, 'That credential is not in the current scope.', 'NOT_FOUND');
    switch (query.tab || 'overview') {
      case 'overview':
        return ok(credentialOverview(cred));
      case 'trust':
        return ok(trustTab(cred));
      case 'rotation':
        return ok(rotationTab(cred));
      case 'activity': {
        const owner = identitiesOf(cred)[0];
        if (!owner) return ok({ activity_data_available: true, events: [], pagination: { page: 1, page_size: 25, total_count: 0, total_pages: 0 }, total: 0, summary: { total_events: 0 } });
        return ok(activityTab(owner, { ...query, credential: cred.id }));
      }
      case 'relationships': {
        return ok(credentialGraph(cred));
      }
      case 'changes':
        return ok(changesForEntity('credential', cred));
      case 'raw':
        return ok(rawTab(cred));
      default:
        return fail(400, 'Unknown tab.', 'VALIDATION_ERROR', 'tab');
    }
  });

  r.get('/api/v1/permission-source', ({ query }) => {
    const cred = credentialById(query.credential_id);
    const owner = cred ? identitiesOf(cred)[0] : null;
    const perms = owner ? permissionsOf(owner) : [];
    const hit = perms.find((p) => p.action?.endsWith(`:${query.event_name}`) || p.action === query.event_name);
    return ok(
      hit
        ? { matched: true, policy_source: hit.policy_source, policy_type: hit.policy_type, effect: 'Allow', resource_arn: hit.resource_arn, matched_action: hit.action, note: '' }
        : { matched: false, policy_source: null, policy_type: null, effect: null, resource_arn: null, matched_action: null, note: 'No allow statement matched this call; it was likely denied.' },
    );
  });
}

/* ── Activity sections ─────────────────────────────────────────────────── */
function eventSection(identity, section, q) {
  const rows = filteredEvents(identity, q);
  const scope = scopeById(identity.account_id);
  switch (section) {
    case 'timeline': {
      const p = paged(rows, q, { defaultSize: 25 });
      const days = new Map();
      for (const e of rows) days.set(e.event_time.slice(0, 10), (days.get(e.event_time.slice(0, 10)) ?? 0) + 1);
      return { events: p.data, pagination: p.pagination, total: rows.length, total_events: rows.length, total_unique_ips: new Set(rows.map((e) => e.source_ip)).size, summary: { total_events: rows.length, error_count: rows.filter((e) => e.error_code).length, unique_ips: new Set(rows.map((e) => e.source_ip)).size }, data_available: true, volume_chart: [...days.entries()].sort().map(([date, n]) => ({ date, count: n })) };
    }
    case 'detail': {
      const e = eventsOf(identity).find((x) => x.event_id === q.event_id);
      if (!e) return { event: null };
      return {
        event: e,
        raw: {
          eventVersion: '1.10',
          eventTime: e.event_time,
          eventSource: e.event_source,
          eventName: e.event_name,
          awsRegion: e.aws_region,
          sourceIPAddress: e.source_ip,
          userAgent: e.user_agent,
          userIdentity: { type: e.caller_type, arn: e.caller_arn, accessKeyId: e.access_key_id, sessionContext: e.session_issuer_arn ? { sessionIssuer: { arn: e.session_issuer_arn } } : undefined },
          errorCode: e.error_code ?? undefined,
          errorMessage: e.error_message ?? undefined,
          resources: e.resource_arn ? [{ ARN: e.resource_arn, type: e.resource_type }] : [],
          readOnly: e.is_read_only,
          eventID: e.event_id,
          recipientAccountId: identity.account_id,
        },
      };
    }
    case 'credentials': {
      const m = new Map();
      for (const e of rows) {
        const key = e.credential_arn ?? e.access_key_id ?? 'unknown';
        const row = m.get(key) ?? { credential_arn: e.credential_arn, credential_name: e.credential_name, credential_type: e.credential_type, credential_id: e.credential_id, access_key_id: e.access_key_id, binding_type: e.binding_type, event_count: 0, first_used: e.event_time, last_used: e.event_time, source_ips: new Set(), services: new Set() };
        row.event_count += 1;
        row.first_used = e.event_time;
        row.source_ips.add(e.source_ip);
        row.services.add(e.service);
        m.set(key, row);
      }
      const used = [...m.values()].map((x) => ({ ...x, source_ips: [...x.source_ips], services: [...x.services] })).sort((a, b) => b.event_count - a.event_count).slice(0, 20);
      return { credentials_used: used, total: used.length };
    }
    case 'resources': {
      const m = new Map();
      for (const e of rows) {
        if (!e.resource_arn) continue;
        const key = e.resource_arn.replace(/\/[0-9a-f]{8}\.json$/, '/*');
        const row = m.get(key) ?? { resource_arn: key, resource_name: e.resource_name, resource_type: e.resource_type, service: e.service, event_count: 0, read_count: 0, write_count: 0, actions: new Set(), first_access: e.event_time, last_access: e.event_time, error_count: 0 };
        row.event_count += 1;
        row[e.is_read_only ? 'read_count' : 'write_count'] += 1;
        if (e.error_code) row.error_count += 1;
        row.actions.add(e.event_name);
        row.first_access = e.event_time;
        m.set(key, row);
      }
      const list2 = [...m.values()].map((x) => ({ ...x, actions: [...x.actions], actions_performed: [...x.actions] })).sort((a, b) => b.event_count - a.event_count);
      return { resources_accessed: list2, total_resources: list2.length, data_available: true };
    }
    case 'heatmap': {
      const m = new Map();
      for (const e of rows) {
        const h = new Date(e.event_time).getUTCHours();
        const key = `${e.event_name}|${h}`;
        m.set(key, (m.get(key) ?? 0) + 1);
      }
      return { heatmap: [...m.entries()].map(([k, n]) => ({ action: k.split('|')[0], hour: Number(k.split('|')[1]), count: n })) };
    }
    case 'sessions': {
      const sessions = [];
      let cur = null;
      for (const e of [...rows].reverse()) {
        const t = Date.parse(e.event_time);
        if (!cur || t - Date.parse(cur.end_time) > 20 * MIN) {
          cur = { id: `ses_${e.event_id.slice(0, 8)}`, session_name: `${identity.name.slice(0, 24)}-${e.event_id.slice(0, 6)}`, start_time: e.event_time, end_time: e.event_time, event_count: 0, error_count: 0, source_ips: new Set(), services: new Set(), credential_name: e.credential_name, credential_arn: e.credential_arn, risk_score: 0, risk_status: 'normal' };
          sessions.push(cur);
        }
        cur.end_time = e.event_time;
        cur.event_count += 1;
        if (e.error_code) cur.error_count += 1;
        cur.source_ips.add(e.source_ip);
        cur.services.add(e.service);
      }
      const out = sessions
        .reverse()
        .slice(0, 40)
        .map((s) => {
          const ext = [...s.source_ips].some((ip) => ip.startsWith('185.'));
          const score = Math.min(100, s.error_count * 12 + (ext ? 60 : 0) + (s.event_count > 60 ? 10 : 0));
          return { ...s, source_ips: [...s.source_ips], services: [...s.services], duration_minutes: Math.max(1, Math.round((Date.parse(s.end_time) - Date.parse(s.start_time)) / MIN)), risk_score: score, risk_status: score >= 60 ? 'high' : score >= 25 ? 'elevated' : 'normal' };
        });
      return { sessions: out, total_sessions: sessions.length };
    }
    case 'errors': {
      const errs = rows.filter((e) => e.error_code);
      const p = paged(errs, q, { defaultSize: 25 });
      const codes = {};
      for (const e of errs) codes[e.error_code] = (codes[e.error_code] ?? 0) + 1;
      return { events: p.data, rows: p.data, pagination: p.pagination, total: errs.length, summary: { total_errors: errs.length, total_calls: rows.length, error_rate_pct: rows.length ? Math.round((errs.length / rows.length) * 1000) / 10 : 0, by_error_code: codes, first_error_at: errs[errs.length - 1]?.event_time ?? null, last_error_at: errs[0]?.event_time ?? null } };
    }
    case 'cross_account': {
      const cross = rows.filter((e) => e.is_cross_account);
      return {
        cross_account_activity: cross.map((e) => ({ ...e, target_account_id: e.target_account_id, target_resource_arn: e.resource_arn, target_resource_name: e.resource_name, status: e.error_code ? 'failed' : 'success' })),
        total_cross_account_events: cross.length,
        identity_account: identity.account_id,
        identity_account_name: scope?.name,
        data_available: true,
      };
    }
    case 'ips': {
      const m = new Map();
      for (const e of rows) {
        const row = m.get(e.source_ip) ?? { source_ip: e.source_ip, ip: e.source_ip, event_count: 0, error_count: 0, first_seen: e.event_time, last_seen: e.event_time, services: new Set(), user_agents: new Set() };
        row.event_count += 1;
        if (e.error_code) row.error_count += 1;
        row.first_seen = e.event_time;
        row.services.add(e.service);
        row.user_agents.add(e.user_agent);
        m.set(e.source_ip, row);
      }
      const ips = [...m.values()].map((x) => ({
        ...x,
        services: [...x.services],
        user_agents: [...x.user_agents],
        user_agent: [...x.user_agents][0],
        kind: x.source_ip.startsWith('10.') ? 'private' : x.source_ip.startsWith('185.') ? 'unknown' : 'public',
        geo_location: x.source_ip.startsWith('10.') ? null : x.source_ip.startsWith('185.220') ? 'Frankfurt, DE (Tor exit)' : x.source_ip.startsWith('140.82') || x.source_ip.startsWith('4.208') || x.source_ip.startsWith('20.42') ? 'GitHub Actions runner (US)' : x.source_ip.startsWith('49.207') ? 'Hyderabad, IN (office)' : x.source_ip.startsWith('106.51') || x.source_ip.startsWith('49.37') ? 'Bengaluru, IN' : 'Pune, IN',
      }));
      return { ips: ips.sort((a, b) => b.event_count - a.event_count), total: ips.length, total_unique_ips: ips.length, data_available: true };
    }
    default:
      return { events: [] };
  }
}
