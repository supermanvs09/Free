import client from './client';
import { unwrapMain } from './http';

/*
 * Blast radius (nhi-backend internal/correlation), scoped to the signed-in
 * user's workspace, accounts and regions:
 *
 *   GET /api/v1/correlations/blast-radius/{arn}?refresh=   what it can reach
 *   GET /api/v1/correlations/who-can-assume/{arn}          who can become this role
 *   GET /api/v1/correlations/identities/{id}/credentials   what an identity signs in with
 *
 * ARNs travel unencoded (encodeURI keeps ':' and '/'), as the routes expect.
 */
const BASE = '/api/v1/correlations';
const arnPath = (arn) => encodeURI(arn);

export async function fetchBlastRadius(arn, { refresh = false } = {}, signal) {
  return unwrapMain(
    await client.get(`${BASE}/blast-radius/${arnPath(arn)}`, { params: refresh ? { refresh: true } : {}, signal, timeout: 60000 }),
  );
}

export async function fetchWhoCanAssume(arn, signal) {
  return unwrapMain(await client.get(`${BASE}/who-can-assume/${arnPath(arn)}`, { params: { depth: 3 }, signal }));
}

export async function fetchIdentitySubjects(identityId, signal) {
  const data = unwrapMain(await client.get(`${BASE}/identities/${encodeURIComponent(identityId)}/credentials`, { signal }));
  return data?.credentials ?? [];
}
