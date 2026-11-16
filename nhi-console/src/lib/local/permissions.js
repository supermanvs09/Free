/* What each identity's credentials allow, and which of those it used: read
   from the entitlement model (entitlements.js), with last use from activity. */
import { credentialsOf, eventsOf } from './world';
import { onOverlayChange, permissionRows } from './entitlements';

const cache = new Map();
onOverlayChange(() => cache.clear());
export function permissionsOf(identity) {
  if (cache.has(identity.id)) return cache.get(identity.id);
  const creds = credentialsOf(identity);
  const cred = creds.find((c) => ['iam_role', 'managed_identity', 'access_key', 'client_secret', 'vault_secret_id', 'vault_token', 'vault_k8s_jwt', 'vault_lease'].includes(c.credential_type)) ?? creds[0];
  const lastUse = new Map();
  const serviceUse = new Map();
  for (const e of eventsOf(identity)) {
    if (e.error_code) continue;
    if (!lastUse.has(e.action)) lastUse.set(e.action, e.event_time);
    const svc = identity.provider === 'aws' ? e.action.split(':')[0] : e.event_source;
    if (!serviceUse.has(svc)) serviceUse.set(svc, e.event_time);
  }
  const rows = permissionRows(identity).map((p) => {
    const service = identity.provider === 'aws' ? p.action.split(':')[0] : p.action.split(/[/.]/)[0];
    const last = p.used ? lastUse.get(p.action) ?? serviceUse.get(service) ?? null : null;
    return {
      action: p.action,
      service,
      resource_arn: p.resource_arn,
      policy_source: p.policy_source,
      policy_type: p.policy_type,
      used: p.used,
      last_used_at: last,
      credential_id: cred?.id ?? null,
      credential_name: cred?.name ?? null,
      effect: 'Allow',
      access_level: p.level,
      wildcard: p.wildcard,
    };
  });
  cache.set(identity.id, rows);
  return rows;
}
