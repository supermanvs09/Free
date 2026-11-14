/* Remediation: findings to fix, fix steps per provider, plans and executions. */
import { remed, failNested, iso, DAY, HOUR, MIN, NOW, rng, hashString } from '../util';
import { fleet, effectiveChecks, rule, postureRow, scoreOf, findingStates } from '../postureEngine';
import { credentialsOf, identityById } from '../world';
import { scopeById } from '../seed';
import { slice, save } from '../state';
import { audit } from '../users';

const B = '/api/v1/remediation';

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
        plan: plan ? { plan_id: plan.plan_id, status: plan.status, mode: plan.mode, updated_at: plan.updated_at } : null,
        stage: !plan ? 'todo' : ['EXECUTED', 'MANUALLY_DONE'].includes(plan.status) ? 'waiting_scan' : resolved ? 'done' : 'in_progress',
      });
    }
  }
  const w = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return out.sort((a, b) => w[b.severity] - w[a.severity] || b.score_gain - a.score_gain);
}

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
  const now = iso(Date.now());
  const score = scoreOf(i);
  return {
    plan_id: `pln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    finding_ids: [f.finding_id],
    rule_ids: [f.rule_id],
    action_type: actionType || rl.auto || 'manual_change',
    account_id: f.account_id,
    region: f.region,
    target_arn: i.arn,
    target_type: i.identity_type,
    mode,
    status: mode === 'ONE_CLICK' ? 'PENDING_APPROVAL' : 'READY',
    status_reason: '',
    risk_level: f.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
    required_approvals: mode === 'ONE_CLICK' ? 2 : 0,
    params: {},
    ...changeFor(rl, i),
    steps: stepsFor(rl, i),
    prechecks: [
      { key: 'activity', label: 'Recent activity reviewed', status: 'PASS', detail: '90 days of calls checked against the new policy.' },
      { key: 'dependents', label: 'No other identity depends on this change', status: credentialsOf(i).some((c) => (c.bound_identities?.length ?? 0) > 1) ? 'WARN' : 'PASS', detail: credentialsOf(i).some((c) => (c.bound_identities?.length ?? 0) > 1) ? 'The credential is shared with other identities.' : 'Not shared.' },
    ],
    score_current: score,
    score_gain: rl ? { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 }[rl.severity] : 0,
    score_projected: Math.min(100, score + ({ CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 }[rl.severity] ?? 0)),
    valid_until: iso(Date.now() + 7 * DAY),
    created_by: user.email,
    created_at: now,
    updated_at: now,
    policy_id: null,
  };
}

function logPlan(plan, user, event, detail = '') {
  planAudit().unshift({ audit_id: `pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, plan_id: plan.plan_id, event, actor: user?.email ?? 'system', at: iso(Date.now()), detail });
}

function setStatus(plan, status, user, event, detail) {
  plan.status = status;
  plan.updated_at = iso(Date.now());
  logPlan(plan, user, event, detail);
  save();
  return plan;
}

export default function register(r) {
  r.get(`${B}/findings`, ({ query }) => {
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
    const f = findingById(params.id);
    if (!f) return failNested(404, 'That finding no longer exists.', 'NOT_FOUND');
    const rl = rule(f.rule_id);
    const i = identityById(f.identity_id);
    const steps = stepsFor(rl, i);
    const where = { aws: 'AWS', azure: 'Azure', jenkins: 'Jenkins', vault: 'Vault' }[i.provider];
    const summaryText = `${rl.title} - ${i.name} (${where})\n${steps.map((st, k) => `${k + 1}. ${st.title}${st.cli ? `\n   ${st.cli}` : ''}`).join('\n')}`;
    return remed({
      ...f,
      resource: i.arn,
      description: f.detail,
      why_it_matters: rl.why,
      how_to_fix: rl.fix,
      fix: { action_type: rl.auto ?? 'manual_fix', title: rl.fix, description: rl.why, risk_level: f.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM', reversible: !['NHI-CH-001'].includes(rl.rule_id), manual: !rl.auto, steps },
      modes: {
        guided: { available: true, flow: `Make a plan, apply the steps in ${where}, then mark it done. The next scan confirms the fix.`, reason: '' },
        one_click: { available: Boolean(rl.auto) && i.provider === 'aws', reason: i.provider !== 'aws' ? `One-click runs in AWS accounts only; ${where} fixes are applied by hand.` : rl.auto ? '' : 'This check has no automatic fix.' },
      },
      summary_text: summaryText,
      plans: plansStore().filter((p) => p.finding_ids.includes(f.finding_id)),
    });
  });

  r.get(`${B}/findings/:id`, ({ params }) => remed(plansStore().filter((p) => p.finding_ids.includes(params.id))));

  r.post(`${B}/plans`, ({ body, user }) => {
    const f = findingById(body.finding_ids?.[0]);
    if (!f) return failNested(404, 'That finding no longer exists.', 'NOT_FOUND');
    const waiting = plansStore().find((p) => p.finding_ids.includes(f.finding_id) && ['READY', 'PENDING_APPROVAL', 'APPROVED', 'DRAFT'].includes(p.status));
    if (waiting) return remed(waiting, { existing_plan: true, message: 'A plan for this finding is already waiting.' });
    const plan = makePlan(f, body.mode || 'GUIDED', user, body.action_type);
    plansStore().unshift(plan);
    logPlan(plan, user, 'CREATED', `${plan.mode === 'ONE_CLICK' ? 'One-click' : 'Guided'} plan`);
    save();
    audit(user, 'remediation.plan.create', `Created a plan for "${f.title}" on ${f.identity_name}`);
    return { status: 201, body: { data: plan, existing_plan: false, message: 'Plan created.' } };
  });

  r.get(`${B}/plans`, ({ query }) => {
    let rows = plansStore();
    if (query.status) rows = rows.filter((p) => String(query.status).split(',').includes(p.status));
    if (query.mode) rows = rows.filter((p) => p.mode === query.mode);
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
    const approvals = planAudit().filter((a) => a.plan_id === p.plan_id && a.event === 'APPROVED').map((a) => ({ actor: a.actor, at: a.at, decision: 'APPROVE', comment: a.detail }));
    return remed({ plan: p, approvals, executions: execs().filter((e) => e.plan_id === p.plan_id), approvals_counted: approvals.length });
  });

  const verbs = {
    approve: (p, u, b) => {
      const n = planAudit().filter((a) => a.plan_id === p.plan_id && a.event === 'APPROVED').length + 1;
      logPlan(p, u, 'APPROVED', b.comment ?? '');
      return setStatus(p, n >= p.required_approvals ? 'APPROVED' : 'PENDING_APPROVAL', u, 'STATUS', `${n} of ${p.required_approvals} approvals`);
    },
    reject: (p, u, b) => setStatus(p, 'REJECTED', u, 'REJECTED', b.comment ?? ''),
    cancel: (p, u, b) => setStatus(p, 'CANCELLED', u, 'CANCELLED', b.reason ?? ''),
    'mark-done': (p, u, b) => {
      setStatus(p, 'MANUALLY_DONE', u, 'MARKED_DONE', b.note ?? '');
      for (const id of p.finding_ids) findingStates()[id] = { ...(findingStates()[id] ?? {}), status: 'RESOLVED', updated_at: iso(Date.now()), updated_by: u.email };
      save();
      return p;
    },
    submit: (p, u) => setStatus(p, 'PENDING_APPROVAL', u, 'SUBMITTED'),
    'confirm-external': (p, u) => setStatus(p, 'EXECUTED', u, 'CONFIRMED_EXTERNAL'),
  };
  for (const [verb, fn] of Object.entries(verbs)) {
    r.post(`${B}/plans/:id/${verb}`, ({ params, body, user }) => {
      const p = plan(params.id);
      if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
      const out = fn(p, user, body ?? {});
      audit(user, `remediation.plan.${verb}`, `${verb[0].toUpperCase()}${verb.slice(1).replace('-', ' ')} plan ${p.plan_id}`);
      return remed(out);
    });
  }

  const run = (p, user, kind) => {
    const ex = { execution_id: `exe_${Date.now().toString(36)}`, plan_id: p.plan_id, kind, status: 'RUNNING', started_at: iso(Date.now()), finished_at: null, started: Date.now(), steps: p.steps.map((s, k) => ({ index: k, title: s.title, status: 'PENDING' })), error_code: '', error_message: '' };
    execs().unshift(ex);
    setStatus(p, kind === 'ROLLBACK' ? 'EXECUTING' : 'EXECUTING', user, kind === 'ROLLBACK' ? 'ROLLBACK_STARTED' : 'EXECUTION_STARTED');
    return ex;
  };
  r.post(`${B}/plans/:id/execute`, ({ params, user }) => {
    const p = plan(params.id);
    if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
    if (p.status !== 'APPROVED' && p.status !== 'READY') return failNested(409, 'The plan must be approved before it runs.', 'PLAN_NOT_APPROVED');
    const ex = run(p, user, 'EXECUTE');
    return { status: 202, body: { data: ex, status_url: `${B}/executions/${ex.execution_id}` } };
  });
  r.post(`${B}/plans/:id/rollback`, ({ params, user }) => {
    const p = plan(params.id);
    if (!p) return failNested(404, 'That plan no longer exists.', 'NOT_FOUND');
    const ex = run(p, user, 'ROLLBACK');
    return { status: 202, body: { data: ex, status_url: `${B}/executions/${ex.execution_id}` } };
  });
  r.get(`${B}/executions/:id`, ({ params }) => {
    const ex = execs().find((e) => e.execution_id === params.id);
    if (!ex) return failNested(404, 'No such execution.', 'NOT_FOUND');
    const elapsed = Date.now() - ex.started;
    const done = Math.min(ex.steps.length, Math.floor(elapsed / 2500));
    ex.steps = ex.steps.map((s, k) => ({ ...s, status: k < done ? 'SUCCEEDED' : k === done ? 'RUNNING' : 'PENDING' }));
    if (done >= ex.steps.length && ex.status === 'RUNNING') {
      ex.status = 'SUCCEEDED';
      ex.finished_at = iso(Date.now());
      const p = plan(ex.plan_id);
      if (p) {
        setStatus(p, ex.kind === 'ROLLBACK' ? 'ROLLED_BACK' : 'EXECUTED', null, ex.kind === 'ROLLBACK' ? 'ROLLED_BACK' : 'EXECUTED');
        if (ex.kind !== 'ROLLBACK') for (const id of p.finding_ids) findingStates()[id] = { ...(findingStates()[id] ?? {}), status: 'RESOLVED', updated_at: iso(Date.now()) };
      }
      save();
    }
    return remed(ex);
  });
  r.get(`${B}/audit`, ({ query }) => remed(planAudit().filter((a) => !query.plan_id || a.plan_id === query.plan_id)));

  r.get(`${B}/actions`, () =>
    remed([
      { action_type: 'trim_unused_permissions', label: 'Remove unused permissions', reversible: true, risk_level: 'MEDIUM' },
      { action_type: 'replace_admin_policy', label: 'Replace administrator policy', reversible: true, risk_level: 'HIGH' },
      { action_type: 'rotate_access_key', label: 'Rotate access key', reversible: false, risk_level: 'MEDIUM' },
      { action_type: 'deactivate_access_key', label: 'Deactivate access key', reversible: true, risk_level: 'LOW' },
      { action_type: 'enable_secret_rotation', label: 'Turn on secret rotation', reversible: true, risk_level: 'LOW' },
      { action_type: 'add_external_id_condition', label: 'Require an ExternalId', reversible: true, risk_level: 'MEDIUM' },
      { action_type: 'pin_oidc_subject', label: 'Pin the OIDC subject', reversible: true, risk_level: 'MEDIUM' },
      { action_type: 'remove_escalation_actions', label: 'Remove escalation actions', reversible: true, risk_level: 'HIGH' },
      { action_type: 'tag_owner', label: 'Tag an owner', reversible: true, risk_level: 'LOW' },
      { action_type: 'disable_identity', label: 'Disable the identity', reversible: true, risk_level: 'MEDIUM' },
    ]),
  );

  const accounts = () =>
    slice('remediationAccounts', () =>
      ['482915736104', '739204185562', '215660394871'].map((id, k) => ({
        account_id: id,
        remediation_enabled: k < 2,
        remediation_role_arn: k < 2 ? `arn:aws:iam::${id}:role/NHIRemediationRole` : '',
        has_external_id: k < 2,
        auto_remediation_enabled: false,
        allowed_action_types: k < 2 ? ['trim_unused_permissions', 'deactivate_access_key', 'tag_owner', 'enable_secret_rotation'] : [],
        enabled_regions: ['ap-south-1'],
        access_status: k < 2 ? 'OK' : 'NOT_CONFIGURED',
        access_detail: k < 2 ? 'Role assumed; required permissions present.' : '',
        access_checked_at: iso(NOW - (k + 1) * 3 * HOUR),
      })),
    );
  r.get(`${B}/accounts`, () => remed(accounts()));
  r.get(`${B}/accounts/:id`, ({ params }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    return a ? remed(a) : failNested(404, 'Not set up.', 'NOT_FOUND');
  });
  r.get(`${B}/accounts/:id/setup`, ({ params }) =>
    remed({
      account_id: params.id,
      role_name: 'NHIRemediationRole',
      external_id: 'nhi-rem-7f3a91c2',
      trust_principal: 'arn:aws:iam::600134289077:role/NHIPlatformRemediator',
      template_url: 'https://deepalgorithms.ai/templates/nhi-remediation-role.yaml',
      policy_actions: ['iam:PutRolePolicy', 'iam:DetachRolePolicy', 'iam:UpdateAccessKey', 'iam:TagRole', 'secretsmanager:RotateSecret'],
    }),
  );
  r.put(`${B}/accounts/:id`, ({ params, body, user }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    if (!a) return failNested(404, 'Not set up.', 'NOT_FOUND');
    Object.assign(a, body, { access_status: body.remediation_role_arn ? 'OK' : 'NOT_CONFIGURED', access_checked_at: iso(Date.now()) });
    save();
    audit(user, 'remediation.settings', `Changed One-click settings for ${params.id}`);
    return remed(a);
  });
  r.post(`${B}/accounts/:id/validate`, ({ params }) => {
    const a = accounts().find((x) => x.account_id === params.id);
    if (!a) return failNested(404, 'Not set up.', 'NOT_FOUND');
    a.access_checked_at = iso(Date.now());
    a.access_status = a.remediation_role_arn ? 'OK' : 'CANNOT_ASSUME';
    a.access_detail = a.remediation_role_arn ? 'Role assumed; required permissions present.' : 'No remediation role set.';
    save();
    return remed(a);
  });
}

export { rng, hashString, MIN, postureRow };
