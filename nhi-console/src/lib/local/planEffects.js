/*
 * What a finished remediation plan changes in the estate, recorded as exact
 * ids (response.js `applied`): the principal right-sized, the keys rotated or
 * deactivated, the trust link removed, the trust pinned, the workload made
 * private, the secret's rotation switched on, the identity disabled. Access
 * graph, blast radius, posture, alerts and inventory all derive from it; a
 * rollback removes the entry and everything goes back.
 */
import { mutate, response } from './response';
import { credentialsOf, identityByArn } from './world';
import { escalationPaths, principalOf, withRightSizePreview } from './entitlements';
import { blastRadius } from './reach';

const RIGHTSIZE = new Set(['NHI-LP-001', 'NHI-LP-002', 'NHI-ES-001']);

function reachOf(identity) {
  const role = credentialsOf(identity).find((c) => c.credential_type === 'iam_role');
  const b = blastRadius(role?.arn ?? identity.arn);
  return b ? { score: b.blast_radius_score, resources: b.reachable_resources.length, accounts: b.summary.accounts } : { score: 0, resources: 0, accounts: 0 };
}

export function effectFor(plan, user) {
  const i = identityByArn(plan.target_arn);
  if (!i) return null;
  const rule = plan.rule_ids?.[0];
  const e = { plan_id: plan.plan_id, rule_id: rule, identity_id: i.id, at: Date.now(), by: user?.email ?? plan.created_by ?? null, by_name: user?.full_name ?? null };
  const creds = credentialsOf(i);
  const keys = creds.filter((c) => c.credential_type === 'access_key' && c.status === 'active');
  if (RIGHTSIZE.has(rule)) {
    e.rightsize = true;
    e.principal = principalOf(i);
    e.before = reachOf(i);
    e.after = withRightSizePreview(e.principal, () => reachOf(i));
  } else if (rule === 'NHI-CH-001') e.rotated = keys.filter((k) => k.age_days > 90).map((k) => k.id);
  else if (rule === 'NHI-EX-001') e.rotated = keys.map((k) => k.id);
  else if (rule === 'NHI-CH-002') e.keys_off = keys.slice(1).map((k) => k.id);
  else if (rule === 'NHI-ES-002') e.link_id = escalationPaths(i)[0]?.links[0]?.id.split('|')[0] ?? null;
  else if (rule === 'NHI-TA-001' || rule === 'NHI-TA-002') e.pinned = creds.filter((c) => c.has_external_trust).map((c) => c.id);
  else if (rule === 'NHI-TA-003') e.private = true;
  else if (rule === 'NHI-CH-004') e.rotation_on = creds.filter((c) => ['secret', 'jenkins_credential'].includes(c.credential_type) && c.rotation_overdue).map((c) => c.id);
  else if (rule === 'NHI-LC-002') e.disabled = true;
  else return null;
  return e;
}

/** A plan ran, or was marked done: its change applies everywhere. */
export function applyPlan(plan, user) {
  const e = effectFor(plan, user);
  if (!e) return null;
  mutate((r) => {
    r.applied[plan.plan_id] = e;
  });
  return e;
}

/** A plan was rolled back: its change is undone everywhere. */
export function revertPlan(plan) {
  if (!response().applied?.[plan.plan_id]) return;
  mutate((r) => {
    delete r.applied[plan.plan_id];
  });
}
