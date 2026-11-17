/*
 * Blast radius, read the way a responder asks it: what kind of thing is at
 * risk, and what would shrink it. Shared by the full view (identity Blast
 * radius tab) and the glance in the access graph's side panel.
 */

export const accountOf = (arn) => String(arn ?? '').split(':')[4] || '';

const SERVICE_CATEGORY = {
  secretsmanager: 'secrets',
  kms: 'secrets',
  ssm: 'secrets',
  iam: 'identity',
  sts: 'identity',
  s3: 'data',
  dynamodb: 'data',
  rds: 'data',
  redshift: 'data',
  efs: 'data',
  glue: 'data',
  kinesis: 'data',
  sqs: 'data',
  sns: 'data',
  logs: 'data',
  athena: 'data',
  elasticache: 'data',
  es: 'data',
  ec2: 'compute',
  lambda: 'compute',
  ecs: 'compute',
  eks: 'compute',
  ecr: 'compute',
  states: 'compute',
  batch: 'compute',
};

/* Order is the order of harm: secrets first, then the roles it can become. */
export const CATEGORIES = [
  { key: 'secrets', label: 'Secrets & keys', hint: 'Secrets Manager, KMS, Parameter Store' },
  { key: 'identity', label: 'Roles & identities', hint: 'It can act as these too' },
  { key: 'data', label: 'Data', hint: 'Buckets, tables, queues, logs' },
  { key: 'compute', label: 'Compute', hint: 'Instances, functions, containers' },
  { key: 'other', label: 'Other', hint: 'Everything else' },
];

export function categoryOf(res) {
  if (res.type === 'secret' || res.type === 'key') return 'secrets';
  return SERVICE_CATEGORY[res.service] ?? 'other';
}

/** Counts by category, cross-account reach, CloudTrail use, wildcards. */
export function summarize(result) {
  const resources = result?.reachable_resources ?? [];
  const source = accountOf(result?.source_arn);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]));
  for (const r of resources) byCategory[categoryOf(r)] += 1;
  const accounts = new Set(resources.map((r) => accountOf(r.arn)).filter((a) => a && a !== source));
  return {
    resources,
    total: resources.length,
    byCategory,
    accounts,
    roles: (result?.reachable_identities ?? []).length,
    used: resources.filter((r) => r.observed_activity).length,
    wildcard: resources.filter((r) => r.wildcard).length,
    viaRoles: resources.filter((r) => (r.hops ?? 1) > 1).length,
  };
}

/**
 * What would shrink the radius, most effective first. Only advice the data
 * supports: "never used" is offered only when CloudTrail shows some use,
 * otherwise no use may just mean no CloudTrail.
 */
export function shrinkSteps(s) {
  const steps = [];
  if (s.byCategory.secrets) {
    steps.push({
      key: 'secrets',
      tone: 'critical',
      title: `Scope down access to ${s.byCategory.secrets} ${s.byCategory.secrets === 1 ? 'secret or key' : 'secrets and keys'}`,
      body: 'A taken-over credential that can read secrets hands the attacker more credentials. Grant only the named secrets this workload reads.',
    });
  }
  if (s.wildcard) {
    steps.push({
      key: 'wildcard',
      tone: 'high',
      title: `Replace ${s.wildcard} wildcard ${s.wildcard === 1 ? 'grant' : 'grants'} with named resources`,
      body: 'A "*" resource covers everything of that kind, including resources created later. Name the exact ARNs in the policy.',
    });
  }
  if (s.used > 0 && s.total - s.used > 0) {
    const unused = s.total - s.used;
    steps.push({
      key: 'unused',
      tone: 'medium',
      title: `Remove access it never used: ${unused} of ${s.total}`,
      body: `CloudTrail shows it using ${s.used}. Dropping the rest cuts the radius by ${Math.round((unused / s.total) * 100)}% without breaking the workload.`,
    });
  }
  if (s.roles) {
    steps.push({
      key: 'roles',
      tone: 'medium',
      title: `Review the ${s.roles} ${s.roles === 1 ? 'role' : 'roles'} it can become`,
      body: 'Each role it can assume adds that role’s reach to this one. Remove it from trust policies that do not need it.',
    });
  }
  if (s.accounts.size) {
    steps.push({
      key: 'cross',
      tone: 'medium',
      title: `Confirm reach into ${s.accounts.size} other AWS ${s.accounts.size === 1 ? 'account' : 'accounts'}`,
      body: 'Cross-account access lets one compromise spread past this account. Keep it only where it is intended.',
    });
  }
  return steps;
}

const tail = (arn) => {
  const text = String(arn ?? '');
  return text.split(':').slice(5).join(':').split('/').filter(Boolean).pop() || text;
};
const POLICY_KIND = { managed: 'managed policy', aws_managed: 'AWS managed policy', customer_managed: 'managed policy', inline: 'inline policy' };

/**
 * Why one arrow of a path exists, in plain words: the policy that grants it,
 * the trust policy that allows the switch, or the CloudTrail call that shows it.
 */
export function hopReason(hop) {
  if (hop.edge_type === 'CAN_ASSUME') {
    if (hop.basis === 'observed_in_cloudtrail') return `seen switching in CloudTrail${hop.observed_count ? ` (${hop.observed_count}×)` : ''}`;
    const to = tail(hop.to_arn);
    const from = tail(hop.from_arn);
    const trust = {
      trust_policy_names_role: `${to}'s trust policy names ${from}`,
      trust_policy_account_and_identity_permission: `${to}'s trust policy trusts ${from}'s whole account, and ${from}'s own policy allows the switch`,
      trust_policy_public_and_identity_permission: `${to}'s trust policy lets anyone switch to it`,
    }[hop.basis] ?? `${to}'s trust policy allows it`;
    return hop.observed_count ? `${trust}, and CloudTrail shows it used` : trust;
  }
  if (hop.evidence === 'observed') return 'seen used in CloudTrail';
  if (hop.table === 'nhi_resource_policies') return `the ${String(hop.basis || 'resource policy').replaceAll('_', ' ')} on it`;
  const policies = hop.policies ?? [];
  if (policies.length === 1) return `${POLICY_KIND[policies[0].type] ?? 'policy'} ${policies[0].name}`;
  if (policies.length > 1) return `policies ${policies.map((p) => p.name).join(', ')}`;
  return 'its IAM policy';
}

const ADMIN = 10;
/**
 * Can it become an administrator? From the engine's privilege levels (0-10,
 * 10 = every action on every resource) of the source and of every role it can
 * become, and its privilege-escalation paths (PATH-005).
 */
export function adminVerdict(result) {
  const own = Number(result.privilege_level) || 0;
  const roles = [...(result.reachable_identities ?? [])].sort((a, b) => (b.privilege_level ?? 0) - (a.privilege_level ?? 0));
  const top = roles[0];
  const escalation = (result.paths ?? []).filter((p) => p.path_type === 'PATH-005');
  if (own >= ADMIN) return { tone: 'critical', answer: 'Yes', text: 'It is already an administrator: its policies allow every action on every resource.', own, top, escalation };
  if (top && top.privilege_level >= ADMIN)
    return { tone: 'critical', answer: 'Yes', text: `By becoming ${tail(top.arn)}${top.hops > 1 ? ` (${top.path.join(' → ')})` : ''}, which is an administrator.`, own, top, escalation };
  if (escalation.length)
    return { tone: 'high', answer: 'Possibly', text: `It can change permissions (${escalation.length} ${escalation.length === 1 ? 'route' : 'routes'} below), which can be used to raise them up to administrator.`, own, top, escalation };
  if (top && top.privilege_level > own)
    return { tone: 'medium', answer: 'No', text: `No route to administrator found. It can become ${tail(top.arn)}, which is more powerful (${top.privilege_level} of 10) than itself (${own} of 10).`, own, top, escalation };
  return { tone: 'low', answer: 'No', text: `No route to administrator found. Its own permissions rate ${own} of 10${top ? ', and no role it can become is stronger' : ''}.`, own, top, escalation };
}
