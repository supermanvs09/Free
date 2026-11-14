import { consoleRole } from '../roles';
import client from './client';
import { ApiError, unwrapMain } from './http';
import { seal } from './seal';

/**
 * POST /api/v1/login -> { token, user, expires_in, refresh_expires_in }.
 * user = { id, email, full_name, team, role, tenant_id, status, last_login_at, created_at }.
 * The password is sent encrypted (seal.js). The refresh token comes back only
 * as an HttpOnly cookie, out of reach of any script on the page.
 */
export async function login({ email, password }) {
  let sealed;
  try {
    sealed = await seal(password);
  } catch (error) {
    throw new ApiError({ message: error?.message || 'Could not prepare the sign-in.', code: 'SEAL_FAILED', retryable: true });
  }
  const data = unwrapMain(await client.post('/api/v1/login', { email: String(email).trim(), password: sealed }));
  if (!data?.token || !data?.user) {
    throw new ApiError({ message: 'The service did not return a session.', code: 'BAD_RESPONSE' });
  }
  return { token: data.token, user: profileFrom(data.user) };
}

/** GET /api/v1/me -> { user_id, tenant_id, role, console_role, capabilities }. */
export async function fetchMe(signal) {
  return unwrapMain(await client.get('/api/v1/me', { signal }));
}

/** POST /api/v1/logout - ends the session the refresh cookie names. Best effort. */
export async function logout() {
  try {
    await client.post('/api/v1/logout', null, { withCredentials: true });
  } catch {
    /* The access token simply expires; nothing for the person to do. */
  }
}

/**
 * The console's view of a signed-in user. `role` is the console role (see
 * lib/roles.js `consoleRole`); `serverRole` is what the API stores.
 */
export function profileFrom(user = {}, me = {}) {
  const email = user.email || me.user_id || '';
  const serverRole = String(me.role || user.role || '').trim().toLowerCase();
  return {
    id: user.id ?? null,
    email,
    user: email,
    name: user.full_name || email.split('@')[0] || 'Signed in',
    team: user.team || '',
    tenantId: me.tenant_id || user.tenant_id || null,
    serverRole,
    /* The server says which console role this is and what it may do; the
       client-side mapping is only the fallback for an older server. */
    role: me.console_role ? consoleRole(me.console_role) : consoleRoleFor(serverRole),
    capabilities: Array.isArray(me.capabilities) ? me.capabilities : user.capabilities ?? null,
    lastLoginAt: user.last_login_at || null,
  };
}

/** Server roles -> console roles (lib/roles.js). Unknown roles get the least access. */
export function consoleRoleFor(serverRole) {
  return consoleRole(serverRole);
}
