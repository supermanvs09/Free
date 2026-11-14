import { ok, fail } from '../util';
import { activeSession, audit, findUser, publicUser, setSession, startSession, users } from '../users';
import { ROLE_CAPS } from '../roles';

export default function register(r) {
  r.post('/api/v1/login', ({ body }) => {
    const u = findUser(body?.email);
    if (!u || u.password !== String(body?.password ?? '')) {
      if (u) audit(u, 'auth.login', 'Sign-in failed: wrong password', { outcome: 'failure' });
      return fail(401, 'That email and password do not match.', 'INVALID_CREDENTIALS');
    }
    if (u.status !== 'active') return fail(403, 'This account is deactivated. Ask an admin to turn it back on.', 'USER_INACTIVE');
    const token = startSession(u);
    audit(u, 'auth.login', 'Signed in');
    return ok({ token, user: publicUser(u), expires_in: 900, refresh_expires_in: 604800 });
  }, { open: true });

  r.post('/api/v1/refresh', () => {
    const s = activeSession();
    const u = s && users().find((x) => x.id === s.user_id);
    if (!u || u.status !== 'active') return fail(401, 'No session.', 'UNAUTHORIZED');
    return ok({ token: s.token, user: publicUser(u) });
  }, { open: true });

  r.post('/api/v1/logout', () => {
    setSession(null);
    return ok({});
  }, { open: true });

  r.get('/api/v1/me', ({ user }) =>
    ok({ user_id: user.email, tenant_id: user.tenant_id, role: user.role, console_role: user.role, capabilities: ROLE_CAPS[user.role] ?? ['read'] }),
  );
}
