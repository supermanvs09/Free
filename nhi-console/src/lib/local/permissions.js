/* What each identity's credentials allow, and which of those it used. */
import { credentialsOf, eventsOf } from './world';
import { hashString, rng } from './util';

const AWS_EXTRA = {
  admin: [['*', '*', 'AdministratorAccess', 'aws_managed']],
  base: [
    ['logs:CreateLogStream', 'arn:aws:logs:*:*:*'],
    ['logs:PutLogEvents', 'arn:aws:logs:*:*:*'],
    ['xray:PutTraceSegments', '*'],
    ['ec2:DescribeNetworkInterfaces', '*'],
    ['s3:ListAllMyBuckets', '*'],
    ['s3:DeleteObject', 'arn:aws:s3:::*'],
    ['iam:PassRole', '*'],
    ['kms:Encrypt', '*'],
    ['sqs:DeleteQueue', '*'],
    ['dynamodb:DeleteTable', '*'],
    ['secretsmanager:ListSecrets', '*'],
    ['sns:Publish', '*'],
  ],
};
const AZURE_EXTRA = [
  ['Microsoft.KeyVault/vaults/secrets/setSecret/action', 'Key Vault Secrets Officer'],
  ['Microsoft.Storage/storageAccounts/listKeys/action', 'Storage Account Contributor'],
  ['Microsoft.Authorization/roleAssignments/write', 'Owner'],
  ['Microsoft.Compute/virtualMachines/runCommand/action', 'Contributor'],
];
const JENKINS_EXTRA = [['Job/Configure'], ['Credentials/Update'], ['Run/Delete'], ['Overall/Administer']];
const VAULT_EXTRA = [['secret/data/* update'], ['sys/policies/acl/* update'], ['auth/token/create sudo'], ['database/rotate-root/* update']];

const cache = new Map();
export function permissionsOf(identity) {
  if (cache.has(identity.id)) return cache.get(identity.id);
  const r = rng(hashString(`perm:${identity.id}`));
  const creds = credentialsOf(identity);
  const cred = creds[0];
  const used = new Map();
  for (const e of eventsOf(identity)) {
    const key = e.action;
    if (!used.has(key)) used.set(key, e);
  }
  const rows = [];
  const add = (action, resource, policy, type, isUsed, service) =>
    rows.push({
      action,
      service: service ?? action.split(/[:/.]/)[0],
      resource_arn: resource,
      policy_source: policy,
      policy_type: type,
      used: Boolean(isUsed),
      last_used_at: isUsed ? used.get(action)?.event_time ?? null : null,
      credential_id: cred?.id ?? null,
      credential_name: cred?.name ?? null,
      effect: 'Allow',
    });
  const p = identity.provider;
  const inlineName = p === 'aws' ? `${identity.name}-policy` : p === 'azure' ? 'Custom role' : p === 'jenkins' ? 'Matrix authorization' : `${identity.name.split('/').pop()}-policy`;
  const inlineType = p === 'aws' ? 'inline' : p === 'azure' ? 'role_assignment' : p === 'jenkins' ? 'matrix' : 'acl';
  for (const [action, e] of used) add(action, e.resource_arn ?? '*', inlineName, inlineType, true, e.service);
  if (p === 'aws') {
    const extra = r.sample(AWS_EXTRA.base, identity.is_admin ? 6 : r.int(3, 8));
    for (const [a, res] of extra) if (!used.has(a)) add(a, res, inlineName, inlineType, false);
    if (identity.is_admin) add('*', '*', 'AdministratorAccess', 'aws_managed', false, '*');
  } else if (p === 'azure') {
    for (const [a, role] of r.sample(AZURE_EXTRA, identity.is_admin ? 4 : 2)) add(a, `/subscriptions/${identity.account_id}`, role, 'role_assignment', false, a.split('/')[0]);
  } else if (p === 'jenkins') {
    for (const [a] of r.sample(JENKINS_EXTRA, identity.is_admin ? 4 : 2)) add(a, '*', 'Matrix authorization', 'matrix', false, 'jenkins');
  } else {
    for (const [a] of r.sample(VAULT_EXTRA, identity.is_admin ? 4 : 2)) add(a, '*', `${identity.name.split('/').pop()}-policy`, 'acl', false, 'vault');
  }
  cache.set(identity.id, rows);
  return rows;
}
