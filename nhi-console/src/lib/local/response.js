/*
 * Response: what people did about what the console found - a key deactivated,
 * a role right-sized to what it uses, a trust link removed, a role deleted -
 * and the live scenarios in progress. Kept in the shared workspace, so the
 * change shows for everyone, and read by the entitlement model, so blast
 * radius, the access graph and posture all recompute from it.
 */
import { save, slice } from './state';

export const response = () =>
  slice('response', () => ({ rev: 1, keys: {}, rightsized: {}, broken: {}, deleted: {}, deletedCreds: {}, scenarios: {} }));

/** Applies a change and moves the version every derived view keys off. */
export function mutate(fn) {
  const r = response();
  for (const k of ['keys', 'rightsized', 'broken', 'deleted', 'deletedCreds', 'scenarios']) r[k] ??= {};
  fn(r);
  r.rev = (r.rev ?? 1) + 1;
  save();
  return r;
}

export const responseRev = () => response().rev ?? 1;
export const keyDeactivated = (credId) => response().keys?.[credId] ?? null;
export const rightSized = (principal) => response().rightsized?.[principal] ?? null;
export const linkBroken = (linkId) => response().broken?.[linkId] ?? null;
export const identityDeleted = (id) => response().deleted?.[id] ?? null;
export const credentialDeleted = (id) => response().deletedCreds?.[id] ?? null;
export const scenario = (key) => response().scenarios?.[key] ?? null;
