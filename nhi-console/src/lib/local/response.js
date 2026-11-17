/*
 * Response: what people did about what the console found - a key deactivated,
 * a role right-sized to what it uses, a trust link removed, a role deleted -
 * and the live scenarios in progress. Kept in the shared workspace, so the
 * change shows for everyone, and read by the entitlement model, so blast
 * radius, the access graph and posture all recompute from it.
 */
import { save, slice } from './state';

export const response = () =>
  slice('response', () => ({ rev: 1, keys: {}, rightsized: {}, broken: {}, deleted: {}, deletedCreds: {}, scenarios: {}, applied: {} }));

/** Applies a change and moves the version every derived view keys off. */
export function mutate(fn) {
  const r = response();
  for (const k of ['keys', 'rightsized', 'broken', 'deleted', 'deletedCreds', 'scenarios', 'applied']) r[k] ??= {};
  fn(r);
  r.rev = (r.rev ?? 1) + 1;
  save();
  return r;
}

export const responseRev = () => response().rev ?? 1;

/*
 * Remediation plans that ran (or were marked done) leave what they changed
 * here, keyed by plan: the principal right-sized, the keys rotated or
 * deactivated, the trust link removed, ... A rollback deletes the entry, and
 * everything derived from it goes back.
 */
const applied = () => Object.values(response().applied ?? {});
const fromPlan = (pred) => {
  const hit = applied().find(pred);
  return hit ? { at: hit.at, by: hit.by, by_name: hit.by_name, plan_id: hit.plan_id, before: hit.before, after: hit.after, via: 'plan' } : null;
};

export const keyDeactivated = (credId) => response().keys?.[credId] ?? fromPlan((a) => a.keys_off?.includes(credId));
export const rightSized = (principal) => response().rightsized?.[principal] ?? fromPlan((a) => a.principal === principal && a.rightsize);
export const linkBroken = (linkId) => response().broken?.[linkId] ?? fromPlan((a) => a.link_id === linkId);
export const identityDeleted = (id) => response().deleted?.[id] ?? null;
export const credentialDeleted = (id) => response().deletedCreds?.[id] ?? null;
export const scenario = (key) => response().scenarios?.[key] ?? null;
export const keyRotated = (credId) => fromPlan((a) => a.rotated?.includes(credId));
export const trustPinned = (credId) => fromPlan((a) => a.pinned?.includes(credId));
export const rotationEnabled = (credId) => fromPlan((a) => a.rotation_on?.includes(credId));
export const madePrivate = (identityId) => fromPlan((a) => a.private && a.identity_id === identityId);
export const identityDisabled = (identityId) => fromPlan((a) => a.disabled && a.identity_id === identityId);
