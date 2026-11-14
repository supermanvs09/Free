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
