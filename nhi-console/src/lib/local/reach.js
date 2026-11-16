/*
 * Reach: the access graph, blast radius and who-can-assume, all computed
 * from the entitlement model (entitlements.js) and the activity it produces
 * (world.js eventsOf), so the three always agree with Permissions, Activity,
 * Posture and NHI Genome.
 */
import { enabledProviders } from './apps';
import { estate } from './seed';
import { credentialsOf, eventsOf, identitiesOf, identityByArn, credentialByArn, visible, scopeSettings } from './world';
import { dataScore, grantsOf, linksFrom, linksTo, resolveResource, sharedRoleOf, storedTarget } from './entitlements';

const ACCOUNT_NAME = { '482915736104': 'prod-core', '739204185562': 'data-platform', '215660394871': 'staging' };
const SERVICE_PRINCIPAL = {
  lambda_function: 'lambda.amazonaws.com',
  ecs_task: 'ecs-tasks.amazonaws.com',
  eks_pod: 'pods.eks.amazonaws.com',
  batch_job: 'ecs-tasks.amazonaws.com',
  ec2_instance: 'ec2.amazonaws.com',
  codepipeline: 'codepipeline.amazonaws.com',
  codebuild_project: 'codebuild.amazonaws.com',
  step_function: 'states.amazonaws.com',
  bedrock_agent: 'bedrock.amazonaws.com',
  glue_job: 'glue.amazonaws.com',
  emr_cluster: 'elasticmapreduce.amazonaws.com',
  sagemaker_notebook: 'sagemaker.amazonaws.com',
  sagemaker_endpoint: 'sagemaker.amazonaws.com',
};

/* ── Scope ─────────────────────────────────────────────────────────────── */
function resourceVisible(res) {
  if (!res) return false;
  if (res.identity_id) return visible(estate().identities.find((i) => i.id === res.identity_id));
  if (res.credential_id) return visible(estate().credentials.find((c) => c.id === res.credential_id));
  if (!enabledProviders().includes(res.provider) && res.provider !== 'jenkins') return false;
  if (res.provider === 'jenkins' && !enabledProviders().includes('jenkins')) return false;
  const { accounts } = scopeSettings();
  return !accounts.length || accounts.includes(res.account_id);
}

/* ── What an identity was seen doing, by resource ──────────────────────── */
const observedCache = new Map();
function observed(identity) {
  if (observedCache.has(identity.id)) return observedCache.get(identity.id);
  const map = new Map();
  for (const e of eventsOf(identity)) {
    if (e.error_code || !e.resource_arn) continue;
    const arn = e.resource_arn.startsWith('arn:aws:s3:::') ? e.resource_arn.split('/')[0] : e.resource_arn;
    const hit = map.get(arn);
    if (hit) hit.count += 1;
    else map.set(arn, { count: 1, last: e.event_time, action: e.action });
  }
  observedCache.set(identity.id, map);
  return map;
}

/* The node an identity's permissions hang from: its role, when it runs as one. */
function carrierOf(identity) {
  if (identity.provider !== 'aws') return identity.arn;
  const role = credentialsOf(identity).find((c) => c.credential_type === 'iam_role');
  return role && role.arn !== identity.arn ? role.arn : identity.arn;
}

const shortType = (res) => {
  if (res.data === 'Secrets' && /Secret|KV|Path/.test(res.type)) return 'secret';
  if (/KMS|Transit/.test(res.type)) return 'key';
  return String(res.type ?? '').split('::').pop().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
};

/* ── Access graph ──────────────────────────────────────────────────────── */
function builder(focusArn) {
  const nodes = new Map();
  const edges = new Map();
  const node = (arn, type, label, extra = {}) => {
    if (!arn || nodes.has(arn)) return;
    nodes.set(arn, { id: arn, arn, type, node_type: type, label, name: label, subtype: extra.subtype ?? null, provider: extra.provider ?? null, is_focus: arn === focusArn, ...extra });
  };
  const edge = (source, target, type, extra = {}) => {
    if (!source || !target || source === target) return;
    const id = `${source}|${target}|${type}`;
    if (!edges.has(id)) edges.set(id, { id, source, target, edge_type: type, type, label: extra.label ?? type, last_observed_at: extra.last ?? null, call_count: extra.count ?? null, ...extra });
  };
  const identityNode = (i) => node(i.arn, 'identity', i.name, { subtype: i.identity_type, provider: i.provider, account_id: i.account_id });
  const credNode = (c) => node(c.arn, 'credential', c.name, { subtype: c.credential_type, provider: c.provider, account_id: c.account_id });
  const resourceNode = (res) => {
    if (res.identity_id) return identityNode(estate().identities.find((i) => i.id === res.identity_id));
    if (res.credential_id) return credNode(estate().credentials.find((c) => c.id === res.credential_id));
    return node(res.arn, 'resource', res.name, { subtype: res.type, provider: res.provider, data_class: res.data, account_id: res.account_id });
  };
  return { nodes, edges, node, edge, identityNode, credNode, resourceNode };
}

/** Grants of an identity drawn from `from`: named resources, wildcards as one node. */
function drawGrants(b, identity, from) {
  const seen = observed(identity);
  for (const g of grantsOf(identity)) {
    if (g.resource_spec === '*' || g.wildcard) {
      const account = identity.account_id;
      const svc = g.resource_spec.slice(4);
      const where = ACCOUNT_NAME[account] ?? account;
      const label = g.resource_spec === '*' ? `Every resource in ${where}` : svc === 'iam' ? `Every IAM role in ${where}` : `Every ${{ dynamodb: 'DynamoDB table', s3: 'S3 bucket', sns: 'SNS topic', ec2: 'EC2 instance', cloudformation: 'CloudFormation stack', 'vault-kv': 'Vault KV path' }[svc] ?? `${svc} resource`} in ${where}`;
      const arn = identity.provider === 'aws' ? `arn:aws:${g.resource_spec === '*' ? '*' : g.resource_spec.slice(4)}:*:${account}:*` : `${identity.arn.split('/')[0]}//${account}/*${g.resource_spec.slice(4)}`;
      b.node(arn, 'resource', label, { subtype: g.resource_spec === '*' ? 'AdministratorAccess' : `${g.resource_spec.slice(4)}:*`, provider: identity.provider, wildcard: true, account_id: account });
      b.edge(from, arn, 'can_access', { label: g.actions.join(', ') });
      for (const res of g.seen_on) {
        if (!resourceVisible(res)) continue;
        const hit = seen.get(res.arn);
        b.resourceNode(res);
        b.edge(from, res.arn, hit ? 'accesses' : 'can_access', { label: hit?.action ?? g.actions[0], count: hit?.count ?? null, last: hit?.last ?? null });
      }
      continue;
    }
    for (const res of g.targets) {
      if (!resourceVisible(res)) continue;
      const hit = seen.get(res.arn);
      b.resourceNode(res);
      b.edge(from, res.arn, hit ? 'accesses' : 'can_access', { label: hit ? hit.action : g.actions.join(', '), count: hit?.count ?? null, last: hit?.last ?? null, is_write: g.level !== 'read' });
    }
  }
}

function drawTrust(b, credential, target) {
  if (!credential?.has_external_trust || !credential.external_principal) return;
  const p = credential.external_principal;
  if (p.startsWith('arn:')) {
    b.node(p, 'external', `Account ${p.split(':')[4]}`, { subtype: 'aws_account' });
    b.edge(p, target, 'cross_account', { label: 'trust policy allows sts:AssumeRole' });
  } else if (p.startsWith('repo:')) {
    const repo = `https://github.com/${p.slice(5).split(':')[0]}`;
    b.node(repo, 'resource', p.slice(5).split(':')[0], { subtype: 'GitHub::Repository', provider: 'github' });
    b.edge(repo, target, 'federated_oidc', { label: p });
  } else {
    const arn = `arn:aws:iam::${credential.account_id}:oidc-provider/${p}`;
    b.node(arn, 'external', p, { subtype: 'oidc_provider' });
    b.edge(arn, target, 'federated_oidc', { label: 'repo:deepalgo-labs/* (any branch)' });
  }
}

function drawLinks(b, identity) {
  const from = carrierOf(identity);
  for (const l of linksFrom(identity)) {
    if (!visible(l.to)) continue;
    b.identityNode(l.to);
    if (l.kind === 'assume') {
      b.edge(from, l.to.arn, 'assume_role', { label: l.why });
      if (l.to.account_id !== identity.account_id) b.edge(from, l.to.arn, 'cross_account', { label: `into ${ACCOUNT_NAME[l.to.account_id] ?? l.to.account_id}` });
    } else if (l.via) {
      b.credNode(l.via);
      b.edge(identity.arn, l.via.arn, 'uses');
      b.edge(l.via.arn, l.to.arn, 'signs_in_as', { label: l.why });
    } else b.edge(identity.arn, l.to.arn, 'signs_in_as', { label: l.why });
  }
  for (const l of linksTo(identity)) {
    if (l.fromKind === 'credential') {
      b.credNode(l.from);
      b.edge(l.from.arn, identity.arn, 'signs_in_as', { label: l.why });
      continue;
    }
    if (!visible(l.from) || l.via) continue;
    b.identityNode(l.from);
    b.edge(l.kind === 'assume' ? carrierOf(l.from) : l.from.arn, identity.arn, l.kind === 'assume' ? 'assume_role' : 'signs_in_as', { label: l.why });
    if (l.kind === 'assume' && l.from.account_id !== identity.account_id) b.edge(carrierOf(l.from), identity.arn, 'cross_account', { label: `from ${ACCOUNT_NAME[l.from.account_id] ?? l.from.account_id}` });
  }
}

function finish(b, focus) {
  const nodes = [...b.nodes.values()];
  const edges = [...b.edges.values()];
  const relationship_table = edges
    .filter((e) => e.source === focus || e.target === focus || nodes.find((n) => n.id === e.source)?.is_focus === false)
    .map((e) => {
      const inbound = e.target === focus;
      const other = nodes.find((n) => n.id === (inbound ? e.source : e.target));
      return { direction: inbound ? 'inbound' : 'outbound', relationship: e.edge_type, target_arn: other?.arn, target_name: other?.label ?? other?.arn, detail: e.call_count ? `${e.label} · ${e.call_count} calls` : e.label };
    });
  return { graph: { nodes, edges }, nodes, edges, relationship_table, depth: 1, truncated: false, activity_data_available: true };
}

/** One identity's neighbourhood: what it runs as, can reach and can become. */
export function identityGraph(identity) {
  const b = builder(identity.arn);
  b.identityNode(identity);
  const carrier = carrierOf(identity);
  for (const c of credentialsOf(identity)) {
    if (c.arn === identity.arn) {
      drawTrust(b, c, identity.arn);
      continue;
    }
    b.credNode(c);
    const bound = ['iam_role', 'managed_identity'].includes(c.credential_type);
    b.edge(identity.arn, c.arn, bound ? 'bound_to' : 'uses', { label: bound ? 'runs as' : 'signs in with' });
    drawTrust(b, c, c.arn);
    if (c.credential_type === 'iam_role') {
      for (const other of identitiesOf(c).filter((x) => x.id !== identity.id && visible(x))) {
        b.identityNode(other);
        b.edge(other.arn, c.arn, 'bound_to', { label: 'also runs as' });
      }
    }
    const stored = c.credential_type === 'jenkins_credential' ? storedTarget(c) : null;
    if (stored?.resource && resourceVisible(stored.resource)) {
      b.resourceNode(stored.resource);
      b.edge(c.arn, stored.resource.arn, 'signs_in_as', { label: 'opens' });
    }
  }
  const service = identity.provider === 'aws' ? SERVICE_PRINCIPAL[identity.identity_type] : null;
  if (service && carrier !== identity.arn) {
    b.node(service, 'service', service, { subtype: 'aws_service' });
    b.edge(service, carrier, 'service_trust', { label: 'trust policy' });
  }
  drawGrants(b, identity, carrier);
  drawLinks(b, identity);
  const creator = identity.created_by && estate().identities.find((i) => i.name === identity.created_by && i.account_id === identity.account_id);
  if (creator && visible(creator)) {
    b.identityNode(creator);
    b.edge(creator.arn, identity.arn, 'created_by', { label: 'created it' });
  }
  return finish(b, identity.arn);
}

/** Who can read a secret, and from where. */
function readersOf(credential) {
  const out = [];
  for (const i of estate().identities) {
    if (!visible(i)) continue;
    for (const g of grantsOf(i)) {
      if (g.targets.some((t) => t.credential_id === credential.id)) {
        out.push({ identity: i, grant: g });
        break;
      }
    }
  }
  return out;
}

/** One credential's neighbourhood. */
export function credentialGraph(credential) {
  const same = identityByArn(credential.arn);
  if (same) return identityGraph(same);
  const b = builder(credential.arn);
  b.credNode(credential);
  const owners = identitiesOf(credential).filter(visible);
  for (const o of owners) {
    b.identityNode(o);
    const bound = ['iam_role', 'managed_identity'].includes(credential.credential_type);
    b.edge(o.arn, credential.arn, bound ? 'bound_to' : 'uses', { label: bound ? 'runs as' : 'signs in with' });
  }
  drawTrust(b, credential, credential.arn);
  if (credential.credential_type === 'iam_role' && owners[0]) {
    const service = SERVICE_PRINCIPAL[owners[0].identity_type];
    if (service) {
      b.node(service, 'service', service, { subtype: 'aws_service' });
      b.edge(service, credential.arn, 'service_trust', { label: 'trust policy' });
    }
    drawGrants(b, owners[0], credential.arn);
    for (const o of owners) {
      for (const l of linksFrom(o).filter((x) => x.kind === 'assume' && visible(x.to))) {
        b.identityNode(l.to);
        b.edge(credential.arn, l.to.arn, 'assume_role', { label: l.why });
      }
    }
  }
  if (credential.credential_type === 'secret') {
    const seen = new Map();
    for (const { identity, grant } of readersOf(credential)) {
      const from = carrierOf(identity);
      if (from !== identity.arn) {
        b.identityNode(identity);
        b.node(from, 'credential', from.split('/').pop(), { subtype: 'iam_role', provider: 'aws' });
        b.edge(identity.arn, from, 'bound_to', { label: 'runs as' });
      } else b.identityNode(identity);
      const hit = observed(identity).get(credential.arn);
      if (!seen.has(from)) b.edge(from, credential.arn, hit ? 'accesses' : 'can_access', { label: hit ? hit.action : grant.actions.join(', '), count: hit?.count ?? null, last: hit?.last ?? null });
      seen.set(from, true);
    }
  }
  const stored = storedTarget(credential);
  if (stored?.identity && visible(stored.identity)) {
    b.identityNode(stored.identity);
    b.edge(credential.arn, stored.identity.arn, 'signs_in_as', { label: stored.why });
  } else if (stored?.resource && resourceVisible(stored.resource)) {
    b.resourceNode(stored.resource);
    b.edge(credential.arn, stored.resource.arn, 'signs_in_as', { label: 'opens' });
  }
  return finish(b, credential.arn);
}

/* ── Blast radius ──────────────────────────────────────────────────────── */
const SERVICE_KEY = { 'vault-kv': 'vault', 'vault-transit': 'vault', 'vault-db': 'vault', 'vault-sys': 'vault' };

function subjectOf(arn) {
  const identity = identityByArn(arn);
  if (identity) return { start: identity, name: identity.name, type: identity.identity_type, provider: identity.provider };
  const cred = credentialByArn(arn);
  if (!cred) return null;
  const stored = cred.credential_type === 'jenkins_credential' ? storedTarget(cred) : null;
  if (stored?.identity) return { start: stored.identity, name: cred.name, type: cred.credential_type, provider: cred.provider, via: cred, storedHop: true };
  const owner = identitiesOf(cred)[0];
  if (!owner) return { start: null, name: cred.name, type: cred.credential_type, provider: cred.provider, external: stored?.resource ?? null };
  return { start: owner, name: cred.name, type: cred.credential_type, provider: cred.provider, cred };
}

function score(res, level, hops, seen) {
  const base = dataScore(res.data) + (level === 'admin' ? 0.8 : level === 'write' ? 0.5 : 0) - 0.45 * Math.max(0, hops - 1) + (seen ? 0.2 : 0);
  return Math.round(Math.max(0.5, Math.min(10, base)) * 10) / 10;
}

export function blastRadius(arn) {
  const subject = subjectOf(arn);
  if (!subject) return null;
  if (subject.start && !visible(subject.start)) return null;
  const resources = new Map();
  const counts = new Map();
  const roles = [];
  const visited = new Set();
  const queue = [];
  if (subject.start) {
    queue.push({ identity: subject.start, path: subject.storedHop ? [arn, subject.start.arn] : [arn] });
    visited.add(subject.start.id);
  } else if (subject.external && resourceVisible(subject.external)) {
    const res = subject.external;
    resources.set(res.arn, { arn: res.arn, name: res.name, service: res.service, type: shortType(res), data_class: res.data, score: score(res, 'write', 1, false), hops: 1, path_arns: [arn, res.arn], wildcard: false, observed_activity: false, access_level: 'write', actions: [] });
  }
  if (subject.storedHop) roles.push({ arn: subject.start.arn, name: subject.start.name, provider: subject.start.provider, path_arns: [arn, subject.start.arn], how: 'signs_in_as' });

  while (queue.length) {
    const { identity, path } = queue.shift();
    const seen = observed(identity);
    for (const g of grantsOf(identity)) {
      for (const res of g.targets) {
        if (!resourceVisible(res) || res.identity_id === identity.id) continue;
        const hit = seen.has(res.arn);
        const hops = path.length;
        const entry = {
          arn: res.arn,
          name: res.name,
          service: SERVICE_KEY[res.service] ?? res.service,
          type: shortType(res),
          data_class: res.data,
          score: score(res, g.level, hops, hit),
          hops,
          path_arns: [...path, res.arn],
          wildcard: g.wildcard,
          observed_activity: hit,
          access_level: g.level,
          actions: g.actions,
          via_identity: identity.name,
        };
        counts.set(res.arn, (counts.get(res.arn) ?? 0) + 1);
        const prev = resources.get(res.arn);
        if (!prev || prev.hops > entry.hops || (prev.hops === entry.hops && prev.score < entry.score)) resources.set(res.arn, entry);
      }
    }
    if (path.length >= 5) continue;
    for (const l of linksFrom(identity)) {
      if (visited.has(l.to.id) || !visible(l.to)) continue;
      visited.add(l.to.id);
      const next = [...path, ...(l.via ? [l.via.arn] : []), l.to.arn];
      roles.push({ arn: l.to.arn, name: l.to.name, provider: l.to.provider, path_arns: next, how: l.kind, why: l.why });
      queue.push({ identity: l.to, path: next });
    }
  }

  const list = [...resources.values()].sort((a, b) => b.score - a.score || a.hops - b.hops);
  const sourceAccount = subject.start?.account_id ?? subject.cred?.account_id ?? null;
  const nameOf = (a) => estate().identities.find((i) => i.arn === a)?.name ?? estate().credentials.find((c) => c.arn === a)?.name ?? resources.get(a)?.name ?? a.split(/[/:]/).pop();
  const paths = list.map((r) => {
    const chain = r.path_arns.slice(1);
    const steps = chain.map((to, i) => ({ edge_type: i === chain.length - 1 ? 'CAN_USE' : 'CAN_ASSUME', to_arn: to, evidence: i === chain.length - 1 ? (r.observed_activity ? 'observed' : 'policy') : 'policy' }));
    const between = chain.slice(0, -1).map(nameOf);
    const what = r.actions.includes('*') ? 'has full administrative access to' : `may ${r.actions.slice(0, 2).join(' and ')}${r.actions.length > 2 ? ` (+${r.actions.length - 2} more)` : ''} on`;
    const description = `${subject.name}${between.length ? ` can become ${between.join(', then ')}, which` : ''} ${what} ${r.name}.`;
    const limitations = [];
    if (r.path_arns.some((a) => /^arn:aws:[^:]*:[^:]*:(\d{12}):/.exec(a)?.[1] && /^arn:aws:[^:]*:[^:]*:(\d{12}):/.exec(a)[1] !== sourceAccount)) limitations.push('crosses_account_boundary');
    if (!r.observed_activity) limitations.push('does_not_prove_access_happened');
    if (r.wildcard) limitations.push('wildcard_resource_grant');
    return { target_arn: r.arn, path_description: description, hops: steps, limitations };
  });
  const top = list[0]?.score ?? 0;
  const crossAccounts = new Set(list.map((r) => /^arn:aws:[^:]*:[^:]*:(\d{12}):/.exec(r.arn)?.[1]).filter((a) => a && a !== sourceAccount));
  const total = list.length ? Math.min(10, top * 0.72 + Math.log2(1 + list.length) * 0.42 + (crossAccounts.size ? 0.4 : 0) + (roles.length ? 0.3 : 0)) : 0;
  const blast = Math.round(total * 10) / 10;
  const risk = blast >= 8 ? 'CRITICAL' : blast >= 6.5 ? 'HIGH' : blast >= 4 ? 'MEDIUM' : blast > 0 ? 'LOW' : 'NONE';
  const byService = {};
  for (const r of list) byService[r.service] = (byService[r.service] ?? 0) + 1;
  return {
    source_arn: arn,
    source_name: subject.name,
    subject: { arn, name: subject.name, type: subject.type, provider: subject.provider },
    risk_level: risk,
    blast_radius_score: blast,
    secrets_access: list.some((r) => r.type === 'secret' || r.type === 'key'),
    converging_paths: [...counts.values()].some((n) => n > 1),
    reachable_resources: list,
    reachable_identities: roles,
    reach_by_service: Object.entries(byService).map(([service, resources]) => ({ service, resources })).sort((a, b) => b.resources - a.resources),
    paths,
    summary: { resources: list.length, sensitive: list.filter((r) => ['Secrets', 'PCI', 'PII'].includes(r.data_class)).length, write: list.filter((r) => r.access_level !== 'read').length, admin: list.some((r) => r.access_level === 'admin'), accounts: 1 + crossAccounts.size },
    resources: list.map((r) => ({ ...r, resource_arn: r.arn, resource_type: r.type, sensitive: ['Secrets', 'PCI', 'PII'].includes(r.data_class) })),
    computed_at: new Date().toISOString(),
  };
}

/* ── Who can become an identity ────────────────────────────────────────── */
export function whoCanAssume(arn) {
  const cred = credentialByArn(arn);
  const target = identityByArn(arn) ?? (cred ? identitiesOf(cred)[0] : null);
  if (!target) return { principals: [], callers: [], paths: [], public_trust: false };
  const principals = [];
  const add = (kind, value, same) => {
    if (!principals.some((p) => p.kind === kind && p.value === value)) principals.push({ kind, value, same_account: same });
  };
  const roleCred = cred ?? credentialsOf(target).find((c) => c.credential_type === 'iam_role');
  if (roleCred?.has_external_trust && roleCred.external_principal) {
    const p = roleCred.external_principal;
    add(p.startsWith('arn:') ? 'account' : 'federated', p, false);
  }
  const holders = cred ? identitiesOf(cred) : [target];
  for (const h of holders) {
    const service = SERVICE_PRINCIPAL[h.identity_type];
    if (service) add('service', service, true);
  }
  for (const l of linksTo(target)) {
    if (l.fromKind === 'credential') {
      add('role', l.from.arn, false);
      continue;
    }
    add(l.from.identity_type?.startsWith('iam_user') ? 'user' : 'role', l.from.arn, l.from.account_id === target.account_id);
  }
  /* Further back: who can become the ones that can become it. */
  const callers = [];
  const queue = [{ identity: target, path: [target.arn] }];
  const seen = new Set([target.id]);
  while (queue.length) {
    const { identity, path } = queue.shift();
    if (path.length > 3) continue;
    for (const l of linksTo(identity)) {
      if (l.fromKind !== 'identity' || seen.has(l.from.id)) continue;
      seen.add(l.from.id);
      const next = [l.from.arn, ...path];
      callers.push({ arn: l.from.arn, name: l.from.name, path: next, hops: next.length - 1 });
      queue.push({ identity: l.from, path: next });
    }
    if (identity !== target) {
      const rc = credentialsOf(identity).find((c) => c.credential_type === 'iam_role');
      if (rc?.has_external_trust && rc.external_principal && !seen.has(rc.external_principal)) {
        seen.add(rc.external_principal);
        const next = [rc.external_principal, ...path];
        callers.push({ arn: rc.external_principal, name: rc.external_principal, path: next, hops: next.length - 1 });
      }
    }
  }
  return { principals, callers, paths: callers.map((c) => c.path), public_trust: false, target: { arn: target.arn, name: target.name } };
}

/** What an identity signs in with, for the blast radius picker. */
export function blastSubjects(identity) {
  const role = credentialsOf(identity).find((c) => c.credential_type === 'iam_role' && c.arn !== identity.arn);
  const out = [];
  if (role) out.push({ arn: role.arn, name: role.name, credential_type: 'iam_role', type: 'iam_role', provider: 'aws', shared: Boolean(sharedRoleOf(identity)) });
  else out.push({ arn: identity.arn, name: identity.name, credential_type: identity.identity_type?.startsWith('iam_user') ? 'iam_user' : identity.identity_type === 'iam_role' ? 'iam_role' : '', type: identity.identity_type, provider: identity.provider });
  for (const c of credentialsOf(identity)) {
    if (c.credential_type === 'jenkins_credential' && storedTarget(c)) out.push({ arn: c.arn, name: c.name, credential_type: 'stored', type: c.credential_type, provider: c.provider });
  }
  return out;
}

export { resolveResource };

/** Trust and sign-in relationships across what is in scope, for the dashboard. */
export function trustEdgeCounts() {
  const ids = estate().identities.filter(visible);
  const out = { service: 0, cross_account: 0, oidc: 0, chaining: 0, signs_in_as: 0 };
  const roles = new Set();
  for (const i of ids) {
    const role = credentialsOf(i).find((c) => c.credential_type === 'iam_role');
    if (role && !roles.has(role.id)) {
      roles.add(role.id);
      if (SERVICE_PRINCIPAL[i.identity_type] && role.arn !== i.arn) out.service += 1;
      if (role.has_external_trust) out[String(role.external_principal).startsWith('arn:') ? 'cross_account' : 'oidc'] += 1;
    }
    for (const c of credentialsOf(i)) if (c.credential_type === 'federated_credential' && c.has_external_trust) out.oidc += 1;
    for (const l of linksFrom(i)) {
      if (!visible(l.to)) continue;
      if (l.kind === 'assume') out[l.to.account_id !== i.account_id ? 'cross_account' : 'chaining'] += 1;
      else out.signs_in_as += 1;
    }
  }
  return out;
}
