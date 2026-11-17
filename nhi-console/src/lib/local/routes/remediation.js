/* Remediation: findings to fix, fix steps per provider, plans and executions. */
import { remed, failNested, iso, HOUR, MIN, NOW, rng, hashString } from '../util';
import { fleet, effectiveChecks, rule, postureRow, scoreOf, findingStates } from '../postureEngine';
import { credentialsOf, identityById } from '../world';
import { scopeById } from '../seed';
import { slice, save } from '../state';
import { audit } from '../users';
import { applyPlan, revertPlan } from '../planEffects';

const B = '/api/v1/remediation';

/*
 * One-click fixes: what the platform does through NHIPlatformRemediator for
 * each check, how risky and reversible it is, and the AWS calls it makes.
 */
const ACTION = {
  'NHI-LP-001': { type: 'trim_unused_permissions', title: 'Remove unused permissions', group: 'Least privilege', risk: 'MEDIUM', reversible: true, calls: [['iam:GetRolePolicy', 'Read the current policy'], ['iam:PutRolePolicy', 'Write the policy scoped to 90 days of use']] },
  'NHI-LP-002': { type: 'replace_admin_policy', title: 'Replace AdministratorAccess with a scoped policy', group: 'Least privilege', risk: 'HIGH', reversible: true, calls: [['iam:PutRolePolicy', 'Attach the scoped policy'], ['iam:DetachRolePolicy', 'Detach AdministratorAccess']] },
  'NHI-CH-001': { type: 'rotate_access_key', title: 'Rotate the access key', group: 'Keys', risk: 'MEDIUM', reversible: false, calls: [['iam:CreateAccessKey', 'Create the new key'], ['secretsmanager:PutSecretValue', 'Store it in ispm/rotated-keys'], ['iam:UpdateAccessKey', 'Deactivate the old key']] },
  'NHI-CH-002': { type: 'deactivate_access_key', title: 'Deactivate the unused access key', group: 'Keys', risk: 'LOW', reversible: true, calls: [['iam:GetAccessKeyLastUsed', 'Confirm the key is unused'], ['iam:UpdateAccessKey', 'Set it Inactive']] },
  'NHI-CH-004': { type: 'enable_secret_rotation', title: 'Turn on secret rotation', group: 'Secrets', risk: 'LOW', reversible: true, calls: [['secretsmanager:DescribeSecret', 'Read rotation settings'], ['secretsmanager:RotateSecret', 'Rotate every 30 days']] },
  'NHI-TA-001': { type: 'add_external_id_condition', title: 'Require an External ID on the vendor trust', group: 'Trust', risk: 'MEDIUM', reversible: true, external: true, calls: [['iam:GetRole', 'Read the trust policy'], ['iam:UpdateAssumeRolePolicy', 'Add the sts:ExternalId condition']] },
  'NHI-TA-002': { type: 'pin_oidc_subject', title: 'Pin the OIDC subject to one branch', group: 'Trust', risk: 'MEDIUM', reversible: true, calls: [['iam:GetRole', 'Read the trust policy'], ['iam:UpdateAssumeRolePolicy', 'Pin the subject to refs/heads/main']] },
  'NHI-ES-001': { type: 'remove_escalation_actions', title: 'Remove permission-management actions', group: 'Escalation', risk: 'HIGH', reversible: true, calls: [['iam:GetRolePolicy', 'Read the current policy'], ['iam:PutRolePolicy', 'Write it without iam:Put*, iam:Attach*, iam:PassRole']] },
  'NHI-ES-002': { type: 'remove_trust_link', title: 'Remove the trust that opens the chain', group: 'Escalation', risk: 'HIGH', reversible: true, calls: [['iam:GetRole', 'Read the trust policy of the next role in the chain'], ['iam:UpdateAssumeRolePolicy', 'Remove this identity from that trust policy']] },
  'NHI-LC-001': { type: 'tag_owner', title: 'Tag an owner', group: 'Lifecycle', risk: 'LOW', reversible: true, calls: [['iam:TagRole', 'Add owner and team tags']] },
  'NHI-LC-002': { type: 'disable_identity', title: 'Disable the identity (deny-all)', group: 'Lifecycle', risk: 'MEDIUM', reversible: true, calls: [['iam:PutRolePolicy', 'Attach the deny-all policy']] },
};
const ALL_ACTIONS = Object.values(ACTION).map((a) => a.type);
const actionOf = (ruleId) => ACTION[ruleId] ?? null;

/** Whether One-click can fix this finding, and if not, why. */
function oneClickFor(f, i) {
  const act = actionOf(f.rule_id);
  if (i.provider !== 'aws') return { available: false, reason: `One-click runs in AWS accounts; ${{ azure: 'Azure', jenkins: 'Jenkins', vault: 'Vault' }[i.provider] ?? 'this'} fixes are applied by hand.` };
  if (!act) return { available: false, reason: 'This check has no automatic fix.' };
  const a = remAccount(f.account_id);
  if (!a?.remediation_enabled) return { available: false, reason: `One-click is turned off for account ${f.account_id}.`, settings: true };
  if (!a.allowed_action_types?.includes(act.type)) return { available: false, reason: `The account does not allow action type ${act.type}.`, settings: true };
  return { available: true, reason: '' };
}
const needsApproval = (risk, severity) => !(risk === 'LOW' && severity !== 'CRITICAL');
const OPEN = ['DRAFT', 'READY', 'WAITING_EXTERNAL', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'EXECUTING'];
const reqId = () => `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 14)}`;

function stepsFor(rl, identity) {
  const cred = credentialsOf(identity)[0];
  const p = identity.provider;
  const n = identity.name;
  const role = cred?.name ?? `${n}-role`;
  if (p === 'azure') {
    return [
      { title: `Open ${n} in Microsoft Entra ID`, console: `Entra ID → Enterprise applications → ${n} → Certificates & secrets` },
      { title: rl.fix, cli: rl.rule_id === 'NHI-LP-002' ? `az role assignment delete --assignee <app-id> --role Owner --scope /subscriptions/${identity.account_id}; az role assignment create --assignee <app-id> --role "Key Vault Secrets User" --scope <vault-id>` : `az ad app credential reset --id <app-id> --append --years 0.5; az ad app credential delete --id <app-id> --key-id <old-key-id>`, iac: `resource "azuread_application_federated_identity_credential" "github" {\n  application_id = azuread_application.${n.replace(/-/g, '_')}.id\n  display_name   = "github-main"\n  issuer         = "https://token.actions.githubusercontent.com"\n  subject        = "repo:deepalgo-labs/payments-api:environment:production"\n  audiences      = ["api://AzureADTokenExchange"]\n}` },
      { title: 'Confirm the integration still signs in', console: 'Entra ID → Sign-in logs → Service principal sign-ins, filter by the app' },
    ];
  }
  if (p === 'jenkins') {
    return [
      { title: `Open ${n} in Jenkins`, console: `Jenkins → ${n.split('/').join(' → ')} → Configure` },
      { title: rl.fix, console: 'Manage Jenkins → Credentials → System → Global credentials → update, then restrict the credential to this folder', cli: `java -jar jenkins-cli.jar -s https://ci.deepalgorithms.ai update-credentials-by-xml system::system::jenkins _ <credential-id> < credential.xml` },
      { title: 'Run the job once to confirm it still works' },
    ];
  }
  if (p === 'vault') {
    return [
      { title: rl.fix, cli: rl.rule_id === 'NHI-CH-005' ? `vault token revoke -accessor <accessor>; vault write auth/approle/role/legacy-batch token_ttl=1h token_max_ttl=4h secret_id_ttl=24h` : `vault write auth/approle/role/${n.split('/').pop()} token_policies="${n.split('/').pop()}-read" token_ttl=1h token_max_ttl=4h`, iac: `resource "vault_approle_auth_backend_role" "${n.split('/').pop().replace(/-/g, '_')}" {\n  role_name      = "${n.split('/').pop()}"\n  token_policies = ["${n.split('/').pop()}-read"]\n  token_ttl      = 3600\n  token_max_ttl  = 14400\n}` },
      { title: 'Check the audit device for denied requests over the next hour', cli: `vault audit list -detailed` },
    ];
  }
  const cli = {
    'NHI-LP-001': `aws iam put-role-policy --role-name ${role} --policy-name ${n}-least-privilege --policy-document file://policy.json`,
    'NHI-LP-002': `aws iam detach-role-policy --role-name ${role} --policy-arn arn:aws:iam::aws:policy/AdministratorAccess; aws iam put-role-policy --role-name ${role} --policy-name ${n}-scoped --policy-document file://policy.json`,
    'NHI-CH-001': `aws iam create-access-key --user-name ${n}; aws iam update-access-key --user-name ${n} --access-key-id <old-key-id> --status Inactive; aws iam delete-access-key --user-name ${n} --access-key-id <old-key-id>`,
    'NHI-CH-002': `aws iam update-access-key --user-name ${n} --access-key-id <unused-key-id> --status Inactive`,
    'NHI-CH-004': `aws secretsmanager rotate-secret --secret-id ${cred?.name ?? '<secret>'} --rotation-rules AutomaticallyAfterDays=30`,
    'NHI-TA-001': `aws iam update-assume-role-policy --role-name ${role} --policy-document file://trust.json`,
    'NHI-TA-002': `aws iam update-assume-role-policy --role-name ${role} --policy-document file://trust-pinned.json`,
    'NHI-LC-001': `aws iam tag-role --role-name ${role} --tags Key=owner,Value=<owner-email> Key=team,Value=<team>`,
    'NHI-LC-002': `aws iam put-role-policy --role-name ${role} --policy-name deny-all --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Action":"*","Resource":"*"}]}'`,
  }[rl.rule_id];
  const isUser = identity.identity_type.startsWith('iam_user');
  return [
    isUser ? { title: `Open the user ${n} in the IAM console`, console: `IAM → Users → ${n} → Security credentials` } : { title: `Open ${role} in the IAM console`, console: `IAM → Roles → ${role}` },
    { title: rl.fix, cli: cli ?? `aws iam get-role --role-name ${role}`, iac: rl.rule_id === 'NHI-LP-002' || rl.rule_id === 'NHI-LP-001' ? `resource "aws_iam_role_policy" "${n.replace(/-/g, '_')}" {\n  role   = aws_iam_role.${role.replace(/-/g, '_')}.id\n  policy = data.aws_iam_policy_document.${n.replace(/-/g, '_')}_used.json\n}` : undefined },
    { title: 'Watch CloudTrail for AccessDenied from this identity for an hour' },
  ];
}

/*
 * Jira: a ticket for each Critical or High finding the team tracks there,
 * assigned to the identity's owner (the platform on-call when it has none).
 * Stable per finding, so the ticket number never moves between reloads.
 */
const JIRA = 'https://deepalgorithms.atlassian.net/browse';
const tracked = (c) => ['CRITICAL', 'HIGH'].includes(c.severity) && hashString(c.finding_id) % 3 !== 2;
/* Ticket numbers in the order the findings appeared: unique, and stable. */
let jiraNumbers = null;
function jiraNumber(findingId) {
  if (!jiraNumbers) {
    const all = fleet()
      .flatMap((i) => effectiveChecks(i).filter((x) => x.failing && tracked(x)))
      .sort((a, b) => Date.parse(a.failing_since ?? 0) - Date.parse(b.failing_since ?? 0) || String(a.finding_id).localeCompare(String(b.finding_id)));
    jiraNumbers = new Map(all.map((x, k) => [x.finding_id, 101 + k]));
  }
  return jiraNumbers.get(findingId) ?? null;
}
function jiraFor(c, i, resolved) {
  if (!tracked(c)) return null;
  const h = hashString(c.finding_id);
  const n = jiraNumber(c.finding_id);
  if (!n) return null;
  const key = `NHI-${n}`;
  const status = resolved ? 'Done' : ['To Do', 'In Progress', 'In Review'][h % 3];
  return {
    key,
    url: `${JIRA}/${key}`,
    status,
    assignee: i.owner_name ?? 'Raju Varma',
    assignee_email: i.owner ?? 'raju@deepalgorithms.ai',
    created_at: c.failing_since,
    priority: c.severity === 'CRITICAL' ? 'Highest' : 'High',
  };
}

/** Every finding tracked in Jira, for the Jira tab. */
export function jiraIssues() {
  return backlog()
    .filter((f) => f.jira)
    .map((f) => ({ ...f.jira, summary: `${f.title} - ${f.identity_name}`, finding_id: f.finding_id, identity_id: f.identity_id, identity_name: f.identity_name, severity: f.severity, provider: f.provider, plan: f.plan }));
}

function backlog() {
  const plans = plansStore();
  const out = [];
  for (const i of fleet()) {
    for (const c of effectiveChecks(i).filter((x) => x.failing)) {
      const rl = rule(c.rule_id);
      const plan = plans.filter((p) => p.finding_ids.includes(c.finding_id)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
      const resolved = c.status !== 'OPEN' || (plan && ['VERIFIED', 'EXECUTED', 'MANUALLY_DONE', 'RESOLVED'].includes(plan.status));
      out.push({
        finding_id: c.finding_id,
        rule_id: c.rule_id,
        rule_name: rl.title,
        title: rl.title,
        severity: c.severity,
        status: resolved ? 'RESOLVED' : 'OPEN',
        identity_id: i.id,
        identity_name: i.name,
        identity_type: i.identity_type,
        provider: i.provider,
        account_id: i.account_id,
        account_name: scopeById(i.account_id)?.name,
        region: i.region,
        target: i.arn,
        detail: c.detail,
        score_gain: c.points,
        created_at: c.failing_since,
        resolved_at: resolved ? plan?.updated_at ?? c.state?.updated_at ?? null : null,
        plan: plan ? { plan_id: plan.plan_id, status: plan.status, mode: plan.mode, updated_at: plan.updated_at, policy_id: plan.policy_id ?? null, by_engine: Boolean(plan.policy_id), created_by: plan.created_by } : null,
        stage: !plan || ENDED.includes(plan.status) ? 'todo' : ['EXECUTED', 'MANUALLY_DONE'].includes(plan.status) ? 'waiting_scan' : resolved ? 'done' : 'in_progress',
        jira: jiraFor(c, i, resolved),
      });
    }
  }
  const w = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return out.sort((a, b) => w[b.severity] - w[a.severity] || b.score_gain - a.score_gain);
}

/* A plan that stopped without fixing anything: the finding is back to be fixed. */
const ENDED = ['ROLLED_BACK', 'REJECTED', 'CANCELLED', 'EXPIRED', 'SUPERSEDED', 'SKIPPED', 'DRY_RUN', 'FAILED'];

export const plansStore = () => slice('plans', () => []);
const execs = () => slice('executions', () => []);
const planAudit = () => slice('planAudit', () => []);

function findingById(id) {
  return backlog().find((f) => f.finding_id === id) ?? null;
}


function changeFor(rl, i) {
  const cred = credentialsOf(i)[0];
  const used = Math.max(3, Math.round(i.permission_utilization_pct / 6));
  const key = cred?.access_key_id ? `${cred.access_key_id.slice(0, 4)}…${cred.access_key_id.slice(-4)}` : 'current key';
  const table = {
    'NHI-LP-001': ['Allowed actions', `${used + 9} actions (incl. s3:DeleteObject, iam:PassRole)`, `${used} actions seen in 90 days of activity`],
    'NHI-LP-002': ['Attached policies', i.provider === 'azure' ? 'Owner on the subscription' : i.provider === 'vault' ? 'ci-admin (sudo on sys/*)' : 'AdministratorAccess', `${i.name}-scoped (${used} actions)`],
    'NHI-CH-001': ['Access keys', `${key}, ${cred?.age_days ?? '?'} days old, active`, 'New key in use; old key deleted'],
    'NHI-CH-002': ['Access keys', 'Two keys active', 'Unused key inactive'],
    'NHI-CH-003': ['Credentials', 'Client secret expiring', 'Federated credential; client secret removed'],
    'NHI-CH-004': ['Rotation', 'Off', 'Every 30 days'],
    'NHI-CH-005': ['Token', 'Orphan periodic token (768h)', 'AppRole, token TTL 1h, max 4h'],
    'NHI-TA-001': ['Trust policy condition', 'None', 'sts:ExternalId required'],
    'NHI-TA-002': ['OIDC subject', 'repo:deepalgo-labs/*', 'repo:deepalgo-labs/payments-api:environment:production'],
    'NHI-TA-003': ['Network exposure', 'Public address, IMDSv1 allowed', 'Private behind load balancer, IMDSv2 required'],
    'NHI-ES-001': ['Permission management', 'iam:PassRole, iam:CreateAccessKey on *', 'Removed; deploy actions scoped to named resources'],
    'NHI-EX-001': ['Leaked credential', `${key} (found in a repository)`, 'Rotated; old value revoked'],
    'NHI-EX-002': ['Source network', 'Any', 'Corporate and VPC ranges only'],
    'NHI-LC-001': ['Tags', 'owner: none', 'owner: <owner-email>, team: <team>'],
    'NHI-LC-002': ['State', 'Active', 'Disabled (deny-all policy attached)'],
    'NHI-LC-003': ['Tags', 'cost-center, data-classification missing', 'Both set'],
  };
  const [path, before, after] = table[rl.rule_id] ?? ['Configuration', 'Current', 'Fixed'];
  return { before_state: { [path]: before }, after_state: { [path]: after }, diff: [{ path, op: 'replace', before, after }] };
}

function makePlan(f, mode, user, actionType) {
  const rl = rule(f.rule_id);
  const i = identityById(f.identity_id);
  const act = actionOf(f.rule_id);
  const acct = remAccount(f.account_id);
  const now = iso(Date.now());
  const score = scoreOf(i);
  const oneClick = mode === 'ONE_CLICK';
  const risk = oneClick && act ? act.risk : f.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM';
  const change = changeFor(rl, i);
  const shared = credentialsOf(i).some((c) => (c.bound_identities?.length ?? 0) > 1);
  const prechecks = [
    { name: 'Activity reviewed', result: 'PASS', detail: '90 days of calls checked against the change: nothing it uses is removed.' },
    { name: 'No other identity depends on it', result: shared ? 'WARN' : 'PASS', detail: shared ? 'The credential is shared with other identities; they keep their own access.' : 'Not shared.' },
    ...(oneClick ? [{ name: 'Live state matches the scan', result: 'PASS', detail: 'Read through NHIPlatformRemediator just now: no drift since the last sync.' }] : []),
  ].map((c) => ({ ...c, key: c.name, label: c.name, status: c.result }));
  const external = oneClick && act?.external;
  const vendor = String(i.external_account ?? '');
  return {
    plan_id: `pln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    finding_ids: [f.finding_id],
    rule_ids: [f.rule_id],
    action_type: actionType || (oneClick ? act?.type : null) || rl.auto || 'manual_change',
    title: oneClick && act ? act.title : rl.fix,
    account_id: f.account_id,
    region: f.region,
    target_arn: i.arn,
    target_name: i.name,
    target_type: i.identity_type,
    finding_title: f.title,
    finding_severity: f.severity,
    mode,
    status: external ? 'WAITING_EXTERNAL' : prechecks.some((c) => c.result === 'BLOCK') ? 'DRAFT' : 'READY',
    status_reason: '',
    risk_level: risk,
    reversible: oneClick ? Boolean(act?.reversible) : false,
    approval_required: oneClick ? needsApproval(risk, f.severity) : false,
    required_approvals: oneClick ? (needsApproval(risk, f.severity) ? acct?.approval_policy?.[risk] ?? 1 : 0) : 0,
    params: external ? { external_id: `ext-${hashString(f.finding_id).toString(16)}${Math.random().toString(16).slice(2, 10)}`, external_id_status: 'PENDING_VENDOR', vendor_account: vendor || 'the vendor account' } : {},
    ...change,
    diff: change.diff.map((d) => ({ path: d.path, change: 'changed', before: d.before, after: d.after })),
    steps: oneClick && act ? act.calls.map(([api, title]) => ({ title, api })) : stepsFor(rl, i),
    prechecks,
    usage_basis: oneClick && ['NHI-LP-001', 'NHI-LP-002', 'NHI-ES-001'].includes(f.rule_id) ? 'Permissions used in the last 90 days (CloudTrail)' : null,
    score_current: score,
    score_gain: rl ? { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 }[rl.severity] : 0,
    score_projected: Math.min(100, score + ({ CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 }[rl.severity] ?? 0)),
    valid_until: iso(Date.now() + 72 * 60 * MIN),
    created_by: user.email,
    created_by_name: user.full_name ?? null,
    created_at: now,
    updated_at: now,
    policy_id: null,
    jira: f.jira ?? null,
  };
}

function logPlan(plan, user, event, detail = '') {
  planAudit().unshift({ audit_id: `pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, plan_id: plan.plan_id, event, actor: user?.email ?? 'system', at: iso(Date.now()), detail });
}

function setStatus(plan, status, user, event, detail) {
  const was = plan.status;
  plan.status = status;
  plan.updated_at = iso(Date.now());
  logPlan(plan, user, event, detail);
  save();
  /* The fix itself, not just its paperwork: access changes everywhere. */
  if (['EXECUTED', 'VERIFIED', 'MANUALLY_DONE'].includes(status) && !['EXECUTED', 'VERIFIED', 'MANUALLY_DONE'].includes(was)) applyPlan(plan, user);
  if (status === 'ROLLED_BACK') revertPlan(plan);
  return plan;
}

/*
 * One-click and auto-remediation, per AWS account: the role the platform
 * assumes (NHIPlatformRemediator), its External ID, which fixes may run,
 * approvals, and the three policy documents the client puts in place.
 */
const NAMES = { '482915736104': 'prod-core', '739204185562': 'data-platform', '215660394871': 'staging', '605218934417': 'shared-services' };
const accounts = () => {
  const list = slice('remediationAccounts', () => []);
  for (const [k, id] of Object.keys(NAMES).entries()) {
    let a = list.find((x) => x.account_id === id);
    if (!a) {
      a = { account_id: id };
      list.push(a);
    }
    /* Older saves used another role name and no auto-remediation fields. */
    if (a.v !== 3) {
      const on = k !== 2;
      Object.assign(a, {
        v: 3,
        account_name: NAMES[id],
        remediation_enabled: on,
        remediation_role_arn: on ? `arn:aws:iam::${id}:role/NHIPlatformRemediator` : '',
        remediation_external_id: on ? `ispm-${hashString(`ext:${id}`).toString(16)}-${hashString(`x:${id}`).toString(16).slice(0, 6)}` : '',
        has_external_id: on,
        auto_remediation_enabled: id === '482915736104' || id === '739204185562',
        allowed_action_types: !on ? [] : id === '482915736104' ? ALL_ACTIONS : ['deactivate_access_key', 'rotate_access_key', 'trim_unused_permissions', 'enable_secret_rotation', 'tag_owner'],
        enabled_regions: on ? ['ap-south-1', 'us-east-1'] : [],
        approval_policy: { LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 2 },
        grace_days: { delete_key: 30 },
        access_status: on ? 'OK' : 'NOT_CONFIGURED',
        access_detail: on ? 'Role assumed with the External ID; all remediation permissions present; guardrail deny in place.' : 'One-click is off for this account.',
        access_checked_at: iso(NOW - (k + 1) * 47 * MIN),
      });
    }
  }
  return list;
};

/*
 * Auto-remediation: plans the rule engine drafted after the last scans from
 * its policies (created_by "auto:<policy>"). One waits for approval, one ran
 * in dry-run mode, one was skipped by a pre-check. Plus one One-click plan a
 * colleague made, waiting for someone else's approval. Made once, from real
 * findings, so they agree with Posture and the identities.
 */
function ensureAutoPlans() {
  const flag = slice('autoPlansSeeded', () => ({ v: 0 }));
  if (flag.v === 3) return;
  flag.v = 3;
  /* Never on an identity a live scenario is about: its story must start clean. */
  const STORY = new Set(['payments-gateway-01', 'svc-deploy-bot', 'reporting-readonly', 'ops-support-role', 'break-glass-admin', 'support-copilot-agent', 'invoice-legacy-export', 'svc-billing', 'svc-billing-api', 'batch-reconciler']);
  const find = (ruleId, name) => backlog().find((f) => f.rule_id === ruleId && f.status === 'OPEN' && (!name || f.identity_name === name) && f.provider === 'aws' && !STORY.has(f.identity_name));
  const engine = (policy, f, status, reason, agoMin) => {
    if (!f || plansStore().some((p) => p.finding_ids.includes(f.finding_id))) return;
    const p = makePlan(f, 'ONE_CLICK', { email: `auto:${policy}`, full_name: `Auto-remediation · ${policy}` }, null);
    const at = iso(Date.now() - agoMin * MIN);
    Object.assign(p, { policy_id: `pol_${policy}`, status, status_reason: reason, created_at: at, updated_at: at, approval_required: status === 'PENDING_APPROVAL', required_approvals: status === 'PENDING_APPROVAL' ? 1 : 0 });
    plansStore().push(p);
    planAudit().push({ audit_id: `pa_${p.plan_id}`, plan_id: p.plan_id, event: 'PLAN_CREATED', actor: `auto:${policy}`, at, detail: `Created by the rule engine after the scan (policy ${policy})` });
    if (status === 'PENDING_APPROVAL') planAudit().push({ audit_id: `pa_${p.plan_id}s`, plan_id: p.plan_id, event: 'SUBMITTED', actor: `auto:${policy}`, at, detail: 'Waiting for 1 approval' });
    if (status === 'DRY_RUN') planAudit().push({ audit_id: `pa_${p.plan_id}d`, plan_id: p.plan_id, event: 'DRY_RUN', actor: `auto:${policy}`, at, detail: reason });
    if (status === 'SKIPPED') planAudit().push({ audit_id: `pa_${p.plan_id}k`, plan_id: p.plan_id, event: 'SKIPPED', actor: `auto:${policy}`, at, detail: reason });
  };
  engine('deactivate-unused-keys', find('NHI-CH-002', 'svc-tally-sync') ?? find('NHI-CH-002'), 'PENDING_APPROVAL', '', 38);
  engine('rotate-old-keys', find('NHI-CH-001', 'svc-airflow-scheduler') ?? find('NHI-CH-001'), 'DRY_RUN', 'Policy in dry-run: the key would be rotated and the new one stored in ispm/rotated-keys. Nothing was changed.', 52);
  engine('tag-missing-owners', find('NHI-LC-001'), 'SKIPPED', 'Pre-check: no owner could be inferred from CloudTrail or tags. Tag it by hand.', 52);
  /* A colleague's One-click plan, waiting for someone else's approval. */
  const f = find('NHI-LP-001');
  if (f && !plansStore().some((p) => p.finding_ids.includes(f.finding_id))) {
    const p = makePlan(f, 'ONE_CLICK', { email: 'charan@deepalgorithms.ai', full_name: 'Charan Teja' }, null);
    const at = iso(Date.now() - 2 * HOUR);
    Object.assign(p, { status: 'PENDING_APPROVAL', created_at: at, updated_at: at });
    plansStore().push(p);
    planAudit().push({ audit_id: `pa_${p.plan_id}`, plan_id: p.plan_id, event: 'PLAN_CREATED', actor: 'charan@deepalgorithms.ai', at, detail: 'One-click plan' });
    planAudit().push({ audit_id: `pa_${p.plan_id}s`, plan_id: p.plan_id, event: 'SUBMITTED', actor: 'charan@deepalgorithms.ai', at, detail: `Waiting for ${p.required_approvals} approval` });
  }
  save();
}

export const remAccount = (id) => accounts().find((a) => a.account_id === id) ?? null;

export default function register(r) {
  r.get(`${B}/findings`, ({ query }) => {
    ensureAutoPlans();
    let rows = backlog();
    const all = rows;
    if (query.status && query.status !== 'ALL') rows = rows.filter((f) => f.status === query.status);
    else if (!query.status) rows = rows.filter((f) => f.status === 'OPEN');
    if (query.severity) rows = rows.filter((f) => f.severity === String(query.severity).toUpperCase());
    if (query.stage) rows = rows.filter((f) => f.stage === query.stage);
    if (query.q) rows = rows.filter((f) => `${f.identity_name} ${f.title} ${f.rule_id}`.toLowerCase().includes(String(query.q).toLowerCase()));
    const limit = Number(query.limit) || 25;
    const offset = Number(query.offset) || 0;
    const open = all.filter((f) => f.status === 'OPEN');
    return remed(rows.slice(offset, offset + limit), {
      pagination: { total_count: rows.length, limit, offset },
      summary: {
        open: open.length,
        to_do: open.filter((f) => f.stage === 'todo').length,
        in_progress: open.filter((f) => f.stage === 'in_progress').length,
        waiting_scan: all.filter((f) => f.stage === 'waiting_scan').length,
        fixed_30d: all.filter((f) => f.status === 'RESOLVED').length + 6,
        by_severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].reduce((m, s) => ({ ...m, [s]: open.filter((f) => f.severity === s).length, [s[0] + s.slice(1).toLowerCase()]: open.filter((f) => f.severity === s).length }), {}),
      },
    });
  });

  r.get(`${B}/findings/:id/fix`, ({ params }) => {
    ensureAutoPlans();
    const f = findingById(params.id);
    if (!f) return failNested(404, 'That finding no longer exists.', 'NOT_FOUND');
    const rl = rule(f.rule_id);
    const i = identityById(f.identity_id);
    const act = actionOf(f.rule_id);
    const steps = stepsFor(rl, i);
    const where = { aws: 'AWS', azure: 'Azure', jenkins: 'Jenkins', vault: 'Vault' }[i.provider];
    const summaryText = `${rl.title} - ${i.name} (${where})\n${steps.map((st, k) => `${k + 1}. ${st.title}${st.cli ? `\n   ${st.cli}` : ''}`).join('\n')}`;
    const oc = oneClickFor(f, i);
    const pending = plansStore().find((p) => p.finding_ids.includes(f.finding_id) && p.mode === 'ONE_CLICK' && OPEN.includes(p.status));
    const risk = act?.risk ?? (f.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM');
    return remed({
      ...f,
      resource: i.arn,
      description: f.detail,
      why_it_matters: rl.why,
      how_to_fix: rl.fix,
      fix: { action_type: act?.type ?? rl.auto ?? 'manual_fix', title: act?.title ?? rl.fix, description: rl.why, risk_level: risk, reversible: act ? act.reversible : false, one_click_supported: Boolean(act), manual: !act && !rl.auto, steps },
      other_fixes: [],
      modes: {
        guided: { available: true, flow: `Make a plan, apply the steps in ${where}, then mark it done. The next scan confirms the fix.`, reason: '' },
        one_click: {
          available: oc.available && !pending,
          reason: pending ? '' : oc.reason,
          settings: Boolean(oc.settings),
          approval_required: needsApproval(risk, f.severity),
          flow: 'After approval, the platform assumes NHIPlatformRemediator in this account, makes the change, verifies it, and can roll it back.',
          pending_plan: pending ? { plan_id: pending.plan_id, status: pending.status, created_by: pending.created_by, by_engine: Boolean(pending.policy_id) } : null,
        },
      },
      summary_text: summaryText,
      plans: plansStore().filter((p) => p.finding_ids.includes(f.finding_id)),
    });
  });

  r.get(`${B}/findings/:id`, ({ params }) => remed(plansStore().filter((p) => p.finding_ids.includes(params.id))));

  r.post(`${B}/plans`, ({ body, user }) => {
    const f = findingById(body.finding_ids?.[0]);
    if (!f) return failNested(404, 'That finding no longer exists.', 'NOT_FOUND');
    const i = identityById(f.identity_id);
    const oc = oneClickFor(f, i);
    const mode = body.mode || (oc.available ? 'ONE_CLICK' : 'GUIDED');
    if (mode === 'ONE_CLICK' && !oc.available) return failNested(409, `One-click is not possible: ${oc.reason}`, 'ONE_CLICK_UNAVAILABLE');
    const waiting = plansStore().find((p) => p.finding_ids.includes(f.finding_id) && OPEN.includes(p.status));
    if (waiting) return remed(waiting, { existing_plan: true, message: waiting.policy_id ? `Auto-remediation already created a plan (${waiting.created_by}); it is ${waiting.status.toLowerCase().replace(/_/g, ' ')}.` : 'A plan for this finding is already open.' });
    const plan = makePlan(f, mode, user, body.action_type);
    plansStore().unshift(plan);
    logPlan(plan, user, 'PLAN_CREATED', `${plan.mode === 'ONE_CLICK' ? 'One-click' : 'Guided'} plan`);
    if (plan.status === 'WAITING_EXTERNAL') logPlan(plan, user, 'EXTERNAL_ID_GENERATED', 'Give the External ID to the vendor, then confirm.');
    save();
    audit(user, 'remediation.plan.create', `Created a ${plan.mode === 'ONE_CLICK' ? 'One-click' : 'guided'} plan for "${f.title}" on ${f.identity_name}`);
    return { status: 201, body: { data: plan, existing_plan: false, message: 'Plan created.' } };
  });

  r.get(`${B}/plans`, ({ query }) => {
    ensureAutoPlans();
    let rows = plansStore();
    if (query.status) rows = rows.filter((p) => String(query.status).split(',').includes(p.status));
    if (query.mode) rows = rows.filter((p) => p.mode === query.mode);
    if (query.source === 'auto') rows = rows.filter((p) => p.policy_id);
    if (query.source === 'manual') rows = rows.filter((p) => !p.policy_id);
    if (query.account_id) rows = rows.filter((p) => p.account_id === query.account_id);
    if (query.finding_id) rows = rows.filter((p) => p.finding_ids.includes(query.finding_id));
    if (query.target_arn) rows = rows.filter((p) => p.target_arn === query.target_arn);
    const limit = Number(query.limit) || 25;
    const offset = Number(query.offset) || 0;
    return remed(rows.slice(offset, offset + limit), { pagination: { total_count: rows.length, limit, offset } });
  });

  const plan = (id) => plansStore().find((p) => p.plan_id === id);
  r.get(`${B}/plans/:id`, ({ params }) => {
    const p = plan(params.id);
    if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
    const approvals = planAudit()
      .filter((a) => a.plan_id === p.plan_id && ['APPROVED', 'REJECTED'].includes(a.event))
      .map((a) => ({ actor: a.actor, at: a.at, decision: a.event === 'APPROVED' ? 'APPROVE' : 'REJECT', comment: a.detail }));
    return remed({ plan: p, approvals, executions: execs().filter((e) => e.plan_id === p.plan_id), approvals_counted: approvals.filter((a) => a.decision === 'APPROVE').length });
  });

  /* A run: the remediation role makes each AWS call in turn (see executions below). */
  const run = (p, user, kind, rollbackOf = null) => {
    const a = remAccount(p.account_id);
    const act = actionOf(p.rule_ids[0]);
    const calls = act ? (kind === 'ROLLBACK' ? [...act.calls].reverse().map(([api, t]) => [api, `Undo: ${t.toLowerCase()}`]) : act.calls) : p.steps.map((s) => [s.api ?? 'aws', s.title]);
    const ex = {
      execution_id: `exe_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      plan_id: p.plan_id,
      kind,
      status: 'RUNNING',
      scheduled_for: iso(Date.now()),
      started_at: iso(Date.now()),
      completed_at: null,
      started: Date.now(),
      assumed_role_arn: a?.remediation_role_arn || `arn:aws:iam::${p.account_id}:role/NHIPlatformRemediator`,
      session_name: `ispm-${p.plan_id.slice(4, 14)}`,
      rollback_of: rollbackOf,
      started_by: user?.email ?? p.created_by,
      steps: calls.map(([api, step], k) => ({ index: k, step, title: step, api, request_id: reqId(), status: 'PENDING', at: null, error: '' })),
      verify_result: null,
      error_code: '',
      error_message: '',
    };
    execs().unshift(ex);
    setStatus(p, 'EXECUTING', user, 'EXECUTION_STARTED', `${kind === 'ROLLBACK' ? 'Rollback' : 'Run'} started as ${ex.assumed_role_arn.split('/').pop()} (session ${ex.session_name})`);
    return ex;
  };
  /* Approved: the run starts by itself; nobody has to click Execute. */
  const approved = (p, user) => {
    setStatus(p, 'APPROVED', user, 'APPROVAL_COMPLETE', p.required_approvals ? `${p.required_approvals} of ${p.required_approvals} approvals` : 'No approval needed (safe fix)');
    return run(p, user, 'EXECUTE');
  };

  const verbs = {
    approve: (p, u, b) => {
      if (p.status !== 'PENDING_APPROVAL') return failNested(409, `The plan is ${p.status.toLowerCase().replace(/_/g, ' ')}, it must be waiting for approval.`, 'PLAN_STATE');
      if (String(p.created_by).toLowerCase() === String(u.email).toLowerCase()) return failNested(403, 'The requester cannot approve or reject their own plan.', 'SELF_APPROVAL');
      logPlan(p, u, 'APPROVED', b.comment ?? '');
      const n = planAudit().filter((a) => a.plan_id === p.plan_id && a.event === 'APPROVED').length;
      if (n >= (p.required_approvals || 1)) approved(p, u);
      else setStatus(p, 'PENDING_APPROVAL', u, 'APPROVAL_PARTIAL', `${n} of ${p.required_approvals} approvals`);
      return p;
    },
    reject: (p, u, b) => {
      if (String(p.created_by).toLowerCase() === String(u.email).toLowerCase()) return failNested(403, 'The requester cannot approve or reject their own plan.', 'SELF_APPROVAL');
      p.status_reason = b.comment ?? '';
      return setStatus(p, 'REJECTED', u, 'REJECTED', b.comment ?? '');
    },
    cancel: (p, u, b) => setStatus(p, 'CANCELLED', u, 'CANCELLED', b.reason ?? ''),
    'mark-done': (p, u, b) => {
      setStatus(p, 'MANUALLY_DONE', u, 'MARKED_DONE', b.note ?? '');
      for (const id of p.finding_ids) findingStates()[id] = { ...(findingStates()[id] ?? {}), status: 'RESOLVED', updated_at: iso(Date.now()), updated_by: u.email };
      save();
      return p;
    },
    submit: (p, u) => {
      if (p.mode !== 'ONE_CLICK' || p.status !== 'READY') return failNested(409, `The plan is ${p.status.toLowerCase().replace(/_/g, ' ')}; only a ready One-click plan can be submitted.`, 'PLAN_STATE');
      if (!p.approval_required) {
        logPlan(p, u, 'SUBMITTED', 'Safe fix below Critical: no approval needed');
        approved(p, u);
        return p;
      }
      return setStatus(p, 'PENDING_APPROVAL', u, 'SUBMITTED', `Waiting for ${p.required_approvals} approval${p.required_approvals === 1 ? '' : 's'}`);
    },
    'confirm-external': (p, u) => {
      if (p.status !== 'WAITING_EXTERNAL') return failNested(409, 'The plan is not waiting for the vendor.', 'PLAN_STATE');
      p.params = { ...p.params, external_id_status: 'CONFIRMED' };
      return setStatus(p, 'READY', u, 'EXTERNAL_CONFIRMED', 'The vendor has configured the External ID');
    },
  };
  for (const [verb, fn] of Object.entries(verbs)) {
    r.post(`${B}/plans/:id/${verb}`, ({ params, body, user }) => {
      const p = plan(params.id);
      if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
      const out = fn(p, user, body ?? {});
      if (out?.status && out?.body) return out;
      audit(user, `remediation.plan.${verb}`, `${verb[0].toUpperCase()}${verb.slice(1).replace('-', ' ')} plan ${p.plan_id} (${p.title ?? p.action_type} on ${p.target_name ?? p.target_arn})`);
      return remed(out);
    });
  }

  r.post(`${B}/plans/:id/execute`, ({ params, user }) => {
    const p = plan(params.id);
    if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
    if (p.policy_id) return failNested(409, 'The rule engine runs auto-remediation plans once they are approved.', 'ENGINE_PLAN');
    if (p.status !== 'APPROVED') return failNested(409, `The plan is ${p.status.toLowerCase().replace(/_/g, ' ')}, it must be APPROVED.`, 'PLAN_NOT_APPROVED');
    const ex = run(p, user, 'EXECUTE');
    return { status: 202, body: { data: ex, status_url: `${B}/executions/${ex.execution_id}` } };
  });
  r.post(`${B}/plans/:id/rollback`, ({ params, user }) => {
    const p = plan(params.id);
    if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
    if (p.mode !== 'ONE_CLICK') return failNested(409, 'Only One-click and auto-remediation plans can be rolled back from here.', 'NOT_ONE_CLICK');
    if (!['EXECUTED', 'VERIFIED', 'RESOLVED'].includes(p.status)) return failNested(409, `The plan is ${p.status.toLowerCase().replace(/_/g, ' ')}, nothing to roll back.`, 'PLAN_STATE');
    if (!p.reversible) return failNested(409, `${p.action_type} cannot be rolled back.`, 'NOT_REVERSIBLE');
    const running = execs().find((e) => e.plan_id === p.plan_id && e.status === 'RUNNING');
    if (running) return failNested(409, `Execution ${running.execution_id} is still RUNNING.`, 'RUNNING');
    const last = execs().find((e) => e.plan_id === p.plan_id && e.kind === 'EXECUTE' && e.status === 'SUCCEEDED');
    if (!last) return failNested(409, `Plan ${p.plan_id} has no succeeded execution to roll back.`, 'NO_EXECUTION');
    const ex = run(p, user, 'ROLLBACK', last.execution_id);
    audit(user, 'remediation.plan.rollback', `Rolled back plan ${p.plan_id} (${p.title} on ${p.target_name})`);
    return { status: 202, body: { data: ex, status_url: `${B}/executions/${ex.execution_id}` } };
  });
  /* Runs move on as they are read: one AWS call every 2.5 s, then verify. */
  r.get(`${B}/executions/:id`, ({ params }) => {
    const ex = execs().find((e) => e.execution_id === params.id);
    if (!ex) return failNested(404, 'No such execution.', 'NOT_FOUND');
    if (ex.status === 'RUNNING') {
      const done = Math.min(ex.steps.length, Math.floor((Date.now() - ex.started) / 2500));
      ex.steps = ex.steps.map((s, k) => (k < done ? { ...s, status: ex.kind === 'ROLLBACK' ? 'UNDONE' : 'OK', at: s.at ?? iso(ex.started + (k + 1) * 2500) } : { ...s, status: k === done ? 'RUNNING' : 'PENDING' }));
      if (done >= ex.steps.length) {
        ex.status = 'SUCCEEDED';
        ex.completed_at = iso(Date.now());
        ex.verify_result = { verified: true, detail: ex.kind === 'ROLLBACK' ? 'Read back: the previous state is in place.' : 'Read back through the role: the change is in place.' };
        const p = plan(ex.plan_id);
        if (p) {
          const role = { email: 'NHIPlatformRemediator' };
          for (const s of ex.steps) logPlan(p, role, 'AWS_CALL', `${s.api} ${s.status} (request ${s.request_id})`);
          if (ex.kind === 'ROLLBACK') {
            setStatus(p, 'ROLLED_BACK', role, 'ROLLED_BACK', 'The previous state was restored.');
            /* Undone: the finding is open again, everywhere, straight away. */
            for (const id of p.finding_ids) findingStates()[id] = { ...(findingStates()[id] ?? {}), status: 'OPEN', updated_at: iso(Date.now()) };
          } else {
            setStatus(p, 'VERIFIED', role, 'VERIFIED', 'Change verified in AWS; the next scan closes the finding.');
            for (const id of p.finding_ids) findingStates()[id] = { ...(findingStates()[id] ?? {}), status: 'RESOLVED', updated_at: iso(Date.now()) };
          }
        }
        save();
      }
    }
    return remed(ex);
  });
  r.get(`${B}/audit`, ({ query }) => {
    ensureAutoPlans();
    const rows = planAudit()
      .filter((a) => !query.plan_id || a.plan_id === query.plan_id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return remed(rows.slice(0, Number(query.limit) || 200).map((a) => ({ ...a, details: a.detail, plan: plan(a.plan_id) ? { title: plan(a.plan_id).title, target_name: plan(a.plan_id).target_name, mode: plan(a.plan_id).mode, policy_id: plan(a.plan_id).policy_id } : null })));
  });

  r.get(`${B}/actions`, () =>
    remed(
      Object.values(ACTION).map((a) => ({ action_type: a.type, title: a.title, label: a.title, remediation_group: a.group, risk_level: a.risk, reversible: a.reversible, one_click_supported: true })),
    ),
  );

  const checksOf = (a) => {
    const on = Boolean(a.remediation_role_arn);
    const st = (ok) => (on ? (ok ? 'pass' : 'warn') : 'idle');
    return [
      { key: 'assume', label: 'The worker can assume NHIPlatformRemediator', state: st(true), message: on ? `ispm-remediator assumed ${a.remediation_role_arn.split('/').pop()} with the External ID.` : 'Set the role ARN first.' },
      { key: 'permissions', label: 'Remediation permissions present', state: st(true), message: on ? 'All 6 statements found: keys, roles, KMS, Secrets Manager, rotated-key store, guardrail.' : '' },
      { key: 'guardrail', label: 'Guardrail: platform roles cannot be changed', state: st(true), message: on ? 'Deny on NHIPlatform*, NHIDiscoveryReadOnly and service-linked roles.' : '' },
      { key: 'regions', label: 'Regions reachable', state: st(true), message: on ? (a.enabled_regions ?? []).join(', ') : '' },
    ];
  };
  const view = (a) => ({ ...a, checks: checksOf(a) });
  r.get(`${B}/accounts`, () => remed(accounts().map(view)));
  r.get(`${B}/accounts/:id`, ({ params }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    return a ? remed(view(a)) : failNested(404, 'Not set up.', 'NOT_FOUND');
  });
  r.get(`${B}/accounts/:id/setup`, ({ params }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    const externalId = a?.remediation_external_id || '<accounts.remediation_external_id>';
    return remed({
      account_id: params.id,
      role_name: 'NHIPlatformRemediator',
      worker_principal: 'arn:aws:iam::884264984984:user/ispm-remediator',
      external_id: externalId,
      policies: [
        {
          key: 'permissions',
          title: 'Remediation role NHIPlatformRemediator: permissions',
          note: 'Covers all 11 remediation policies. The last statement is a guardrail: the platform can never change its own roles or AWS service-linked roles.',
          document: {
            Version: '2012-10-17',
            Statement: [
              { Sid: 'R2DeactivateKeysR5RotateKeys', Effect: 'Allow', Action: ['iam:ListAccessKeys', 'iam:GetAccessKeyLastUsed', 'iam:UpdateAccessKey', 'iam:CreateAccessKey', 'iam:DeleteAccessKey'], Resource: 'arn:aws:iam::*:user/*' },
              { Sid: 'R3TrustR5SessionR6Escalation', Effect: 'Allow', Action: ['iam:GetRole', 'iam:UpdateAssumeRolePolicy', 'iam:UpdateRole', 'iam:GetRolePolicy', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy'], Resource: 'arn:aws:iam::*:role/*' },
              { Sid: 'R4KmsPolicyGrantsR5KmsRotation', Effect: 'Allow', Action: ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:PutKeyPolicy', 'kms:ListGrants', 'kms:RevokeGrant', 'kms:CreateGrant', 'kms:GetKeyRotationStatus', 'kms:EnableKeyRotation', 'kms:DisableKeyRotation'], Resource: '*' },
              { Sid: 'R4SecretPolicyR5RotateSecrets', Effect: 'Allow', Action: ['secretsmanager:DescribeSecret', 'secretsmanager:GetResourcePolicy', 'secretsmanager:PutResourcePolicy', 'secretsmanager:DeleteResourcePolicy', 'secretsmanager:RotateSecret', 'secretsmanager:UpdateSecretVersionStage', 'lambda:InvokeFunction'], Resource: '*' },
              { Sid: 'R5StoreRotatedKeys', Effect: 'Allow', Action: ['secretsmanager:CreateSecret', 'secretsmanager:PutSecretValue'], Resource: 'arn:aws:secretsmanager:*:*:secret:ispm/rotated-keys/*' },
              { Sid: 'GuardrailNeverChangePlatformRoles', Effect: 'Deny', Action: ['iam:UpdateAssumeRolePolicy', 'iam:UpdateRole', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy'], Resource: ['arn:aws:iam::*:role/NHIPlatform*', 'arn:aws:iam::*:role/NHIDiscoveryReadOnly', 'arn:aws:iam::*:role/aws-service-role/*'] },
            ],
          },
        },
        {
          key: 'trust',
          title: 'Remediation role: trust policy (who may assume it)',
          note: 'Only the platform worker user, and only with this account’s External ID.',
          document: {
            Version: '2012-10-17',
            Statement: [{ Effect: 'Allow', Principal: { AWS: 'arn:aws:iam::884264984984:user/ispm-remediator' }, Action: 'sts:AssumeRole', Condition: { StringEquals: { 'sts:ExternalId': externalId } } }],
          },
        },
        {
          key: 'worker',
          title: 'Worker user ispm-remediator: its own permissions (platform side)',
          note: 'Lives in the platform account, not yours: it may assume NHIPlatformRemediator in connected accounts and send the approval e-mails.',
          document: {
            Version: '2012-10-17',
            Statement: [
              { Effect: 'Allow', Action: 'sts:AssumeRole', Resource: 'arn:aws:iam::*:role/NHIPlatformRemediator' },
              { Effect: 'Allow', Action: ['ses:SendRawEmail', 'ses:SendEmail'], Resource: '*' },
            ],
          },
        },
      ],
    });
  });
  r.put(`${B}/accounts/:id`, ({ params, body, user }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    if (!a) return failNested(404, 'Not set up.', 'NOT_FOUND');
    Object.assign(a, body, { access_status: a.remediation_role_arn || body.remediation_role_arn ? 'OK' : 'NOT_CONFIGURED', access_checked_at: iso(Date.now()) });
    save();
    audit(user, 'remediation.settings', `Changed One-click settings for ${params.id}`);
    return remed(view(a));
  });
  r.post(`${B}/accounts/:id/validate`, ({ params }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    if (!a) return failNested(404, 'Not set up.', 'NOT_FOUND');
    a.access_checked_at = iso(Date.now());
    a.access_status = a.remediation_role_arn ? 'OK' : 'CANNOT_ASSUME';
    a.access_detail = a.remediation_role_arn ? 'Role assumed with the External ID; all remediation permissions present; guardrail deny in place.' : 'No remediation role set.';
    save();
    return remed(view(a));
  });
}

export { rng, hashString, MIN, postureRow };
