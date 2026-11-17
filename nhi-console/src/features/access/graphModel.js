import { arnResource, humanizeToken } from '../../lib/format';

/**
 * The access graph's vocabulary and its pure graph maths.
 *
 * ── Where the graph comes from ───────────────────────────────────────────────
 * The discovery service answers one node's neighbourhood at a time
 * (`?tab=relationships`), naming every node by ARN. Edges come from two
 * stores: trust and binding edges from Postgres (`trust_edges`, written by
 * discovery from trust policies and service bindings), and `accesses` /
 * `created_by` edges from CloudTrail events in ClickHouse. The service prunes
 * both to the caller's saved accounts and regions.
 *
 * Every neighbourhood fetched is merged into one store (`createStore`,
 * `mergeRelationships`), and what is drawn is computed from that store by
 * `buildNeighbourhood`: the focus, plus the next hop of every node the reader
 * opened, each hop capped to a budget with the rest folded behind a count.
 */

/* ── Vocabulary ───────────────────────────────────────────────────────────── */

/**
 * Node kinds. MAIN types nodes as identity | credential | resource | unknown;
 * `unknown` is split by what its ARN says it is, so an account principal or a
 * federation provider is not labelled as a resource.
 */
export const NODE_KINDS = {
  identity: {
    label: 'Identity',
    plural: 'Identities',
    description: 'A workload, service or automation that acts in your AWS accounts: a function, a task, an instance, a pipeline, an IAM user.',
  },
  policy: {
    label: 'Policy',
    plural: 'Policies',
    description: 'A permissions policy: attached to the role an identity runs as, or directly to the identity. Everything it allows is what the identity can reach.',
  },
  credential: {
    label: 'Credential',
    plural: 'Credentials',
    description: 'What an identity signs in with: an IAM role, an access key, a secret.',
  },
  resource: {
    label: 'Resource',
    plural: 'Resources',
    description: 'Something an identity used, as recorded in the AWS activity log (CloudTrail).',
  },
  account: {
    label: 'Account',
    plural: 'Accounts',
    description: 'A whole AWS account, allowed to use a role by its trust policy.',
  },
  federated: {
    label: 'Company sign-in',
    plural: 'Company sign-ins',
    description: 'A company single sign-on (SAML) or web identity (OIDC) provider that people or pipelines sign in through.',
  },
  service: {
    label: 'AWS service',
    plural: 'AWS services',
    description: 'An AWS service, such as EC2 or Lambda, that may use a role on its own behalf.',
  },
  other: {
    label: 'Not in your inventory',
    plural: 'Others',
    description: 'Something named by an AWS address (ARN) that discovery has no record of in your current scope.',
  },
};

/**
 * Edge groups: how an edge is drawn and listed in the legend. Every edge kind
 * belongs to exactly one, so the legend names every line the canvas can draw.
 */
export const EDGE_GROUPS = {
  uses: { label: 'Uses', description: 'The credential an identity runs as (instance profile, execution role, task role).' },
  trust: { label: 'Allowed to use or switch to', description: "Set up in a role's trust policy: who may take on (assume) the role." },
  observed: { label: 'Seen in the activity log', description: 'Calls recorded by the AWS activity log (CloudTrail) in the last 90 days.' },
  crossAccount: { label: 'Reaches another AWS account', description: 'Either end is in a different AWS account.' },
};

/**
 * MAIN edge types, as the console names them.
 *
 * `label` reads from the source's side ("A <label> B"), `inbound` from the
 * target's ("B <inbound> A"). `weight` picks the edge a pair of nodes is drawn
 * as when several connect them. `observed` marks edges that come from
 * CloudTrail calls rather than from configuration. No edge type is an
 * escalation: the service does not compute escalation paths, so the graph
 * does not claim any. A cross-account edge is the one real risk signal an
 * edge carries, and it is drawn as such.
 */
export const EDGE_KINDS = {
  cross_account: {
    label: 'Can switch to a role in another account',
    inbound: 'Can be used from another account by',
    group: 'trust',
    tone: 'high',
    weight: 7,
    description: 'Can take on (assume) a role in a different AWS account.',
  },
  assume_role: {
    label: 'Can switch to (assume)',
    short: 'can assume',
    inbound: 'Can be assumed by',
    group: 'trust',
    tone: 'high',
    weight: 6,
    description: "The role's trust policy lets this principal take on the role's permissions.",
  },
  federated_oidc: {
    label: 'Lets pipelines sign in through web identity (OIDC)',
    inbound: 'Signed in through web identity (OIDC) by',
    group: 'trust',
    tone: 'high',
    weight: 6,
    description: 'People or pipelines signed in through an OIDC provider may use this role.',
  },
  federated_saml: {
    label: 'Lets people sign in through company single sign-on (SAML)',
    inbound: 'Signed in through company single sign-on (SAML) by',
    group: 'trust',
    tone: 'high',
    weight: 6,
    description: 'People signed in through company single sign-on may use this role.',
  },
  pass_role: {
    label: 'Can hand a role to a service',
    inbound: 'Can be handed to a service by',
    group: 'trust',
    tone: 'medium',
    weight: 5,
    description: 'Can give this role to an AWS service (iam:PassRole), which then acts with its permissions.',
  },
  trusts: {
    label: 'Named in the trust policy of',
    inbound: 'Trust policy names',
    group: 'trust',
    tone: 'medium',
    weight: 5,
    description: "The role's trust policy names this principal.",
  },
  service_trust: {
    label: 'AWS service may use',
    inbound: 'May be used by the AWS service',
    group: 'trust',
    tone: 'neutral',
    weight: 4,
    description: 'An AWS service, such as EC2, may use the role on its own behalf.',
  },
  has_policy: {
    label: 'Policy attached',
    short: 'policy attached',
    inbound: 'Attached to',
    group: 'uses',
    tone: 'info',
    weight: 4,
    flow: true,
    description: 'A permissions policy attached to this role or identity. What the policy allows, the identity can do.',
  },
  bound_to: {
    label: 'Uses',
    short: 'runs as',
    flow: true,
    inbound: 'Used by',
    group: 'uses',
    tone: 'info',
    weight: 4,
    description: 'The credential this identity runs as (instance profile, execution role, task role).',
  },
  uses: { label: 'Uses', short: 'signs in with', flow: true, inbound: 'Used by', group: 'uses', tone: 'info', weight: 3, description: 'Uses this credential.' },
  signs_in_as: {
    label: 'Signs in as',
    inbound: 'Signed in to by',
    group: 'uses',
    tone: 'high',
    weight: 5,
    description: 'Authenticates as this identity: a Vault AppRole or Kubernetes login, an Entra workload identity, or a CI credential that holds its key.',
  },
  can_access: {
    label: 'Allowed to use',
    short: 'allows',
    inbound: 'Can be used by',
    group: 'trust',
    tone: 'neutral',
    weight: 2,
    description: 'A policy allows this, but the activity log has not shown it being used.',
  },
  attached_to: { label: 'Attached to', inbound: 'Has attached', group: 'uses', tone: 'neutral', weight: 3, description: 'Attached to this principal.' },
  manages: { label: 'Manages', inbound: 'Managed by', group: 'uses', tone: 'neutral', weight: 3, description: 'Manages this resource.' },
  contains: { label: 'Contains', inbound: 'Inside', group: 'uses', tone: 'neutral', weight: 2, description: 'Contains this resource.' },
  accesses: {
    label: 'Called',
    short: 'used',
    inbound: 'Called by',
    group: 'observed',
    tone: 'info',
    weight: 2,
    observed: true,
    description: 'Successful calls against this resource, recorded by the AWS activity log (CloudTrail).',
  },
  created_by: {
    label: 'Created by',
    inbound: 'Created',
    group: 'observed',
    tone: 'neutral',
    weight: 1,
    observed: true,
    description: 'Who the AWS activity log (CloudTrail) records as having created it.',
  },
};

export function edgeKindMeta(type) {
  const label = humanizeToken(type || 'related');
  return EDGE_KINDS[type] ?? { label, inbound: `${label} (from)`, group: 'trust', tone: 'neutral', weight: 0, description: '' };
}

/** An edge's plain label from one end's side: 'out' reads source -> target. */
export function edgeLabel(type, direction = 'out') {
  const meta = edgeKindMeta(type);
  return direction === 'in' ? meta.inbound : meta.label;
}

/** How many neighbours a hop shows before folding, and how many a click on the fold adds. */
export const VISIBLE_PER_GROUP = 3;
export const REVEAL_STEP = 2;

/* ── ARN helpers ─────────────────────────────────────────────────────────── */

export function accountOf(arn) {
  const parts = String(arn ?? '').split(':');
  return parts.length >= 5 && /^\d{12}$/.test(parts[4]) ? parts[4] : '';
}

function kindFromApi(type, arn) {
  if (type === 'identity' || type === 'credential' || type === 'resource' || type === 'service' || type === 'policy') return type;
  const value = String(arn ?? '');
  if (/^arn:aws[\w-]*:iam::\d{12}:root$/.test(value)) return 'account';
  if (/:(oidc-provider|saml-provider)\//.test(value)) return 'federated';
  if (!value.startsWith('arn:') && value.endsWith('.amazonaws.com')) return 'service';
  return 'other';
}

/** The name a node is drawn with. Resource names from CloudTrail are the ARN's
    last segment ("42" for a task definition), so the resource path is used. */
function displayName(kind, name, arn) {
  if (kind === 'account') return `Account ${accountOf(arn)}`;
  if (kind === 'resource' || kind === 'other') {
    const path = arnResource(arn);
    return path && path !== '-' ? path : name || arn;
  }
  return name || arnResource(arn) || arn;
}

/** A short type label for the node's second line, from MAIN's subtype. */
export function subtypeLabel(kind, subtype) {
  if (!subtype) return '';
  if (kind === 'resource' && /^[A-Za-z]+::/.test(subtype)) {
    return subtype.split('::').slice(1).join(' ');
  }
  if (kind === 'other') return subtype.replace(':', ' ');
  return humanizeToken(subtype)
    .replace(/\bIam\b/g, 'IAM')
    .replace(/\bEc2\b/g, 'EC2')
    .replace(/\bEcs\b/g, 'ECS')
    .replace(/\bTls\b/g, 'TLS')
    .replace(/\bSsh\b/g, 'SSH')
    .replace(/\bApi\b/g, 'API');
}

/* ── The store ───────────────────────────────────────────────────────────── */

/**
 * Everything learnt so far: node facts by ARN, raw edges by key, and which
 * ARNs have had their own neighbourhood read (`loaded`).
 */
export function createStore() {
  return { nodes: new Map(), edges: new Map(), loaded: new Set() };
}

const SPECIFICITY = { identity: 3, credential: 3, policy: 3, resource: 2, account: 1, federated: 1, service: 1, other: 0 };

export function mergeRelationships(store, ownerArn, response) {
  const graph = response?.graph ?? {};
  for (const node of graph.nodes ?? []) {
    if (!node?.arn) continue;
    const kind = kindFromApi(node.type, node.arn);
    const held = store.nodes.get(node.arn);
    if (held && SPECIFICITY[held.kind] > SPECIFICITY[kind]) continue;
    store.nodes.set(node.arn, {
      id: node.arn,
      arn: node.arn,
      kind,
      apiType: node.type,
      subtype: node.subtype || '',
      name: kind === 'policy' || node.wildcard ? node.name : displayName(kind, node.name, node.arn),
      accountId: accountOf(node.arn),
      admin: Boolean(node.admin),
      resourceCount: node.resource_count ?? null,
      sensitiveCount: node.sensitive_count ?? null,
      direct: node.direct ?? null,
      attachedTo: node.attached_to ?? null,
      wildcard: Boolean(node.wildcard),
    });
  }
  for (const edge of graph.edges ?? []) {
    if (!edge?.source || !edge?.target || edge.source === edge.target) continue;
    const key = `${edge.source}|${edge.target}|${edge.edge_type}`;
    const held = store.edges.get(key);
    store.edges.set(key, {
      source: edge.source,
      target: edge.target,
      type: edge.edge_type,
      lastObservedAt: edge.last_observed_at ?? held?.lastObservedAt ?? null,
      callCount: edge.call_count ?? held?.callCount ?? null,
      detail: edge.label && edge.label !== edge.edge_type ? edge.label : held?.detail ?? null,
      level: edge.level ?? held?.level ?? null,
    });
  }
  if (ownerArn) store.loaded.add(ownerArn);
}

/**
 * Raw edges collapsed to one drawn edge per ordered pair. Two roles joined by
 * both `assume_role` and `cross_account` (and the CloudTrail `accesses` edge
 * of the AssumeRole calls) are one relationship to read, named after its
 * heaviest kind and carrying the rest as facts.
 */
export function pairEdges(store) {
  const pairs = new Map();
  for (const edge of store.edges.values()) {
    const id = `${edge.source}->${edge.target}`;
    const meta = edgeKindMeta(edge.type);
    let pair = pairs.get(id);
    if (!pair) {
      pair = {
        id,
        from: edge.source,
        to: edge.target,
        kinds: [],
        kind: edge.type,
        callCount: null,
        lastObservedAt: null,
        configured: false,
        observed: false,
        detail: null,
        level: null,
      };
      pairs.set(id, pair);
    }
    pair.kinds.push(edge.type);
    if (meta.weight > edgeKindMeta(pair.kind).weight) {
      pair.kind = edge.type;
      pair.detail = edge.detail ?? pair.detail;
    } else if (!pair.detail) pair.detail = edge.detail;
    if (edge.level === 'admin' || (edge.level && !pair.level)) pair.level = edge.level;
    if (meta.observed) pair.observed = true;
    else pair.configured = true;
    if (edge.callCount) pair.callCount = (pair.callCount ?? 0) + edge.callCount;
    if (edge.lastObservedAt && (!pair.lastObservedAt || edge.lastObservedAt > pair.lastObservedAt)) {
      pair.lastObservedAt = edge.lastObservedAt;
    }
  }
  for (const pair of pairs.values()) {
    const a = accountOf(pair.from);
    const b = accountOf(pair.to);
    /* Two ARNs with account ids settle it. The service's `cross_account` kind
       decides only when one side has none: it also tags trust in the
       account's own root, which would label a same-account pair. */
    pair.crossAccount = a && b ? a !== b : pair.kinds.includes('cross_account');
    if (pair.kind === 'cross_account' && pair.kinds.includes('assume_role')) pair.kind = 'assume_role';
  }
  return [...pairs.values()];
}

const POLICY_TYPE_LABEL = {
  aws_managed: 'AWS managed policy',
  inline: 'Inline policy',
  role_assignment: 'Role assignment',
  matrix: 'Matrix authorization',
  acl: 'Access policy',
};

/* ── Risk and interest ───────────────────────────────────────────────────── */

const STALE_DAYS = 90;

/**
 * A node as drawn: the store's facts plus what the inventory says about it.
 * `facts` is { identity, credential, profile } for the ARN (any may be
 * missing). Every flag here is read from a real field:
 *   isAdmin       credential privilege level 4 (discovery's assessment), or
 *                 AdministratorAccess attached to it
 *   publicPolicy  identity is_publicly_accessible
 *   stale         credential unused for more than 90 days (idle_days)
 *   externalTrust credential has_external_trust (trust policy names another
 *                 account)
 */
export function describeNode(base, facts) {
  const identity = facts?.identity ?? null;
  const credential = facts?.credential ?? null;
  const profile = facts?.profile ?? null;
  const policies = profile?.attachedPolicies ?? [];
  const idle = credential?.idle_days;
  const count = (n) => `${n} resource${n === 1 ? '' : 's'}`;
  const typeLabel =
    base.kind === 'policy'
      ? `${POLICY_TYPE_LABEL[base.subtype] ?? 'Policy'}${base.resourceCount != null ? ` · ${count(base.resourceCount)}` : ''}`
      : base.wildcard
        ? base.resourceCount
          ? `Wildcard · ${count(base.resourceCount)}`
          : 'Wildcard'
        : `${subtypeLabel(base.kind, base.subtype)}${credential?.status && !['active', 'Active'].includes(credential.status) && base.kind === 'credential' ? ' · deactivated' : ''}`;
  return {
    ...base,
    typeLabel,
    accountName: base.accountId || identity?.account_id || credential?.account_id || '',
    region: identity?.region ?? credential?.region ?? '',
    identityId: identity?.id ?? null,
    credentialId: credential?.id ?? null,
    identityType: identity?.identity_type ?? null,
    status: identity?.status ?? credential?.status ?? null,
    owner: identity?.owner ?? null,
    environment: identity?.environment ?? null,
    privilegeLevel: profile?.privilegeLevel ?? null,
    isAdmin: base.kind === 'policy' ? base.admin : profile?.privilegeLevel === 4 || policies.includes('AdministratorAccess'),
    publicPolicy: Boolean(identity?.is_publicly_accessible),
    stale: typeof idle === 'number' && idle > STALE_DAYS,
    lastUsedDays: typeof idle === 'number' ? idle : null,
    externalTrust: Boolean(credential?.has_external_trust),
    orphaned: Boolean(credential?.is_orphaned),
    expandable: Boolean(identity || credential),
  };
}

/** Which neighbours earn the budgeted slots: risk first, then reach. */
export function interestOf(node) {
  let score = 10;
  if (node.isAdmin) score += 30;
  if (node.publicPolicy) score += 22;
  if (node.stale) score += 15;
  if (node.externalTrust) score += 12;
  if (node.kind === 'identity' || node.kind === 'credential') score += 6;
  if (node.kind === 'account' || node.kind === 'federated') score += 8;
  return score;
}

function edgeInterest(pair) {
  if (!pair) return 0;
  /* The access chain first: what it runs as and the policies attached there
     are the spine of the picture, so they never fold behind a count. */
  if (pair.kind === 'has_policy') return 60;
  if (pair.kind === 'bound_to' || pair.kind === 'uses') return 40;
  let score = pair.crossAccount ? 16 : 0;
  /* What it can become is the next most important thing after its own access. */
  if (pair.kind === 'assume_role' || pair.kind === 'cross_account') score += 10;
  score += Math.min(4, edgeKindMeta(pair.kind).weight);
  if (pair.callCount) score += Math.min(6, Math.log2(pair.callCount + 1));
  return score;
}

function summariseHidden(nodes) {
  const counts = new Map();
  for (const node of nodes) {
    const label = NODE_KINDS[node.kind]?.plural ?? 'Other';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const words = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${(count === 1 ? label.replace(/ies$/, 'y').replace(/s$/, '') : label).toLowerCase()}`);
  /* "3 credentials, 2 resources and 1 identity" - commas, "and" only before the last. */
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/* ── The drawn neighbourhood ─────────────────────────────────────────────── */

/**
 * The graph as one focus plus whatever has been opened from it.
 *
 * Breadth first from the focus, through opened nodes only, both directions
 * ("what can reach this" matters as much as "what this reaches"). Each hop
 * keeps its VISIBLE_PER_GROUP most interesting neighbours plus whatever was
 * revealed, and folds the rest. `describe(arn)` returns a drawn node for an
 * ARN (see `describeNode`).
 */
export function buildNeighbourhood({ store, focusArn, expanded = [], collapsed = [], revealed = {}, describe }) {
  if (!focusArn || !store.nodes.has(focusArn)) return null;
  const pairs = pairEdges(store);
  const out = new Map();
  const into = new Map();
  for (const pair of pairs) {
    if (!out.has(pair.from)) out.set(pair.from, []);
    if (!into.has(pair.to)) into.set(pair.to, []);
    out.get(pair.from).push(pair);
    into.get(pair.to).push(pair);
  }
  const neighboursOf = (arn) => {
    const list = [];
    for (const pair of out.get(arn) ?? []) list.push({ pair, other: pair.to });
    for (const pair of into.get(arn) ?? []) list.push({ pair, other: pair.from });
    return list.filter((entry) => store.nodes.has(entry.other));
  };

  const openSet = new Set([focusArn, ...expanded]);
  const autoOpen = new Set();
  const via = new Map();
  const closed = new Set(collapsed);
  const depth = new Map([[focusArn, 0]]);
  const visible = new Map([[focusArn, describe(focusArn)]]);
  const shown = new Map();
  const groups = [];
  const queue = [focusArn];
  const walked = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (walked.has(current)) continue;
    walked.add(current);
    const currentDepth = depth.get(current) ?? 0;
    if (!openSet.has(current) && !(autoOpen.has(current) && !closed.has(current))) continue;

    const byNeighbour = new Map();
    for (const entry of neighboursOf(current)) {
      if (visible.has(entry.other)) {
        shown.set(entry.pair.id, entry.pair);
        continue;
      }
      const held = byNeighbour.get(entry.other);
      if (!held || edgeInterest(entry.pair) > edgeInterest(held.pair)) byNeighbour.set(entry.other, entry);
    }

    const ranked = [...byNeighbour.values()]
      .map((entry) => {
        const node = describe(entry.other);
        return { ...entry, node, rank: interestOf(node) + edgeInterest(entry.pair) };
      })
      .sort((a, b) => b.rank - a.rank || String(a.node.name).localeCompare(String(b.node.name)));

    /* The access chain (runs as, signs in with, its policies) is always drawn
       in full; the budget is for everything else around a box. */
    const flowCount = ranked.filter((entry) => entry.pair.from === current && edgeKindMeta(entry.pair.kind).flow).length;
    const budget = VISIBLE_PER_GROUP + flowCount + (revealed[current] ?? 0);
    for (const { pair, node } of ranked.slice(0, budget)) {
      visible.set(node.id, node);
      /* Access reads left to right: what can act as the focus sits to its
         left, what the focus runs as, its policies and what they reach to its
         right. Once on a side, a path keeps going that way. */
      const outward = pair.from === current;
      const step = currentDepth > 0 ? 1 : currentDepth < 0 ? -1 : outward ? 1 : -1;
      depth.set(node.id, currentDepth + step);
      via.set(node.id, pair.kind);
      shown.set(pair.id, pair);
      queue.push(node.id);
      /* The chain from the focus to its policies opens by itself, so the
         first screen already answers "through what, and to what". */
      if (pair.from === current && edgeKindMeta(pair.kind).flow && currentDepth >= 0 && currentDepth < 3) autoOpen.add(node.id);
    }
    const hidden = ranked.slice(budget);
    if (hidden.length > 0) {
      groups.push({
        id: `more:${current}`,
        kind: 'more',
        parentId: current,
        parentName: visible.get(current)?.name,
        hiddenCount: hidden.length,
        depth: currentDepth + (currentDepth < 0 ? -1 : currentDepth > 0 ? 1 : ranked.slice(budget).some((e) => e.pair.from === current) ? 1 : -1),
        summary: summariseHidden(hidden.map((entry) => entry.node)),
      });
    }
  }

  /* Edges between nodes that are both on screen are drawn even when neither
     end was the one opened, so a triangle reads as a triangle. */
  for (const pair of pairs) {
    if (visible.has(pair.from) && visible.has(pair.to)) shown.set(pair.id, pair);
  }

  const nodes = [...visible.values()].map((node) => {
    const neighbourIds = new Set(neighboursOf(node.id).map((entry) => entry.other));
    const unseen = [...neighbourIds].filter((id) => !visible.has(id)).length;
    return {
      ...node,
      depth: depth.get(node.id) ?? 0,
      via: via.get(node.id) ?? null,
      isFocus: node.id === focusArn,
      expanded: openSet.has(node.id) || (autoOpen.has(node.id) && !closed.has(node.id)),
      loaded: store.loaded.has(node.id),
      neighbourCount: neighbourIds.size,
      unseenCount: unseen,
      interest: interestOf(node),
    };
  });

  return {
    focus: visible.get(focusArn),
    nodes,
    edges: [...shown.values()],
    groups,
    totalNodes: store.nodes.size,
  };
}

/** Every drawn edge touching one ARN, described from that node's side. */
export function edgesOf(store, arn) {
  return pairEdges(store)
    .filter((pair) => pair.from === arn || pair.to === arn)
    .map((pair) => {
      const otherArn = pair.from === arn ? pair.to : pair.from;
      return { ...pair, direction: pair.from === arn ? 'out' : 'in', otherArn, other: store.nodes.get(otherArn) };
    });
}

/* ── Reading a path back ─────────────────────────────────────────────────── */

/** What an arrow means, as a phrase that reads between its two ends. */
export function edgePhrase(edge, to) {
  if (!edge) return '';
  if (edge.kind === 'has_policy') return to?.direct ? 'policy attached directly to it' : 'policy attached to the role';
  if (edge.kind === 'bound_to') return 'runs as';
  if (edge.kind === 'uses') return 'signs in with';
  if (edge.kind === 'can_access' || edge.kind === 'accesses') {
    const what = edge.level === 'admin' ? 'grants full administrator access to' : edge.level === 'write' ? 'grants write access to' : edge.level === 'read' ? 'grants read access to' : 'allows access to';
    return edge.kind === 'accesses' && edge.callCount ? `${what} (used ${edge.callCount} times)` : what;
  }
  if (edge.kind === 'assume_role' || edge.kind === 'cross_account') return edge.crossAccount ? 'can assume, in another account,' : 'can assume';
  if (edge.kind === 'created_by') return 'created';
  if (edge.kind === 'service_trust') return 'is trusted to use';
  if (edge.kind === 'signs_in_as') return 'signs in as';
  return edgeKindMeta(edge.kind).label.toLowerCase();
}

/**
 * How the focus is connected to one node on screen: the shortest chain of
 * drawn arrows between them, each step with the arrow's meaning and its real
 * direction, so "this came from the role" can be read rather than inferred.
 */
export function traceTo(graph, targetId) {
  const focusId = graph?.focus?.id;
  if (!graph || !focusId || !targetId || targetId === focusId) return null;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacent = new Map();
  for (const edge of graph.edges) {
    if (!adjacent.has(edge.from)) adjacent.set(edge.from, []);
    if (!adjacent.has(edge.to)) adjacent.set(edge.to, []);
    adjacent.get(edge.from).push({ edge, next: edge.to });
    adjacent.get(edge.to).push({ edge, next: edge.from });
  }
  /* Prefer the access chain (outward arrows) when two routes are equally short. */
  for (const list of adjacent.values()) list.sort((a, b) => Number(b.edge.from !== b.next) - Number(a.edge.from !== a.next));
  const back = new Map([[focusId, null]]);
  const queue = [focusId];
  while (queue.length) {
    const at = queue.shift();
    if (at === targetId) break;
    for (const { edge, next } of adjacent.get(at) ?? []) {
      if (back.has(next)) continue;
      back.set(next, { from: at, edge });
      queue.push(next);
    }
  }
  if (!back.has(targetId)) return null;
  const steps = [];
  for (let at = targetId; back.get(at); at = back.get(at).from) {
    const { from, edge } = back.get(at);
    steps.unshift({ from: nodes.get(from), to: nodes.get(at), edge, forward: edge.from === from });
  }
  return steps;
}
