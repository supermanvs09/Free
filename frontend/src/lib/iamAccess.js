/*
 * Reading IAM policies the way the AWS console's policy summary does: per
 * service, which access levels a policy grants (List, Read, Write,
 * Permissions management, Tagging), fully or in part, and on which resources.
 *
 * ponytail: the access level of an action is read from its verb (Get -> Read,
 * List/Describe -> List, Tag -> Tagging ...), not from AWS's per-action
 * catalogue, so a few actions land in a neighbouring level. Ship the AWS
 * service authorization reference as JSON if exact levels matter.
 */

export const ACCESS_LEVELS = ['List', 'Read', 'Write', 'Permissions management', 'Tagging'];

const SERVICE_NAMES = {
  '*': 'Every service',
  s3: 'Amazon S3',
  ec2: 'Amazon EC2',
  iam: 'IAM',
  sts: 'AWS STS',
  sso: 'IAM Identity Center',
  lambda: 'AWS Lambda',
  dynamodb: 'Amazon DynamoDB',
  kms: 'AWS KMS',
  secretsmanager: 'Secrets Manager',
  ssm: 'Systems Manager',
  logs: 'CloudWatch Logs',
  cloudwatch: 'CloudWatch',
  sns: 'Amazon SNS',
  sqs: 'Amazon SQS',
  rds: 'Amazon RDS',
  eks: 'Amazon EKS',
  ecr: 'Amazon ECR',
  ecs: 'Amazon ECS',
  cloudtrail: 'CloudTrail',
  cloudformation: 'CloudFormation',
  organizations: 'Organizations',
  route53: 'Route 53',
  elasticloadbalancing: 'Elastic Load Balancing',
  autoscaling: 'Auto Scaling',
  'cost-explorer': 'Cost Explorer',
  ce: 'Cost Explorer',
  budgets: 'Budgets',
  config: 'AWS Config',
  events: 'EventBridge',
  states: 'Step Functions',
  apigateway: 'API Gateway',
  glue: 'AWS Glue',
  athena: 'Athena',
  'aws-portal': 'Billing',
  support: 'Support',
};

export const serviceName = (code) => SERVICE_NAMES[code] ?? code;

const PERMISSION_VERBS = /^(Attach|Detach|Put\w*Policy|Delete\w*Policy|Create\w*Policy|SetDefaultPolicyVersion|PassRole|UpdateAssumeRolePolicy|AddPermission|RemovePermission|\w*Acl$|Put\w*Permission|Create\w*Grant|Revoke|Retire\w*Grant|AddUserToGroup|RemoveUserFromGroup|CreateLoginProfile|UpdateLoginProfile|CreateAccessKey|PutBucketPolicy|PutBucketAcl|PutObjectAcl)/;

/** The access level of one action name (without the service prefix). */
export function accessLevelOf(service, action) {
  const name = String(action ?? '');
  if (name === '*' || service === '*') return '*';
  if (/^(Tag|Untag)/.test(name)) return 'Tagging';
  if (PERMISSION_VERBS.test(name)) return 'Permissions management';
  if (/^(List|Describe)/.test(name)) return 'List';
  if (/^(Get|Head|Read|Select|BatchGet|Lookup|Search|Query|Scan|Download|View|Check|Export|Preview|Validate|Estimate|Simulate|Generate|Decrypt|Verify)/.test(name)) return 'Read';
  if (name.endsWith('*')) return levelOfWildcard(name);
  return 'Write';
}

const WRITE_VERBS = /^(Put|Create|Delete|Update|Modify|Start|Stop|Run|Terminate|Reboot|Send|Publish|Invoke|Write|Upload|Restore|Copy)/;

/* "Get*" reads, "List*" lists, "Put*" writes; another prefix may span levels. */
function levelOfWildcard(name) {
  const prefix = name.slice(0, -1);
  if (!prefix) return '*';
  const level = accessLevelOf('', `${prefix}X`);
  return level === 'Write' && !WRITE_VERBS.test(prefix) ? 'mixed' : level;
}

const asList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

function parseDoc(doc) {
  if (!doc) return null;
  if (typeof doc === 'object') return doc;
  try {
    return JSON.parse(doc);
  } catch {
    return null;
  }
}

/**
 * The policy summary of one document: one row per service with its access
 * levels, resources, conditions and the actions behind it. Allow and Deny
 * statements are summarised separately ("denied" rows).
 */
export function summarisePolicy(doc) {
  const parsed = parseDoc(doc);
  const rows = new Map();
  for (const st of asList(parsed?.Statement)) {
    const effect = String(st?.Effect ?? '').toLowerCase() === 'deny' ? 'Deny' : 'Allow';
    const resources = asList(st?.Resource).map(String);
    const hasCondition = st?.Condition && Object.keys(st.Condition).length > 0;
    for (const raw of asList(st?.Action)) {
      const text = String(raw).trim();
      const [service, action] = text === '*' ? ['*', '*'] : text.includes(':') ? [text.slice(0, text.indexOf(':')).toLowerCase(), text.slice(text.indexOf(':') + 1)] : ['', text];
      const key = `${effect}|${service}`;
      if (!rows.has(key)) rows.set(key, { effect, service, name: serviceName(service), levels: new Map(), resources: new Set(), conditions: false, actions: [] });
      const row = rows.get(key);
      const level = accessLevelOf(service, action);
      if (level === '*' || action === '*') for (const l of ACCESS_LEVELS) row.levels.set(l, 'Full');
      else if (level !== 'mixed') row.levels.set(level, row.levels.get(level) === 'Full' ? 'Full' : 'Limited');
      else row.levels.set('Write', row.levels.get('Write') === 'Full' ? 'Full' : 'Limited');
      for (const r of resources.length ? resources : ['*']) row.resources.add(r);
      if (hasCondition) row.conditions = true;
      row.actions.push({ action: action === '*' ? '* (every action)' : action, level: level === '*' ? 'All levels' : level === 'mixed' ? 'Several levels' : level });
    }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, resources: [...row.resources], levelText: levelText(row.levels), admin: row.levels.size === ACCESS_LEVELS.length && [...row.levels.values()].every((v) => v === 'Full') }))
    .sort((a, b) => Number(a.effect === 'Deny') - Number(b.effect === 'Deny') || Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name));
}

/** "Full access", or "Full: List, Read · Limited: Write" as in the AWS console. */
function levelText(levels) {
  const full = ACCESS_LEVELS.filter((l) => levels.get(l) === 'Full');
  const limited = ACCESS_LEVELS.filter((l) => levels.get(l) === 'Limited');
  if (full.length === ACCESS_LEVELS.length) return 'Full access';
  return [full.length && `Full: ${full.join(', ')}`, limited.length && `Limited: ${limited.join(', ')}`].filter(Boolean).join(' · ') || 'No access';
}
