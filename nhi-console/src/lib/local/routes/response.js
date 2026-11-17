/*
 * Response: act on what the console found, and see the effect at once.
 *
 *   GET  /api/v1/response/identities/:id            what can be done about it now
 *   GET  /api/v1/response/identities/:id/least-privilege   the policy it needs, with blast radius before/after
 *   POST /api/v1/response/identities/:id/right-size  replace its access with what it uses
 *   POST /api/v1/response/keys/:id/deactivate        deactivate an access key
 *   POST /api/v1/response/links/break                remove a role from another role's trust policy
 *   GET  /api/v1/response/credentials/:id            a credential's standing (orphaned, unused, owner)
 *   POST /api/v1/response/credentials/:id/delete     delete an orphaned role
 *   GET  /api/v1/scenarios                           live scenarios and where each stands
 *   POST /api/v1/scenarios/:key/run | /reset         start one, or put it back
 *
 * Every change goes to the shared workspace (response.js), so blast radius,
 * the access graph, posture and alerts recompute for everyone.
 */
import { ok, fail } from '../util';
import { estate } from '../seed';
import { audit, auditLog } from '../users';
import { can } from '../roles';
import { save } from '../state';
import { credentialById, credentialsOf, identityById, identitiesOf, eventsOf, visible } from '../world';
import { escalationPaths, escalationThrough, grantsForPrincipal, linkById, originalGrants, principalOf, rightSize, withRightSizePreview } from '../entitlements';
import { accessPath, blastRadius } from '../reach';
import { liveFindings } from '../exposureData';
import { anomalies } from './genome';
import { deliveries, emitEvent, liveEvents } from '../notifyBus';
import { findingStates } from '../postureEngine';
import { plansStore } from './remediation';
import { mutate, response, rightSized, scenario } from '../response';
import { genomeRouteFor } from '../../identityLinks';
import { credentialGenome, credentialGenomeOne, sharedKey } from '../keyGenome';

const ACCOUNT_NAME = { '482915736104': 'prod-core', '739204185562': 'data-platform', '215660394871': 'staging', '605218934417': 'shared-services' };
const byName = (name) => estate().identities.find((i) => i.name === name && !i.__deleted) ?? estate().identities.find((i) => i.name === name);
const actor = (user) => ({ at: Date.now(), by: user.email, by_name: user.full_name });

function blastSummary(arn) {
  const b = arn ? blastRadius(arn) : null;
  if (!b) return { score: 0, risk: 'NONE', resources: 0, sensitive: 0, accounts: 0, roles: 0 };
  return { score: b.blast_radius_score, risk: b.risk_level, resources: b.reachable_resources.length, sensitive: b.summary.sensitive, accounts: b.reachable_resources.length ? b.summary.accounts : 0, roles: b.reachable_identities.length };
}

/* The ARN whose blast radius stands for an identity: its role, else itself. */
function subjectArn(identity) {
  const role = credentialsOf(identity).find((c) => c.credential_type === 'iam_role');
  return role?.arn ?? identity.arn;
}

/** Marks the live alerts a response settles. */
function resolve(pred, resolution) {
  let changed = false;
  for (const e of liveEvents()) {
    if (!e.resolution && pred(e)) {
      e.resolution = resolution;
      changed = true;
    }
  }
  if (changed) save();
}

function servicesUsed(identity) {
  const used = new Set();
  for (const e of eventsOf(identity)) if (!e.error_code) used.add(e.service);
  return [...used];
}

/* ── What can be done about an identity ────────────────────────────────── */
function insights(identity) {
  const out = { identity_id: identity.id, name: identity.name };
  /* A key of its found in code. */
  const keys = credentialsOf(identity).filter((c) => c.credential_type === 'access_key');
  const leak = liveFindings().find((f) => f.list === 'live' && keys.some((k) => k.id === f.credential_id) && f.analyst_decision !== 'false_positive');
  if (leak) {
    const key = credentialById(leak.credential_id);
    out.exposure = {
      finding_id: leak.finding_id,
      repository: leak.repository,
      branch: leak.branch,
      file_path: leak.file_path,
      line_number: leak.line_number,
      author: leak.author,
      commit_message: leak.commit_message,
      commit_id: leak.commit_id,
      found_at: leak.created_at,
      redacted: leak.redacted,
      uri: leak.github_uri ?? leak.bitbucket_uri,
      credential_id: key.id,
      credential_name: key.name,
      access_key_id: key.access_key_id,
      status: key.status,
      deactivated_at: key.deactivated_at,
      deactivated_by: key.deactivated_by,
      blast: blastSummary(key.arn),
      identity_admin: Boolean(identity.__base?.is_admin ?? identity.is_admin),
    };
  }
  /* Administrator access it barely uses. */
  if (identity.provider === 'aws' && identity.__base?.is_admin && !escalationPaths(identity).length) {
    const key = principalOf(identity);
    const original = originalGrants(key);
    const adminGrant = original.find((g) => g.resource_spec === '*');
    if (adminGrant) {
      const used = servicesUsed(identity).filter((s) => s !== 'sts');
      const role = credentialsOf(identity).find((c) => c.credential_type === 'iam_role');
      const sized = rightSized(key);
      out.overprivilege = {
        principal: key,
        role_name: role?.name ?? identity.name,
        policy: adminGrant.policy_source,
        services_granted: 25,
        services_used: used.length,
        used_services: used,
        utilization_pct: Math.max(1, Math.round((used.length / 25) * 100)),
        public: identity.is_publicly_accessible,
        imds: identity.identity_type === 'ec2_instance' ? { version: 'IMDSv1', hop_limit: 2 } : null,
        right_sized: sized ? { at: new Date(sized.at).toISOString(), by: sized.by, by_name: sized.by_name, before: sized.before, after: sized.after } : null,
        blast: blastSummary(subjectArn(identity)),
      };
    }
  }
  /* Role chains to administrator access. */
  const from = escalationPaths(identity);
  const through = escalationThrough(identity);
  const brokenHere = Object.entries(response().broken ?? {}).filter(([id]) => id.includes(`assume:${identity.name}->`) || id.includes(`->${identity.name}`));
  if (from.length || through.length || brokenHere.length) {
    const shape = (p) => ({
      identities: p.identities.map((i) => ({ id: i.id, name: i.name, arn: i.arn, identity_type: i.identity_type, is_admin: i.is_admin, account: ACCOUNT_NAME[i.account_id] ?? i.account_id, utilization_pct: i.permission_utilization_pct })),
      links: p.links.map((l) => ({ id: l.id, why: l.why, from: l.from.name, to: l.to.name })),
    });
    out.escalation = {
      paths: from.map(shape),
      through: through.map(shape),
      closed: brokenHere.map(([id, v]) => {
        const l = linkById(id);
        return { id, from: l?.from.name, to: l?.to.name, why: l?.why, at: new Date(v.at).toISOString(), by: v.by, by_name: v.by_name };
      }),
    };
  }
  /* Behaviour NHI Genome flagged in the last day, and whether it was contained. */
  const fresh = anomalies().filter((a) => a.identity_id === identity.id && a.status === 'open' && Date.parse(a.detected_at) > Date.now() - 24 * 3600 * 1000);
  if (fresh.length) {
    const key = principalOf(identity);
    const sized = rightSized(key);
    out.anomaly = { ...fresh[0], contained: sized ? { at: new Date(sized.at).toISOString(), by: sized.by, by_name: sized.by_name } : null, principal: key, blast: blastSummary(subjectArn(identity)) };
  }
  return out;
}

/* Blast radius as it would be with only what it uses. */
function leastPrivilege(identity) {
  const key = principalOf(identity);
  const before = blastSummary(subjectArn(identity));
  const proposed = rightSize(grantsForPrincipal(key));
  const already = Boolean(response().rightsized?.[key]);
  const after = already ? before : withRightSizePreview(key, () => blastSummary(subjectArn(identity)));
  const statements = proposed.map((g, n) => ({
    Sid: `Used${n + 1}`,
    Effect: 'Allow',
    Action: g.actions.length === 1 ? g.actions[0] : g.actions,
    Resource: g.targets.map((t) => (t.service === 's3' && t.arn.startsWith('arn:aws:s3:::') ? `${t.arn}/*` : t.arn)),
  }));
  const original = originalGrants(key);
  return {
    principal: key,
    policy_name: `${key.split('@')[0]}-least-privilege`,
    replaces: [...new Set(original.map((g) => g.policy_source))],
    policy: { Version: '2012-10-17', Statement: statements },
    based_on: '90 days of CloudTrail activity',
    before,
    after,
    reduction_pct: before.resources ? Math.round(((before.resources - after.resources) / before.resources) * 100) : 0,
    already_applied: already,
  };
}

/* ── Live scenarios ────────────────────────────────────────────────────── */
const SCENARIOS = {
  leak: { title: 'Leaked IAM key' },
  ec2: { title: 'EC2 role stolen through the instance metadata service' },
  chain: { title: 'Privilege escalation through an AssumeRole chain' },
  orphan: { title: 'Role left behind by a deleted Lambda' },
  agent: { title: 'Runaway Bedrock agent' },
  sharedkey: { title: 'Known credential, unknown consumer' },
};

/* The EC2 scenario's headline number, kept until its access changes. */
let ec2Cache = null;
function ec2Reduction(gw) {
  const sized = response().rightsized?.[principalOf(gw)];
  if (sized?.before) return Math.round(((sized.before.resources - sized.after.resources) / sized.before.resources) * 100);
  ec2Cache ??= leastPrivilege(gw).reduction_pct;
  return ec2Cache;
}

function scenarioState() {
  const r = response();
  const bot = byName('svc-deploy-bot');
  const key = bot && estate().credentials.find((c) => c.bound_identities?.includes(bot.id) || c.__base?.bound?.includes(bot.id));
  const gw = byName('payments-gateway-01');
  const ro = byName('reporting-readonly');
  const lambda = byName('invoice-legacy-export');
  const role = estate().credentials.find((c) => c.name === 'invoice-legacy-export-role');
  const agent = byName('support-copilot-agent');
  return {
    leak: { ran_at: r.scenarios?.leak?.at ?? null, done: Boolean(key && r.keys?.[key.id]), identity_id: bot?.id, credential_id: key?.id, access_key_id: key?.access_key_id },
    ec2: { ran_at: r.scenarios?.ec2?.at ?? null, done: Boolean(gw && r.rightsized?.[principalOf(gw)]), identity_id: gw?.id, reduction_pct: gw ? ec2Reduction(gw) : null },
    chain: { ran_at: r.scenarios?.chain?.at ?? null, done: Boolean(r.broken?.['assume:reporting-readonly->ops-support-role']), identity_id: ro?.id, link_id: 'assume:reporting-readonly->ops-support-role' },
    orphan: { ran_at: r.scenarios?.orphan?.at ?? null, done: Boolean(role && r.deletedCreds?.[role.id]), identity_id: lambda?.id, credential_id: role?.id },
    agent: { ran_at: r.scenarios?.agent?.at ?? null, done: Boolean(agent && r.rightsized?.[principalOf(agent)]), identity_id: agent?.id, genome: agent ? genomeRouteFor(agent) : null },
    sharedkey: (() => {
      const k = sharedKey();
      return { ran_at: r.scenarios?.sharedkey?.at ?? null, done: Boolean(k && r.vaultRotated?.[k.id]), credential_id: k?.id ?? null, identity_id: byName('svc-billing')?.id ?? null };
    })(),
  };
}

/**
 * The figures a replay narrates, read from the live model rather than written
 * into the script: how far the key reaches, how little of its access the
 * server uses, the chain, how long the role sat unused. Read before a story
 * plays, so the captions say what the screens are about to show.
 */
function scenarioFacts() {
  const byName = (n) => estate().identities.find((i) => i.name === n && !i.__deleted);
  const n = (v) => (Number.isFinite(v) ? v : null);
  const out = {};
  const bot = byName('svc-deploy-bot');
  const key = bot && estate().credentials.find((c) => c.bound_identities?.includes(bot.id) || c.__base?.bound?.includes(bot.id));
  if (key) {
    const b = blastSummary(key.arn);
    out.leak = { score: n(b.score), resources: n(b.resources), accounts: n(b.accounts), sensitive: n(b.sensitive), roles: n(b.roles), repo: 'deepalgo-labs/payments-api' };
  }
  const gw = byName('payments-gateway-01');
  if (gw) {
    const o = insights(gw).overprivilege;
    const b = blastSummary(subjectArn(gw));
    out.ec2 = { utilization_pct: n(o?.utilization_pct), used: n(o?.services_used), granted: n(o?.services_granted), resources: n(b.resources), sensitive: n(b.sensitive), reduction_pct: ec2Reduction(gw) };
  }
  const ro = byName('reporting-readonly');
  if (ro) {
    const p = escalationPaths(ro)[0];
    out.chain = { hops: p ? p.identities.length - 1 : null, path: p ? p.identities.map((i) => i.name) : [], target: p?.identities.at(-1)?.name ?? null, resources: n(blastSummary(subjectArn(ro)).resources) };
  }
  const role = estate().credentials.find((c) => c.name === 'invoice-legacy-export-role');
  if (role) {
    const grants = grantsForPrincipal(role.name);
    out.orphan = { role: role.name, function: 'invoice-legacy-export', stores: grants.flatMap((g) => g.targets).length, sensitive: grants.flatMap((g) => g.targets).filter((t) => ['Secrets', 'PCI', 'PII'].includes(t.data)).length, unused_days: role.last_used_at ? Math.max(0, Math.round((Date.now() - Date.parse(role.last_used_at)) / 86400000)) : null };
  }
  const agent = byName('support-copilot-agent');
  if (agent) out.agent = { name: agent.name, resources: n(blastSummary(subjectArn(agent)).resources) };
  const k = sharedKey();
  if (k) {
    const g = credentialGenomeOne(k.id);
    out.sharedkey = { key: `${k.access_key_id.slice(0, 4)}…${k.access_key_id.slice(-4)}`, path: k.vault_path, consumers: g.consumers.map((c) => ({ name: c.name, network: c.network, hours: c.hours })), days: g.baseline.days };
  }
  return out;
}

function runScenario(key, user) {
  const st = scenarioState()[key];
  mutate((r) => {
    r.scenarios[key] = actor(user);
  });
  if (key === 'leak') {
    const bot = byName('svc-deploy-bot');
    const finding = liveFindings().find((f) => f.scenario === 'leak');
    emitEvent({
      id: `evt_scn_leak_${Date.now().toString(36)}`,
      kind: 'exposure',
      severity: 'CRITICAL',
      identity: bot,
      scenario: 'leak',
      title: 'AWS access key committed to deepalgo-labs/payments-api',
      summary: `An active access key of svc-deploy-bot (AdministratorAccess, reaches ${blastSummary(bot.arn).accounts} AWS accounts) was pushed to deploy/.env.production on main by Raju Varma, 41 seconds ago.`,
      facts: { platform: 'github', repository: 'deepalgo-labs/payments-api', file: 'deploy/.env.production', line: 12, branch: 'main', redacted: finding?.redacted, verification: 'verified', credential_id: st.credential_id, author: 'Raju Varma', commit: finding?.commit_id },
      link: `/identities/${bot.id}?tab=blast`,
    });
  }
  if (key === 'ec2') {
    const gw = byName('payments-gateway-01');
    emitEvent({
      id: `evt_scn_ec2_${Date.now().toString(36)}`,
      kind: 'posture',
      severity: 'CRITICAL',
      identity: gw,
      scenario: 'ec2',
      title: 'payments-gateway-01: internet-facing server with full admin',
      summary: 'Its instance role has AdministratorAccess and uses 4% of it. IMDSv1 is on, so one server-side request forgery in the web app hands out the role.',
      facts: { utilization_pct: 4 },
      link: `/identities/${gw.id}?tab=blast`,
    });
  }
  if (key === 'chain') {
    const ro = byName('reporting-readonly');
    emitEvent({
      id: `evt_scn_chain_${Date.now().toString(36)}`,
      kind: 'posture',
      severity: 'CRITICAL',
      identity: ro,
      scenario: 'chain',
      title: 'reporting-readonly can become break-glass-admin',
      summary: 'A read-only reporting role can assume ops-support-role, which can assume break-glass-admin (AdministratorAccess). Two hops from read-only to full admin.',
      facts: {},
      link: `/identities/${ro.id}`,
    });
  }
  if (key === 'orphan') {
    const lambda = byName('invoice-legacy-export');
    const role = estate().credentials.find((c) => c.name === 'invoice-legacy-export-role');
    mutate((r) => {
      r.deleted[lambda.id] = { at: Date.now(), by: 'sashi@deepalgorithms.ai', by_name: 'Sashi Kumar', via: 'lambda:DeleteFunction' };
    });
    emitEvent({
      id: `evt_scn_orphan_${Date.now().toString(36)}`,
      kind: 'posture',
      severity: 'HIGH',
      identity: null,
      scenario: 'orphan',
      title: 'invoice-legacy-export was deleted - its role was left behind',
      summary: 'lambda:DeleteFunction by Sashi Kumar. Its execution role invoice-legacy-export-role still allows S3 and DynamoDB access, and has not been used in 97 days.',
      facts: { credential_id: role.id, subject: role.name, provider: 'aws' },
      link: `/credentials?credential=${role.id}`,
    });
  }
  if (key === 'sharedkey') {
    const k = sharedKey();
    const owner = byName('svc-billing');
    if (k && owner) {
      emitEvent({
        id: `evt_scn_sharedkey_${Date.now().toString(36)}`,
        kind: 'anomaly',
        severity: 'CRITICAL',
        identity: owner,
        scenario: 'sharedkey',
        title: `Known credential, unknown consumer: ${k.access_key_id.slice(0, 4)}…${k.access_key_id.slice(-4)} used from 185.193.88.41`,
        summary: 'svc-billing’s access key (kept in Vault, read by svc-billing-api and batch-reconciler) was just used by a third source: a new IP outside every VPC, a new client and an enumeration pattern (ListAllMyBuckets, GetSecretValue).',
        facts: { credential_id: k.id, dimension: 'consumer', value: '185.193.88.41' },
        link: `/genome/credentials/${k.id}`,
      });
    }
  }
  if (key === 'agent') {
    const agent = byName('support-copilot-agent');
    estate();
    emitEvent({
      id: `evt_scn_agent_${Date.now().toString(36)}`,
      kind: 'anomaly',
      severity: 'CRITICAL',
      identity: agent,
      scenario: 'agent',
      title: 'support-copilot-agent is reading KYC documents it has never touched',
      summary: '1,240 s3:GetObject calls on dpa-kyc-documents in 4 minutes. 14 days of baseline: orders and merchant-profiles only.',
      facts: { dimension: 'resource', value: 'dpa-kyc-documents' },
    });
  }
  return scenarioState();
}

/* Who a scenario touches: its identities and credentials, by id and ARN. */
function scenarioSubjects(key) {
  const st = scenarioState()[key];
  const ids = new Set();
  const add = (row) => row && ids.add(row.id) && ids.add(row.arn);
  if (key === 'leak') {
    add(byName('svc-deploy-bot'));
    add(estate().credentials.find((c) => c.id === st.credential_id));
  }
  if (key === 'ec2') {
    add(byName('payments-gateway-01'));
    for (const c of estate().credentials) if (c.name === 'payments-gateway-01-role') add(c);
  }
  if (key === 'chain') ['reporting-readonly', 'ops-support-role', 'break-glass-admin'].forEach((n) => add(byName(n)));
  if (key === 'orphan') {
    add(byName('invoice-legacy-export'));
    add(estate().credentials.find((c) => c.id === st.credential_id));
  }
  if (key === 'agent') add(byName('support-copilot-agent'));
  if (key === 'sharedkey') {
    ['svc-billing', 'svc-billing-api', 'batch-reconciler'].forEach((n) => add(byName(n)));
    add(sharedKey());
  }
  return ids;
}

/**
 * Puts a scenario back as if it never ran - for everyone, and without a trace:
 * its alerts, delivery log lines, audit entries, the fixes made during it (by
 * card or by remediation plan) and the posture findings they resolved.
 */
function resetScenario(key) {
  const st = scenarioState();
  const since = (response().scenarios?.[key]?.at ?? Date.now()) - 2000;
  const subjects = scenarioSubjects(key);
  const plans = plansStore().filter((p) => subjects.has(p.target_arn) && Date.parse(p.created_at) >= since);
  const planIds = new Set(plans.map((p) => p.plan_id));
  mutate((r) => {
    delete r.scenarios[key];
    if (key === 'leak' && st.leak.credential_id) delete r.keys[st.leak.credential_id];
    if (key === 'ec2') delete r.rightsized[principalOf(byName('payments-gateway-01'))];
    if (key === 'chain') delete r.broken[st.chain.link_id];
    if (key === 'orphan') {
      delete r.deleted[st.orphan.identity_id];
      if (st.orphan.credential_id) delete r.deletedCreds[st.orphan.credential_id];
    }
    if (key === 'agent') delete r.rightsized[principalOf(byName('support-copilot-agent'))];
    if (key === 'sharedkey' && st.sharedkey.credential_id) delete r.vaultRotated[st.sharedkey.credential_id];
    for (const id of planIds) delete r.applied[id];
  });
  const sweep = (list, drop) => {
    for (let i = list.length - 1; i >= 0; i -= 1) if (drop(list[i])) list.splice(i, 1);
  };
  const eventIds = new Set(liveEvents().filter((e) => e.scenario === key).map((e) => e.id));
  sweep(liveEvents(), (e) => e.scenario === key);
  sweep(deliveries(), (d) => eventIds.has(d.event_id));
  sweep(auditLog(), (a) => Date.parse(a.at) >= since && (subjects.has(a.target) || [...subjects].some((x) => typeof x === 'string' && x.startsWith('arn:') && String(a.summary).includes(x.split('/').pop()))));
  sweep(plansStore(), (p) => planIds.has(p.plan_id));
  const states = findingStates();
  for (const [fid, state] of Object.entries(states)) {
    const owner = [...subjects].find((x) => typeof x === 'string' && x.startsWith('idn_') && fid.startsWith(`fnd_${x.slice(4, 10)}_`));
    if (owner && Date.parse(state?.updated_at ?? 0) >= since) delete states[fid];
  }
  save();
  return scenarioState();
}

/* ── Routes ────────────────────────────────────────────────────────────── */
export default function register(r) {
  r.get('/api/v1/response/identities/:id', ({ params }) => {
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    return ok(insights(i));
  });

  /* NHI Genome for credentials: known consumers, and any unknown one. */
  r.get('/api/v1/response/credential-genome', () => ok({ credentials: credentialGenome() }));
  r.get('/api/v1/response/credential-genome/:id', ({ params }) => {
    const d = credentialGenomeOne(params.id);
    return d ? ok(d) : fail(404, 'Not in scope.', 'NOT_FOUND');
  });

  /* Rotate a Vault-held key: a new key is written to the same Vault path, so
     every known consumer picks it up on its next read and any copy taken
     outside Vault stops working. */
  r.post('/api/v1/response/keys/:id/rotate-in-vault', ({ params, user }) => {
    if (!can(user, 'operate') && !can(user, 'integrations')) return fail(403, 'Your role cannot change access.', 'FORBIDDEN');
    const key = credentialById(params.id);
    if (!key || key.store !== 'vault') return fail(404, 'That key is not kept in Vault.', 'NOT_FOUND');
    const before = credentialGenomeOne(key.id);
    mutate((st) => {
      st.vaultRotated[key.id] = { ...actor(user), old_key: key.access_key_id };
    });
    resolve((e) => e.scenario === 'sharedkey' || e.facts?.credential_id === key.id, { label: 'Rotated in Vault', at: new Date().toISOString(), by: user.email, by_name: user.full_name ?? user.email });
    audit(user, 'credential.rotate', `Rotated ${key.name} in Vault (${key.vault_path}); ${before?.known_consumers ?? 0} known consumers read the new key, the unknown one is cut off`, { target: key.id });
    return ok({ credential_id: key.id, genome: credentialGenomeOne(key.id) });
  });

  r.get('/api/v1/response/identities/:id/access-path', ({ params }) => {
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Identity not found', 'NOT_FOUND');
    return ok({ ...accessPath(i), total: blastSummary(subjectArn(i)), contained: blastRadius(subjectArn(i))?.contained ?? null });
  });
  r.get('/api/v1/response/identities/:id/least-privilege', ({ params }) => {
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    return ok(leastPrivilege(i));
  });

  r.post('/api/v1/response/identities/:id/right-size', ({ params, user }) => {
    if (!can(user, 'operate') && !can(user, 'integrations')) return fail(403, 'Your role cannot change access.', 'FORBIDDEN');
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    const preview = leastPrivilege(i);
    mutate((st) => {
      st.rightsized[preview.principal] = { ...actor(user), before: preview.before, after: preview.after, policy: preview.policy_name };
    });
    audit(user, 'remediation.right_size', `Right-sized ${i.name} to what it uses: blast radius ${preview.before.resources} → ${preview.after.resources} resources`, { target: i.arn });
    resolve((e) => e.identity?.id === i.id && ['ec2', 'agent'].includes(e.scenario), { label: i.name === 'support-copilot-agent' ? 'Contained: restricted to its baseline' : 'Right-sized to least privilege', at: new Date().toISOString(), by: user.full_name });
    return ok({ ...insights(i), applied: preview });
  });

  r.post('/api/v1/response/keys/:id/deactivate', ({ params, user }) => {
    if (!can(user, 'operate') && !can(user, 'integrations')) return fail(403, 'Your role cannot change access.', 'FORBIDDEN');
    const key = credentialById(params.id);
    if (!key || key.credential_type !== 'access_key') return fail(404, 'That access key no longer exists.', 'NOT_FOUND');
    const before = blastSummary(key.arn);
    mutate((st) => {
      st.keys[key.id] = { ...actor(user), before };
    });
    const owner = identitiesOf(key)[0];
    audit(user, 'credential.deactivate', `Deactivated access key ${key.access_key_id} of ${owner?.name ?? 'an IAM user'}`, { target: key.arn });
    resolve((e) => e.facts?.credential_id === key.id || (e.kind === 'exposure' && e.identity?.id === owner?.id), { label: 'Key deactivated', at: new Date().toISOString(), by: user.full_name });
    return ok({ credential_id: key.id, status: 'inactive', before, after: blastSummary(key.arn), insights: owner ? insights(owner) : null });
  });

  r.post('/api/v1/response/links/break', ({ body, user }) => {
    if (!can(user, 'operate') && !can(user, 'integrations')) return fail(403, 'Your role cannot change access.', 'FORBIDDEN');
    const link = linkById(String(body?.link_id ?? ''));
    if (!link || link.kind !== 'assume') return fail(404, 'That trust relationship no longer exists.', 'NOT_FOUND');
    mutate((st) => {
      st.broken[link.id] = actor(user);
    });
    audit(user, 'remediation.trust', `Removed ${link.from.name} from the trust policy of ${link.to.name}`, { target: link.to.arn });
    resolve((e) => e.scenario === 'chain' || e.identity?.id === link.from.id && e.title?.includes(link.to.name), { label: 'Escalation path closed', at: new Date().toISOString(), by: user.full_name });
    return ok({ link_id: link.id, from: insights(link.from) });
  });

  r.get('/api/v1/response/credentials/:id', ({ params }) => {
    const c = credentialById(params.id);
    if (!c || !visible(c)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    const owner = c.__base?.bound?.length ? estate().identities.find((i) => i.id === c.__base.bound[0]) : null;
    const grants = c.credential_type === 'iam_role' ? grantsForPrincipal(c.name) : [];
    const idle = Math.max(0, Math.round((Date.now() - Date.parse(c.last_used_at)) / 86400000));
    return ok({
      credential_id: c.id,
      name: c.name,
      orphaned: c.is_orphaned,
      orphaned_by: c.orphaned_by,
      unused_days: idle,
      owner: owner ? { name: owner.owner_name, email: owner.owner, team: owner.owner_team, created_by: owner.created_by, workload: owner.name } : null,
      access: grants.map((g) => ({ actions: g.actions, resource: g.targets.map((t) => t.name).join(', ') || g.resource_spec, data: g.targets[0]?.data ?? null })),
      can_delete: c.credential_type === 'iam_role' && c.is_orphaned,
    });
  });

  r.post('/api/v1/response/credentials/:id/delete', ({ params, user }) => {
    if (!can(user, 'operate') && !can(user, 'integrations')) return fail(403, 'Your role cannot change access.', 'FORBIDDEN');
    const c = credentialById(params.id);
    if (!c) return fail(404, 'That role no longer exists.', 'NOT_FOUND');
    if (!c.is_orphaned) return fail(409, 'Something still uses this role. Remove it from its workload first.', 'IN_USE');
    mutate((st) => {
      st.deletedCreds[c.id] = actor(user);
    });
    audit(user, 'credential.delete', `Deleted orphaned role ${c.name}`, { target: c.arn });
    resolve((e) => e.facts?.credential_id === c.id, { label: 'Role deleted', at: new Date().toISOString(), by: user.full_name });
    return ok({ deleted: c.id });
  });

  r.get('/api/v1/scenarios', () => {
    const facts = scenarioFacts();
    return ok({ scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({ key, ...s, ...scenarioState()[key], facts: facts[key] ?? {} })) });
  });

  r.post('/api/v1/scenarios/:key/run', ({ params, user }) => {
    if (!SCENARIOS[params.key]) return fail(404, 'Unknown scenario.', 'NOT_FOUND');
    if (scenario(params.key)) resetScenario(params.key);
    runScenario(params.key, user);
    return ok({ scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({ key, ...s, ...scenarioState()[key] })) });
  });

  /* While a scenario is presented, background detections wait (for everyone). */
  r.post('/api/v1/scenarios/presenting', ({ body }) => {
    const seconds = Math.max(0, Math.min(300, Number(body?.seconds) || 0));
    mutate((st) => {
      st.presenting = seconds ? { until: Date.now() + seconds * 1000 } : null;
    });
    return ok({ presenting: Boolean(seconds) });
  });

  r.post('/api/v1/scenarios/:key/reset', ({ params }) => {
    const keys = params.key === 'all' ? Object.keys(SCENARIOS) : [params.key];
    for (const k of keys) if (SCENARIOS[k]) resetScenario(k);
    return ok({ scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({ key, ...s, ...scenarioState()[key] })) });
  });
}
