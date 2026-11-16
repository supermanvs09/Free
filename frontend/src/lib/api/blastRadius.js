import client from './client';
import { ApiError, unwrapMain } from './http';

/*
 * Blast radius, from the correlation engine (nhi-backend internal/modules/
 * correlation). Every call is for the signed-in user's workspace; the tenant
 * comes from the token, never from the request.
 *
 *   GET /api/v1/correlation/blast-radius?arn=&refresh=&summary=   what it can reach
 *   GET /api/v1/correlation/graph?arn=&direction=in&depth=        who can become this role (.inbound)
 *   GET /api/v1/identity-subjects/{id}                            what an identity signs in with
 *
 * The correlation answers are { data: ... }; an error is { error: { code,
 * message } }.
 */
const CORRELATION = '/api/v1/correlation';

function engineBody(response) {
  const body = response?.data;
  if (!body || typeof body !== 'object' || body.error) {
    const detail = body?.error ?? {};
    throw new ApiError({
      message: detail.message || 'The blast radius service reported a failure.',
      status: response?.status ?? null,
      code: detail.code,
    });
  }
  return body.data ?? body;
}

export async function fetchBlastRadius(arn, { refresh = false, summary = false } = {}, signal) {
  return engineBody(
    await client.get(`${CORRELATION}/blast-radius`, {
      params: { arn, ...(refresh ? { refresh: true } : {}), ...(summary ? { summary: true } : {}) },
      signal,
      timeout: 60000,
    }),
  );
}

/** The role's inbound side: { principals, callers, public_trust }, or null for something with no trust policy. */
export async function fetchWhoCanAssume(arn, signal) {
  const body = engineBody(
    await client.get(`${CORRELATION}/graph`, { params: { arn, direction: 'in', depth: 3, limit: 1 }, signal }),
  );
  if (body.inbound) return body.inbound;
  /* No multi-step chains computed: the trust policy's own principals still answer it. */
  const direct = body.inward?.trust_principals ?? [];
  return direct.length ? { principals: direct, callers: [], public_trust: direct.some((p) => p.kind === 'public') } : null;
}

export async function fetchIdentitySubjects(identityId, signal) {
  const data = unwrapMain(await client.get(`/api/v1/identity-subjects/${encodeURIComponent(identityId)}`, { signal }));
  return data?.credentials ?? [];
}
